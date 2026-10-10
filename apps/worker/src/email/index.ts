import { isPlaceholder } from '../config';
import type { Env } from '../env';
import { nowIso, stripControl, uuid } from '../lib/http';

/**
 * Email (spec section 13). Mail is stored in `email_outbox` first and sent afterwards, so a
 * payment or contact request never blocks on delivery; cron retries failures with backoff.
 *
 * Loop prevention: nothing in this app reads a mailbox. Mail sent to info@zfadavi.com is
 * forwarded to a human by Cloudflare Email Routing and cannot trigger more mail from here.
 */

export interface Attachment {
  filename: string;
  /** base64 content */
  content: string;
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  attachments?: Attachment[];
}

export interface EmailSender {
  send(message: OutgoingEmail): Promise<void>;
}

const MAX_ATTEMPTS = 8;
/** Resend's free plan allows 100/day; stay under it and defer (never drop) the rest. */
const DAILY_SEND_CAP = 90;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** The fixed From header. Always the site address, never a visitor's (spoofing / DMARC). */
export function fromHeader(env: Env): string {
  const name = stripControl(env.EMAIL_FROM_NAME).replace(/[<>"]/g, '');
  return `${name} <${stripControl(env.EMAIL_FROM_ADDRESS)}>`;
}

const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
export function isValidEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_RE.test(value);
}

class ConsoleSender implements EmailSender {
  constructor(private readonly env: Env) {}
  async send(m: OutgoingEmail): Promise<void> {
    console.log(
      [
        '',
        '================ EMAIL (console driver) ================',
        `From:     ${fromHeader(this.env)}`,
        `To:       ${m.to}`,
        m.replyTo ? `Reply-To: ${m.replyTo}` : '',
        `Subject:  ${m.subject}`,
        m.attachments?.length ? `Attachments: ${m.attachments.map((a) => a.filename).join(', ')}` : '',
        '--------------------------------------------------------',
        m.text,
        '========================================================',
        '',
      ]
        .filter((l) => l !== '')
        .join('\n'),
    );
  }
}

class ResendSender implements EmailSender {
  constructor(private readonly env: Env) {}
  async send(m: OutgoingEmail): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromHeader(this.env),
        to: [stripControl(m.to)],
        subject: stripControl(m.subject),
        text: m.text,
        html: m.html,
        reply_to: m.replyTo ? stripControl(m.replyTo) : undefined,
        attachments: m.attachments,
      }),
    });
    if (!res.ok) {
      // Never log the API key; the response body is the provider's error message.
      throw new Error(`Resend responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
  }
}

export function createSender(env: Env): EmailSender {
  if (env.EMAIL_DRIVER === 'resend') {
    if (isPlaceholder(env.RESEND_API_KEY)) {
      throw new Error('Email is not configured: set RESEND_API_KEY (or use EMAIL_DRIVER=console locally).');
    }
    return new ResendSender(env);
  }
  return new ConsoleSender(env);
}

export interface QueuedEmail extends OutgoingEmail {
  kind: string;
  locale?: 'en' | 'da';
}

/** Store an email for delivery. Returns its outbox id. */
export async function enqueueEmail(env: Env, email: QueuedEmail): Promise<string> {
  const id = uuid();
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO email_outbox
       (id, kind, to_email, reply_to, subject, text_body, html_body, locale, attachments_json, status, attempts, next_attempt_at, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'pending', 0, ?10, ?10)`,
  )
    .bind(
      id,
      email.kind,
      stripControl(email.to),
      email.replyTo ? stripControl(email.replyTo) : null,
      stripControl(email.subject),
      email.text,
      email.html ?? null,
      email.locale ?? 'en',
      email.attachments?.length ? JSON.stringify(email.attachments) : null,
      now,
    )
    .run();
  return id;
}

interface OutboxRow {
  id: string;
  to_email: string;
  reply_to: string | null;
  subject: string;
  text_body: string;
  html_body: string | null;
  attachments_json: string | null;
  attempts: number;
}

function backoffMinutes(attempts: number): number {
  return Math.min(5 * 2 ** (attempts - 1), 360); // 5, 10, 20 ... up to 6 hours
}

/**
 * Send due outbox rows (or just `onlyId`). Failures are recorded and retried later; a
 * delivery error never throws to the caller.
 */
export async function flushOutbox(env: Env, opts: { onlyId?: string; limit?: number } = {}): Promise<number> {
  let sender: EmailSender;
  try {
    sender = createSender(env);
  } catch (err) {
    console.log(JSON.stringify({ level: 'error', msg: 'email not configured', error: String(err) }));
    return 0;
  }

  const now = nowIso();
  const rows = opts.onlyId
    ? await env.DB.prepare(
        `SELECT id, to_email, reply_to, subject, text_body, html_body, attachments_json, attempts
           FROM email_outbox WHERE id = ?1 AND status IN ('pending', 'failed')`,
      )
        .bind(opts.onlyId)
        .all<OutboxRow>()
    : await env.DB.prepare(
        `SELECT id, to_email, reply_to, subject, text_body, html_body, attachments_json, attempts
           FROM email_outbox WHERE status IN ('pending', 'failed') AND next_attempt_at <= ?1
           ORDER BY next_attempt_at LIMIT ?2`,
      )
        .bind(now, opts.limit ?? 10)
        .all<OutboxRow>();

  let sentToday = 0;
  if (env.EMAIL_DRIVER === 'resend') {
    const day = now.slice(0, 10);
    const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM email_outbox WHERE status = 'sent' AND sent_at >= ?1`)
      .bind(`${day}T00:00:00.000Z`)
      .first<{ n: number }>();
    sentToday = r?.n ?? 0;
  }

  let sent = 0;
  for (const row of rows.results) {
    if (env.EMAIL_DRIVER === 'resend' && sentToday >= DAILY_SEND_CAP) {
      // Defer to tomorrow instead of dropping the mail.
      const tomorrow = new Date(Date.parse(`${now.slice(0, 10)}T00:00:00.000Z`) + 86_400_000 + 60_000).toISOString();
      await env.DB.prepare('UPDATE email_outbox SET next_attempt_at = ?2 WHERE id = ?1').bind(row.id, tomorrow).run();
      continue;
    }
    try {
      await sender.send({
        to: row.to_email,
        replyTo: row.reply_to ?? undefined,
        subject: row.subject,
        text: row.text_body,
        html: row.html_body ?? undefined,
        attachments: row.attachments_json ? (JSON.parse(row.attachments_json) as Attachment[]) : undefined,
      });
      await env.DB.prepare(`UPDATE email_outbox SET status = 'sent', sent_at = ?2, last_error = NULL WHERE id = ?1`)
        .bind(row.id, nowIso())
        .run();
      sent++;
      sentToday++;
    } catch (err) {
      const attempts = row.attempts + 1;
      const dead = attempts >= MAX_ATTEMPTS;
      const next = new Date(Date.now() + backoffMinutes(attempts) * 60_000).toISOString();
      await env.DB.prepare(
        `UPDATE email_outbox SET status = ?2, attempts = ?3, next_attempt_at = ?4, last_error = ?5 WHERE id = ?1`,
      )
        .bind(row.id, dead ? 'dead' : 'failed', attempts, next, String(err).slice(0, 300))
        .run();
    }
  }
  return sent;
}

/** Contact-form notification to the owner. Owner-facing mail is English. */
export function contactNotification(
  env: Env,
  m: { name: string; email: string; message: string; locale: 'en' | 'da'; artworkTitle?: string | null },
): QueuedEmail {
  const name = stripControl(m.name);
  const lines = [
    `New message from the website contact form.`,
    ``,
    `Name:     ${name}`,
    `Email:    ${m.email}`,
    `Language: ${m.locale === 'da' ? 'Danish' : 'English'}`,
    ...(m.artworkTitle ? [`Artwork:  ${m.artworkTitle}`] : []),
    ``,
    m.message,
    ``,
    `Reply to this email to answer ${name} directly.`,
  ];
  const html =
    `<p>New message from the website contact form.</p>` +
    `<table cellpadding="4">` +
    `<tr><td><b>Name</b></td><td>${escapeHtml(name)}</td></tr>` +
    `<tr><td><b>Email</b></td><td>${escapeHtml(m.email)}</td></tr>` +
    `<tr><td><b>Language</b></td><td>${m.locale === 'da' ? 'Danish' : 'English'}</td></tr>` +
    (m.artworkTitle ? `<tr><td><b>Artwork</b></td><td>${escapeHtml(m.artworkTitle)}</td></tr>` : '') +
    `</table>` +
    `<p style="white-space:pre-wrap">${escapeHtml(m.message)}</p>` +
    `<p>Reply to this email to answer ${escapeHtml(name)} directly.</p>`;
  return {
    kind: 'contact_notification',
    to: env.OWNER_NOTIFICATION_EMAIL,
    // The visitor's address goes in Reply-To only; From is always the fixed site address.
    replyTo: m.email,
    subject: `Website message from ${name}${m.artworkTitle ? ` about "${stripControl(m.artworkTitle)}"` : ''}`,
    text: lines.join('\n'),
    html,
    locale: 'en',
  };
}

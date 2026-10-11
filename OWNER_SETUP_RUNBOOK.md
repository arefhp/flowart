# OWNER_SETUP_RUNBOOK.md

# Zakereh Art Website — Owner Runbook

This is for you (the owner). Follow the steps in order. It must stay in sync with `CLAUDE_IMPLEMENTATION_INSTRUCTIONS.md`. If they disagree, tell Claude and fix both.

```
Browser
  -> zfadavi.com  (one Cloudflare Worker)
        |- static Next.js site (free, unlimited asset requests)
        |- /api/*   TypeScript API  -> D1 (SQLite: bookings, customers, artworks, messages)
        |                           -> R2  (artwork images, served at media.zfadavi.com)
        |                           -> Stripe Checkout / webhooks
        |                           -> Resend (sends email from info@zfadavi.com)
  -> /admin  protected by Cloudflare Access (you sign in with your email)
  info@zfadavi.com -> Cloudflare Email Routing -> your personal inbox
```

## Ground rules
- Never paste passwords/API keys/tokens into chat with Claude. Put secrets only in: a password manager, local `.dev.vars` files (git-ignored), `wrangler secret put`, GitHub secret settings.
- Never commit `.dev.vars`, `.env`, tokens, Stripe secret keys, database dumps.
- Stripe TEST mode until the whole booking flow is verified.
- Free-tier limits change. Before relying on any "free" plan, open its pricing page and confirm the current limits (links at the bottom).
- Your Cloudflare account now holds your domain, website, database and images. Protect it (Step 1).

## What it will really cost (estimate)
Prices checked in October 2026; confirm on the pages linked at the bottom before you pay.

| Item | Plan | Cost |
|---|---|---|
| Domain `zfadavi.com` | Cloudflare Registrar, at cost (about 10.46 USD/year for `.com`, same on renewal) | **about 10.5 USD/year (about 0.9 USD/month)** |
| Website hosting (static assets) | Workers Free: asset requests are free and unlimited | 0 |
| API (Worker) | Workers Free: 100,000 requests/day, 10 ms CPU per request | 0 |
| Database | D1 Free: 5 GB, 5 million row reads/day, 100,000 row writes/day | 0 |
| Image storage | R2 Free: 10 GB, 1 M writes + 10 M reads per month, no egress fees | 0 (see card note) |
| Image resizing | Pre-generated in your browser. Cloudflare Image Transformations only as fallback: 5,000 unique/month free | 0 |
| Admin login | Cloudflare Access: free up to 50 users | 0 |
| Bot protection | Turnstile | 0 |
| Email receiving | Cloudflare Email Routing | 0 |
| Email sending | Resend Free: 3,000 emails/month, 100/day, 1 domain | 0 |
| GitHub | Private repo + Actions free minutes | 0 |
| Stripe | No monthly fee. European cards 1.5% + 1.80 DKK, non-European cards 2.9% + 1.80 DKK per payment | per payment only |

**Fixed running cost: about 10.5 USD per year (roughly 75 DKK).** Stripe fees come out of each workshop payment, not out of your pocket in advance. Example: a 500 DKK workshop place paid by a European card costs 7.50 + 1.80 = 9.30 DKK in fees (about 1.9%).

### Traffic sanity check
A busy artist site might see 5,000 visitors/month. Page views are static assets and are free. Only API calls (live availability, contact, booking, admin) count against the 100,000/day Worker allowance, so even a very busy day is far below it. Storage: 100 artworks at three sizes is about 100-300 MB of the 10 GB R2 allowance. Emails: a 12-person workshop is about 25 emails (a confirmation for each person plus owner notices), so the 3,000/month and 100/day limits are comfortable.

### When you would start paying
| Trigger | What happens on Free | Fix | Cost |
|---|---|---|---|
| Worker API passes 100,000 requests/day or CPU limit hit | Requests error until the next UTC day | Workers Paid | 5 USD/month |
| D1 passes 100,000 writes/day or 5 M reads/day | Queries fail until 00:00 UTC | Workers Paid | 5 USD/month (includes much larger D1 allowance) |
| You want 30-day (not 7-day) database point-in-time restore | n/a | Workers Paid | 5 USD/month |
| Booking or webhook requests fail now and then (Free allows only about 10 ms of CPU per request; accepted risk at launch) | the affected request errors; Stripe retries webhooks automatically | Workers Paid, then raise the CPU limit. Steps in [docs/MAINTENANCE.md](docs/MAINTENANCE.md) | 5 USD/month |
| More than 100 emails/day or 3,000/month | Emails are deferred/rejected | Resend Pro | about 20 USD/month |
| R2 beyond 10 GB | Billed per GB | none needed | about 0.015 USD per extra GB/month |

Realistic worst case for a successful small studio: **about 5 USD/month plus domain**. Cloudflare's Free plan has no automatic overage billing; hitting a limit causes errors, not a surprise bill. The exception is R2 and Workers Paid, where you opt in.

**Card note:** Cloudflare usually asks for a payment method to enable R2 (and to buy the domain). It is not charged while you stay inside the free allowance. Confirm in the R2 sign-up screen.

"Free" here means about 0 per month at a small artist's traffic, not "impossible to be billed". Step 12 sets protections.

---

# STEP 0 — Names
```
PROJECT_NAME = zakereh-art
GITHUB_REPO  = arefhp/flowart   (existing repo: https://github.com/arefhp/flowart)
DOMAIN       = zfadavi.com
MEDIA_HOST   = media.zfadavi.com        (images from R2)
SITE_EMAIL   = info@zfadavi.com         (sender AND receiver, forwards to your own inbox)
D1_DATABASE  = zakereh-art-db
R2_BUCKETS   = zakereh-media (public), zakereh-private (optional originals)
WORKER_NAME  = zakereh-art
```
Use one naming convention everywhere.

**Values for Claude:** as you finish each step, write the non-secret IDs it produces (database ID, account ID, Access team name and AUD tag, public Turnstile site key, contact details) into [OWNER_VALUES.md](OWNER_VALUES.md). Secrets never go in that file.

# STEP 0A — Buy and secure your domain
You need the domain before Resend verification (Step 5), real Turnstile hostnames (Step 6), the Stripe website field (Step 4), and the custom domains in Step 10.

**Decision: `zfadavi.com` at Cloudflare Registrar.** It is sold at cost, the price stays the same on renewal, WHOIS privacy is free, and the domain, DNS, email forwarding, Turnstile, hosting, database and images all live in one dashboard, so there are no nameservers to change.

1. Sign in or create the free account: https://dash.cloudflare.com/sign-up. Turn on two-factor authentication (Profile -> Authentication). Prefer a hardware key or authenticator app, and store the recovery codes offline.
2. **Domain Registration** -> **Register Domains** -> search `zfadavi.com` -> **Purchase**. Add a payment method. If it is taken, tell Claude and we pick an alternative and update the files.
3. Leave **auto-renew ON** and confirm the contact email is one you read.
4. The domain is automatically a Cloudflare zone; skip any "add site"/nameserver steps.

(Note: Cloudflare does not sell `.dk`. If you ever want a `.dk` domain, buy it elsewhere and point its nameservers to Cloudflare, then tell Claude to update the docs.)

### Domain safety checklist
- [ ] Two-factor authentication on Cloudflare
- [ ] Auto-renew on; account email is current and is **not** on `zfadavi.com` itself (if the domain lapsed you could lose access to that mailbox)
- [ ] Domain transfer lock enabled (usually default)
- [ ] Credentials in your password manager, never in chat or git
- [ ] Domain and Cloudflare account are in **your** name

# STEP 0B — Business email: `info@zfadavi.com`
One address does both jobs:
- **Receiving:** Cloudflare Email Routing forwards `info@zfadavi.com` to your personal inbox. Free. It forwards; it does not store mail.
- **Sending:** the website sends booking confirmations and contact-form alerts from `info@zfadavi.com` through Resend (Step 5).

Do this after the domain is in your Cloudflare account.

### A. Set up forwarding (receive)
1. https://dash.cloudflare.com/ -> select `zfadavi.com` -> **Email** -> **Email Routing** -> **Get started**.
2. Under **Destination addresses** click **Add destination address** and enter your personal email. Cloudflare sends a verification email; click the link. Forwarding does not work until it shows **Verified**.
3. Under **Routing rules** -> **Create address**: custom address `info`, action **Send to an email**, destination = your verified address. Save.
4. When Cloudflare offers to add the required DNS records (MX and an SPF TXT), click **Add records and enable**. Do not delete these later.
5. Test: from a different email account, send a message to `info@zfadavi.com`. It should arrive within a minute. Check spam the first time and mark "not spam".
6. Optional: a catch-all rule so `anything@zfadavi.com` also reaches you. Leave it off if you start getting spam.

### B. Set up sending (Resend)
Follow Step 5. Because the sender is `info@zfadavi.com`, verify the **root domain** `zfadavi.com` in Resend. Resend's bounce records go on a `send.` subdomain, so they do not conflict with Email Routing. Rules:
- The root domain can have **only one SPF TXT record**. Keep Cloudflare's (it contains `include:_spf.mx.cloudflare.net`). If Resend asks for SPF at the root, merge it into the single existing record.
- Never delete the Cloudflare MX records, or incoming mail stops.
- Add the DMARC record described in Step 5.

### C. Replying "as info@zfadavi.com" from your own inbox (optional)
1. In Resend create a **separate** API key named `zakereh-art-smtp-gmail` with **Sending access** only.
2. Gmail -> **Settings** -> **See all settings** -> **Accounts and Import** -> **Send mail as** -> **Add another email address**. Name `Zakereh Art`, address `info@zfadavi.com`.
3. SMTP server `smtp.resend.com`, port `465` (SSL) or `587` (TLS), username `resend`, password = that API key. Confirm current values at https://resend.com/docs/send-with-smtp.
4. Gmail sends a verification code to `info@zfadavi.com`; it arrives via your forwarding rule. Enter it.
5. Store the key in your password manager, never in chat. If it leaks, delete it in Resend and create a new one.

Contact-form messages arrive in your inbox with the visitor's address in **Reply-To**, so pressing Reply writes to the visitor. Pick the `info@zfadavi.com` identity in Gmail's "From" dropdown when you reply.

### D. Check it works
- [ ] A message sent to `info@zfadavi.com` arrives in your personal inbox
- [ ] The website contact form sends a notification to you
- [ ] The test booking confirmation arrives from `Zakereh Art <info@zfadavi.com>`
- [ ] Gmail "Show original": SPF, DKIM and DMARC all say PASS

### When you would need a paid mailbox instead
If you later want a real mailbox you log into (storage, a team), add a paid plan (e.g. Google Workspace). It requires moving the MX records, so ask Claude to update the instructions first.

# STEP 1 — GitHub and Cloudflare account hygiene
1. Use the existing repo https://github.com/arefhp/flowart (it already exists and is cloned at `C:\SourceCodes\flowart`; its `origin` points at it). Check it is **private** (repo -> Settings -> General -> Danger Zone -> Change visibility) because it will contain business logic and docs with your setup details. The remote currently holds only the initial README commit, so commit and push the new docs when you are ready (ask Claude). Turn on branch protection for `main`, Dependabot alerts, and secret scanning (if available).
2. Cloudflare is now a single point of failure for the whole site. Confirm: 2FA on, recovery codes stored offline, a second trusted way to recover the account, and no shared logins.
3. Create a GitHub **environment** named `production` (repo -> Settings -> Environments -> New environment -> `production` -> tick **Required reviewers** and add yourself -> Save). Only the production **migration** workflow uses it, so every database change needs your approval. Do not put the Cloudflare secrets in this environment (see Step 3, item 4).

# STEP 2 — Local tools
Git, Node.js LTS (includes npm), and the Stripe CLI. Wrangler (Cloudflare's CLI) comes from the project's npm dependencies, so there is nothing separate to install. **No Go, Docker or Google Cloud tools are needed.**

```powershell
git --version; node --version; npm.cmd --version; stripe --version
```
Links: https://git-scm.com/downloads · https://nodejs.org/ · https://docs.stripe.com/stripe-cli

# STEP 3 — Create the Cloudflare resources (one-time)
Do these in the dashboard (https://dash.cloudflare.com/) or ask Claude for the exact `wrangler` commands. Never paste tokens into chat; the IDs below (database ID, bucket names) are not secret and may be shared.

1. **D1 database:** Storage & Databases -> **D1 SQL Database** -> **Create** -> name `zakereh-art-db`. Choose a location hint in Western Europe if offered. Copy the **Database ID** and give it to Claude (it goes into `wrangler.jsonc`).
2. **R2 buckets:** **R2 Object Storage** -> enable R2 (you may be asked for a payment method; you stay within the free allowance) -> **Create bucket** `zakereh-media`, and optionally `zakereh-private`. Keep `zakereh-private` private.
3. **Public images domain:** open `zakereh-media` -> **Settings** -> **Custom Domains** -> **Add** -> `media.zfadavi.com`. Cloudflare creates the DNS record. Do **not** enable the `r2.dev` public URL for production (it is rate limited and not for production).
4. **Cloudflare API token for GitHub deploys:** My Profile -> **API Tokens** -> **Create Token**. Use the "Edit Cloudflare Workers" template, then restrict it to your account and add **D1 Edit**. Name it `zakereh-art-github-deploy`, create it, and copy the token once (it is shown only once). Then add both as **repository secrets**: GitHub repo -> **Settings** -> **Secrets and variables** -> **Actions** -> tab **Secrets** -> **New repository secret**:
   - Name `CLOUDFLARE_API_TOKEN`, value = the token.
   - Name `CLOUDFLARE_ACCOUNT_ID`, value = your account ID (dashboard -> Workers & Pages overview; not sensitive, but the workflows need it).
   - Name `AGE_PUBLIC_KEY`, value = the public `age1...` key from Step 13 (for the encrypted daily backup).

   **Why repository secrets, not environment secrets:** the automatic site rebuild (when you publish in `/admin`) and the daily backup run unattended. Secrets stored in an approval-protected environment would make those runs wait for you to click approve every time. Approval is applied only to production migrations (Step 1, item 3). Repository secrets are also not readable by pull requests from forks. Keep the repo private and `main` protected so nobody can push a workflow that reads them. Never paste the token in chat; if it leaks, roll it under My Profile -> API Tokens and update the GitHub secret.
   - Also add a repository **variable** (same page, tab **Variables**): `NEXT_PUBLIC_TURNSTILE_SITE_KEY` once you have it (Step 6). It is public.
5. **Rebuild token:** GitHub -> Settings -> Developer settings -> **Fine-grained personal access tokens** -> repository `arefhp/flowart` only, permission **Contents: Read and write** (GitHub requires this for the repository-dispatch call that starts the rebuild; "Actions" alone is not enough, and the rebuild silently never starts) and Metadata: Read (added automatically). Save it only as the Worker secret `GITHUB_DISPATCH_TOKEN` (set in Step 10). This lets your admin "publish" action rebuild the site.

Notes: D1 has no passwords, connection strings, pausing, or percent-encoding to worry about. Everything in D1/R2 is reached through bindings from the Worker.

# STEP 4 — Stripe (TEST mode)
### What to enter when Stripe asks about your business
Be accurate: Stripe reviews your website against what you write, and a mismatch can delay or block activation. Edit the text below to match reality.

**Website** (use your real domain, or your temporary site address until the domain is live; a working site activates faster):
```
https://zfadavi.com
```

**Describe your business in a few words / What does your business do?**
```
I am an independent artist based in Copenhagen, Denmark. My website showcases my artworks (portfolio with titles, sizes and descriptions) and lets customers book and pay online for my art workshops and events. Customers choose an event, enter their name and email, and pay a per-person fee by card through Stripe Checkout. Workshops have a fixed date, time and limited number of places.
```
Shorter version if the field is length-limited:
```
Independent artist in Copenhagen offering paid art workshops and events, booked online through my portfolio website.
```

Other things Stripe commonly asks (check each against your own situation):
- **Country:** Denmark. **Business type:** usually "Individual / sole proprietorship" (enkeltmandsvirksomhed) unless you have a company (ApS etc.). Ask an accountant which applies and whether you need a CVR number / VAT (moms) registration.
- **Product/service category:** art or craft classes/workshops (education/events). Do **not** describe it as selling physical artwork online. The site currently only displays artworks; if you later sell artworks through the site, update your Stripe business description.
- **Statement descriptor** (shown on customers' card statements): e.g. `ZAKEREH ART` (short, recognizable, max ~22 characters).
- **Support email, phone, address:** use real contact details; these also appear on `/contact`, `/privacy`, `/terms`. Support email: `info@zfadavi.com`.
- **Refund/cancellation policy URL:** your `/terms` page.
- **Bank account (IBAN) and ID verification:** needed to activate live payments and receive payouts. Test mode works without full activation.
- **Currency:** DKK.

https://dashboard.stripe.com/ -> stay in your **sandbox** (test mode) -> copy the secret key (`sk_test_...`) into your local `.dev.vars` only. The webhook secret comes from the Stripe CLI locally (Step 9) and from the Stripe dashboard in Step 10.

### Stripe settings to check (owner decisions)
- **Payment methods:** Dashboard -> Settings -> Payment methods. Enable **Cards** (Apple Pay and Google Pay come with it). Leave MobilePay and the other methods off for now. The site does not hard-code payment methods; it uses whatever you enable here.
- **Customer receipts:** Dashboard -> Settings -> Customer emails -> turn on **Successful payments**. Customers then get Stripe's receipt in addition to the site's own confirmation email. Stripe may not send receipts for sandbox payments; that is normal.
- **No Stripe Invoicing:** the site does not create Stripe invoices. If a company asks for an invoice, tell Claude; it is a small change, but check Stripe's fee for it first.
- **Sandbox vs live:** everything is built and tested against the sandbox. Live keys are only used at the very end of Step 15.

# STEP 5 — Email provider (Resend)
Purpose: the site sends booking confirmations, owner notifications and contact-form alerts. Check current free limits at https://resend.com/pricing (at time of writing 3,000 emails/month, 100/day, 1 domain; verify).

**Part A — Account and API key (works immediately, no domain needed)**
1. Sign up: https://resend.com/signup (confirm your email).
2. Create an API key: https://resend.com/api-keys -> **Create API Key** -> name `zakereh-art-local` -> permission **Sending access** -> Create.
3. Copy the key (starts with `re_`) **once** into your password manager and your local `apps/worker/.dev.vars` as `RESEND_API_KEY`. Never paste it in chat or commit it.
4. Later create a separate key `zakereh-art-prod` and set it only as a Worker secret (Step 10). If a key leaks, delete it on the same page and create a new one.
5. Before your domain is ready, Resend's test sender `onboarding@resend.dev` can only deliver to your own Resend account email. For pure local development set `EMAIL_DRIVER=console` so emails print in the terminal.

**Part B — Verify your domain (needed before real customers get emails)**
1. https://resend.com/domains -> **Add Domain**.
2. Enter `zfadavi.com` (the root domain, since the sender is `info@zfadavi.com`). Choose an EU region if offered.
3. Resend shows DNS records, usually an **SPF** (TXT, plus an MX, on a `send` subdomain), a **DKIM** (TXT or CNAME), and optionally a tracking record. Copy them exactly. Do **not** touch or replace the Cloudflare Email Routing MX/SPF records on the root (Step 0B). If a record would duplicate an existing SPF TXT on the same name, merge instead of adding a second one.
4. In Cloudflare -> `zfadavi.com` -> **DNS** -> **Records** -> **Add record** for each one. **Important:** for any CNAME, set Proxy status to **DNS only** (grey cloud), or verification fails.
5. In Resend click **Verify DNS Records** (minutes to a few hours).
6. Add a **DMARC** record: TXT, name `_dmarc`, content `v=DMARC1; p=none; rua=mailto:info@zfadavi.com`. Start with `p=none`, tighten later.
7. Email settings (non-secret, in `wrangler.jsonc`/`.dev.vars`): sender `info@zfadavi.com`, name `Zakereh Art`, reply-to `info@zfadavi.com`, owner notification `info@zfadavi.com`.
8. Send a test to Gmail and Outlook/iCloud; confirm not in spam and SPF/DKIM/DMARC = PASS ("Show original" in Gmail).

If something fails: Resend dashboard -> Logs. Common causes: proxied CNAME (orange cloud), typo in record name (Cloudflare auto-appends your domain, so enter only the prefix), DNS not propagated yet.

# STEP 6 — Cloudflare Turnstile
Purpose: blocks bots from spamming the contact and booking forms. Free. Docs: https://developers.cloudflare.com/turnstile/

**Option 1 — start now with Cloudflare's official test keys (local dev only)**
Put these in `apps/worker/.dev.vars` / `apps/web/.env.local` (confirm they are still current at https://developers.cloudflare.com/turnstile/troubleshooting/testing/):
- Site key (always passes): `1x00000000000000000000AA`
- Secret key (always passes): `1x0000000000000000000000000000000AA`

They never block anything, so they are **only for local development**.

**Option 2 — real keys (needed for production)**
1. In the Cloudflare dashboard sidebar open **Turnstile** (https://dash.cloudflare.com/?to=/:account/turnstile) -> **Add widget**.
2. Widget name `zakereh-art`. **Hostname management**: add `zfadavi.com` (and `www.zfadavi.com` if used). For development create a second widget `zakereh-art-dev` for `localhost` (cleaner).
3. Mode **Managed**. Pre-clearance: No. Create.
4. Two values:
   - **Site key** (public): `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in `apps/web/.env.local` and in the GitHub Actions build variables.
   - **Secret key** (private): Worker secret `TURNSTILE_SECRET_KEY` only. Never in frontend variables, git or chat.
5. If a secret leaks: open the widget -> **Rotate secret key**.

# STEP 7 — Let Claude build Milestone 1
Tell Claude: "Implement Milestone 1 from CLAUDE_IMPLEMENTATION_INSTRUCTIONS.md." Then build M2, M3, M4 in order.

**How each milestone works (agreed workflow):**
1. Claude builds the milestone and **verifies it itself first**: typecheck, lint, tests, build, and runs the app to exercise the new features. It reports what it ran and what passed.
2. Claude **commits to `main` locally** (it does not push yet).
3. Claude gives you a **short run-and-check list**: the exact commands, URLs and what you should see.
4. You run it on your computer and click through it, then reply **"approved"** or tell Claude what to fix.
5. Only after "approved" does Claude push to GitHub and start the next milestone. Claude never starts the next milestone on its own.

Your photos are in `input/` (git-ignored): the seed script uses `about.jpeg` as the About portrait and the four paintings as sample artworks, so Milestone 1 already looks like your real site.

Claude generates commented templates `apps/worker/.dev.vars.example` and `apps/web/.env.local.example`. Run `scripts\setup.ps1` (or `npm run setup`) to copy them to `.dev.vars` and `.env.local`, then fill in the placeholders using the comments in each file. `scripts\check-env.ps1` validates without printing secrets.

**The full local guide, with every variable, where to get each key, Stripe CLI steps and troubleshooting, is [docs/LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md).** Short version: the site boots with **no accounts and no real keys** (emails print in the terminal, Turnstile uses test keys, admin has no login locally). You only add a real key when you want to test that feature: a Stripe **test** key for payments, a Resend key for real email.

Local files (you create them; never commit):
- `apps/worker/.dev.vars`: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`, `GITHUB_DISPATCH_TOKEN` (optional locally), plus non-secret settings like `ADMIN_DEV_BYPASS=true`. Exact names follow the example file.
- `apps/web/.env.local`: `NEXT_PUBLIC_SITE_URL`, the Turnstile **site** key and `BUILD_API_BASE_URL`. Public or build-time values only, never a secret.

# STEP 8 — Migrations and admin access
```powershell
npm run migrate:local         # creates the local SQLite database (no cloud needed)
npm run seed                  # sample data for local testing
```
There is **no admin password** to create. Locally the app uses a development bypass. In production you sign in through Cloudflare Access with your email (Step 10). If the schema must change later: ask Claude for a new migration. Never edit production tables by hand.

# STEP 9 — Run locally and acceptance-test
Use this step to click through the real local site as an owner. It uses a local database and local image storage; it does not publish anything to the live site. Keep all Stripe activity in **Test mode**.

### Start the local site

Run these commands from the repository root in PowerShell. Do this once after a fresh clone; `npm run setup` does not overwrite existing local environment files:

```powershell
npm install
npm run setup
npm run migrate:local
npm run seed
```

If you have already set up the project and only need to restart it, skip those commands and start the servers:

```powershell
npm run dev
```

This starts both services: the Worker API at `http://localhost:8787` and the website at `http://localhost:3000`. Leave this terminal open. If you prefer separate terminals, run `npm run dev:worker` in one and `npm run dev:web` in the other. Check that the Worker is responding by opening `http://localhost:8787/api/health`, then open `http://localhost:3000`.

The local admin has no login. The sample data is useful for browsing, but create a fresh artwork and event for the checks below so you can safely edit or cancel them. Emails use the local console driver by default: check the Worker terminal for email output. If PowerShell blocks `npm`, use `npm.cmd` in place of `npm`.

### Artwork, gallery, categories, languages and About

1. Open `http://localhost:3000/admin` and create an artwork **with** a price. Upload several images; the browser creates three image sizes for each upload. Choose one as the **cover**, save, and open the artwork's public page.
2. Open `http://localhost:3000/artworks`. Each artwork should appear once, using its cover image. Open your artwork: confirm all its images appear as thumbnails, select a thumbnail, click the large image to open the viewer, use the left/right arrow keys to move, and press `Esc` to close. Confirm the full description is shown. Click **Ask about this work**; the contact form should open with the artwork name filled in.
3. In `Admin -> Categories`, add a category. Edit an artwork and assign it that category and a size. On `/artworks`, try Category, Size and Available only in the filter sidebar, then click **Clear filters**. On a phone-sized screen, confirm the filters open from the **Filters** button. Try deleting the category while an artwork still uses it; deletion must be blocked with an error naming that artwork.
4. In the admin, add some Danish text to an artwork. Use the **EN | DA** switch. Fields with no Danish translation should show their English text. Check `http://localhost:3000/da/artworks` and `http://localhost:3000/da/about`.
5. Create a second artwork **without** a price. Its public page must show no price label, dash, `N/A`, `Free`, or empty price box. **This check is mandatory.**
6. Open `http://localhost:3000/admin/about`. Confirm the artist statement is present. Upload the portrait (JPEG, PNG or WebP; portrait orientation and at least 1200 px tall are ideal), enter alt text and save. View `http://localhost:3000/about` on desktop and phone. Remove the portrait and save; the text-only page should still look clean.

### Events and Copenhagen time

1. In `Admin -> Events`, create an event. It should start as a draft. Set its date, Copenhagen start time, places and a price, then press **Publish**.
2. Open `http://localhost:3000/workshops` and `http://localhost:3000/calendar`. Confirm the event appears and its time is correct for Copenhagen. Try **Add to calendar** and confirm a calendar file downloads with the correct event time.
3. Return to the admin and use **Back to draft**, then **Cancel event**, confirming the event is no longer offered for booking.
4. Try to create an event at `02:30` on the last Sunday in March, when Copenhagen clocks jump forward. For example, use `2027-03-28` if that date is still in the future when you run this test. The nonexistent local time must be rejected with a clear message, not silently shifted to another time.

### Stripe sandbox booking, webhook and refund

The pretend-payment default is useful for ordinary development, but it does **not** test a real Stripe card, webhook delivery or Stripe refund. To perform the checks below, use a Stripe **test-mode** secret key only; never use a live key.

1. In `apps/worker/.dev.vars`, set `STRIPE_SECRET_KEY` to your Stripe test-mode secret key (`sk_test_...`). Do not paste it into chat or commit the file. Keep `EMAIL_DRIVER=console` if you want to inspect email contents in the Worker terminal.
2. Start the local site with `npm run dev` and leave it running. In a **second PowerShell terminal**, from the repository root, sign in to the Stripe CLI and start forwarding the webhook events the app handles.

   If the browser opens a **Review and authorize** page but **Authorize** is disabled, this is usually a Stripe CLI authorization/session issue, not a problem with the website or `EMAIL_DRIVER`. For Stripe CLI versions newer than 1.50.0, an account **Administrator or IAM Admin** must enable CLI access for the account and environment you want to use. In the Stripe Dashboard, select the intended test account or sandbox, then open **Settings -> Team and security -> MCP and CLI access** and enable CLI access. Ask an Administrator or IAM Admin to do this if you cannot change the setting yourself.

   If that setting is already enabled and the page says **"Modify permissions or accounts to authorize"**, the CLI session may already be authorized for the accounts shown, so there is nothing new for that page to apply. Do not remove an account just to enable the button. In a terminal, check the existing CLI login:

   ```powershell
   stripe login list
   ```

   If the intended account/sandbox is listed, select it if needed with `stripe switch`, then continue to `stripe listen`; you may not need to authorize again. To change the current session's authorized accounts or permissions, use `stripe reauth`. To explicitly start a fresh browser login, use `stripe login --new-session` (this replaces/revokes the current CLI login session). Make sure the selected CLI account/sandbox matches the test account whose `sk_test_...` key you put in `apps/worker/.dev.vars`.

   If browser authorization still is not possible, use the CLI's interactive API-key login instead. Run this in the second terminal and enter the **test** secret key only at the terminal prompt; never paste it into chat:

   ```powershell
   stripe login --interactive
   ```

   Continue with the webhook listener after login:

   ```powershell
   stripe listen --forward-to localhost:8787/api/stripe/webhook --events checkout.session.completed,checkout.session.expired,charge.refunded
   ```

   The listener prints a webhook signing secret beginning with `whsec_`. Copy it into `STRIPE_WEBHOOK_SECRET` in `apps/worker/.dev.vars` (do not share it), stop and restart `npm run dev` so the Worker loads it, and leave `stripe listen` running. If you restart the listener and it prints a different signing secret, update `.dev.vars` and restart the Worker again.
3. Create and publish a paid test event, then book it at `http://localhost:3000/workshops`. On Stripe Checkout use test card `4242 4242 4242 4242`, any future expiry date, any three-digit CVC and any postal code. Complete payment.
4. The success page should initially say it is **confirming** the payment. In `Admin -> Bookings`, the booking must become **Confirmed** only after the webhook arrives. The Stripe CLI terminal should show the event being forwarded. Delivering the same webhook twice must not create a duplicate confirmation, charge or email; the automated idempotency regression tests can also be run with `npm run test -w apps/worker`.
5. Start another checkout and abandon it instead of paying. After the hold expires (30 minutes), the places should become available again. To check capacity safely, make two bookings close together for the last available place; no more places may be confirmed than the event's capacity.
6. Cancel the paid test event from `Admin -> Events`. Confirm the sandbox payment is refunded and the refund/owner notification emails are printed in the Worker terminal. A local console email is output for inspection, not delivered to a real inbox.

For more Stripe setup detail and troubleshooting, see [docs/LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md), section 7. Do not run these payment checks with live Stripe credentials.

# STEP 10 — Deploy to Cloudflare
1. **Apply migrations to production** (explicit step, run by you or the manual `migrate` workflow after approval): `npm run migrate:prod`.
2. **Set the production Worker's private secrets.** These are stored by Cloudflare for Worker `zakereh-art`; they do not go in `wrangler.jsonc`, `.env.local`, GitHub variables, or chat. Do not copy the values from `.dev.vars`: create/use the production credentials listed below. Your recorded Stripe decision is **Sandbox until launch**, so use matching Stripe **test-mode** credentials while doing production-site acceptance tests. Switch both Stripe values to live mode only at the final launch check (Step 15).

   Open PowerShell in the repository, then go to the Worker folder and verify Wrangler is signed into the Cloudflare account that owns `zakereh-art`:

   ```powershell
   Set-Location C:\SourceCodes\flowart\apps\worker
   npx wrangler whoami
   ```

   Confirm the account is the right one before continuing. Set each secret separately: run the command, wait for Wrangler's prompt, paste that secret into the terminal prompt, and press Enter. Do not put the value after the command (that would save it in shell history). Repeat for all five names:

   ```powershell
   npx wrangler secret put STRIPE_SECRET_KEY
   npx wrangler secret put STRIPE_WEBHOOK_SECRET
   npx wrangler secret put TURNSTILE_SECRET_KEY
   npx wrangler secret put RESEND_API_KEY
   npx wrangler secret put GITHUB_DISPATCH_TOKEN
   ```

   Get the values as follows:
   - `STRIPE_SECRET_KEY`: Stripe Dashboard -> select the **sandbox/test environment** for acceptance tests -> Developers/Workbench -> API keys -> copy its secret key (`sk_test_...`). At launch, replace it with the live secret key (`sk_live_...`) from live mode.
   - `STRIPE_WEBHOOK_SECRET`: create a webhook endpoint in the **same Stripe environment** as the API key, URL `https://zfadavi.com/api/stripe/webhook`, subscribed to `checkout.session.completed`, `checkout.session.expired`, and `charge.refunded`. Reveal/copy that endpoint's signing secret (`whsec_...`). Do not use the `whsec_...` from local `stripe listen` here; that is for local development only. At launch, create/configure the live-mode endpoint and replace this with its live signing secret.
   - `TURNSTILE_SECRET_KEY`: Cloudflare Dashboard -> Turnstile -> production widget `zakereh-art` -> copy **Secret key** (not the public Site key). The widget must allow `zfadavi.com`.
   - `RESEND_API_KEY`: Resend -> API Keys -> create/use the separate production key `zakereh-art-prod` with **Sending access** only. Use it after `zfadavi.com` is verified in Resend.
   - `GITHUB_DISPATCH_TOKEN`: GitHub -> repository `arefhp/flowart` -> Settings -> Developer settings -> Fine-grained personal access tokens -> create a token restricted to this repository with **Contents: Read and write** (and Metadata: Read, automatic). This lets the Worker request the site-rebuild workflow. Keep it private.

   Wrangler should confirm each secret was uploaded. To check that names (not values) are present, run:

   ```powershell
   npx wrangler secret list
   ```

   Do not post terminal output if it includes a value; the list should show secret names only. Replacing an existing secret overwrites the old value. If the first `secret put` says the Worker does not exist, complete the first/bootstrap deploy in item 3, then return here and set the secrets; do not try to paste them into config files.
3. **First deploy:** run the GitHub `deploy` workflow (GitHub -> Actions -> deploy -> Run workflow; it uses the repository secrets from Step 3 and needs no approval click). Claude documents the very first bootstrap deploy (API first, then the site build, because the site is built from the API's data).
4. **Custom domain:** Workers & Pages -> `zakereh-art` -> **Settings** -> **Domains & Routes** -> **Add** -> **Custom domain** -> `zfadavi.com`. Disable the `workers.dev` URL once the domain works.
5. **Cloudflare Access (admin login):** Zero Trust (https://one.dash.cloudflare.com/) -> choose a team name (the free plan is fine; this is your `ACCESS_TEAM_NAME`) -> **Access** -> **Applications** -> **Add an application** -> **Self-hosted**:
   - Name `zakereh-art-admin`.
   - Public hostnames/paths: `zfadavi.com` path `/admin*` and a second entry `zfadavi.com` path `/api/admin/*`.
   - Policy: **Allow**, include **Emails** = your email address(es). Login method: **One-time PIN** (default) and/or Google.
   - Session duration: e.g. 24 hours.
   - Copy the application's **Audience (AUD) tag** and give Claude the team name and AUD (not secret) so they go into `wrangler.jsonc` as `ACCESS_TEAM_NAME`, `ACCESS_AUD`; also set `ADMIN_EMAILS` to your address.
   - Test in a private browser window: `https://zfadavi.com/admin` must ask for your email and send a code, and `https://zfadavi.com/api/admin/me` must not work without signing in.
6. **Stripe webhook:** Configure the endpoint in the same Stripe mode as `STRIPE_SECRET_KEY`: sandbox/test mode for acceptance checks, then live mode at launch. Use URL `https://zfadavi.com/api/stripe/webhook` and select exactly these three events: `checkout.session.completed`, `checkout.session.expired`, `charge.refunded`. Put that endpoint's signing secret (`whsec_...`) in the Worker secret `STRIPE_WEBHOOK_SECRET`. The Worker refuses to start in production without `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, and never with `STRIPE_FAKE` set.
7. **Cron triggers** are declared in `wrangler.jsonc` and deploy automatically; confirm under the Worker's **Settings -> Triggers**.
8. **Optional but recommended:** one Cloudflare WAF rate-limit rule for `/api/*` (Security -> WAF -> Rate limiting rules; the free plan allows a rule or two).
9. Check HTTPS: SSL/TLS mode **Full (strict)** is the default for Workers custom domains; leave it.
10. Once `https://zfadavi.com` works, tell Claude: it adds `"workers_dev": false` to `wrangler.jsonc` so the `*.workers.dev` address stops answering.

# STEP 11 — Public site checks
- `https://zfadavi.com` loads; an image loads from `media.zfadavi.com`.
- `https://zfadavi.com/api/health` returns OK.
- Publishing an artwork in `/admin` triggers the "rebuild" and appears on the public site within a few minutes (Actions tab shows the run).

# STEP 12 — Cost protection
- Stay on the Free plans. Cloudflare Free has no pay-as-you-go overage; hitting a limit causes errors, not charges.
- Cloudflare dashboard -> **Notifications**: enable usage and billing notifications to your email (if you later upgrade, also set a spending notification).
- Re-read the free-tier pages (links below) once at launch and every few months.
- Stripe -> Settings -> email alerts for failed payments and disputes.

# STEP 13 — Backups and restore (do not skip)
- The exact commands, the `age` key setup, decrypting and the restore procedure are in [docs/infrastructure.md](docs/infrastructure.md). Claude has already rehearsed the restore (`npm run restore-test -w apps/worker`).
- D1 **Time Travel** lets you restore to any minute in the last 7 days on the Free plan (30 on Paid). Claude documents the command.
- A scheduled GitHub Actions job exports the database daily, encrypts it with `age` and stores it as an artifact. You generate the `age` key pair once (Claude documents how), put the **public** key in GitHub secrets and keep the **private** key only in your password manager.
- **Monthly:** download the latest encrypted dump to your own computer. Same-vendor backups do not help if you lose the Cloudflare account.
- Keep original high-resolution artwork files on your own disk, not only in R2. The three web sizes can always be regenerated from them.
- **Test a restore** once into a scratch D1 database before launch. A backup you've never restored is not a backup.
- Set a free uptime monitor (UptimeRobot or Cloudflare health checks) on `https://zfadavi.com` and `/api/health/ready`.

# STEP 14 — Legal/admin pages (you decide the content)
Fill in `/privacy` and `/terms` (cancellation and refund policy, contact info, who is data controller). The privacy page should mention that Cloudflare, Stripe and Resend process your visitors' data. In Denmark/EU also confirm VAT (moms), invoicing, and Stripe business details with an accountant or authority. Claude provides templates only, not legal advice.

# STEP 15 — Production acceptance
PUBLIC
- [ ] Home, gallery, artwork detail, images load (from `media.zfadavi.com`)
- [ ] Priced artwork shows price; unpriced artwork shows NO price element
- [ ] Workshops list/detail, places left are live, calendar works (correct Copenhagen times, also in a browser set to another time zone), `.ics` downloads and opens in your calendar app
- [ ] Contact form (Turnstile) works and arrives at `info@zfadavi.com` -> your inbox
- [ ] About page shows your portrait and statement; both editable in `/admin/about`
- [ ] Instagram, Facebook and TikTok links show in the footer and open the right pages; editable in `/admin/social`; hiding all of them removes the section
- [ ] Mobile layout, SEO metadata, sitemap, robots
- [ ] Filters on the Artworks page work in English and Danish (category, size with Small/Medium/Large, available only), in a sidebar (a "Filters" button on phones); there is no price filter
- [ ] Gallery grid shows one cover per artwork; the artwork page shows every image and the full description; "Ask about this work" works
- [ ] English and Danish: the EN | DA switch goes to the same page in the other language, Danish gaps fall back to English, and the Danish UI wording has been read by a Danish speaker
- [ ] `/privacy` and `/terms` (English and Danish) reviewed; the 24-hour refund policy wording is the one you want

ADMIN
- [ ] `/admin` requires Cloudflare Access sign-in; `/api/admin/*` rejects unauthenticated calls
- [ ] Another email address (not on your list) cannot get in
- [ ] Artwork create/edit/upload/reorder/delete/status/feature
- [ ] Event create/edit/publish/cancel; bookings list/export
- [ ] New/changed content appears on the public site after the automatic rebuild

PAYMENT (test mode, then one real low-value payment + refund)
- [ ] Success -> confirmed only via webhook; failure doesn't confirm
- [ ] Duplicate/replayed webhook safe; capacity cannot be exceeded
- [ ] Abandoned checkout frees spots; refund + cancellation emails work
- [ ] Confirmation email arrives from `info@zfadavi.com` with `.ics`

INFRA
- [ ] Health endpoints, HTTPS, custom domain; `workers.dev` URL disabled
- [ ] Cron triggers listed; the **backup** workflow ran green and you can decrypt its file; restore tested (`npm run restore-test -w apps/worker`); monthly offline copy done once
- [ ] `npm run smoke -- https://zfadavi.com` prints "Smoke test passed"
- [ ] Browser developer tools (Console) show no red "Content Security Policy" messages on home, a workshop page, Contact and the admin
- [ ] No secrets in git (`gitleaks` clean)
- [ ] Cloudflare account 2FA on, recovery codes stored offline
- [ ] Switch Stripe to live keys only after everything above is green

# STEP 16 — Ongoing workflow
Day-to-day site management is explained in [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md): signing in, artworks, About page, events, bookings and refunds, how long changes take to appear, the monthly checklist, and what to do when something looks wrong.

1. Content changes (artworks, events, prices, About): do them in `/admin`; the site rebuilds itself.
2. Code/schema changes: ask Claude -> review diff -> CI passes -> run the `migrate` workflow if needed (you approve the `production` environment prompt) -> run the `deploy` workflow (no approval) -> verify.
3. Never make undocumented production-only changes.
4. Monthly: check Cloudflare usage page, Actions runs, uptime, Resend sending volume, Stripe dashboard; download an offline backup.

# Collaboration rule with Claude
1. You create accounts/resources.
2. Claude writes code/docs/scripts.
3. You give Claude only non-secret IDs/URLs (database ID, bucket names, Access team name and AUD tag).
4. You enter secrets directly into provider consoles / `wrangler secret put` / local `.dev.vars`.
5. You run deploy/migration commands; share logs (with secrets removed) so Claude can diagnose.

# Official links (verify current limits here)
- Cloudflare Registrar: https://www.cloudflare.com/products/registrar/
- Workers pricing/limits: https://developers.cloudflare.com/workers/platform/pricing/ · https://developers.cloudflare.com/workers/platform/limits/
- Workers static assets: https://developers.cloudflare.com/workers/static-assets/
- D1 pricing/limits: https://developers.cloudflare.com/d1/platform/pricing/ · Time Travel: https://developers.cloudflare.com/d1/reference/time-travel/
- R2 pricing: https://developers.cloudflare.com/r2/pricing/ · custom domains: https://developers.cloudflare.com/r2/buckets/public-buckets/
- Image Transformations pricing: https://developers.cloudflare.com/images/pricing/
- Cloudflare Access: https://developers.cloudflare.com/cloudflare-one/policies/access/ · validate JWT: https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/
- Email Routing: https://developers.cloudflare.com/email-routing/ · Turnstile: https://developers.cloudflare.com/turnstile/
- Resend pricing: https://resend.com/pricing · domains: https://resend.com/docs/dashboard/domains/introduction
- Stripe Checkout: https://docs.stripe.com/payments/checkout · Webhooks: https://docs.stripe.com/webhooks · CLI: https://docs.stripe.com/stripe-cli · Pricing: https://stripe.com/dk/pricing

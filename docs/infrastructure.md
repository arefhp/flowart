# Infrastructure: what runs where, and how to operate it

For the owner and any future developer. Setup steps in detail are in `OWNER_SETUP_RUNBOOK.md`; limits and upgrade triggers in `docs/MAINTENANCE.md`.

## What exists
| Piece | What it is | Name / address |
|---|---|---|
| Worker | one Cloudflare Worker serves the static site (assets) and the API (`/api/*`) | `zakereh-art` |
| Domain | custom domain on the Worker | `zfadavi.com` (route in `apps/worker/wrangler.jsonc`) |
| Database | Cloudflare D1 | `zakereh-art-db` (binding `DB`) |
| Images | R2 bucket, public through a custom domain | `zakereh-media` at `media.zfadavi.com` (binding `MEDIA`) |
| Private files | R2 bucket, never public | `zakereh-private` (binding `PRIVATE`) |
| Admin login | Cloudflare Access (Zero Trust), one-time code by email | application `zakereh-art-admin`, paths `/admin*` and `/api/admin/*` |
| Scheduled jobs | Cron Triggers in `wrangler.jsonc` | every 15 min (email, holds, refunds, rebuild catch-up), daily 03:17 UTC (cleanup) |
| Email out | Resend, domain `zfadavi.com` verified | sender `info@zfadavi.com` |
| Email in | Cloudflare Email Routing forwards `info@zfadavi.com` to the owner | the app reads no mailbox |
| Payments | Stripe Checkout + webhook `https://zfadavi.com/api/stripe/webhook` | events: `checkout.session.completed`, `checkout.session.expired`, `charge.refunded` |
| Builds and deploys | GitHub Actions: `ci`, `deploy`, `migrate`, `backup` | repository `arefhp/flowart` |

## Secrets: where each one lives
Never in git, never in chat. Worker secrets are set with `npx wrangler secret put NAME` (you type the value).

| Secret | Where |
|---|---|
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`, `GITHUB_DISPATCH_TOKEN` | Worker secrets (production); `apps/worker/.dev.vars` (local, git-ignored) |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `AGE_PUBLIC_KEY` | GitHub repository secrets |
| `age` private key | only in the owner's password manager |

In production the Worker **refuses to serve** (HTTP 500 that names the variable only) if a required value is missing, a placeholder or a test key, or if `STRIPE_FAKE` or `ADMIN_DEV_BYPASS` is set.

## Deploying
1. Merge to `main` (CI must be green).
2. If there are new migrations, run **GitHub -> Actions -> migrate** and approve (deploys never migrate).
3. Run **deploy** (or save something in the admin: that triggers it). The workflow ends with a smoke test of the live site.
4. Any time: `npm run smoke -- https://zfadavi.com`.

**Rollback:** Cloudflare dashboard -> Workers & Pages -> `zakereh-art` -> Deployments -> choose the previous version -> Rollback. This does not undo database changes (see Backups).

## Content security policy
`apps/web/public/_headers` sends a strict policy: scripts only from the site and Cloudflare Turnstile, images only from the site and `media.zfadavi.com`, nothing may frame the site, forms only post to the site. Next.js writes small inline scripts into each page, so `script-src` includes `'unsafe-inline'`; per-script hashes are not practical because every page's embedded data changes them (and header length is limited). Everything else stays locked down.
Locally, `npm run preview -w apps/worker` shows no images, because they come from `localhost`, which the production policy does not allow. Normal `npm run dev` has no policy.

## Backups
1. **Time Travel (built into D1):** restore the whole database to any minute in the last 7 days on the Free plan (30 on Paid).
   ```powershell
   cd apps/worker
   npx wrangler d1 time-travel info DB                      # shows the current bookmark: write it down (it is your undo)
   npx wrangler d1 time-travel restore DB --timestamp=2026-11-02T09:30:00Z
   ```
   (Add `--remote` where Wrangler asks for it; check `npx wrangler d1 time-travel --help` for your version.) This overwrites the live database.
2. **Daily encrypted export (GitHub `backup` workflow):** a data-only SQL dump, encrypted with `age`, kept as a workflow artifact for 30 days (Actions -> backup -> latest run -> `db-backup`).
   - One time: install `age` (https://github.com/FiloSottile/age), run `age-keygen -o age-key.txt`, put the **public** key (`age1...`) in the GitHub secret `AGE_PUBLIC_KEY`, keep `age-key.txt` only in your password manager, then delete the file from the computer.
   - Decrypt: `age -d -i age-key.txt -o dump.sql zakereh-art-2026-11-02.sql.age`. The dump holds customer names and emails: keep it private and delete it after use.
3. **Monthly:** download the newest encrypted dump to your own disk (protects you if the Cloudflare account is ever lost).
4. **Images:** keep the original artwork photos on your own disk; the three web sizes can be regenerated from them.

## Restore from a dump
The table layout always comes from the migrations; the dump holds only the data. (A full dump cannot be loaded into an empty database: rows would be inserted before the tables they point to exist.)
```powershell
# 1. Create a new empty database (dashboard: D1 -> Create) and put its id in wrangler.jsonc as database_id.
cd apps/worker
npx wrangler d1 migrations apply DB --remote        # the layout
# 2. The migrations add a few starter rows (categories, About text); the dump has the real ones.
#    Make wipe.sql containing:  PRAGMA defer_foreign_keys=TRUE;  then  DELETE FROM "<table>";  for every table
#    (artworks, artwork_images, about_page, social_links, contact_messages, email_outbox, audit_log, rate_limits,
#     site_state, categories, events, event_bookings, stripe_events)  and finally  DELETE FROM d1_migrations;
npx wrangler d1 execute DB --remote --file wipe.sql
npx wrangler d1 execute DB --remote --file dump.sql  # the data
```
**The rehearsal is automated:** `npm run restore-test -w apps/worker` exports the local database, builds a brand-new scratch database from the migrations, loads the dump and compares every table's row count. It must end with "Restore test passed". Run it after any migration that adds a table. (Verified on the Milestone 4 build: all 13 tables matched.)

## Uptime monitoring (free)
Add two monitors in UptimeRobot (free plan, 5-minute checks, email alert to you):
- `https://zfadavi.com/` with keyword `Zakereh`
- `https://zfadavi.com/api/health/ready` expecting HTTP 200

Alternative: Cloudflare -> Notifications -> Health Checks. Cloudflare's own status page: https://www.cloudflarestatus.com/

## First production deploy: order of operations
1. Create the resources (runbook Step 3) and the Stripe, Resend and Turnstile accounts (Steps 4-6).
2. `npm run migrate:prod`.
3. Set the Worker secrets.
4. Run the GitHub **deploy** workflow with *allow_empty* ticked (the site is built from the API, which does not exist yet).
5. Check `https://zfadavi.com/api/health`.
6. Create the Access application and send me the team name and AUD; they go into `wrangler.jsonc` with `ADMIN_EMAILS`.
7. Add the Stripe webhook.
8. Add some content in `/admin`; that triggers a normal deploy.
9. Walk through runbook Step 15.

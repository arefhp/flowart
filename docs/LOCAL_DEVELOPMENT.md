# Run the site on your computer

This guide gets the whole site (public pages, admin, database, image storage, emails, test payments) running on your own computer. It needs **no deployment and no Cloudflare resources**: the database and image storage are emulated locally by Wrangler (Cloudflare's CLI).

> The commands below (`npm run setup`, `dev`, `migrate:local`, `seed`, ...) are defined in `CLAUDE_IMPLEMENTATION_INSTRUCTIONS.md` sections 2 and 19 and are created in Milestone 1. Until Milestone 1 is built they will not exist yet. If a command or variable name here differs from the code, tell Claude and fix both.

**Never** paste a secret into chat, commit it, or put it in a `NEXT_PUBLIC_` variable. Local secrets live only in `apps/worker/.dev.vars` and `apps/web/.env.local` (both git-ignored).

---

## 1. What you need installed
| Tool | Why | Check |
|---|---|---|
| Git | clone the repo | `git --version` |
| Node.js LTS (includes npm) | runs the Worker and website | `node --version` |
| Stripe CLI | forwards Stripe test webhooks to your machine (only needed to test payments) | `stripe --version` |

Wrangler is installed automatically by `npm install`. No Go, Docker or Google Cloud tools are needed.

On Windows PowerShell, if `npm` is blocked by the execution policy, use `npm.cmd` instead of `npm` (for example `npm.cmd install`).

## 2. First-time setup
```powershell
git clone <your repo url> flowart
cd flowart
npm install
npm run setup          # copies the two *.example files if the real files do not exist yet, never overwrites
```
This creates:
- `apps/worker/.dev.vars`: backend variables and secrets
- `apps/web/.env.local`: website variables (non-secret only)

Then create the local database and sample data:
```powershell
npm run migrate:local  # creates the local SQLite database from the migrations
npm run seed           # sample artworks, an event, the About page text and the social links
```
Local data lives in `.wrangler/state` (git-ignored). To start over: stop the servers, delete that folder, and run the two commands again.

**Your own photos:** the `input/` folder (git-ignored) holds your portrait (`about.jpeg`) and painting photos. `npm run seed` uses them as the About portrait and as sample artworks (several with more than one image so you can try covers, thumbnails and the viewer). If `input/` is empty or missing, the seed makes placeholder images instead.

## 3. Start it
```powershell
npm run dev            # starts the Worker (API) on :8787 and the website on :3000
```
Open **http://localhost:3000**. The website proxies `/api/*` to the Worker, so everything behaves like production (one origin).

Separate terminals are also possible: `npm run dev:worker` and `npm run dev:web`.

| URL | What |
|---|---|
| http://localhost:3000 | public site (English) |
| http://localhost:3000/da | public site (Danish) |
| http://localhost:3000/admin | admin (no login locally, see section 6) |
| http://localhost:8787/api/health | API health check |
| http://localhost:8787/media/... | locally stored images (the local stand-in for `media.zfadavi.com`) |

## 4. The minimum to boot (zero accounts)
The generated `.dev.vars` is pre-filled so that the site runs **without any external account**:

- emails are printed in the terminal (`EMAIL_DRIVER=console`)
- Turnstile uses Cloudflare's always-pass test keys
- the admin area uses the development bypass
- the database and images are local

You can browse the gallery, use the admin (create artworks, upload images, edit About, edit social links, create events) and submit the contact form right away. Add the keys in section 5 only when you want to test that specific feature.

## 5. Variables and keys: what each is, where to get it
### `apps/worker/.dev.vars` (backend)
| Variable | Secret? | Needed to boot? | Local value / where to get it |
|---|---|---|---|
| `APP_ENV` | no | yes | `local` |
| `PUBLIC_SITE_URL` | no | yes | `http://localhost:3000` (production: `https://zfadavi.com`). Stripe success/cancel links are built from this |
| `ADMIN_DEV_BYPASS` | no | yes | `true`. **Local only**: the Worker refuses to start in production with it set |
| `ADMIN_EMAILS` | no | no | your email, comma separated. Production allowlist; optional locally |
| `ACCESS_TEAM_NAME`, `ACCESS_AUD` | no | no | production only. Zero Trust dashboard (runbook Step 10) |
| `EMAIL_DRIVER` | no | yes | `console` locally (prints emails in the terminal). `resend` sends real email |
| `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`, `EMAIL_REPLY_TO`, `OWNER_NOTIFICATION_EMAIL` | no | yes | pre-filled: `info@zfadavi.com`, `Zakereh Art`, `info@zfadavi.com`, `info@zfadavi.com` |
| `BOOKING_MAX_PARTICIPANTS` | no | yes | `10` (most places in one booking) |
| `BOOKING_HOLD_MINUTES` | no | yes | `30` (how long unpaid places are held) |
| `RESEND_API_KEY` | **yes** | no | only for real email. https://resend.com/api-keys -> Create API Key -> **Sending access**, name `zakereh-art-local`. Starts with `re_`. Shown once |
| `TURNSTILE_SECRET_KEY` | **yes** | yes | local test value `1x0000000000000000000000000000000AA` (always passes). Real key: Cloudflare -> Turnstile -> widget `zakereh-art-dev` |
| `STRIPE_SECRET_KEY` | **yes** | only to test payments | https://dashboard.stripe.com/test/apikeys. Stay in **Test mode**. Starts with `sk_test_` |
| `STRIPE_WEBHOOK_SECRET` | **yes** | only to test payments | printed by `stripe listen` (see section 7). Starts with `whsec_` |
| `GITHUB_DISPATCH_TOKEN`, `GITHUB_REPO` | token **yes** | no | production only. Without it, local "publish" works and the rebuild step is skipped with a notice |

### `apps/web/.env.local` (website, public values only)
| Variable | Local value |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | empty (the dev server proxies `/api` to the Worker) |
| `NEXT_PUBLIC_MEDIA_BASE_URL` | `http://localhost:8787/media` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | `1x00000000000000000000AA` (always passes; confirm at https://developers.cloudflare.com/turnstile/troubleshooting/testing/) |

### Check your setup
```powershell
npm run check-env      # lists missing or placeholder values; never prints secret values
```
A value still reading `CHANGE_ME` or a `*_xxx` example counts as missing.

## 6. The admin area locally
Locally there is no sign-in: with `ADMIN_DEV_BYPASS=true` and `APP_ENV=local` the Worker treats you as the admin, and a banner in the admin says "Local development mode". In production the same pages sit behind Cloudflare Access (one-time code sent to your email). The admin guide is in [ADMIN_GUIDE.md](ADMIN_GUIDE.md).

## 7. Test payments (Stripe test mode)
1. Put your `sk_test_...` key in `.dev.vars` as `STRIPE_SECRET_KEY`.
2. In a **second terminal** run:
   ```powershell
   stripe login
   stripe listen --forward-to localhost:8787/api/stripe/webhook
   ```
   It prints `Ready! Your webhook signing secret is whsec_...`. Put that value in `.dev.vars` as `STRIPE_WEBHOOK_SECRET` and restart the Worker (the secret changes if you run `stripe login` again).
3. Book a workshop on http://localhost:3000/workshops and pay with:
   | Card | Result |
   |---|---|
   | `4242 4242 4242 4242` | success |
   | `4000 0000 0000 9995` | declined (insufficient funds) |
   | `4000 0025 0000 3155` | requires 3-D Secure authentication |
   Any future expiry date, any 3-digit CVC, any postcode.
4. The success page first says "We're confirming your payment"; the booking becomes **Confirmed** only when the webhook arrives. If it stays pending, `stripe listen` is not running or the webhook secret is wrong.

Check the current test cards at https://docs.stripe.com/testing.

## 8. Test email
- Default (`EMAIL_DRIVER=console`): every email is printed in the Worker terminal, including the calendar attachment name. Use this for everyday work.
- Real delivery: set `EMAIL_DRIVER=resend` and `RESEND_API_KEY`. Until `zfadavi.com` is verified in Resend (runbook Step 5), you can only send to your own Resend account email, from `onboarding@resend.dev`. Set `EMAIL_FROM_ADDRESS=onboarding@resend.dev` temporarily for that test and change it back afterwards.

## 9. Everyday commands
| Command | What it does |
|---|---|
| `npm run dev` | start Worker + website |
| `npm run test` | Worker tests (Vitest) and frontend tests |
| `npm run lint` / `npm run typecheck` | static checks |
| `npm run build` | static export of the website |
| `npm run migrate:local` | apply new database migrations locally |
| `npm run seed` | reload sample data |
| `npm run check-env` | validate your variables |
| `npm run migrate:prod` | **production**: only when you intend it (runbook Step 10) |

## 10. Troubleshooting
| Problem | Likely cause and fix |
|---|---|
| `check-env` reports a missing variable | open `apps/worker/.dev.vars`, read the comment above that variable |
| Admin pages say "Your session ended" | the Worker is not running, or `APP_ENV` is not `local` / `ADMIN_DEV_BYPASS` is not `true` |
| Images do not load | `NEXT_PUBLIC_MEDIA_BASE_URL` must be `http://localhost:8787/media` and the Worker must be running |
| Contact form says verification failed | `TURNSTILE_SECRET_KEY` (backend) and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (website) must be the matching **test pair** or a matching real pair |
| Booking stays "pending" after paying | `stripe listen` not running, or `STRIPE_WEBHOOK_SECRET` is not the value it printed |
| `Port 8787 / 3000 already in use` | close the other copy of the server |
| Database looks wrong or broken | stop servers, delete `.wrangler/state`, run `npm run migrate:local` and `npm run seed` |
| `npm` is blocked in PowerShell | use `npm.cmd` instead |
| Worker refuses to start in production, naming a variable | that variable is missing or still a placeholder; set it with `npx wrangler secret put NAME` |

## 11. Safety reminders
- Never commit `.dev.vars`, `.env`, `.env.local`, database exports or `.wrangler/`. The repo's `.gitignore` and gitleaks CI check cover this, but you are the last line of defence.
- Use **test** Stripe keys locally. Live keys are only ever set as production Worker secrets.
- If a key leaks: revoke it in the provider's dashboard (Resend -> API Keys, Stripe -> API keys -> Roll key, Turnstile -> Rotate secret key), create a new one, and update `.dev.vars` / `wrangler secret put`.

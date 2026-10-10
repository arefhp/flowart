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
npm run seed           # five sample artworks (one without a price, one sold, one hidden, one in the Resin category), the About portrait and five sample workshops (two upcoming, one draft, one cancelled, one past)
```
The About text (English and Danish), the three social links and the two starting categories (Fine Art, Resin) are part of the database migration, so they are there as soon as `migrate:local` has run. The sample workshops are dated relative to the day you run the seed, so they are always upcoming.

Local data lives in `apps/worker/.wrangler/state` (git-ignored). To start over: stop the servers, delete that folder, and run the two commands again. `npm run seed` is safe to run twice: it skips what already exists.

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
| `MEDIA_BASE_URL` | no | yes | `http://localhost:8787/media` (production `https://media.zfadavi.com`). Where image addresses point |
| `CONTACT_RETENTION_MONTHS` | no | no | `12`. Contact messages older than this are deleted by the daily cleanup |
| `ADMIN_DEV_BYPASS` | no | yes | `true`. **Local only**: the Worker refuses to start in production with it set |
| `ADMIN_EMAILS` | no | no | your email, comma separated. Production allowlist; optional locally |
| `ACCESS_TEAM_NAME`, `ACCESS_AUD` | no | no | production only. Zero Trust dashboard (runbook Step 10) |
| `EMAIL_DRIVER` | no | yes | `console` locally (prints emails in the terminal). `resend` sends real email |
| `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`, `EMAIL_REPLY_TO`, `OWNER_NOTIFICATION_EMAIL` | no | yes | pre-filled: `info@zfadavi.com`, `Zakereh Art`, `info@zfadavi.com`, `info@zfadavi.com` |
| `BOOKING_MAX_PARTICIPANTS` | no | yes | `10` (most places in one booking) |
| `BOOKING_HOLD_MINUTES` | no | yes | `30` (how long unpaid places are held) |
| `RESEND_API_KEY` | **yes** | no | only for real email. https://resend.com/api-keys -> Create API Key -> **Sending access**, name `zakereh-art-local`. Starts with `re_`. Shown once |
| `TURNSTILE_SECRET_KEY` | **yes** | yes | local test value `1x0000000000000000000000000000000AA` (always passes). Real key: Cloudflare -> Turnstile -> widget `zakereh-art-dev` |
| `STRIPE_SECRET_KEY` | **yes** | only to test with the real Stripe sandbox | https://dashboard.stripe.com/test/apikeys. Stay in **Test mode**. Starts with `sk_test_`. Leave it as `sk_test_xxx` and the built-in pretend payment page is used instead (section 7) |
| `STRIPE_WEBHOOK_SECRET` | **yes** | only to test with the real Stripe sandbox | printed by `stripe listen` (see section 7). Starts with `whsec_` |
| `STRIPE_FAKE` | no | yes | `true` (local only): while `STRIPE_SECRET_KEY` is empty or an example value, bookings use the pretend payment page, no Stripe account needed. A real key always wins. The Worker refuses to start in production if this is set |
| `GITHUB_DISPATCH_TOKEN`, `GITHUB_REPO` | token **yes** | no | production only. Without it, local "publish" works and the rebuild step is skipped with a notice |

### `apps/web/.env.local` (website, public values only)
| Variable | Local value |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` (production `https://zfadavi.com`). Used for canonical links and the sitemap |
| `BUILD_API_BASE_URL` | `http://localhost:8787`. The API the static site is built from. The build fails loudly if it cannot be reached |
| `ALLOW_EMPTY_BUILD` | optional. `1` only for the very first deploy, before any API exists |

The browser never needs an API address (it always calls the same origin), and image addresses come from the API, which builds them from the Worker's `MEDIA_BASE_URL`.
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | `1x00000000000000000000AA` (always passes; confirm at https://developers.cloudflare.com/turnstile/troubleshooting/testing/) |

### Check your setup
```powershell
npm run check-env      # lists missing or placeholder values; never prints secret values
```
A value still reading `CHANGE_ME` or a `*_xxx` example counts as missing.

## 6. The admin area locally
Locally there is no sign-in: with `ADMIN_DEV_BYPASS=true` and `APP_ENV=local` the Worker treats you as the admin, and a banner in the admin says "Local development mode". In production the same pages sit behind Cloudflare Access (one-time code sent to your email). The admin guide is in [ADMIN_GUIDE.md](ADMIN_GUIDE.md).

## 7. Test booking and payments
There are two ways. Start with A; use B when you want to see the real Stripe test page.

### A. Pretend payment page (no account, works offline)
With `STRIPE_SECRET_KEY` left as `sk_test_xxx` (or empty) and `STRIPE_FAKE=true` (both are the defaults from `npm run setup`), booking a paid workshop sends you to a plain page that says **Local test only**, with three buttons:
- **Pay (pretend)**: runs exactly the code a real Stripe confirmation runs (only the signature check is skipped), then returns to the "thank you" page. The confirmation emails are printed in the Worker terminal.
- **Go back**: like pressing Back on Stripe's page: nothing is paid, the places stay held for a while.
- **Let the payment page expire**: releases the places, like Stripe's page timing out.

Everything else is real: the booking is saved in the local database, places are held, the admin shows it, you can refund it. Refunds are pretended too. This page does not exist in production: the Worker refuses to start there with `STRIPE_FAKE` set, and the page answers 404.

If your `.dev.vars` already holds a real sandbox key (which always wins), start the site with **`npm run dev:pretend`** instead of `npm run dev`: it forces the pretend page, the always-pass spam check and console email, without touching your files.

A free workshop (price 0) needs no payment at all and is confirmed immediately, in either mode.

### B. The real Stripe sandbox
1. Put your `sk_test_...` key in `.dev.vars` as `STRIPE_SECRET_KEY` (a real key always wins over the pretend page).
2. In a **second terminal** run:
   ```powershell
   stripe login
   stripe listen --forward-to localhost:8787/api/stripe/webhook --events checkout.session.completed,checkout.session.expired,charge.refunded
   ```
   It prints `Ready! Your webhook signing secret is whsec_...`. Put that value in `.dev.vars` as `STRIPE_WEBHOOK_SECRET` and restart the Worker (the secret changes if you run `stripe login` again). Keep this terminal open while testing.
3. Book a workshop on http://localhost:3000/workshops and pay with:
   | Card | Result |
   |---|---|
   | `4242 4242 4242 4242` | success |
   | `4000 0000 0000 9995` | declined (insufficient funds) |
   | `4000 0025 0000 3155` | requires 3-D Secure authentication |
   Any future expiry date, any 3-digit CVC, any postcode.
4. The success page first says "We're confirming your payment"; the booking becomes **Confirmed** only when the webhook arrives. If it stays waiting, `stripe listen` is not running or the webhook secret is wrong.
5. In the admin, **Bookings -> Cancel and refund** sends a real refund to the Stripe sandbox; check it under Stripe -> Payments.

Check the current test cards at https://docs.stripe.com/testing.

Tests never use your real key: the automated tests and `npm run test:e2e` run the Worker with the pretend page forced on (`npm run dev:e2e -w apps/worker`), with the always-pass spam check, console email and no GitHub rebuild trigger, whatever is in your `.dev.vars`.

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
| Images do not load | `MEDIA_BASE_URL` in `apps/worker/.dev.vars` must be `http://localhost:8787/media` and the Worker must be running. After changing it, restart `npm run dev` |
| A new artwork's public page is missing or shows an error | an artwork is public only when its status is not Hidden **and** it has at least one image. In development, a hidden or image-less artwork's page shows an error instead of the friendly 404; that is expected and does not happen in production |
| `npm run build` says it cannot reach the API | start the Worker first (`npm run dev:worker`) so there is an API to build from |
| `npm run build` fails with "resource busy or locked" on `out` | an old `wrangler dev` from an earlier version holds the folder: stop all dev servers and try again |
| Contact form says verification failed | `TURNSTILE_SECRET_KEY` (backend) and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (website) must be the matching **test pair** or a matching real pair |
| Booking stays "pending" after paying | with the real sandbox: `stripe listen` not running, or `STRIPE_WEBHOOK_SECRET` is not the value it printed. With the pretend page: press **Pay (pretend)** on it |
| "Online payment is not available right now" when booking a paid workshop | no usable payment mode: set `STRIPE_FAKE=true` with `STRIPE_SECRET_KEY=sk_test_xxx`, or put a real sandbox key in `STRIPE_SECRET_KEY` |
| `Port 8787 / 3000 already in use` | close the other copy of the server |
| Database looks wrong or broken | stop servers, delete `.wrangler/state`, run `npm run migrate:local` and `npm run seed` |
| `npm` is blocked in PowerShell | use `npm.cmd` instead |
| Worker refuses to start in production, naming a variable | that variable is missing or still a placeholder; set it with `npx wrangler secret put NAME` |

## 11. Safety reminders
- Never commit `.dev.vars`, `.env`, `.env.local`, database exports or `.wrangler/`. The repo's `.gitignore` and gitleaks CI check cover this, but you are the last line of defence.
- Use **test** Stripe keys locally. Live keys are only ever set as production Worker secrets.
- If a key leaks: revoke it in the provider's dashboard (Resend -> API Keys, Stripe -> API keys -> Roll key, Turnstile -> Rotate secret key), create a new one, and update `.dev.vars` / `wrangler secret put`.

## 12. Tests, and checking a production-style build
```powershell
npm run typecheck       # types in all three packages
npm run lint            # code style and common mistakes
npm test                # unit tests (shared, Worker with real local D1/R2, website)
npm run test:built-html # builds the site against a mock API and checks the generated HTML (the no-price rule, About, social links, languages)
npm run test:e2e        # drives a real browser through the site, the admin and the whole booking journey (needs the seeded sample data; starts the servers itself, with the pretend payment page forced on). If you already run `npm run dev`, stop it first so the tests start their own Worker
```
`npm run test:built-html` and `npm run build` both use the `apps/web/.next` folder, so stop `npm run dev` first. The first time you run the end-to-end tests, install the browser once: `npx playwright install chromium`.

To see the site the way Cloudflare will serve it (static files, the API in front, the 404 page, security headers), with the Worker running (`npm run dev:worker`):
```powershell
npm run build           # builds the static site into apps/web/out
npm run preview -w apps/worker   # serves it on http://localhost:8788
```

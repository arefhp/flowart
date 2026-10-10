# flowart — Zakereh Art Website

Art portfolio + workshop booking site for a Copenhagen-based artist.

- **Gallery:** the grid shows one cover image per artwork; clicking it opens the artwork page with all its images, the full description, and an "Ask about this work" button. Price is optional — if the admin leaves it empty, no price is shown anywhere on the public site.
- **Categories and filters:** the owner defines categories (starting with Fine Art and Resin) and picks a category and a size (Small, Medium, Large) for each artwork. Visitors filter the gallery from a sidebar by category, size (Small, Medium, Large) and availability. A price-range filter is built but switched off for now.
- **Languages:** English (root) and Danish (`/da/`) from day one; Danish text is optional per field and falls back to English. The About statement has a Danish version from the start.
- **Workshops/events:** date and time (always Copenhagen time, summer and winter handled), capacity with live places left, calendar view and `.ics` download; Stripe Checkout payment and confirmation arrive in Milestone 3.
- **Contact:** contact form with spam protection.
- **Admin:** private `/admin` area (protected by Cloudflare Access) to manage everything without touching code.

## Stack (all-Cloudflare)
Next.js (static export) + a TypeScript Hono API, served by **one Cloudflare Worker** at `https://zfadavi.com` · **D1** (SQLite) for artworks, bookings, customers and messages · **R2** for images (`media.zfadavi.com`, browser-generated WebP sizes) · **Cloudflare Access** for admin login · Stripe Checkout · Resend for email sent from `info@zfadavi.com` (received via Cloudflare Email Routing) · Turnstile · GitHub Actions.

Fixed running cost: the domain, about 10.5 USD/year. Everything else fits the free tiers (see the runbook for limits and the upgrade triggers).

## Documents
| File | Audience | Purpose |
|---|---|---|
| [CLAUDE_IMPLEMENTATION_INSTRUCTIONS.md](CLAUDE_IMPLEMENTATION_INSTRUCTIONS.md) | Claude / developers | Architecture, requirements, milestones |
| [OWNER_SETUP_RUNBOOK.md](OWNER_SETUP_RUNBOOK.md) | Owner | Accounts, deployment, backups, cost estimate, acceptance checklist |
| [OWNER_VALUES.md](OWNER_VALUES.md) | Owner | Fill-in sheet of the non-secret IDs and details Claude needs (database ID, Access AUD, contact details, ...) |
| [docs/LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md) | Owner / developers | Run everything locally: setup, every variable and API key, Stripe test payments, troubleshooting |
| [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md) | Owner | Managing the site in `/admin`: artworks, About, events, bookings, rebuilds, monthly routine |
| [docs/LANGUAGE_REVIEW.md](docs/LANGUAGE_REVIEW.md) | Owner / Danish reviewer | The English and Danish site wording and the `/terms` and `/privacy` texts the site is built from |
| [docs/MAINTENANCE.md](docs/MAINTENANCE.md) | Owner / developers | Free-tier limits (including the Workers 10 ms CPU risk) and how to raise them, routine maintenance |

## Non-secret identifiers
| Item | Value |
|---|---|
| Site | https://zfadavi.com |
| Images | https://media.zfadavi.com (R2 bucket `zakereh-media`) |
| D1 database | `zakereh-art-db` (database ID is added to `apps/worker/wrangler.jsonc` after creation) |
| Public email | `info@zfadavi.com` (sender via Resend, receiver via Email Routing) |

**Secrets (never commit, never paste in chat):** Stripe keys, Turnstile secret, Resend API key, GitHub dispatch token, Cloudflare API token. Locally they live in `apps/worker/.dev.vars` (git-ignored); in production they are Worker secrets (`wrangler secret put`) and GitHub secrets.

## Run locally (quick start)
Needs only Node.js LTS. No accounts or real keys are required to boot; emails print in the terminal and admin has no login locally.
```powershell
npm install
npm run setup          # creates apps/worker/.dev.vars and apps/web/.env.local from the examples
npm run migrate:local  # local database
npm run seed           # sample data
npm run dev            # site on http://localhost:3000, API on :8787, admin at /admin
```
Add a Stripe **test** key / Resend key only for the features that need them. Full details: [docs/LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md). Managing the site: [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md).

## Status
**Milestones 1 and 2 are built:** the bilingual gallery (cover images, artwork pages with a viewer, filters, "Ask about this work"), the About page, social links, the contact form, **workshops** (list, pages with live places, "Add to calendar" files, a month calendar) and the admin for all of it, with tests. Next: Milestone 3 (online booking and payments), Milestone 4 (production hardening and launch). Until Milestone 3, visitors ask for a place by message. The quick start above works as written.

Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:built-html`, `npm run test:e2e` (see [docs/LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md), section 12).

Workflow: work happens on `main`. After each milestone Claude verifies it, commits locally, and gives the owner a run-and-check list; the owner replies "approved" before it is pushed and the next milestone starts (see section 21.1 of the implementation instructions). Stripe runs in the owner's sandbox (test keys) until launch.

Never commit secrets (`.dev.vars`, `.env`, API keys, database dumps).

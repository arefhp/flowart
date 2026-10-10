# CLAUDE_IMPLEMENTATION_INSTRUCTIONS.md

## Project: Zakereh Art Website

You are the primary coding agent. Build a production-ready art portfolio + workshop booking website for a Copenhagen-based artist, at (near) zero monthly running cost. Only the domain name is a fixed cost.

Rules that always apply:
- Never ask the owner to paste secrets into chat. Use placeholders and `.dev.vars.example`. Never commit real credentials.
- Work milestone by milestone (section 21). Do not start a milestone before the previous one runs locally and its tests pass.
- Do not invent credentials, resource IDs, or provider features. If unsure whether a provider feature/limit is current, say so and point to the official doc (free-tier limits change; verify them).
- When blocked on a human action, implement everything else and document the exact action required.
- Work directly on `main` (owner decision). Commit locally at the end of each milestone, after your own verification (section 21.1). Push only when the owner approves that milestone. Never commit `input/`, secrets or `.claude/settings.local.json`.
- Every milestone ends with the **milestone gate** (section 21.1): verify it yourself first (tests, build, run the app and exercise the new features), then give the owner a short run-and-check list, then STOP and wait for "approved" before starting the next milestone.
- Owner-facing text and docs must stay consistent with this file. When you change behavior, update the affected docs in the same change (`docs/*.md`, `OWNER_SETUP_RUNBOOK.md`, `OWNER_VALUES.md`, `README.md`).

## Key decisions and why
Decided; do not re-litigate without the owner.

| Topic | Decision | Why |
|---|---|---|
| Backend | **TypeScript Worker (Hono)** | Runs natively on Workers. One language end to end, no cold starts, no cloud billing account. |
| Database | **Cloudflare D1 (SQLite)** | Free, same platform, never pauses, no connection strings or password encoding. |
| Files | **Cloudflare R2** | 10 GB free, zero egress fees, served through the Cloudflare CDN. |
| Images | **Pre-generated WebP variants made in the admin browser**; Cloudflare Image Transformations only as an optional fallback | Workers have no native image library; browser resizing costs nothing, strips EXIF, and avoids the 5,000 unique transformations/month cap. |
| Admin auth | **Cloudflare Access (free, up to 50 users) + JWT verified in the Worker** | The Workers Free plan allows only 10 ms CPU per request, so password hashing would not reliably fit. No passwords to store, leak or reset. |
| Same-origin API | **One Worker serves static assets and `/api/*`** | Same origin by construction. No CORS, no cookie problems. |
| Cron | **Workers Cron Triggers** | Nothing pauses; cron only does cleanup and email retry. |
| Email | **Resend** for sending, **Cloudflare Email Routing** for receiving | `info@zfadavi.com` sends via Resend and receives via forwarding. |
| Languages | **English (root) + Danish (`/da/`) from day one** | Owner decision. English URLs are unprefixed (`/artworks`), Danish mirrors them under `/da/` (`/da/artworks`). Content is entered in both languages in the admin; Danish is optional per field and falls back to English (section 16.1). |
| Stripe scope | **Checkout + webhooks only. No Stripe Invoicing.** Customers get Stripe's payment receipt plus our own confirmation email. | Owner decision. Cards, Apple Pay and Google Pay (dashboard-managed payment methods). No MobilePay for now. |
| Workflow | **Commit to `main`, milestone gate after each milestone** | Owner decision (section 21.1). |
| Stripe environment | **Stripe sandbox (test mode keys, `sk_test_...`)** until the owner says otherwise | The Stripe MCP/planner is not used; follow Stripe's official docs and re-verify API details at implementation time. |

Accepted trade-offs: single-vendor concentration (domain, DNS, hosting, DB and files all at Cloudflare) and SQLite instead of Postgres (no row locks, simpler types). Mitigations are in sections 14 and 15.

---

# 1. Architecture (decided)

| Concern | Choice |
|---|---|
| Frontend | Next.js + TypeScript + Tailwind, **static export** (`output: 'export'`) |
| Hosting (frontend + API) | **One Cloudflare Worker with static assets** (`wrangler.jsonc`: `assets.directory = ../web/out`, `run_worker_first: ["/api/*"]`). Verify the current option names in Cloudflare's docs at setup time. |
| Backend | TypeScript Worker, **Hono** router, `zod` validation |
| Database | **Cloudflare D1** (binding `DB`) |
| Migrations | `wrangler d1 migrations` (sequential `.sql`), run as an explicit step |
| File storage | **R2**: public bucket `zakereh-media` on custom domain `media.zfadavi.com`; private bucket `zakereh-private` for originals (optional) |
| Image delivery | Pre-generated WebP variants (480/960/1920 px wide) served from R2 via CDN; optional Cloudflare Image Transformations fallback |
| Payments | Stripe Checkout + webhooks |
| Email | Resend over HTTPS (`fetch`); receiving via Cloudflare Email Routing |
| Bot protection | Cloudflare Turnstile on contact + booking |
| Admin auth | **Cloudflare Access** in front of `/admin*` and `/api/admin/*`; Worker verifies the Access JWT |
| Customers | Guest checkout, NO accounts |
| Domain/DNS | `zfadavi.com`, Cloudflare Registrar + DNS |
| Scheduled work | Workers Cron Triggers |
| IaC | **None required.** D1 migrations are the schema source of truth; `wrangler.jsonc` declares bindings, routes and crons. Everything else is documented one-time setup. No Terraform. |
| CI/CD | GitHub Actions (`wrangler deploy`) |

Do not introduce Next.js server features (server actions, route handlers, SSR, middleware); the build must succeed with `output: 'export'`. Do not use Node-only APIs in the Worker; use Web APIs (`fetch`, `crypto.subtle`, `crypto.randomUUID`). Enable `nodejs_compat` only if a dependency needs it.

## 1.1 Same origin (solved by design)
One Worker answers `https://zfadavi.com`: requests under `/api/*` run the Worker code; everything else is served from the static asset bundle. The browser sees one origin, so no CORS and no cross-site cookie issues.
- The browser always calls the same origin (`/api/*`); there is no API base URL setting for the browser. Local dev: Next on `http://localhost:3000` proxies `/api/*` to `wrangler dev` on `http://localhost:8787` (Next `rewrites` in dev only, which is permitted with `output: 'export'` when guarded by `NODE_ENV`). The static build itself reads the API from the build-time variable `BUILD_API_BASE_URL`.
- `*.workers.dev` may be enabled for preview only. Access and Turnstile hostnames are configured for `zfadavi.com`.

## 1.2 Static export vs dynamic content (important)
`/artworks/[slug]` etc. exist only for slugs known at build time.
- The web build fetches published artworks/events/about from the public API (`BUILD_API_BASE_URL`, default `https://zfadavi.com`) and uses `generateStaticParams`. Good for SEO and the "no price" rule. First-ever deploy bootstrap: deploy the Worker with an empty asset directory so the API exists, then build and redeploy the site. Document it; the build must fail loudly (not silently emit an empty site) if the API is unreachable in CI, except when `ALLOW_EMPTY_BUILD=1`.
- When admin creates/updates/publishes/hides an artwork, event, the About page or the social links (section 4B), the Worker triggers a rebuild by sending a GitHub `repository_dispatch` (event type `site-rebuild`) using `GITHUB_DISPATCH_TOKEN` (a fine-grained token limited to this repo, Actions: write; SECRET). The workflow builds `apps/web` and runs `wrangler deploy`. Debounce (at most one trigger per minute, state kept in D1 table `site_state`); failure to trigger must not fail the admin save. Log it and show "site rebuild pending/failed" in admin.
- Admin pages (`/admin/**`) are client-rendered with query-param detail pages (`/admin/artworks/edit?id=...`). No `[id]` dynamic routes in admin.
- Live data (remaining capacity, event status) is fetched client-side from the API on page load. Static HTML is never trusted for availability. Availability and booking endpoints send `Cache-Control: no-store`.
- Rebuild must also be possible manually (admin button -> same endpoint, and a manual `workflow_dispatch`).

---

# 2. Repository structure

```
/
  apps/
    web/                 # Next.js (static export)
    worker/              # Hono Worker: src/index.ts, src/routes, src/lib, wrangler.jsonc, migrations/
  docs/
  scripts/               # .ps1 and .sh equivalents
  .github/workflows/
  README.md
```
`apps/worker/.dev.vars.example` (backend secrets for local dev), `apps/web/.env.local.example` (frontend). Work on Windows PowerShell and macOS/Linux. Provide `scripts/*.ps1` and `*.sh` for common tasks; an npm-workspaces `package.json` at the root exposes the same tasks (`npm run dev|test|lint|build|migrate:local|migrate:prod`).

---

# 3. Frontend

Public routes (English at the root, the same set mirrored under `/da/` for Danish, section 16.1): `/`, `/artworks`, `/artworks/[slug]`, `/workshops`, `/workshops/[slug]`, `/calendar`, `/about`, `/contact` (accepts `?artwork=<slug>` for enquiries, section 4), `/privacy`, `/terms`, `/booking/success`, `/booking/cancelled`; Danish: `/da`, `/da/artworks`, `/da/artworks/[slug]`, and so on. The admin (`/admin/**`) is English only.

Admin routes (client-rendered, query-param detail pages, behind Cloudflare Access): `/admin`, `/admin/artworks`, `/admin/artworks/new`, `/admin/artworks/edit?id=`, `/admin/events`, `/admin/events/new`, `/admin/events/edit?id=`, `/admin/bookings`, `/admin/calendar`, `/admin/messages`, `/admin/categories` (section 4), `/admin/about` (section 4A), `/admin/social` (section 4B). There is no `/admin/login` page: Access performs the login before the page is served. A signed-out/expired state shows a "Your session ended, reload to sign in again" message when `/api/admin/me` returns 401/redirects.

Rules:
- Config: `NEXT_PUBLIC_SITE_URL` (canonical links, sitemap), `NEXT_PUBLIC_TURNSTILE_SITE_KEY`; build time only: `BUILD_API_BASE_URL`, `ALLOW_EMPTY_BUILD`. The image host is not a website setting: the API returns image URLs built from the Worker's `MEDIA_BASE_URL`.
- No secrets in the browser. Only `NEXT_PUBLIC_*` for non-secret values.
- `/booking/success` says "We're confirming your payment" and polls the booking status from the API; it never marks anything paid itself.
- Every user-facing string comes from the translation dictionaries (section 16.1), never hard-coded in components.

---

# 4. Artworks

D1/SQLite type conventions used everywhere (section 9): ids are `TEXT` UUIDs from `crypto.randomUUID()`, timestamps are `TEXT` ISO-8601 UTC (`2026-10-08T14:30:00.000Z`), booleans are `INTEGER 0/1`, money is `INTEGER` minor units.

Fields: `id`, `title`, `title_da` null, `slug` (unique, generated from the English title, shared by both languages), `description` null, `description_da` null, `price_minor` **INTEGER null**, `currency` null (required iff price set), `width_cm` null, `height_cm` null, `depth_cm` null, `medium` null, `medium_da` null, `year` null, `status` (available|sold|reserved|hidden), `featured`, `category_id` (FK to `categories.id`, `ON DELETE RESTRICT`), `size_class` (`small`|`medium`|`large`, chosen by the owner, not calculated from the centimetres), `cover_image_id` null (FK to `artwork_images.id`, `ON DELETE SET NULL`), `created_at`, `updated_at`. English fields are required where the English field is required today; `*_da` fields are optional and fall back to English (section 16.1).

`artwork_images`: `id`, `artwork_id`, `object_key_base` (e.g. `artworks/{artwork_id}/{uuid}`; variants are `{base}-480.webp`, `-960.webp`, `-1920.webp`), `alt_text`, `alt_text_da` null, `sort_order`, `width`, `height`, `created_at`.

## Gallery: one cover per artwork, click for more (owner requirement)
- **Cover image.** Each artwork has one cover: `cover_image_id` if set, otherwise the image with the lowest `sort_order`. In the admin, each image has a **Set as cover** button and the current cover is clearly marked; reordering never changes the cover; deleting the cover image falls back to the first remaining image (the FK sets `cover_image_id` to NULL).
- **Gallery grid (`/artworks`).** Shows **one card per artwork, with only its cover image**, the title, and a status badge for `sold` / `reserved`. No price unless set (rule below). Fixed aspect-ratio box using the cover's width/height so there is no layout shift; responsive `srcset`; lazy-load below the fold. An artwork with **no image** is not shown in the public gallery (no empty frame or placeholder), and the admin list marks it "No image: not shown publicly".
- **Artwork page (`/artworks/[slug]`)**, reached by clicking the card: the cover large at the top; a **thumbnail strip of all images** (cover first, then `sort_order`); clicking any image opens a **full-screen viewer** (an accessible dialog: focus trap, Esc to close, left/right arrow keys and on-screen buttons, swipe on touch, pinch/zoom not blocked, image counter, each image's alt text, neighbours preloaded). Below: the **full description** (paragraph rules as in section 4A, plain text only), then the medium, year and size rows that exist, then the status, then the **Ask about this work** button.
- **If an artwork has a single image**, there is no thumbnail strip and no counter, only the click-to-enlarge viewer.
- **Ask about this work.** Links to `/contact?artwork=<slug>` (`/da/contact?...` in Danish). The contact page fetches the artwork title and pre-fills the message ("I am interested in the artwork "{title}"." in the page language; the visitor can edit it). The Worker stores the optional `artwork_id` on `contact_messages` and includes the title in the owner's notification email. Shown for `available` and `reserved` works; not shown for `sold` (hidden works are never public). It never mentions a price.
- **Public API:** `GET /api/artworks?lang=` (list) returns for each artwork only `{ slug, title, status, medium?, cover: { url, alt, width, height } }` plus `price_minor`/`currency` only when set; `GET /api/artworks/{slug}?lang=` returns the full description and `images: [{ url, alt, width, height }]` ordered with the cover first. Image URLs are the base key; the client builds `-480/-960/-1920` variants. Build DTOs explicitly.

## Categories, sizes and gallery filters (owner requirements)
- **Categories** are defined by the owner in `/admin/categories`. Table `categories` (`id`, `name`, `name_da` null, `slug` unique and stable, `sort_order`, timestamps; a unique index on `lower(trim(name))`). Migration 0003 seeds **Fine Art** and **Resin**. Each artwork has **exactly one** category, chosen when it is added (required; a new artwork starts in the first category). The owner can add, rename (the slug does not change, so shared filter links keep working), reorder and delete categories.
- **Deleting a category is blocked while any artwork (even hidden) is in it:** the API answers `409` with code `category_in_use`, a message that names the category and the count, and `details: { count, titles }`; the admin shows it on that row with the artwork titles. The database enforces it as well (`ON DELETE RESTRICT`). Nothing is deleted until none are assigned.
- **Size class** `small | medium | large` is chosen by the owner for every artwork (required in the form and API).
- **Public API:** list and detail DTOs include `category: { slug, name }` (name resolved for the language) and `size` (omitted when never set). `GET /api/categories?lang=` returns only categories that have at least one **shown** artwork (not hidden, has an image), with a count, in the owner's order, so there is never an empty filter button.
- **Filters on `/artworks`** (English and Danish) are a **sidebar** to the left of the gallery (a "Filters" button that folds them away below the `lg` breakpoint), as quiet text rows with the active choice marked and a small count per option (`aria-pressed`, 44 px touch targets): **Category**, **Size**, **Available only**, plus "Showing X of Y" and **Clear filters**. **Size always offers Small, Medium and Large** (a size with no artwork shows a count of 0 and, when chosen, the "no match" message). Category appears when there are >= 2 shown categories; availability only when some work is not available. A **price-range filter exists but is switched off** (`SHOW_PRICE_FILTER = false` in `apps/web/src/lib/price-bands.ts`, owner decision); the rules below describe it for when it is turned on, and while it is off a `price` in the address is ignored and no price filter wording is sent to the browser. Choices live in the address (`?category=resin&size=small&price=mid&available=1`), so a filtered view can be shared; invalid values are ignored. Filtering runs in the browser on a page that is **built with every artwork in the HTML** (search engines and no-script visitors see the full gallery); it must not use `useSearchParams` during the build, which would drop the list from the static HTML.
- **Price filter (switched off) and the optional-price rule:** the ranges are in `apps/web/src/lib/price-bands.ts` (under 5,000, 5,000 to 15,000, over 15,000 DKK; only DKK prices are compared). A range appears only when an artwork falls in it; an artwork without a price is in no range; and when **no** artwork has a price the page contains no price filter and no price words at all (not even in the data sent to the browser). A built-HTML test enforces this.
- **Artwork page:** a link to its category (`/artworks?category=slug`) next to the "Artworks" link.

## CRITICAL BUSINESS RULE: optional price
- `price_minor IS NULL` = no price specified. `0` = genuinely free.
- Admin form: price may be empty; empty submits `null` (not 0).
- **API layer:** public artwork JSON must OMIT `price_minor`/`currency` keys entirely when NULL. Build the public DTO explicitly; never spread the DB row into the response.
- **UI layer:** render the price component only when price is non-null. No label, placeholder, "N/A", "-", "Free", "0", empty container, or `aria` text for a NULL price. Same for JSON-LD/Open Graph/sitemap data.
- Mandatory automated tests at API level (key absent) AND on built HTML (no price markup) for a NULL-price artwork.
- Show size only for the dimensions that exist; hide the size row if none.

Admin: create/edit/delete artwork, English and Danish text fields side by side (Danish marked optional), upload multiple images, reorder, **set cover**, delete images, per-image alt text in both languages, change status, feature, set optional price. Public: browse and view `available|sold|reserved` (hidden is never returned by public endpoints).

---

# 4A. About page (owner-editable text + artist portrait)

The `/about` page shows an artist portrait and the artist statement below. Both must be editable by the owner in `/admin/about` without a code change. The text below is the **initial content**; seed it in a migration so the page is correct on first deploy.

Data: a singleton table `about_page` (`id INTEGER PRIMARY KEY CHECK (id = 1)`, `heading TEXT null`, `heading_da TEXT null`, `body TEXT not null`, `body_da TEXT null`, `portrait_key_base TEXT null`, `portrait_alt TEXT null`, `portrait_alt_da TEXT null`, `portrait_width INTEGER null`, `portrait_height INTEGER null`, `updated_at`). The Danish fields are optional; when `body_da` is empty the Danish page shows the English text (section 16.1). The seeded `body` is English, and migration 0003 fills `body_da` with a Danish translation of it (reviewed in `docs/LANGUAGE_REVIEW.md`, Part D), so the Danish About page is in Danish from the start; the owner can reword it in `/admin/about`, and clearing it falls back to English.

Initial `body` (paragraphs separated by a blank line; copy verbatim, including the wording):

```
My approach to visual storytelling through color, texture, and form. My work explores emotion, atmosphere, and the quiet balance between movement and stillness.

Working primarily with oil paint, I create expressive, intuitive compositions that invite reflection and personal interpretation. Through layered textures, harmonious color, and fluid forms, I seek to communicate emotions that are often difficult to express with words.

My current work is inspired by the delicate beauty of Persian miniature painting, where every detail is intentional and meaning is found in subtlety. Rather than telling a fixed story, I create spaces where viewers can pause, connect, and discover their own interpretations.

My creative process begins with observation or a simple idea and evolves through intuitive sketching, layering, and experimentation. For me, painting is a journey of exploration, one guided by clarity, purpose, and soul.
```
(The first sentence is a fragment in the owner's draft. Keep it as given in the seed, and tell the owner they can reword it in `/admin/about`.)

Rules:
- **Body format:** plain text. Blank line = new paragraph; single line breaks inside a paragraph are collapsed to spaces. Render each paragraph as its own `<p>`. Never render admin text as raw HTML (no `dangerouslySetInnerHTML`); React escaping only. Limit length (e.g. 5,000 chars) and validate server-side.
- **Portrait upload:** reuse the section 10 pipeline (browser-generated WebP variants, server-side content sniffing and limits). Store at `site/about/{uuid}-{w}.webp` in `zakereh-media`. Record width/height so the page reserves space (no layout shift). Replacing or deleting the portrait deletes the old R2 objects.
- **Alt text** for the portrait is required when a portrait is set (e.g. "Portrait of the artist, Zakereh, in her studio"); the admin form enforces it.
- **No portrait yet:** the page renders the text only, centered and readable. No empty frame, placeholder box, broken image, or "no image" label. Same spirit as the optional-price rule.
- **Layout:** desktop = portrait beside the text (portrait about 1/3 width, text about 2/3, line length around 60-75 characters). Mobile = portrait on top, text below. Portrait uses `object-fit: cover` within a fixed aspect ratio (e.g. 4:5); the admin preview shows the exact crop. Responsive `srcset`, `loading="eager"` (above the fold), and `alt`.
- **Static export:** the build fetches `GET /api/about` and bakes the HTML. Saving in admin triggers the debounced rebuild (section 1.2). SEO: title/description from the first paragraph, `og:image` = portrait when set.
- **API:** public `GET /api/about` returns `{heading?, body, portrait?: {url, alt, width, height}}` and omits `portrait` when none. Admin: `GET|PUT /api/admin/about`, `POST|DELETE /api/admin/about/portrait`. All admin endpoints authenticated + CSRF-protected.
- **Admin UI `/admin/about`:** textarea with character count, optional heading, portrait upload with drag-and-drop and live preview, alt-text field, Replace/Remove, Save, and a "site rebuild pending/done" indicator.
- **Tests:** `portrait` absent when none set; upload validation (non-image, oversized, wrong dimensions); built-HTML test that `/about` has no `<img>` without a portrait and renders paragraphs separately; admin endpoints reject unauthenticated requests.

---

# 4B. Social media links (owner-editable)

The owner's social pages are managed in `/admin/social` without a code change and shown across the public site. Initial links (seed them in a migration so the site is correct on first deploy). The owner supplied these URLs with tracking/share parameters; the seed stores the **cleaned** form (parameters removed, see normalization below):

| Platform | Owner supplied | Seeded value |
|---|---|---|
| Instagram | `https://www.instagram.com/zakereh.fadavi.art?vrfl=bTgzcXhjdjdya25x&utm_source=qr` | `https://www.instagram.com/zakereh.fadavi.art/` |
| Facebook | `https://www.facebook.com/share/1974LVc4VU/?mibextid=wwXIfr` | `https://www.facebook.com/share/1974LVc4VU/` |
| TikTok | `https://www.tiktok.com/@zakerehfadaviart?_r=1&_t=ZN-9AQrRByMDSg` | `https://www.tiktok.com/@zakerehfadaviart` |

Note for the owner (put it in the admin form hint and `docs/ADMIN_GUIDE.md`): the Facebook link is a *share* link (`/share/...`) that redirects to the page. It works, but if the page has a permanent address like `https://www.facebook.com/<page-name>`, replacing it gives a more stable link.

Data: table `social_links` (`id TEXT PK`, `platform TEXT NOT NULL CHECK (platform IN ('instagram','facebook','tiktok','youtube','pinterest','x','behance','other'))`, `url TEXT NOT NULL`, `label TEXT null` (display name, required when `platform='other'`), `visible INTEGER NOT NULL DEFAULT 1`, `sort_order INTEGER NOT NULL`, `created_at`, `updated_at`). One row per platform except `other`. Seed order: Instagram, Facebook, TikTok.

Rules:
- **URL validation (server-side, `zod`):** parse with `new URL()`; scheme must be `https` (reject `http:`, `javascript:`, `data:`, etc.); no username/password in the URL; length at most 500; hostname must belong to the chosen platform (`instagram.com`; `facebook.com`, `fb.com`; `tiktok.com`; `youtube.com`, `youtu.be`; `pinterest.com`; `x.com`, `twitter.com`; `behance.net`; always allowing the `www.`/`m.` variants, and `vm.tiktok.com` for TikTok). `other` accepts any https host. Return a friendly field error such as "This does not look like an Instagram link".
- **Normalization on save:** strip tracking and share parameters (`utm_*`, `igshid`, `igsh`, `vrfl`, `mibextid`, `fbclid`, `_r`, `_t`, `si`, `feature`, `ref`, `ref_src`), drop the fragment, lowercase the host, keep the path (including `@handle` and Facebook `/share/...`), keep other parameters only when needed (e.g. YouTube `?v=`/`?list=` is not expected for profile links, so none are kept for the listed platforms). The admin form shows "Will be saved as: ..." live. The API never stores the raw pasted value.
- **Display rules (same spirit as the optional-price rule):** only rows with `visible = 1` reach the public API, HTML and JSON-LD. If there are no visible links, render **nothing**: no heading, empty list, icons, or placeholder text. Never render a link the owner hid.
- **Where they appear:** (1) the global site footer on every public page, (2) the `/contact` page under the contact details, (3) the `/about` page under the statement, (4) the confirmation/notification email footer (plain text list, optional, only when at least one is visible), (5) JSON-LD `sameAs` on the site-level `Person`/`Organization` entity (section 17).
- **Markup:** plain outbound links, `target="_blank"` with `rel="me noopener noreferrer"`. Icons are inline SVG shipped in the repo (no icon font, no CDN, no third-party script, no tracking pixel, no feed embed), `aria-hidden="true"` beside a visible or screen-reader name, e.g. accessible name "Instagram (opens in a new tab)". Touch targets at least 44 px. Order follows `sort_order`. Instagram/Facebook/TikTok icons must be neutral monochrome using current text color, so they sit with the gallery-first design.
- **Static export:** the build fetches `GET /api/social` and bakes the footer/links into the HTML. Saving in admin triggers the debounced rebuild (section 1.2) like About. No client-side fetch is needed for these links.
- **API:** public `GET /api/social` returns `{ links: [{ platform, label, url }] }` with `label` defaulting to the platform name and hidden rows excluded (empty array when none). Admin: `GET /api/admin/social`, `PUT /api/admin/social` (replaces the whole ordered list atomically in one `DB.batch`; validates every row; rejects duplicate platforms except `other`; max 12 links). All admin endpoints authenticated + CSRF-protected and written to `audit_log`.
- **Admin UI `/admin/social`:** a list of rows, each with a platform selector (Instagram, Facebook, TikTok, plus YouTube, Pinterest, X, Behance, Other), URL field with the live "Will be saved as" preview and inline validation, optional display label (required for Other), a **Visible** toggle, move up/down buttons (keyboard accessible; drag-and-drop optional), **Remove**, an **Open link** button to test it in a new tab, **Add link**, **Save**, and the shared "site rebuild pending/done/failed/skipped" indicator. Empty state: "No social links yet. Add your Instagram, Facebook or TikTok." Unsaved-changes warning on navigation. Linked from the admin navigation next to About.
- **Tests:** API test that hidden rows and the keys `visible`/`sort_order`/`id` never appear publicly; normalization test using the three owner-supplied URLs above (expected seeded values exactly); validation tests (`http:`, `javascript:`, credentials in URL, wrong host for platform, over-long URL, duplicate platform); built-HTML test that the footer has no social markup when all links are hidden and contains exactly the visible links in order otherwise; JSON-LD `sameAs` lists only visible links; admin endpoints reject unauthenticated requests; Playwright e2e: edit a link, hide one, reorder, save, confirm the public footer after rebuild (local: after rebuild step is skipped, confirm via `GET /api/social`).

---

# 5. Events / workshops

Fields: `id`, `title`, `title_da` null, `slug`, `description`, `description_da` null, `starts_at` (TEXT ISO-8601 UTC), `ends_at` (TEXT ISO-8601 UTC), `timezone` (default `Europe/Copenhagen`, IANA), `location`, `location_da` null, `max_participants`, `price_minor INTEGER` (>=0), `currency` (default `DKK`), `status` (draft|published|cancelled|completed), `created_at`, `updated_at`. CHECK `ends_at > starts_at` (ISO-8601 UTC strings of identical format compare correctly), `max_participants > 0`.

Do NOT store separate date/time/timezone columns that can disagree. Admin enters local time in the event's timezone; the API converts to UTC. Always render times in the event's timezone (`Intl.DateTimeFormat` with `timeZone`). Test DST boundaries (last Sunday of March and October in Copenhagen).

Public event page: date, start/end time (event tz), location, price, remaining capacity (live from API), description, booking CTA, "Add to calendar" (.ics). Sold-out/cancelled/past events show the right state and no booking CTA.

Calendar:
- Public `/calendar`: month/list view of published events with remaining spots.
- Admin `/admin/calendar`: events plus booking counts per event.
- Confirmation email includes an `.ics` attachment.
- (A customer "my bookings" calendar is out of scope: customers have no accounts. The confirmation email + `.ics` covers it.)

Admin: create/edit/publish/cancel events. No hard-coded prices or dates.

**Cancelling an event with paid bookings:** admin sees count/amount affected, must confirm; backend refunds via Stripe (idempotent), sets `payment_status=refunded`, `booking_status=cancelled`, emails each customer. Partial failures are recorded and retryable (processed in batches within the Workers subrequest limit of 50 per request; continue via cron). Admin can also refund/cancel a single booking.

---

# 6. Bookings

Config (non-secret vars, validated at startup, pre-filled in the examples): `BOOKING_MAX_PARTICIPANTS=10` (maximum places in one booking, also capped by remaining capacity) and `BOOKING_HOLD_MINUTES=30` (how long unpaid places are held). Both are enforced server-side; the availability endpoint reports `maxPerBooking`.

**Cancellation and refund policy (owner decision):** a customer who cancels **by email to `info@zfadavi.com` at least 24 hours before the start time** gets a **full refund**. There is no customer self-service cancellation (no accounts): the admin receives the email and refunds that booking with the per-booking refund action, which also cancels the booking, releases the places and emails the customer. A request later than 24 hours before the start is not refundable under this policy, at the artist's discretion (the admin can still refund; the app does not block it, but the refund dialog shows how many hours remain before the start). If the **artist** cancels an event, every paid booking is refunded in full (section 5). State this policy on the booking page (next to the consent checkbox), in the confirmation email, and in `/terms`, in both languages. The wording of the "later than 24 hours" case is a placeholder for the owner to confirm.

`event_bookings`: `id`, `event_id`, `public_token` (unguessable, unique), `customer_name`, `customer_email`, `customer_phone` null, `locale` (`en`|`da`, the language of the page the customer booked from; used for emails and the Stripe Checkout language), `number_of_participants` (1 to `BOOKING_MAX_PARTICIPANTS`), `amount_minor`, `currency`, `stripe_checkout_session_id` unique null, `stripe_payment_intent_id` null, `payment_status` (pending|paid|failed|refunded), `booking_status` (pending|confirmed|cancelled|expired), `needs_attention` (0/1), `hold_expires_at`, `consent_accepted_at`, `created_at`, `updated_at`.

`stripe_events` (id primary key = Stripe event id, `type`, `processed_at`) for webhook idempotency.

Flow:
1. Customer opens event; client fetches live availability.
2. Customer submits name/email/phone/participants + Turnstile token + terms consent.
3. **Capacity reservation without row locks.** D1 has no `SELECT ... FOR UPDATE`, but it executes writes serially per database, so a single conditional statement is atomic. Reserve with one statement:
   ```sql
   INSERT INTO event_bookings (id, event_id, ..., hold_expires_at, ...)
   SELECT ?1, ?2, ...
   WHERE (SELECT status FROM events WHERE id = ?2) = 'published'
     AND (SELECT max_participants FROM events WHERE id = ?2)
         - COALESCE((SELECT SUM(number_of_participants) FROM event_bookings
                     WHERE event_id = ?2
                       AND (booking_status = 'confirmed'
                            OR (booking_status = 'pending' AND hold_expires_at > ?now))), 0)
         >= ?participants;
   ```
   If no row is inserted (use `RETURNING id`: D1's `meta.changes` also counts trigger writes), respond "not enough places". Never do read-then-write in two statements. `hold_expires_at = now + BOOKING_HOLD_MINUTES`.
4. Backend computes the amount server-side from the event price and creates a Stripe Checkout Session (section 7: `expires_at` aligned with the hold, `client_reference_id`/metadata = booking id, idempotency key, `locale` from the booking). If Stripe creation fails, mark the booking `expired` immediately so the hold is released.
5. Customer is redirected to Stripe.
6. Webhook is the ONLY thing that confirms payment. Verify the signature with Web Crypto (HMAC-SHA256 over `timestamp.rawBody`, constant-time compare, 300 s tolerance; see 21.4), reading the raw body (`await request.text()`). Dedupe by Stripe event id (insert into `stripe_events`, ignore on conflict). Handle `checkout.session.completed` (and `async_payment_succeeded/failed` if enabled), `checkout.session.expired`, `charge.refunded`. Out-of-order and duplicate events must be safe.
7. Paid -> `payment_status=paid`, `booking_status=confirmed`; enqueue emails in the outbox (never block the webhook response on email delivery; respond 2xx quickly, send via `ctx.waitUntil` and let cron retry failures).
8. **Hold release:** (a) availability queries ignore pending bookings whose `hold_expires_at < now` (lazy expiry, the authoritative mechanism), (b) `checkout.session.expired` marks the booking expired, (c) a cron trigger marks stale pendings `expired` as a backup.
9. Edge case: payment succeeds for a booking whose hold already expired and capacity is gone -> record as `paid` + `needs_attention=1`, auto-refund or alert admin; never silently lose a payment.

NEVER trust the frontend for price, availability, or payment status. Zero-price events skip Stripe and confirm directly (still capacity-checked by the same statement).

---

# 7. Stripe
Stripe Checkout only. Secrets/config: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PUBLIC_SITE_URL` (success/cancel URLs derived from it, not hard-coded). Test mode (the owner's Stripe **sandbox**; keys still start `sk_test_`) until the owner says otherwise. Amounts in minor units. Subscribe only to required events. Document Stripe CLI local forwarding to `http://localhost:8787/api/stripe/webhook`. Stripe is called with plain `fetch` and Web Crypto instead of the official SDK (as built, see 21.4).

Decisions (owner-confirmed; verify exact parameter names and limits against https://docs.stripe.com/api/checkout/sessions/create at implementation time, and pin the Stripe API version in the client):
- **Session shape:** `mode: 'payment'`; one line item with `price_data` (currency and `unit_amount` from the event on the server, `product_data.name` = the event title in the booking's language, and the date as a description), `quantity` = number of participants; `customer_email` = the booking email; `client_reference_id` and `metadata.booking_id`; `locale` = `da` or `en` from the booking; `success_url` / `cancel_url` built from `PUBLIC_SITE_URL` plus the booking's language prefix and the booking `public_token`; an idempotency key per booking.
- **Session expiry:** align `expires_at` with the hold. Stripe enforces a minimum session lifetime of 30 minutes (verify), which equals the default hold, so set `expires_at` to the hold end plus a small margin; a payment that lands after the hold has expired is handled by the "needs attention" edge case in section 6.
- **Payment methods:** do **not** hard-code `payment_method_types`. Use the dashboard-managed payment methods and tell the owner to enable only **Cards** (Apple Pay and Google Pay come with cards) in Stripe Dashboard -> Settings -> Payment methods. MobilePay and other methods stay off for now. Everything enabled is synchronous, so the webhook only needs `checkout.session.completed`, `checkout.session.expired` and `charge.refunded` (subscribe to just these); keep the async handlers harmless if the owner ever enables a delayed method.
- **Receipts, no Invoicing:** the app does **not** use Stripe Invoicing, `invoice_creation` or Stripe Tax. The customer gets (1) Stripe's automatic payment receipt (owner turns on "Successful payments" under Stripe Dashboard -> Settings -> Customer emails; verify in the sandbox whether test payments send one) and (2) the app's own confirmation email with the `.ics` file. Prices entered in the admin are final prices; VAT (moms) treatment is the owner's decision with an accountant. If the owner later wants invoices, adding `invoice_creation` is a small change; check Stripe's fee for it first.
- **Refunds:** `refunds.create` on the payment intent with an idempotency key, from the admin refund action and from event cancellation; mark `payment_status=refunded` only after Stripe confirms (the `charge.refunded` webhook is the source of truth).
- **Not used:** the Stripe MCP/implementation planner is not part of this project; follow the official docs.

---

# 8. Admin authentication (Cloudflare Access)

Only the artist/admin signs in. Customers are guests. There are no passwords, no `admins` table and no session table.

- **Edge gate:** a Cloudflare Access self-hosted application covers `zfadavi.com/admin*` and `zfadavi.com/api/admin/*`. Policy: Allow, include the owner's email address(es), login by one-time PIN (email) and/or Google. Session duration set by the owner (e.g. 24 h). (Free for up to 50 users; verify current terms.)
- **Defense in depth in the Worker:** every `/api/admin/*` route passes through middleware that:
  1. reads the `Cf-Access-Jwt-Assertion` header (reject if absent);
  2. verifies the RS256 signature against the team JWKS (`https://<TEAM_NAME>.cloudflareaccess.com/cdn-cgi/access/certs`, cached in memory for a short time with refetch on unknown `kid`);
  3. checks `iss` = `https://<TEAM_NAME>.cloudflareaccess.com`, `aud` includes `ACCESS_AUD`, `exp`/`nbf` valid;
  4. requires the `email` claim to be in `ADMIN_EMAILS` (comma-separated allowlist).
  Config: `ACCESS_TEAM_NAME`, `ACCESS_AUD`, `ADMIN_EMAILS` (non-secret vars). Startup/first-request validation fails with a clear message if missing in production.
- **Local dev:** `ADMIN_DEV_BYPASS=true` is honored ONLY when `APP_ENV=local`; the Worker must refuse to run with it set in production (test this).
- **CSRF:** the Access cookie is a browser credential, so state-changing admin requests (POST/PUT/PATCH/DELETE) require (a) an `Origin` header equal to `PUBLIC_SITE_URL` (or the local origin in local env) and (b) a custom header such as `X-Admin-Request: 1` (cross-site forms cannot set it). Admin JSON is never served with permissive CORS.
- **Audit:** log admin actions (email claim, action, entity, time) to `audit_log`.
- **Authorization test:** a test enumerates every registered `/api/admin/*` route and asserts it returns 401 without a valid JWT, with an expired JWT, with a wrong `aud`, and with a valid JWT whose email is not allowlisted.
- Optional later hardening: require a second factor in the Access policy.
- Account hygiene (documented in the runbook): hardware key or authenticator on the Cloudflare account itself; it is now the single key to the whole site.

---

# 9. Database & migrations (D1)

- Migrations live in `apps/worker/migrations/0001_*.sql` (Wrangler's format). Never an unversioned `setup.sql`. Apply with `wrangler d1 migrations apply DB --local` and, for production, `--remote` as an explicit step (manual GitHub workflow with environment approval, or by the owner from a terminal). Never auto-migrate on deploy or on request.
- Tables: events, event_bookings and stripe_events (all created in migration 0004; bookings are used from Milestone 3), artworks, categories, artwork_images, about_page (singleton), social_links (section 4B), events, event_bookings, stripe_events, contact_messages (with `locale` and optional `artwork_id`, `ON DELETE SET NULL`), email_outbox (retries; stores the `locale` it was rendered for), audit_log, rate_limits, site_state (rebuild debounce). Danish text lives in nullable `*_da` columns next to the English columns (sections 4, 4A, 5).
- Conventions: `TEXT` UUID ids, `TEXT` ISO-8601 UTC timestamps, `INTEGER` booleans and money. `CHECK` constraints (price >= 0, currency required when price set, `max_participants > 0`, `ends_at > starts_at`, status enums), `UNIQUE` slugs, foreign keys with explicit `ON DELETE` (D1 enforces foreign keys), indexes on `(event_id, booking_status)`, `slug`, `hold_expires_at`. `updated_at` maintained by `AFTER UPDATE` triggers.
- Only parameterized queries via `prepare().bind()`; use `DB.batch([...])` for multi-statement atomic units (batches run as an implicit transaction in D1).
- There is no network database, so no connection strings, pooler, password encoding, or row-level security to configure.
- Daily limits on the Free plan (verify): 5 million rows read, 100,000 rows written, 5 GB storage. Write indexes so that availability queries read few rows. Add a note in docs on what happens at the limit (queries fail until 00:00 UTC) and the $5/month Workers Paid option.
- **Local dev uses Wrangler's local D1** (SQLite file under `.wrangler/state`), seeded by `npm run seed`. No Docker.

---

# 10. Storage (R2)

- Buckets: `zakereh-media` (public via custom domain `media.zfadavi.com`; do NOT use the rate-limited `r2.dev` URL in production) and `zakereh-private` (optional originals, never public). The Worker uses R2 bindings `MEDIA` and `PRIVATE`; no S3 keys are needed in the app.
- **Variants are pre-generated in the admin browser** before upload: decode the chosen file, apply EXIF orientation, draw on a canvas at 480, 960 and 1920 px wide (never upscale), export WebP (quality ~0.82). Canvas export drops EXIF/GPS metadata. The upload sends the variants (and optionally the original, to the private bucket) as multipart to `POST /api/admin/artworks/{id}/images`.
- **The Worker never trusts the browser:** sniff magic bytes (must be WebP for variants; JPEG/PNG/WebP for originals), enforce per-file size (e.g. 4 MB per variant, 15 MB original), parse width/height from the header and require the allowed set of widths, and reject anything else. Object keys are server-generated: `artworks/{artworkId}/{uuid}-{width}.webp`. Set `Cache-Control: public, max-age=31536000, immutable` on put (names are never reused).
- Optional fallback: if a size is missing, the frontend may use Cloudflare Image Transformations (`/cdn-cgi/image/...`) on the media domain. The free plan includes 5,000 unique transformations per month (verify); pre-generated variants must remain the default so this limit is never reached.
- Deleting an artwork/image deletes its R2 objects in the same request, with failures recorded in `audit_log` for retry by cron.
- D1 stores keys/metadata only. Never store file bytes in D1.
- Free tier (verify): 10 GB storage, 1 million Class A and 10 million Class B operations per month, no egress fees. Budget: 100 artworks x 3 variants x ~0.4 MB is about 120 MB, far under the cap.

---

# 11. API

REST + JSON, consistent error shape `{ "error": { "code": "...", "message": "..." } }`, server-side validation (`zod`), body/file size limits, structured request logging (`console.log` JSON, Workers Logs) without secrets/PII payloads, `request_id`.

Public: `GET /api/health`, `GET /api/categories`, `GET /api/artworks`, `GET /api/artworks/{slug}`, `GET /api/about`, `GET /api/social`, `GET /api/events`, `GET /api/events/availability` (all upcoming published events in one request, for the list and calendar), `GET /api/events/{slug}`, `GET /api/events/{slug}/availability`, `GET /api/events/{slug}/ics`, `POST /api/events/{slug}/bookings`, `GET /api/bookings/{publicToken}` (status polling, unguessable token, minimal fields), `POST /api/stripe/webhook`, `POST /api/contact`. Public content GETs (artworks, about, events) take `?lang=en|da` (default `en`) and return the text **already resolved for that language, falling back to English per field**, never null `*_da` keys. `POST /api/events/{slug}/bookings` and `POST /api/contact` take a `locale` (`en|da`); `POST /api/contact` also takes an optional `artworkSlug`.

Admin (Access JWT + CSRF checks): `GET /api/admin/me`, `GET|PUT /api/admin/about` + `POST|DELETE /api/admin/about/portrait`, `GET|PUT /api/admin/social`, `GET|POST /api/admin/categories`, `PUT|DELETE /api/admin/categories/{id}`, `PATCH /api/admin/categories/order`, CRUD for `artworks` (admin endpoints return and accept both English and `*_da` fields), `POST/DELETE/PATCH(order)` for artwork images, `PUT /api/admin/artworks/{id}/cover`, CRUD for `events` (+ `POST .../publish`, `.../unpublish`, `.../cancel`), `GET /api/admin/bookings` (filters `event`, `status`, `attention`), `GET /api/admin/bookings/export.csv` (same filters), `GET /api/admin/bookings/{id}`, `POST /api/admin/bookings/{id}/cancel` (refunds a paid booking in full), `POST /api/admin/bookings/{id}/handled`, `POST /api/admin/events/{id}/refunds` (continue refunding a cancelled event), `GET /api/admin/messages`, `POST /api/admin/site/rebuild`.

No `/internal/cleanup` HTTP endpoint: cleanup runs from the Worker's `scheduled()` handler (Cron Triggers), so there is nothing to protect.

`/api/health` = liveness (no DB); `/api/health/ready` = trivial D1 query, for uptime monitoring.

Public GET responses for artworks/events/about/social may send `Cache-Control: public, max-age=60`; availability, bookings, admin and webhook responses send `no-store`.

---

# 12. Infrastructure approach

- One-time setup is documented in `docs/infrastructure.md` with exact dashboard paths/commands: D1 database, R2 buckets + custom domain, Worker custom domain, Access application, Email Routing, Turnstile widget, Resend domain records, Cron Triggers, GitHub secrets.
- `apps/worker/wrangler.jsonc` is committed and contains non-secret IDs (D1 `database_id`, bucket names, routes, cron schedule, `vars`). **Secrets are never in it**: use `wrangler secret put` (production) and `.dev.vars` (local, git-ignored).
- Deploy: GitHub Actions `deploy` workflow (manual + on `repository_dispatch: site-rebuild` + on push to `main` after CI): build web, `wrangler deploy`. Authenticate with a scoped Cloudflare API token stored as a **repository** secret (Settings -> Secrets and variables -> Actions -> Repository secrets; not an environment secret, because the automatic rebuild deploy and the scheduled backup must run without waiting for approval) (`CLOUDFLARE_API_TOKEN`, permissions limited to Workers Scripts edit + D1 edit for this account; and `CLOUDFLARE_ACCOUNT_ID`). Never print secrets.
- Cron Triggers in `wrangler.jsonc`: every 15 minutes (expire holds, process `email_outbox` retries, resume partial refunds) and daily (retention purge for contact messages and old rate-limit rows).
- Budget guard: Cloudflare has no hard spend cap on the Free plan; staying on Free means exceeding limits causes errors, not charges. Document this and the point at which the owner would choose to pay $5/month.

---

# 13. Email
`EmailSender` interface + a Resend adapter (HTTPS `POST https://api.resend.com/emails` with `fetch`, `Authorization: Bearer`) and a `console` driver for local dev. Send: booking confirmation (with `.ics` attachment, base64), admin booking notification, contact-form notification, cancellation/refund notice. **Customer-facing emails (confirmation, cancellation/refund notice) are rendered in the booking's `locale` (`en` or `da`)**; templates exist in both languages with the cancellation policy text (section 6). Owner-facing notifications are in English and name the customer's language. Emails to the owner about an artwork enquiry include the artwork title. Store outgoing mail in `email_outbox` with status/attempts; payment confirmation must never block on email; retry from the cron handler with backoff and provide admin "resend". Contact form saves the message to D1 even if email fails. Resend's free plan limits are about 3,000 emails/month and 100/day (verify); count one booking as about 2 emails (customer + owner) and design the outbox so exceeding the daily cap defers, not drops, mail.

## 13.1 Domain and mailbox decisions (owner-confirmed)
- Domain: `zfadavi.com`, registered at Cloudflare Registrar, DNS at Cloudflare. Site at `https://zfadavi.com`.
- **One public address, `info@zfadavi.com`, is both the sender and the receiver.**
  - **Receiving:** Cloudflare Email Routing forwards `info@zfadavi.com` to the owner's personal inbox. DNS/dashboard setup only (runbook Step 0B). The application never reads a mailbox.
  - **Sending:** the Worker sends through Resend with `From: Zakereh Art <info@zfadavi.com>`, so Resend verifies the root domain `zfadavi.com` (the free plan allows 1 domain, which is enough).
- **Config:** non-secret vars in `wrangler.jsonc`/`.dev.vars`: `EMAIL_DRIVER=resend|console` (default `console` locally), `EMAIL_FROM_ADDRESS=info@zfadavi.com`, `EMAIL_FROM_NAME=Zakereh Art`, `EMAIL_REPLY_TO=info@zfadavi.com`, `OWNER_NOTIFICATION_EMAIL=info@zfadavi.com` (forwards to the owner; configurable in case they point it elsewhere). Secret: `RESEND_API_KEY`.
  - Production validation: fail with a clear message if the driver is `resend` and the key or from-address is missing, or if the from-address domain differs from the site domain. Never log the key.
- **Contact form emails:** `From` is always the fixed `EMAIL_FROM_ADDRESS`, never the visitor's address (spoofing and DMARC failure). The visitor's address goes in `Reply-To` and the body. Strip CR/LF from header values; escape the body; plain text plus a simple HTML part.
- **Loop prevention:** no inbound processing exists, so mail to `info@` (which forwards to a human) cannot trigger more app mail. Add a code comment saying so.
- **Do not break receiving:** the root domain can have only one SPF TXT record. Cloudflare Email Routing's MX and SPF at the root must not be deleted when adding Resend's records. Resend's return-path records live on a `send.` subdomain, so the two coexist.
- **Deliverability docs:** SPF, DKIM, DMARC at `_dmarc.zfadavi.com` starting `p=none; rua=mailto:info@zfadavi.com`, plus a manual test checklist (Gmail "Show original": SPF/DKIM/DMARC PASS).
- **Replying as info@ from the owner's mail client** is optional, uses a separate restricted Resend key over SMTP, and is documented in the runbook only.
- **Tests:** contact notification has `Reply-To` = visitor and `From` = `EMAIL_FROM_ADDRESS`; header-injection attempts (`\r\nBcc:`) rejected or neutralized; contact message is saved when the provider errors; production config validation fails on a missing or mismatched sender.

---

# 14. Security
Secure headers set by the Worker on API responses and via a `_headers` file in the static bundle (CSP allowing `challenges.cloudflare.com` for Turnstile, `media.zfadavi.com` for images, Stripe redirect only; no social-media scripts or embeds, links only (section 4B), so no extra CSP sources are needed; HSTS; `X-Content-Type-Options`; `Referrer-Policy`; `frame-ancestors 'none'`). Strict `Origin` checks, CSRF for admin (section 8), Turnstile verified server-side, parameterized SQL only, `zod` validation, rate limiting (Turnstile + D1 `rate_limits` counters keyed by hashed IP/endpoint, plus one Cloudflare WAF rate-limit rule on `/api/*`; never in-memory only), no secrets/PII in logs, safe uploads (section 10), Stripe signature verification, admin authz on every admin route, dependency scanning (Dependabot + `npm audit` in CI), secret scanning (gitleaks) in CI.

**Single point of failure:** the Cloudflare account controls domain, DNS, hosting, data and files. Require 2FA with a hardware key or authenticator, keep recovery codes offline, and keep independent encrypted backups off Cloudflare (section 15).

**Privacy/GDPR (EU/Denmark):** `/privacy` and `/terms` pages in **both languages** (`/da/privacy`, `/da/terms`), drafted from templates, not legal advice. The data controller is the owner's business **Flow Art** (display name Zakereh Art, CVR 42674249, email `info@zfadavi.com`; postal address from `OWNER_VALUES.md` section D when given). **Never show a phone number anywhere** (owner decision: contact is by email and social media only). **Never mention VAT (moms) anywhere on the site, in `/terms`, `/privacy`, emails or structured data** (owner decision). Do not add legal clauses that are not in the source text (no right-of-withdrawal, liability, photo-consent, governing-law or complaints-board clauses, no postal address unless the owner provides one): keep the pages short, friendly and plain. **The source text for the legal pages and the Danish UI wording is `docs/LANGUAGE_REVIEW.md`** (owner-approved); use it verbatim, keep both languages identical in meaning, and the build must fail if a `[CHECK]` or `[FILL]` marker ever appears in the published text. The booking page shows the **total price** and the **24-hour free-cancellation notice before the payment button**, next to the consent checkbox. `/terms` states the cancellation and refund policy from section 6, in the plain wording of `docs/LANGUAGE_REVIEW.md`. Also: consent checkbox at booking, data retention policy (delete contact messages after N months via cron; admin tool to delete/anonymize a customer's data on request), no unnecessary trackers (no analytics or a cookieless one, so no cookie banner). Mention that data is processed by Cloudflare, Stripe and Resend in the privacy page placeholder. Docs note: the owner should confirm VAT (moms) and legal requirements with an accountant; do not give legal advice in code comments.

---

# 15. Reliability on free tiers
- **No pausing, no keep-alive.** D1, Workers and R2 do not pause. Remove any keep-alive workflow.
- **Backups (do not skip):**
  1. D1 Time Travel provides point-in-time restore (7 days on Free, 30 on Paid; verify). Document `wrangler d1 time-travel restore`.
  2. A scheduled GitHub Actions workflow (daily) runs `wrangler d1 export DB --remote --output dump.sql`, encrypts it with `age` (public key in repo secrets, private key kept only by the owner in a password manager) and uploads it as a workflow artifact with 30+ days retention. Dumps contain customer data: never commit or log them.
  3. The owner downloads a monthly copy to their own disk (account-loss protection; same-vendor backups do not protect against losing the Cloudflare account).
  4. R2: keep original high-resolution artwork on the owner's own disk; the pre-generated variants are reproducible from them. Optionally copy `zakereh-media` with `rclone` monthly.
  5. A documented, **tested** restore procedure into a scratch D1 database before launch.
- **Quotas/cost guards:** document the Free limits (Workers 100,000 requests/day and 10 ms CPU per invocation; D1 5M reads/100k writes per day; R2 10 GB, 1M/10M ops; Resend 3,000/month, 100/day), what fails when exceeded, and the upgrade path. Static asset requests are free and do not count against Worker requests.
- **CPU budget:** keep Worker handlers light (no heavy hashing, no image processing, no large JSON transforms). Add a test or log that flags handlers near 10 ms in `wrangler dev` where feasible.
- **Known risk, accepted by the owner: the Workers Free 10 ms CPU limit.** The site starts on the Free plan because load will be very low. Heavier paths (Stripe SDK calls, webhook signature verification, JWT verification, large admin payloads) could occasionally exceed 10 ms and fail that request. Write `docs/MAINTENANCE.md` (required deliverable) explaining, for a future developer or the owner: the limit and why it exists; the symptoms (intermittent 5xx or "Worker exceeded resource limits" on booking/webhook/admin calls); where to look (Cloudflare dashboard -> Workers & Pages -> `zakereh-art` -> Metrics for CPU time, plus Workers Logs); the fix, which is to upgrade to **Workers Paid (about 5 USD/month)** and, if needed, raise `limits.cpu_ms` in `apps/worker/wrangler.jsonc` and redeploy (verify the current option name and limits in Cloudflare's docs); and that failed Stripe webhooks are retried by Stripe, so a rare failure does not lose a payment. The same document lists the other free-tier limits and their upgrade triggers (section 12 and the runbook table) and the "how to raise it" steps for each.
- **Monitoring:** free external uptime check (UptimeRobot or Cloudflare health check) on `https://zfadavi.com` and `/api/health/ready`. Enable Workers Logs/observability in `wrangler.jsonc`.

---

# 16. UX
Elegant, minimal, gallery-focused, mobile-first; artwork is the hero. Responsive `srcset`/lazy loading from the pre-generated variants, alt text, keyboard navigation, focus states, loading/error/empty states, clear capacity and payment states, friendly errors (never raw technical messages). **Visual direction (owner choice): a quiet, light gallery.** Off-white background, generous white space, restrained typography (a refined serif for headings and a clean sans for body is a good default), artwork as the hero, minimal chrome, no decorative clutter, strong keyboard focus states, AA contrast. RTL is not required.

## 16.1 Languages: English (root) and Danish (`/da/`)
- **URLs:** English is unprefixed (`/artworks`, `/about`), Danish mirrors every public route under `/da/` (`/da/artworks`, `/da/about`). Slugs are shared across languages. There is **no automatic redirect by browser language** (static export, no server logic, and it is bad for SEO and crawlers); the `/` page is English and a visible language switcher in the header and footer links to the same page in the other language (EN | DA).
- **UI strings:** typed dictionaries `en` and `da` in `apps/web`; no hard-coded user-facing text. A CI check fails if a key exists in one dictionary and not the other. Danish copy must be natural Danish, not machine-sounding; flag anything uncertain in the milestone hand-off so the owner can have it reviewed.
- **Content fields:** English is required, Danish is optional (artworks, images' alt text, About, events, location). The public API resolves the language per field and falls back to English when the Danish field is empty, so no page is ever blank. The admin shows English and Danish inputs side by side with the hint "Danish (optional). If empty, the English text is shown."
- **Rendering:** `<html lang>` is correct per page; `hreflang` alternate links (`en`, `da`, `x-default` = English) and a per-language canonical URL; sitemap lists both language versions; Open Graph `og:locale` per page. Dates, times and money use `Intl` with the page language (`en-GB` / `da-DK`), the event's time zone, and `DKK`.
- **Transactional language:** the booking's `locale` selects the email language and the Stripe Checkout `locale`, and the success/cancel URLs return to the same language. Turnstile uses the page language where the widget supports it.
- **Admin stays English only** (the owner administers the site in English; both-language content is entered there).

---

# 17. SEO
Titles/descriptions, Open Graph, canonical URLs and `hreflang` alternates for English and Danish (section 16.1), sitemap generated at build (only published artworks/events, both languages), robots.txt, JSON-LD (`VisualArtwork` without offers/price when price is NULL; `Event` with offer only for events), a site-level `Person`/`Organization` entity whose `sameAs` lists only the **visible** social links (section 4B; omit `sameAs` when none), semantic HTML.

---

# 18. Testing
Worker: Vitest with `@cloudflare/vitest-pool-workers` (runs against real local D1 and R2 bindings, no mocks for the database). Cover: unit, API, **every admin route requires a valid Access JWT** (section 8), **booking capacity under concurrency** (fire N parallel reservation requests for the last seats; total confirmed+held never exceeds max), hold expiry, Stripe webhook signature/idempotency/out-of-order, refund flow, upload validation, email header injection, DST handling.

Also cover: **categories and filters** (starting categories; delete blocked with 409 while any artwork, even hidden, is assigned, and allowed once empty; rename keeps the slug; duplicate names refused in any capitalisation; category and size required on artworks; the public category list only has shown artworks; every filter works alone and combined in the browser, the Price filter is absent when nothing has a price, the address is shareable); **i18n** (every key present in both dictionaries; Danish field empty -> English text served; `?lang=da` resolves per field; `hreflang`/`<html lang>` correct; the booking `locale` selects the email and Checkout language); **gallery** (grid shows only the cover; cover fallback to the first image; set-cover and delete-cover behavior; an artwork without images is absent publicly; the detail page lists all images, cover first; the viewer opens, closes with Esc and moves with arrow keys); **enquiry** (button on available/reserved, absent on sold; `/contact?artwork=` pre-fills; `artwork_id` stored; the email names the artwork); **booking limits** (more than `BOOKING_MAX_PARTICIPANTS` rejected; hold length from `BOOKING_HOLD_MINUTES`).

Frontend: component tests; Playwright e2e against `wrangler dev` + local assets for: browse artwork; open an artwork from the grid and view its extra images; switch language EN <-> DA on the same page; artwork with price; **artwork WITHOUT price (mandatory: no price markup in built HTML and no price keys in API JSON)**; admin CRUD with `ADMIN_DEV_BYPASS`; image upload (browser resize -> R2 local); create event; booking -> Stripe test mode -> webhook -> confirmed; calendar view.

---

# 19. Developer experience

## 19.0 Environment templates (required deliverable, created in Milestone 1)
- `apps/worker/.dev.vars.example` (local secrets and vars for `wrangler dev`) and `apps/web/.env.local.example` (frontend). Real `.dev.vars` and `.env.local` are git-ignored.
- **Every variable the code reads must be in the example files**, in sections (App, Access/Admin, Stripe, Email, Turnstile, Rebuild, Frontend). Add a test/CI check that fails if code reads an env var missing from the example or from the `Env` type.
- **Each variable has a comment** stating: what it is, REQUIRED vs OPTIONAL, which environments need it (local/production), where to get it (exact dashboard page), a fake example format, and whether it is a **SECRET** (never commit, never `NEXT_PUBLIC_`).
- **Non-secret values pre-filled:** `APP_ENV=local`, `PUBLIC_SITE_URL=http://localhost:3000` (production `https://zfadavi.com`), `MEDIA_BASE_URL`, currency `DKK`, timezone `Europe/Copenhagen`, `EMAIL_FROM_ADDRESS=info@zfadavi.com`, `EMAIL_FROM_NAME=Zakereh Art`, `EMAIL_REPLY_TO=info@zfadavi.com`, `OWNER_NOTIFICATION_EMAIL=info@zfadavi.com`, `BOOKING_MAX_PARTICIPANTS=10`, `BOOKING_HOLD_MINUTES=30`, `ADMIN_DEV_BYPASS=true` (local only).
- **Secrets as obvious placeholders** (`CHANGE_ME`, `sk_test_xxx`, `re_xxx`); the Worker refuses to serve in production with a placeholder and names the variable (not its value).
- **Safe local defaults:** Turnstile's published always-pass test keys, Stripe test mode with `stripe listen`, and `EMAIL_DRIVER=console`. Everything runs offline-friendly with no cloud accounts: local D1 and R2 emulation via Wrangler.
- `.gitignore` in the first commit: `.dev.vars`, `.env`, `.env.*` (except `*.example`), `apps/web/.env.local`, `.wrangler/`, `*.sql` dumps, `*.age`. gitleaks in CI.
- `scripts/setup.ps1` / `npm run setup` copies example files if the real ones don't exist (never overwrite) and prints a checklist of values still to fill. `scripts/check-env` validates without printing secrets.
- README "Run locally": minimum variables to boot vs extra ones for Stripe/email/R2 production behaviour.
Docs: setup, deployment, migrations, rollback, backup/restore, troubleshooting, "how to rebuild the site", `docs/infrastructure.md`, and `docs/MAINTENANCE.md` (limits, upgrade triggers and how to raise them; a starter version already exists, extend it as you build).

## 19.1 Local run and owner documentation (required deliverables)
Two owner-facing documents already exist and are the **source of truth for the owner's experience**: `docs/LOCAL_DEVELOPMENT.md` (run everything locally, every variable/key and where to get it, Stripe CLI, email, troubleshooting) and `docs/ADMIN_GUIDE.md` (how the owner manages the site). The code must make them true, and you must update them whenever behavior changes. Concretely:
- **Command names are a contract.** Root `package.json` provides exactly: `setup`, `dev` (starts Worker on :8787 and web on :3000 together, e.g. via `concurrently`), `dev:worker`, `dev:web`, `migrate:local`, `migrate:prod`, `seed`, `check-env`, `test`, `lint`, `typecheck`, `build`. Equivalent `scripts/*.ps1` and `*.sh` exist. The `setup` script must never overwrite existing files.
- **Boots with zero accounts.** The generated `.dev.vars` is pre-filled with `APP_ENV=local`, `ADMIN_DEV_BYPASS=true`, `EMAIL_DRIVER=console`, Turnstile always-pass test keys, and `PUBLIC_SITE_URL=http://localhost:3000`. Stripe, Resend and GitHub dispatch variables may be placeholders; features needing them must degrade with a clear message (e.g. "Payments are not configured: set STRIPE_SECRET_KEY") instead of crashing. Rebuild trigger without `GITHUB_DISPATCH_TOKEN` logs "rebuild skipped (local)" and the admin shows that status.
- **Local media.** Locally `media.zfadavi.com` does not exist. When `APP_ENV=local` the Worker serves `GET /media/*` from the `MEDIA` R2 binding (never registered in production), and the example sets the Worker variable `MEDIA_BASE_URL=http://localhost:8787/media`. Add `GITHUB_REPO` (non-secret, `owner/name`; this repo is `arefhp/flowart`, pre-fill it in `wrangler.jsonc` vars and the examples) to the variables used for the rebuild dispatch.
- **Owner-supplied images in `input/`** (git-ignored, never committed): the owner placed `about.jpeg` (the portrait) and four painting photos in `input/`. `npm run seed` uses them when present: `about.jpeg` as the About portrait and the paintings as sample artworks, with the variants (480/960/1920 WebP) generated by a **dev-only Node script** (e.g. `sharp` as a devDependency; never bundled into the Worker). Give some seeded artworks two or three images each so the cover/thumbnail/viewer behavior (section 4) can be checked. If `input/` is missing (a fresh clone, CI), fall back to locally generated placeholder images so seed and tests still work. Seeded text is English with a few Danish translations so the language switch can be tried.
- **`npm run seed`** creates: 4+ sample artworks (at least one **without** price, one sold, one hidden, one featured), images from `input/` or generated placeholders (no external downloads), the About page text from section 4A, the three social links from section 4B (Instagram, Facebook, TikTok, normalized, visible), one future published event with capacity, and one draft event. It is idempotent and refuses to run against production (`--remote` is never used).
- **`npm run check-env`** reports missing/placeholder variables by name only, distinguishes "needed to boot" from "needed for feature X", and never prints values.
- **Admin banner:** in local dev-bypass mode the admin UI shows "Local development mode"; the production build never renders it.
- **Admin UI states for the guide:** the admin shows the rebuild indicator (pending/done/failed/skipped), the **Rebuild site** button, booking rows flagged **Needs attention**, the CSV export, and per-booking refund, exactly as `docs/ADMIN_GUIDE.md` describes. The admin has a **Help** link to the published admin guide (or a `/admin/help` page generated from the same text).
- **Docs acceptance test (Milestone 1 done):** a person who has only Node installed can follow `docs/LOCAL_DEVELOPMENT.md` sections 1-4 verbatim on a clean machine (Windows PowerShell and macOS/Linux) and reach a working local site with zero accounts. Verify this by running the steps from a fresh clone in CI or manually before reporting M1 done.

---

# 20. CI/CD (GitHub Actions)
On PR/push: typecheck, lint, Worker tests (Vitest pool), frontend tests/build (`output: export`), Playwright, `npm audit`, gitleaks. Deploy: `deploy` workflow as described in section 12 (scoped `CLOUDFLARE_API_TOKEN`, the `deploy` and backup workflows read the repository secrets and must run unattended, so they do NOT use an approval environment). Migrations: separate manual workflow `migrate` (`wrangler d1 migrations apply DB --remote`) whose job declares `environment: production` (GitHub environment with the owner as required reviewer, so every production migration needs approval); deploy never migrates. Scheduled: daily encrypted D1 export. Never print secrets. No automatic destructive changes.

---

# 21. Milestones & Definition of Done

**M1 - Gallery + admin:** repo skeleton (npm workspaces, first commit includes `.gitignore` with `input/`), D1 migrations, bilingual (EN root / `/da/`) site scaffolding, translation dictionaries and language switcher (section 16.1), Worker (health, artworks, Access JWT middleware, R2 upload with browser-side variants), admin UI for artworks (EN/DA fields, multiple images, cover selection), gallery grid with covers and the artwork page with thumbnails, viewer and "Enquire" button (section 4), About page with admin-editable text and portrait (section 4A) + tests, social links admin UI and public footer/contact/about display (section 4B) + tests, public gallery with optional-price rule + tests, rebuild trigger, contact form with Turnstile + email (console driver locally). *Done when:* runs locally end to end with `wrangler dev` + Next, following `docs/LOCAL_DEVELOPMENT.md` from a clean clone (section 19.1); `docs/ADMIN_GUIDE.md` matches the built admin; NULL-price tests pass; CI green.

**M2 - Events + calendar (built, see 21.3):** events CRUD, public/admin calendar, `.ics`, availability endpoint, SEO/sitemap, DST tests.

**M3 - Booking + payments (built, see 21.4):** booking flow, atomic capacity reservation, holds, Stripe Checkout + webhooks, outbox + Resend, refunds/cancellation, concurrency + idempotency tests.

**M4 - Production hardening (repo side built, see 21.5; the Cloudflare account steps are the owner's, runbook Steps 10-13):** domain/custom domains, Access application, Email Routing + Resend DNS, cron triggers, backups + restore test, uptime check, privacy/terms pages, production acceptance checklist in the runbook.

## 21.1 Milestone gate (owner-confirmed workflow; applies to M1, M2, M3, M4)
Work on `main`. For each milestone:
1. **Implement** the milestone, with its tests and doc updates.
2. **Verify it yourself first.** Run `npm run typecheck`, `lint`, `test` and `build`; start the app (`npm run dev`) and actually exercise the new features end to end (curl the API, drive the pages, check the built HTML where this file requires it); fix what is broken. Do not hand over something you have not run. Report honestly what you ran, what passed, and anything you could not verify.
3. **Commit** to `main` locally with a clear message (do not push yet).
4. **Hand over to the owner** with a short, numbered **run-and-check list** written for a non-developer: the exact commands (PowerShell), the URLs to open, what they should see, and what to try (including the milestone's mandatory checks, e.g. the no-price artwork, the language switch, the cover/thumbnail/viewer flow). Also list anything the owner must do by hand and any content you need reviewed (for example Danish wording).
5. **Stop and wait** for the owner to reply "approved" (or send fixes). Only then push to GitHub and start the next milestone. Never start milestone N+1 on your own.

Final "done" requires: all milestone criteria, README lets another developer reproduce everything, no secrets in git, restore procedure tested, runbook, `docs/MAINTENANCE.md` and this file consistent.

## 21.3 As built in Milestone 2: events and calendar
- **Data:** table `events` as in section 5 plus `location_da`; `event_bookings` and `stripe_events` exist from migration 0004 so the calendar and capacity rules are real (counts are 0 until Milestone 3). `starts_at`/`ends_at` are UTC instants, `timezone` an IANA zone; there are no separate date/time columns.
- **Time:** `packages/shared/src/time.ts` converts local to UTC using `Intl` only. A wall-clock time that does not exist (the skipped hour in spring) is REJECTED with a clear message; one that happens twice (autumn) uses the FIRST occurrence. Tested at the last Sundays of March and October (2026, 2027 and 2030/2031). Pages always show times in the event's zone (`Intl` with `timeZone`), verified with the browser in other zones.
- **Lifecycle:** a new event is always a **draft**. `publish` (draft to published, start must be in the future), `unpublish` (published to draft, only with no confirmed/held places), `cancel`, `delete` (only if no booking rows ever existed; also enforced by `ON DELETE RESTRICT`). Cancelled and completed events cannot be edited. The number of places cannot be set below confirmed + held places. A cron job marks published events whose end has passed as `completed`.
- **Cancelling an event that has bookings** is done in Milestone 3 (see 21.4); in Milestone 2 the API answered `409 has_bookings` instead.
- **Capacity** = `max_participants` minus confirmed places minus unexpired holds on pending bookings (the formula from section 6). It is served live and uncached by `GET /api/events/{slug}/availability` and the batch `GET /api/events/availability`; the public event DTO and the static pages never contain capacity numbers (a built-HTML test enforces this). Upcoming/past is also decided in the browser with the real clock, so a finished workshop moves to "past" without a rebuild.
- **Public pages (English and `/da/`):** `/workshops`, `/workshops/[slug]` (every public event, including past and cancelled, has a static page), `/calendar` (Monday-first month grid on wide screens, a plain list on phones), a three-workshop teaser on the home page, `Event` JSON-LD with an offer (no availability claim), sitemap entries, `.ics` download (UTC times, escaped, folded at 75 bytes).
- **Booking in Milestone 2:** the workshop page offered **Ask about a place**. Milestone 3 replaced it with the booking form; the contact link remains as "Have a question first? Write to me" (`/contact?event=slug`, message pre-filled).
- **Admin:** `/admin/events` (Upcoming / Past and cancelled), `/admin/events/new`, `/admin/events/edit?id=` (Publish, Back to draft, Cancel event, Delete event), `/admin/calendar` (all statuses by date with booked places).
- **Tests added:** shared 35 (time), Worker 198 (events, ICS), web 52, built-HTML workshop checks, Playwright 23 event tests.

## 21.4 As built in Milestone 3: booking and payments
- **Booking flow:** `POST /api/events/{slug}/bookings` (by slug, not id: the static pages know slugs) validates the form, rate-limits (8 per hour per visitor, 5 per email, 120 overall in production; very generous locally), checks Turnstile, then reserves with ONE conditional `INSERT ... SELECT ... WHERE` (event published, not started, enough places, using `RETURNING id`). The price is read inside the same statement (`price_minor x participants`); the browser's amounts are ignored. A free event (price 0) is inserted as `confirmed`/`paid` with amount 0 and no hold; a paid event as `pending` with `hold_expires_at` = now + `BOOKING_HOLD_MINUTES` (at least 30, because Stripe keeps a payment page open for 30 minutes or more). Answers: `{ bookingToken, checkoutUrl }` (paid) or `{ bookingToken, confirmed: true }` (free); errors `sold_out`, `not_enough_places` (with `remaining`), `too_many_places`, `event_cancelled`, `event_started`, `event_closed`, `payments_not_configured` (503, nothing reserved), `payment_unavailable` (502, the hold is released at once), `rate_limited`, `turnstile_failed`.
- **Stripe client (deviation from "use the SDK"):** `apps/worker/src/lib/stripe.ts` calls the Checkout Sessions and Refunds APIs with `fetch` and verifies webhooks with Web Crypto, because the official SDK is large and the Free plan's CPU limit is tight. The API version is pinned (`STRIPE_API_VERSION`). Idempotency keys: `booking-{id}` and `refund-{id}`. `payment_method_types` is not set (dashboard-managed). `expires_at` = hold end + 60 s. Success/cancel URLs: `PUBLIC_SITE_URL` + language prefix + `/booking/success|cancelled?token=`.
- **Webhook** `POST /api/stripe/webhook`: signature over the raw body (HMAC-SHA256 of `t.body`, constant-time compare via `subtle.verify`, 300 s tolerance, any `v1` may match). The event id is recorded in `stripe_events` only AFTER handling, so a failure part-way is retried by Stripe; every state change is a guarded `UPDATE ... RETURNING`, so repeats and out-of-order delivery change nothing and send no second email. `checkout.session.completed`: the booking is found by `client_reference_id` AND the stored session id; the amount and currency must match (otherwise `needs_attention`, never confirmed); it confirms inside the hold, or after the hold if the places are still free and the event is published and not started; otherwise the payment is **refunded automatically** and the customer told (a failed refund sets `needs_attention` and emails the owner). `checkout.session.expired`: unpaid pending to expired only. `charge.refunded` (full): booking cancelled/refunded, customer emailed once (covers refunds made in the Stripe dashboard). Anything else: acknowledged and ignored.
- **Local pretend payment** (`stripeMode` in `config.ts`): `STRIPE_FAKE=true` is honoured only when `APP_ENV=local` and no real `STRIPE_SECRET_KEY` is set. `/api/dev/stripe/checkout/{bookingId}` is a plain page with Pay / Go back / Expire buttons that run the same internal handler (only the signature check is skipped); refunds are pretended. Production refuses to start with `STRIPE_FAKE` set, or without `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`.
- **Status endpoint** `GET /api/bookings/{token}`: no-store, rate-limited, minimal (status, places, amount, masked email, workshop title/time/slug, reference); a pending booking whose hold has run out is reported as `expired`.
- **Emails** (`email/booking.ts`, bilingual by the booking's `locale`, plain text plus escaped HTML): customer confirmation with the `.ics` attached and the 24-hour rule; owner notification (English, Reply-To = customer); customer cancellation/refund (cancelled by the artist, cancelled as agreed, free booking, late payment refunded); owner "needs attention" alert. Dates, times and money use `packages/shared/src/format.ts`, the same code as the website.
- **Refunds and cancelling:** `POST /api/admin/bookings/{id}/cancel` refunds a paid booking in full (or just cancels a free one) and emails the customer; a refund that fails leaves the booking paid, flags it, returns 502 and emails the owner; `POST .../handled` clears the flag. `POST /api/admin/events/{id}/cancel` with bookings answers `409 confirmation_required` with the numbers (bookings, places, paid bookings, refund total, holds); with `{ confirm: true }` it cancels the event, expires unpaid holds, then refunds and emails confirmed bookings **10 per run** (each refund is several subrequests; the free plan allows about 50 per request). The 15-minute cron continues with any left (`bookingMaintenance`: expire stale holds, then refund confirmed bookings of cancelled events); a booking whose refund failed is flagged and skipped, so one bad payment neither blocks the rest nor loops. `unpublish` and `delete` stay refused (409) when bookings exist.
- **Admin:** `/admin/bookings` (filters, status labels, needs-attention notes, Cancel and refund with the hours-before-start shown, Mark as handled, CSV download), the event page cancel flow with the confirmation numbers and refund progress, a link to an event's bookings, and a needs-attention line on the Overview. CSV cells starting with `= + - @`, tab or CR get a leading apostrophe (formula injection), and the file starts with a byte-order mark for Excel.
- **Public pages:** the booking form on the workshop page (name, email, optional phone, places up to the live maximum, live total, hold note, 24-hour rule and total BEFORE the pay button, consent checkbox with links to Terms and Privacy, Turnstile), `/booking/success` and `/booking/cancelled` in both languages (noindex, not in the sitemap). The success page never decides a booking is paid: it polls the status endpoint ("We're confirming your payment...") until the webhook has arrived. The static HTML carries no form and no capacity.
- **Migration 0005** adds `event_bookings.attention_note`.
- **Tests added (Worker 271 in total):** Stripe client and signature vectors, booking rules, the last-places concurrency test (parallel requests never exceed capacity), holds and expiry, the pretend payment page, webhook security, idempotency, replay, out-of-order and late-payment cases, amount mismatch, refund events, emails (language, calendar file, escaping), admin bookings, CSV safety, per-booking and per-event refunds including batches, partial failure and the cron. Playwright `booking.spec.ts` (12 tests): paid journey, validation, abandoned payment, last place, race, free workshop, Danish, refund, cancelling a workshop, protected deletes. `npm run dev:e2e -w apps/worker` starts the Worker for the tests with the pretend payment, the always-pass spam check, console email and no GitHub trigger, whatever is in `.dev.vars`.

## 21.5 As built in Milestone 4: production hardening
- **CSP:** `apps/web/public/_headers` now carries a full policy (self, Turnstile for scripts and frames, `media.zfadavi.com` for images, `frame-ancestors 'none'`, `form-action 'self'`). It keeps `'unsafe-inline'` for scripts because Next's inline scripts embed per-page data, so hashes are impractical (hundreds of unique hashes; header length limit). Checked in a real browser against a production-style build on the home, gallery, artwork, workshop (with the booking form), calendar, contact, booking and admin pages: no violations except local images, which come from `localhost` rather than the production media host.
- **Backups:** `.github/workflows/backup.yml` (daily 02:41 UTC): data-only `wrangler d1 export --remote --no-schema`, encrypted with `age` (`AGE_PUBLIC_KEY` secret), artifact kept 30 days, plaintext removed. Restore = migrations for the layout, then the data (a full dump cannot be loaded into an empty database because child rows precede their parent tables). `npm run restore-test -w apps/worker` rehearses this locally and compares every table's row count (passes: 13 tables).
- **Smoke test:** `npm run smoke -- <url>` (read-only): health and database, pages and headers, Danish, 404, admin API closed without sign-in (the local bypass is allowed only on localhost), webhook rejects unsigned requests, pretend payment page absent, events API. The `deploy` workflow runs it against `https://zfadavi.com` after a deploy (not on the first empty deploy).
- **Config:** `wrangler.jsonc` has the custom-domain route for `zfadavi.com`; `workers_dev` is switched off after the domain works. `docs/infrastructure.md` documents resources, secrets, deploy and rollback, Time Travel, the dump restore, uptime monitors and the first-deploy order. The production configuration guard (Access, Turnstile, Resend, Stripe, no dev bypass or pretend payment) was completed in Milestone 3.
- **Not verifiable without the owner's accounts:** the Access application, custom domains, Email Routing and Resend DNS, the first real deploy, the backup workflow's first run, and the real-money test. These are runbook Steps 10-15; the first Actions runs of `deploy`, `migrate` and `backup` have not happened yet.

## 21.2 As built in Milestone 1 (where the build refined this document)
- **`packages/shared`** (workspace `@flowart/shared`) holds code both apps need: locales and limits, social-link validation and cleaning (the admin preview and the API use the same function), slugs, language fallback, and the WebP header parser. This adds `packages/` to the structure in section 2.
- **Extra API endpoints:** `GET /api/site-version` (public; the content timestamp the site build records in `out/build-info.json`) and `GET /api/admin/site/status` (the admin's rebuild indicator compares the two, so "done" needs no callback from GitHub). `PATCH /api/admin/artworks/{id}/images/order` and `PUT /api/admin/artworks/{id}/cover` are as listed in section 11.
- **Rebuild catch-up:** the 15-minute cron also triggers a rebuild when a change was debounced (content newer than the last trigger), so the last save is never left unbuilt.
- **Local dev layout:** the dev Worker uses its own empty `apps/worker/.local-assets` folder so it never locks `apps/web/out` (which `npm run build` replaces). `npm run preview -w apps/worker` serves a real build through the Worker's static assets on :8788 (production-like check).
- **Build safety:** `npm run build` clears Next's fetch cache first (a rebuild must never reuse API data from the previous build) and then writes `out/build-info.json`. The build fails loudly when the API is unreachable unless `ALLOW_EMPTY_BUILD=1`.
- **Dev-only behaviours:** in `next dev`, `generateStaticParams` is re-run per request, so a newly published artwork (one that has an image) appears on reload; a hidden or image-less artwork's page shows a dev error instead of the production 404.
- **Originals:** uploading the optional original to the private bucket (section 10) is not implemented; the owner keeps originals on their own disk. The `PRIVATE` binding exists for later.
- **Security headers:** `apps/web/public/_headers` sets nosniff, frame, referrer, permissions, HSTS, `frame-ancestors` and cache rules. The full `script-src`/`img-src` content security policy needs hashes of Next's inline scripts, so it is generated after the build and is part of Milestone 4.
- **CI/CD files:** `ci.yml` is complete (typecheck, lint, tests, built-HTML test, end-to-end tests, audit of shipped dependencies, gitleaks). `deploy.yml` and `migrate.yml` follow section 20 but have not run against a real Cloudflare account yet (Milestone 4). `backup.yml` is Milestone 4.
- **Contact rate limit:** 5 messages per hour per visitor (60 per hour overall) in production; 1,000 and 10,000 locally so repeated testing is never blocked.
- **Categories, sizes and filters** (owner request after the first hand-over) are in migration 0003 and described under "Categories, sizes and gallery filters" in section 4. The tagline is "Fine Art and workshops in Copenhagen" (Danish: "Fine Art og workshops i København"). The Worker list API joins categories; the website's Artworks page is a client component prerendered with every artwork.
- **Tests (after Milestone 3):** shared 41, Worker 271 (real local D1 and R2), web 54, built-HTML 90+ checks, 82 Playwright end-to-end tests (1 skipped while the price filter is off). `npm test` runs the first three; `npm run test:built-html` and `npm run test:e2e` run the others.

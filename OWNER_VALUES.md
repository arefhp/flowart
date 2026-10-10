# OWNER_VALUES.md: values to give Claude

Fill in the **Value** column as you complete each runbook step, then tell Claude "values are updated in OWNER_VALUES.md". Claude puts them into `wrangler.jsonc`, the environment examples and the docs.

**This file is for NON-SECRET values only** (IDs, names, public keys, URLs, your public contact details). Never write a password, API key, token, recovery code or backup key here, and never paste one into chat. See "Secrets you do NOT give Claude" at the bottom for where those go.

Status key: `[ ]` not done, `[x]` done. Leave a value blank until you have it.

---

## A. Already decided (no action, for reference)
| Name | Value |
|---|---|
| `DOMAIN` | `zfadavi.com` |
| `MEDIA_HOST` | `media.zfadavi.com` |
| `SITE_EMAIL` (sender and receiver) | `info@zfadavi.com` |
| `WORKER_NAME` | `zakereh-art` |
| `D1_DATABASE_NAME` | `zakereh-art-db` |
| `R2_PUBLIC_BUCKET` | `zakereh-media` |
| `R2_PRIVATE_BUCKET` (optional originals) | `zakereh-private` |
| Currency / timezone | `DKK` / `Europe/Copenhagen` |

If you pick different names in the dashboard, change them here too.

---

## B. Needed before Milestone 1 can finish (local development)
Milestone 1 runs locally with no accounts, so these are optional to start. Providing them early lets Claude finish the Cloudflare configuration files in the same pass.

| Name | Value | Where to find it | Runbook step | Done |
|---|---|---|---|---|
| `GITHUB_REPO` (`owner/name`, this repo is `arefhp/flowart`) | arefhp/flowart | GitHub repo URL | Step 1 | [x] |
| `CLOUDFLARE_ACCOUNT_ID` | 53b7273413025db1bae1299f9a221414 | Cloudflare dashboard -> Workers & Pages overview (right side), or the URL after `dash.cloudflare.com/` | Step 3 | [x] |
| `D1_DATABASE_ID` | 7f7524db-8f36-414a-8f67-119b0422996d | Cloudflare -> Storage & Databases -> D1 -> `zakereh-art-db` -> **Database ID** | Step 3 | [x] |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (production widget, **public**) | 0x4AAAAAAFRsKGAs4iPYF9Vj | Cloudflare -> Turnstile -> widget `zakereh-art` -> **Site key**. Local development uses the always-pass test key and needs nothing here | Step 6 | [x] |
| `TURNSTILE_SITE_KEY_DEV` (optional, widget `zakereh-art-dev`, **public**) | 0x4AAAAAAFRsda8oQ5YVFOxm | same page, the dev widget | Step 6 | [x] |

## C. Needed for deployment (Milestone 4)
| Name | Value | Where to find it | Runbook step | Done |
|---|---|---|---|---|
| `ACCESS_TEAM_NAME` | | Cloudflare Zero Trust -> Settings -> Custom pages / team domain. It is the part before `.cloudflareaccess.com` | Step 10 | [ ] |
| `ACCESS_AUD` (Audience tag) | | Zero Trust -> Access -> Applications -> `zakereh-art-admin` -> **Overview** -> Application Audience (AUD) Tag | Step 10 | [ ] |
| `ADMIN_EMAILS` (comma separated; must match the Access policy) | | the address(es) you sign in with | Step 10 | [ ] |
| R2 media custom domain confirmed working (`media.zfadavi.com` resolves) | yes / no | R2 -> `zakereh-media` -> Settings -> Custom Domains | Step 3 | [x] |
| Resend domain `zfadavi.com` shows **Verified** | yes | https://resend.com/domains | Step 5 | [x] |
| Cloudflare Email Routing: `info@` rule active and destination **Verified** | yes | Cloudflare -> `zfadavi.com` -> Email -> Email Routing | Step 0B | [x] |
| Stripe webhook endpoint created at `https://zfadavi.com/api/stripe/webhook` | yes / no | Stripe -> Developers -> Webhooks (the signing secret is a secret, see below) | Step 10 | [ ] |
| GitHub **repository secrets** `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` added (you do this; Claude never sees the token) | yes | GitHub -> Settings -> Secrets and variables -> Actions | Step 3, item 4 | [x] |
| GitHub environment `production` created with you as required reviewer (used only by the migrate workflow) | yes | GitHub -> Settings -> Environments | Step 1, item 3 | [x] |

---

## D. Content and legal details (for pages, emails and Stripe)
Public contact details of the business. Claude uses them on `/contact`, `/privacy`, `/terms`, in email footers, and in structured data. Leave blank anything you do not want published.

| Name | Value | Notes | Done |
|---|---|---|---|
| Artist / business display name | Zakereh Art | e.g. Zakereh Art | [x] |
| Business legal name (if different) | Flow Art | shown in `/terms` and `/privacy` | [x] |
| CVR number (if you have one) | 42674249 | Danish company number | [x] |
| VAT / moms number (if registered) | **Not VAT registered (yet)** | VAT is **not mentioned anywhere** on the site, in the terms or in emails (owner decision) | [x] |
| Public email | `info@zfadavi.com` | already decided | [x] |
| Public phone (optional) | **None. Do not show a phone number.** Contact is by email or social media only | the contact page, terms, privacy page and email footers show no phone; the booking form's phone field stays optional | [x] |
| Studio / postal address (optional, public) | | needed for privacy policy "data controller" contact | [ ] |
| City shown on the site | Copenhagen | | [x] |
| Instagram URL | `https://www.instagram.com/zakereh.fadavi.art/` | cleaned from the link you supplied (QR/tracking parameters removed); editable later in `/admin/social` | [x] |
| Facebook URL | `https://www.facebook.com/share/1974LVc4VU/` | a *share* link; swap for the page's permanent address if it has one | [x] |
| TikTok URL | `https://www.tiktok.com/@zakerehfadaviart` | cleaned from the link you supplied | [x] |
| Other social/links (optional) | | add later in `/admin/social` | [ ] |
| Cancellation / refund policy text | A customer who cancels by email to info@zfadavi.com at least 24 hours before the workshop starts gets a full refund (the admin refunds that booking). If the artist cancels, everyone is fully refunded. Later than 24 hours: not refundable under the policy, at the artist's discretion (**confirmed by the owner**). | owner decision; Claude writes `/terms` in English and Danish from this | [x] |
| Default workshop location (optional) | | pre-fills the event form | [ ] |
| Site tagline / short description (optional, for SEO) | **Fine Art and workshops in Copenhagen** (Danish, drafted: "Fine Art og workshops i København") | shown under the site name, in the footer and in search results; please confirm the Danish | [x] |
| Home-page hero artwork (optional) | pick the featured one | the title of the artwork to feature, or "pick the featured one" | [x] |

Files to give Claude: put them in the repo's `input/` folder (do not paste them in chat). **Provided:** `about.jpeg` (About portrait) and four painting photos (`Painting 3 croped.JPG`, `Pinting 2.jpg`, `painting 4 1.jpg`, `painting original 1.jpg`). Still optional: a logo. `input/` is git-ignored (your originals are never committed); the seed script uses these files locally and falls back to generated placeholders when they are absent. Keep your own copies.

---

## E. Optional decisions (answer when asked, or leave to Claude's defaults)
| Question | Your answer | Default |
|---|---|---|
| Danish and/or English pages? | **Both from day one.** English at the root (`/artworks`), Danish under `/da/` (`/da/artworks`). Danish text is optional per field and falls back to English | decided |
| Hold time for unpaid bookings | 30 minutes (confirmed) | 30 minutes |
| Max places per booking | 10 (confirmed) | 10 |
| Owner notification email (booking alerts) | `info@zfadavi.com` (default accepted) | `info@zfadavi.com` |
| Add a `www.zfadavi.com` redirect? | yes (default accepted) | yes |
| Domain `.dk` later? | no (default accepted) | no |
| Invoices for workshop bookings? | Stripe's payment receipt plus our confirmation email only; no Stripe Invoicing | decided |
| Payment methods | Cards, Apple Pay, Google Pay (no MobilePay for now) | decided |
| Stripe environment | Sandbox (test keys) until you say go live | decided |
| Visual direction | Quiet, light gallery | decided |
| Artwork enquiries | "Ask about this work" button opens the contact form pre-filled (not shown for sold works) | decided |
| Gallery | The grid shows one cover image per artwork; clicking opens the artwork page with all its images and the full description | decided |
| Categories | Defined by you in the admin (start: Fine Art, Resin). One category per artwork; a category with artworks cannot be deleted | decided |
| Size | Small / Medium / Large, chosen by you for every artwork | decided |
| Gallery filters | Category, Size, Price range, Available only. The Price filter only appears when an artwork has a price. Ranges: under 5,000, 5,000 to 15,000, over 15,000 DKK | decided |
| About text in Danish | Starts as a translation of your English text; reword it in `/admin/about` | decided |
| Workers Free 10 ms CPU limit | Accepted for launch; how to raise it is in `docs/MAINTENANCE.md` | decided |

---

## Secrets you do NOT give Claude
Enter these only where listed. Claude will tell you the exact variable names; it never needs the values.

| Secret | Where it goes |
|---|---|
| `STRIPE_SECRET_KEY` (`sk_test_...` locally, live key in production) | local `apps/worker/.dev.vars`; production `npx wrangler secret put STRIPE_SECRET_KEY` |
| `STRIPE_WEBHOOK_SECRET` (`whsec_...`) | local from `stripe listen`; production `wrangler secret put` |
| `TURNSTILE_SECRET_KEY` | local `.dev.vars` (test key); production `wrangler secret put` |
| `RESEND_API_KEY` (`re_...`) | local `.dev.vars`; production `wrangler secret put` (use a separate key) |
| `GITHUB_DISPATCH_TOKEN` | production `wrangler secret put` |
| `CLOUDFLARE_API_TOKEN` | GitHub repo -> Settings -> Secrets and variables -> Actions -> **Repository secrets** (not an environment secret; runbook Step 3, item 4) |
| `CLOUDFLARE_ACCOUNT_ID` (not sensitive) | same page, **Repository secrets** |
| `age` backup **private** key, `age` public key | private key: password manager only; public key: GitHub secret (Claude documents the name) |
| Cloudflare / Stripe / Resend / GitHub account passwords, 2FA recovery codes | password manager and offline paper copy |
| Gmail "Send mail as" SMTP key (optional) | password manager; Gmail settings |

If you ever pasted a secret into chat or committed it by mistake: revoke it at the provider (Resend -> API Keys, Stripe -> API keys -> Roll key, Turnstile -> Rotate secret key, Cloudflare -> API Tokens -> Roll) and create a new one.

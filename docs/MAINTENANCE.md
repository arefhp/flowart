# Maintenance and developer notes

For the owner and for any developer who takes over the site later. Keep it current: whenever a limit, plan or provider setting changes, update this file in the same change.

Free-tier limits change over time. **Verify every number below on the provider's official page before relying on it** (links at the bottom of `OWNER_SETUP_RUNBOOK.md`).

---

## 1. Known risk: the Workers Free 10 ms CPU limit

**Status: accepted by the owner. The site launches on the Free plan because traffic will be very low. Increase it when the symptoms below appear.**

### What it is
On the Workers **Free** plan, each request to the Worker (anything under `/api/*`) may use only about **10 ms of CPU time**. This is CPU time, not waiting time: time spent waiting for D1, R2 or Stripe does not count, but parsing, signature checks, JSON handling and the Stripe SDK do. Static pages and images are not Worker requests and are not affected.

### Which parts are most exposed
- Stripe webhook handling (signature verification, then updating the booking). The signature check uses the built-in Web Crypto API, not the Stripe SDK
- Creating a Stripe Checkout session (booking request). Stripe is called with plain `fetch` (no SDK), to keep the Worker small and fast
- Cancelling a workshop that has many bookings: refunds are sent 10 per run (each refund is a Stripe call, and the free plan allows about 50 subrequests per request); the scheduled job (every 15 minutes) finishes the rest
- Verifying the Cloudflare Access sign-in token on `/api/admin/*` requests
- Large admin payloads (for example saving many social links or a long About text)

### Symptoms
- Occasional failed booking requests or admin saves, shown to the user as a friendly error.
- Errors in Workers Logs mentioning that the Worker exceeded its resource/CPU limit (Cloudflare "error 1102" style messages).
- In Stripe -> Developers -> Webhooks, deliveries to `/api/stripe/webhook` showing failures. **Stripe retries failed webhook deliveries automatically for days**, so a rare failure does not lose a payment; check the Bookings list for "Needs attention" anyway.

### How to check
Cloudflare dashboard -> Workers & Pages -> `zakereh-art` -> **Metrics** (CPU time, errors) and **Logs**. The code also logs a warning when a handler runs close to the limit where this can be measured.

### How to increase it
1. Upgrade the account to **Workers Paid (about 5 USD/month)**: dashboard -> Workers & Pages -> Plans.
2. In `apps/worker/wrangler.jsonc`, raise the CPU limit with the `limits` setting (for example `"limits": { "cpu_ms": 50 }`). Confirm the current option name and allowed values in Cloudflare's docs: https://developers.cloudflare.com/workers/platform/limits/ and https://developers.cloudflare.com/workers/wrangler/configuration/ .
3. Deploy (GitHub Actions `deploy` workflow), then watch Metrics for a day.
4. Paid also raises the request and database limits and gives 30-day database point-in-time restore (see section 2).

If you would rather not wait for symptoms, you can do step 1 on day one; the cost is the same 5 USD/month.

---

## 2. Other free-tier limits and what to do

| Limit (Free, verify) | What happens when exceeded | Raise it |
|---|---|---|
| Worker requests: 100,000 per day | API requests fail until the next UTC day | Workers Paid, about 5 USD/month |
| D1: 5 million row reads and 100,000 row writes per day | Queries fail until 00:00 UTC | Workers Paid (much larger allowance) |
| D1 point-in-time restore: 7 days | Older states cannot be restored | Workers Paid (30 days) |
| R2: 10 GB storage, 1 M writes and 10 M reads per month | Billed per use beyond the free amount | nothing to do; small cost |
| Resend: 3,000 emails per month, 100 per day, 1 domain | Emails are deferred by the outbox, then rejected by the provider | Resend Pro, about 20 USD/month |
| Image Transformations: 5,000 unique per month (fallback only) | Fallback images fail; the pre-generated sizes are unaffected | normally not needed |
| Cloudflare Access: up to 50 users | n/a for one admin | n/a |

Cloudflare's Free plan has no automatic overage billing: hitting a limit causes errors, not a surprise bill.

---

## 3. Routine maintenance
See [ADMIN_GUIDE.md](ADMIN_GUIDE.md) section 8 for the owner's weekly and monthly checklist, and `OWNER_SETUP_RUNBOOK.md` Steps 12 and 13 for cost protection and backups.

For a developer: dependency updates arrive via Dependabot pull requests; run `npm run typecheck`, `lint`, `test` and `build` before merging; production migrations go through the manual `migrate` workflow (approval required); deploys never migrate.

---

## 4. Gallery filters: the price filter is switched off
The Artworks page has a filter sidebar (Category, Size, Available only). A **price-range filter is built and tested but NOT shown** (owner decision). To show it again, set `SHOW_PRICE_FILTER = true` in `apps/web/src/lib/price-bands.ts`, run `npm test`, `npm run test:built-html`, `npm run test:e2e` and `npm run build`, and deploy: the Price group then appears (only when at least one artwork has a price) and the price wording is sent to the browser again. While it is off, a `?price=` in the address is ignored. When on, the filter offers three price ranges in Danish kroner: under 5,000, 5,000 to 15,000, and over 15,000. They live in one small list in `apps/web/src/lib/price-bands.ts` (`PRICE_BANDS`, amounts in øre, so 500000 is 5,000 DKK). To change the ranges, edit that list, run `npm test` and `npm run build`, and deploy. A range is only shown when an artwork falls in it, and works priced in another currency are not compared with these ranges. The words ("Under {amount}", "{from} to {to}", "Over {amount}") are in `apps/web/src/i18n/dictionary.ts`. Categories and the Small/Medium/Large size are chosen by the owner in the admin and need no code change.

---

## 5. Languages and legal pages
The public site is English (root) and Danish (`/da/`). Danish text in artworks, events and About is optional and falls back to English. The Danish wording, `/terms` and `/privacy` (both languages) come from [LANGUAGE_REVIEW.md](LANGUAGE_REVIEW.md). Change the wording there first, then ask Claude to update the site.

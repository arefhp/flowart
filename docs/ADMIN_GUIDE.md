# Admin guide: managing your website

For the owner. No coding needed. Everything below is done at **https://zfadavi.com/admin** (locally: http://localhost:3000/admin).

> **What exists today (Milestone 1):** Overview, Artworks, About, Social links, Messages, Help, and the **Rebuild site** button. Sections 4 (Events), 5 (Bookings) and the Calendar part of section 6 describe what arrives in Milestones 2 and 3; they are not in the admin yet. If a screen is named differently in the finished app, tell Claude and update this guide.

---

## 1. Signing in
1. Go to `https://zfadavi.com/admin`.
2. Cloudflare asks for your email address and sends a **6-digit code**. Enter it.
3. You are in. The session lasts as long as you set in Cloudflare Access (for example 24 hours). When it ends, reload the page and sign in again.

Only email addresses on your allow list can sign in. Anyone else gets a refusal page and never sees the admin.

**Add or remove an admin** (for example an assistant): needs two changes, both done by you in Cloudflare: Zero Trust -> Access -> Applications -> `zakereh-art-admin` -> Policies -> edit the **Emails** list; and ask Claude to add the address to `ADMIN_EMAILS` in `wrangler.jsonc`, then deploy. Remove people the same way.

**Can't sign in?**
| Problem | What to do |
|---|---|
| No code arrives | check spam; make sure you typed the allow-listed address exactly; wait a minute and retry |
| "You don't have access" | the address is not on the list (add it as above) |
| Page says "Your session ended" | reload the page and sign in again |
| Still stuck | open a private browser window and try once more; then contact Claude with a screenshot (no codes or passwords) |

## 2. Artworks (`Admin -> Artworks`)
**Add an artwork**
1. **New artwork**.
2. Fill in: **Title** (required), **Description**, **Materials and technique** (e.g. oil on canvas), **Year**, and the size (**width / height / depth in cm**). Leave out any size you don't want to show; the page only shows the sizes you fill in. Each text field has an **English** box and a **Danish** box. English is required; **Danish is optional**: if you leave it empty, Danish visitors see the English text.
3. **Price (optional).** Fill it in to show a price. **Leave it empty to show no price at all**: nothing is displayed, not even a dash. Enter `0` only if the work is truly free.
4. **Status:** 
   | Status | What visitors see |
   |---|---|
   | Available | shown in the gallery |
   | Reserved | shown, marked reserved |
   | Sold | shown, marked sold |
   | Hidden | not on the public site at all (use for drafts) |
5. **Featured:** tick to show it on the home page.
6. **Images:** drag in one or more photos (JPEG, PNG or WebP). Your browser prepares the three web sizes for you; you only choose the original file. Use a sharp, well-lit photo. Write a short **alt text** for each (a sentence describing the painting, for people using screen readers; the Danish alt text is optional).
   - **Cover image:** the gallery shows only **one image per artwork, its cover**. Click **Set as cover** on the image you want. If you never choose one, the first image is the cover.
   - **More images:** the other images (details, the back, the painting in a room, ...) appear on the artwork's own page. A visitor clicks the cover in the gallery, lands on that page, sees all the images as thumbnails, and can click any of them to view it large. The full **Description** is shown there too, so use it for the story, technique and details.
   - An artwork **with no images** is not shown on the public site (it is marked "No image: not shown publicly" in your list).
7. **Save.** The site updates itself in a few minutes (section 7).

**Edit / reorder / delete:** open the artwork from the list. Drag images to reorder them, remove an image with its delete button, or delete the whole artwork (this also deletes its stored images; it cannot be undone, so keep your original files).

**Enquiries:** every available or reserved artwork has an **Ask about this work** button. It opens the contact form with the artwork's name filled in, and the message arrives in **Admin -> Messages** and at `info@zfadavi.com`. It never shows a price. The button is not shown for sold works.

Tips: use clear titles; images under about 10 MB are fine; keep your original high-resolution files on your own computer.

## 3. About page (`Admin -> About`)
- Edit the **heading** (optional) and the **text**, in English and (optionally) Danish. Leave a blank line between paragraphs. Text only; no formatting is needed. Until you add Danish, the Danish About page shows the English text.
- **Portrait:** drag in your photo, check the preview (it shows exactly how it will be cropped), write the **alt text** (required, e.g. "Portrait of the artist in her studio"), and Save. **Replace** swaps it; **Remove** takes it away, and the page then shows only the text.
- A good portrait is portrait-orientation, at least 1200 px tall.

## 3A. Social media links (`Admin -> Social`)
Your Instagram, Facebook and TikTok links are set here and appear in the footer of every page, on the Contact and About pages, and in the email footer.
- Each row has a **platform**, the **link**, an optional **label**, and a **Visible** switch. Paste the link from your browser or the app's Share button. The form shows **"Will be saved as: ..."**: it removes tracking bits (such as `utm_source`, `mibextid`, `vrfl`, `_t`) so the link stays clean.
- **Add link** for another platform (YouTube, Pinterest, X, Behance, or Other with your own label). **Move up/down** changes the order. **Open link** tests it in a new tab. **Remove** deletes it.
- Turn **Visible** off to hide a link without losing it. If every link is hidden or removed, the site shows no social section at all.
- The links must start with `https://` and match the platform (an Instagram row only accepts an instagram.com link).
- Your Facebook link is a *share* link (`facebook.com/share/...`). It works, but if your page has a permanent address like `facebook.com/<your-page-name>`, using that is more stable.
- After **Save** the site rebuilds (section 7) and the links go live in a few minutes.

## 4. Workshops / events (`Admin -> Events`)
**Create**
1. **New event**. Enter **title**, **description**, **location** (English required, Danish optional). In the description, tell people what to expect: what they will paint, whether beginners are welcome, what is included (paint, canvas, brushes, snacks), and the atmosphere you want.
2. **Start and end time** in Copenhagen time. The site takes care of summer/winter time.
3. **Max participants** (the number of places) and **price per person** in DKK.
4. **Save as draft**, check it, then **Publish**. Draft events are invisible to visitors.

**What visitors see:** date, time, location, price, remaining places (live), and a **Book** button. Full, cancelled and past events show the right message and no Book button.

**Cancel an event:** use **Cancel event**. If people have already paid, the screen shows how many bookings and how much money are affected. When you confirm, everyone is **refunded through Stripe automatically** and gets an email. If some refunds fail, they are retried automatically; check the bookings list for rows marked **Needs attention**.

## 5. Bookings (`Admin -> Bookings`)
Lists everyone who booked, with event, number of people, amount and status.

| Status | Meaning |
|---|---|
| Pending | the customer is still paying; the places are held for 30 minutes, then released |
| Confirmed | paid and confirmed (only after Stripe confirms the payment) |
| Cancelled | cancelled or refunded |
| Expired | payment was not completed in time |
| **Needs attention** | something unusual (for example someone paid after their hold expired and the event filled up). Open it and refund or resolve it |

Actions: **filter** by event/status, **export CSV** (for your own records or accountant), **refund** one booking. Refunds go back to the customer's card by Stripe.

**Cancellation policy (your decision):** customers have no accounts, so they cancel by emailing `info@zfadavi.com`. If they write **at least 24 hours before the workshop starts**, they get a **full refund**: open their booking and press **Refund**; the places are released and they get an email in their language. The refund dialog shows how many hours remain before the start. Later requests are not covered by the policy (your discretion; the app does not stop you from refunding). If **you** cancel an event, everyone who paid is refunded automatically (section 4). A booking can be made for at most 10 places at once, and unpaid places are held for 30 minutes.

## 6. Calendar and messages
- **Calendar:** all events with the number of bookings per event, so you can see at a glance what is filling up.
- **Messages:** every contact-form message is saved here **and** emailed to `info@zfadavi.com` (which forwards to your own inbox). To answer, press Reply in your email. The visitor's address is set as the reply address. If you set up "Send mail as" (runbook Step 0B), choose `info@zfadavi.com` as the From address.

## 7. How changes reach the public site
Your site is built into fast, static pages. After you **save a change to an artwork, event, the About page or the social links**, the admin shows **"Rebuilding the site"** and the change goes live in **a few minutes**. 

| Indicator | Meaning |
|---|---|
| Rebuild pending | wait a few minutes, then reload the public page |
| Rebuild done | live |
| Rebuild failed | click **Rebuild site**; if it fails again, tell Claude (the GitHub Actions tab has the log) |

Live items such as remaining places and booking status are always fresh and do not wait for a rebuild. If you did not see your change after 10 minutes, hard-refresh the page (Ctrl+F5), then use **Rebuild site**.

## 8. Weekly and monthly routine
**When you add content:** add images with alt text, set the status, save, wait for the rebuild, and look at the page on your phone.

**Monthly (15 minutes):**
- [ ] Open the **Bookings** list: nothing marked Needs attention
- [ ] Stripe dashboard: no failed payouts or disputes
- [ ] Cloudflare -> usage page, and the Resend dashboard: volume far below the free limits
- [ ] GitHub -> Actions: the daily backup runs are green; **download the newest encrypted backup** to your own computer
- [ ] Uptime monitor email: no downtime reports
- [ ] Original artwork files are safely stored on your own disk

## 9. Security habits
- Your Cloudflare account controls the domain, site, database and images. Keep **two-factor authentication** on, store recovery codes offline, and never share the login.
- Only sign in to `/admin` on devices you trust. Sign out on shared computers (close the browser; for Cloudflare Access, the session also expires on its own).
- Never send passwords, codes, API keys or backup keys in chat or email. If you suspect a key leaked, tell Claude and rotate it (see the key-rotation notes in [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) section 11).
- Customer data (names, emails) is personal data. Export CSVs only when needed, store them safely and delete them when finished. To delete a customer's data on request, use the admin's customer-data deletion tool or ask Claude.

## 10. Common questions
| Question | Answer |
|---|---|
| Can I hide the price on some artworks? | Yes: leave Price empty |
| Can I take an artwork off the site without deleting it? | Yes: set status **Hidden** |
| Why isn't my new artwork on the site yet? | the rebuild takes a few minutes (section 7) |
| Someone paid but isn't confirmed | wait a minute (confirmation comes from Stripe); then check the Bookings list for **Needs attention** |
| I need to change a price on an event with bookings | already-paid bookings keep the price they paid; the new price applies to new bookings |
| How do I change the contact email shown on the site? | ask Claude (it is a setting, not a page edit) |
| How do I change a page like Privacy or Terms? | ask Claude to edit it (these pages are part of the code, not the admin). They exist in English and Danish; the wording is in `docs/LANGUAGE_REVIEW.md` |
| How do I add Danish text? | in each form (artwork, About, event) fill the **Danish** box next to the English one. Leave it empty to show English |
| Which language do customers' emails use? | the language of the page they booked from (English or Danish) |
| What if the site gets slow or booking sometimes fails? | the free Cloudflare plan has a small per-request CPU limit; see `docs/MAINTENANCE.md` for how to raise it (about 5 USD/month) |
| What if the site is down? | check https://www.cloudflarestatus.com/ and your uptime monitor; then contact Claude with the time and what you saw |

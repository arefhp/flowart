# Admin guide: managing your website

For the owner. No coding needed. Everything below is done at **https://zfadavi.com/admin** (locally: http://localhost:3000/admin).

> **What exists today (Milestones 1 to 3):** Overview, Artworks, Categories, Events, **Bookings**, Calendar, About, Social links, Messages, Help, and the **Rebuild site** button. If a screen is named differently in the finished app, tell Claude and update this guide.

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
5. **Category and size.** Choose the **category** (for example Fine Art or Resin) and the **size** (Small, Medium or Large). Both are required, because visitors use them to filter the gallery. The size does not have to match the centimetres exactly: choose what feels right. A new artwork starts in the first category. Manage the list in `Admin -> Categories` (section 2A).
6. **Featured:** tick to show it on the home page.
7. **Images:** drag in one or more photos (JPEG, PNG or WebP). Your browser prepares the three web sizes for you; you only choose the original file. Use a sharp, well-lit photo. Write a short **alt text** for each (a sentence describing the painting, for people using screen readers; the Danish alt text is optional).
   - **Cover image:** the gallery shows only **one image per artwork, its cover**. Click **Set as cover** on the image you want. If you never choose one, the first image is the cover.
   - **More images:** the other images (details, the back, the painting in a room, ...) appear on the artwork's own page. A visitor clicks the cover in the gallery, lands on that page, sees all the images as thumbnails, and can click any of them to view it large. The full **Description** is shown there too, so use it for the story, technique and details.
   - An artwork **with no images** is not shown on the public site (it is marked "No image: not shown publicly" in your list).
8. **Save.** The site updates itself in a few minutes (section 7).

**Edit / reorder / delete:** open the artwork from the list. Drag images to reorder them, remove an image with its delete button, or delete the whole artwork (this also deletes its stored images; it cannot be undone, so keep your original files).

**Enquiries:** every available or reserved artwork has an **Ask about this work** button. It opens the contact form with the artwork's name filled in, and the message arrives in **Admin -> Messages** and at `info@zfadavi.com`. It never shows a price. The button is not shown for sold works.

Tips: use clear titles; images under about 10 MB are fine; keep your original high-resolution files on your own computer.

## 2A. Categories (`Admin -> Categories`)
Categories group your artworks, for example **Fine Art** and **Resin**. You choose one for every artwork, and visitors can filter the gallery by category.
- **Add:** type the English name (and the Danish name if it differs; if you leave it empty, the English name is used in Danish) and press **Add category**. Two categories cannot have the same name.
- **Rename:** change the name and press **Save**. The address used for filtering stays the same, so links people have shared keep working.
- **Order:** **Move up / Move down** sets the order of the filter buttons on the site.
- **Delete:** press **Delete**. If any artwork is still in the category (even a hidden one), you get an error that names those artworks, and nothing is deleted. Open each of them, choose another category, save, then delete the category. A category with no artworks deletes straight away.
- A category only appears as a filter button on the site when it has at least one artwork that is shown to visitors, so you never get an empty button.

**How visitors filter the gallery** (Artworks page, English and Danish): a **Filters sidebar** beside the gallery (on a phone it folds away behind a **Filters** button) with **Category**, **Size** and **Available only**. The choices are outlined buttons (the chosen one is filled in), and each group can be folded open and closed by clicking its heading. **The first category (the first one in your Categories list, so you decide it by ordering them) is selected when the page opens**; visitors press **All** to see everything. Each choice shows how many artworks it has, "Showing 2 of 4" appears once a filter is on, and **Clear filters** resets everything. **Size always offers Small, Medium and Large**, even if you have nothing Large yet (choosing it then says no artworks match). Category buttons only appear for categories that have at least one artwork shown to visitors, so there is never an empty one. **A price filter is built but switched off for now**: visitors do not see it. It can be switched on later (see `docs/MAINTENANCE.md`); when on, it would only appear if at least one artwork has a price, and an artwork without a price would never appear in a price range.

## 3. About page (`Admin -> About`)
- Edit the **heading** (optional) and the **text**, in English and Danish. Leave a blank line between paragraphs. Text only; no formatting is needed. The Danish text starts as a translation of your English statement (please read it and reword anything that does not sound like you); if you ever clear the Danish box, the Danish page shows the English text again.
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

## 4. Workshops / events (`Admin -> Events` and `Admin -> Calendar`)
**Create**
1. **New event.** Fill in **Starts** and **Ends**, the **Location**, the **Number of places** and the **Price per person**, then the **title and description** (English required, Danish optional). In the description, tell people what to expect: what they will paint, whether beginners are welcome, what is included (paint, canvas, brushes, snacks), and the atmosphere you want.
2. **Times are Copenhagen time.** Type the time as it is on the clock; the site takes care of summer and winter time. If you pick a time that does not exist (the hour skipped when the clocks go forward in March) you get a message asking you to choose another. A workshop can last at most 14 days.
3. **Price per person** in DKK; enter **0** for a free workshop (visitors then see "Free").
4. **Save as draft.** A new event is always a draft: visitors cannot see it. Check it, then press **Publish** on the next screen.

**The buttons on an event**
| Button | What it does |
|---|---|
| **Publish** | puts a draft on the public site (the start must be in the future) |
| **Back to draft** | takes it off the public site again (only possible while nobody has booked; otherwise cancel it) |
| **Cancel event** | visitors see it as **cancelled**, struck through, with no way to book. If people have already booked, you are first told how many people and how much money, and asked to confirm; then every paid booking is **refunded in full** and every customer gets an email (section 5) |
| **Delete event** | removes it for good. Only possible when nobody has ever booked; otherwise cancel it |

A **cancelled** or **completed** event can no longer be edited. After a workshop has ended, the site moves it to the past list by itself, and it is marked **Completed** within about 15 minutes. You cannot make the number of places lower than the places already booked, and a price change only applies to new bookings.

**What visitors see:** the **Workshops** page (upcoming first, past ones below), each workshop's own page with the date, time (marked Copenhagen time), place, price per person, **places left (live)** and an **Add to calendar** button that downloads a standard calendar file, and a **Calendar** page with a month view. The home page shows the next three upcoming workshops. Full, cancelled and past workshops show the right message. While places are left, the workshop page has the **booking form** (section 5); under it a link, **Have a question first? Write to me**, opens the contact form with the workshop's name and date filled in, and the message arrives in **Messages**. A workshop with the price **0** is **free**: people book without paying.

**The admin Calendar** shows every workshop by date (drafts dashed, published with a blue edge, cancelled struck through) with the places booked out of the total. Click one to edit it. **Events** lists them as Upcoming and Past and cancelled.

## 5. Bookings (`Admin -> Bookings`)

**How a customer books.** On a workshop page with places left, the customer fills in name and email (phone is optional), chooses how many places (up to 10), ticks the box saying they have read the Terms and the Privacy policy, and presses **Pay**. Above the Pay button they can see the **total price**, that their places are **held for 30 minutes** while they pay, and the **free-cancellation rule** (see below). They then pay on Stripe's secure page (cards and wallets such as Apple Pay and Google Pay). When Stripe confirms the payment, the booking becomes **Confirmed** and they receive an email in their language with the details and a calendar file; you receive a notification email at `info@zfadavi.com` (Reply goes to the customer). For a **free** workshop the booking is confirmed at once, with the same emails and no payment.

Nothing is ever confirmed because a customer came back to the site: only Stripe telling the server that the payment worked confirms it. The "thank you" page says *We're confirming your payment...* until then.

**The list.** `Admin -> Bookings` shows everyone who booked: when, workshop, name and email, places, amount and status. Filter by **workshop**, by **status**, or **Needs attention only**. **Download as spreadsheet (CSV)** gives the same list (with the same filters) for your own records or your accountant.

| Status | Meaning |
|---|---|
| Waiting for payment | the customer is still paying; the places are held for 30 minutes, then released automatically |
| Confirmed | paid (or free) and confirmed |
| Cancelled | cancelled by you or because the workshop was cancelled; paid ones are refunded |
| Expired (not paid) | the payment was not completed in time; the places went back on sale |
| **Needs attention** (red note) | something unusual that needs a human: a refund that did not go through, or an amount that does not match. The note says what. Fix it (for example refund it in the Stripe dashboard), then press **Mark as handled**. You also get an email, and the Overview lists these |

**Cancellation policy.** Customers have no accounts, so they cancel by emailing `info@zfadavi.com`. If they write **at least 24 hours before the workshop starts**, they get a **full refund**: find their booking and press **Cancel and refund**. The dialog tells you the amount and how long is left before the start, so you can see whether the 24-hour rule applies; the app does not stop you from refunding a later request, that is your decision. The customer is emailed in their language and the places become free again. If **you** cancel a workshop, everyone is refunded automatically (section 4). If someone pays *after* their 30 minutes ran out and the places are gone, they are refunded automatically and told so.

**Refunds go back to the original card**, through Stripe. Depending on the bank it can take a few days to show on the customer's statement.

**If a workshop has many bookings**, the refunds are sent a few at a time (10 per run); the rest follow automatically within a few minutes. The dialog says how many are still on their way.

A booking can be for at most 10 places at once. Several people are not stopped from booking with the same email: each booking is separate.

## 6. Calendar and messages
- **Calendar:** all events by date with the places booked out of the total (see section 4).
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
| Someone paid but isn't confirmed | wait a minute (confirmation comes from Stripe); then check the Bookings list for **Needs attention**. If Stripe shows the payment but the site never confirmed it, check **Developers -> Webhooks** in the Stripe dashboard for failed deliveries (runbook Step 8) |
| I need to change a price on an event with bookings | already-paid bookings keep the price they paid; the new price applies to new bookings |
| How do I change the contact email shown on the site? | ask Claude (it is a setting, not a page edit) |
| How do I change a page like Privacy or Terms? | ask Claude to edit it (these pages are part of the code, not the admin). They exist in English and Danish; the wording is in `docs/LANGUAGE_REVIEW.md` |
| How do I add a category such as "Prints"? | `Admin -> Categories` -> **Add category**, then choose it on the artworks that belong to it (section 2A) |
| Why can't I delete a category? | some artwork is still in it. The message lists them: move them to another category first (section 2A) |
| Why is there no Price filter on the site? | it is switched off for now (it is built and can be switched on later; see `docs/MAINTENANCE.md`). Artworks that have a price still show it on their own page |
| How do I add Danish text? | in each form (artwork, About, event) fill the **Danish** box next to the English one. Leave it empty to show English |
| Which language do customers' emails use? | the language of the page they booked from (English or Danish) |
| What if the site gets slow or booking sometimes fails? | the free Cloudflare plan has a small per-request CPU limit; see `docs/MAINTENANCE.md` for how to raise it (about 5 USD/month) |
| What if the site is down? | check https://www.cloudflarestatus.com/ and your uptime monitor; then contact Claude with the time and what you saw |

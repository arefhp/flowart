import { expect, test } from '@playwright/test';
import { createEvent, deleteEvent, stamp } from './helpers';

// Relies on the seeded sample workshops (npm run seed), with dates relative to the day it was run:
//   Oil Painting for Beginners (published, 8 places, DKK 550, Danish title, Saturday 10:00-14:00)
//   Resin Art Evening          (published, 6 places, DKK 650, Thursday 18:00-21:00)
//   Autumn Landscape Morning   (CANCELLED, upcoming)
//   Winter Still Life          (completed, in the past)
//   Colour Study Day           (DRAFT: must never be public)

const OIL = 'oil-painting-for-beginners';

test.describe('workshops (public)', () => {
  test('the list shows upcoming workshops soonest first, cancelled ones struck through, past ones below, and never a draft', async ({ page }) => {
    await page.goto('/workshops');
    await expect(page.getByRole('heading', { name: 'Workshops', level: 1 })).toBeVisible();
    const upcoming = page.getByRole('region', { name: 'Upcoming workshops' }).getByRole('heading', { level: 3 });
    await expect(upcoming).toHaveText(['Oil Painting for Beginners', 'Autumn Landscape Morning', 'Resin Art Evening']);
    await expect(page.getByRole('region', { name: 'Past workshops' }).getByRole('heading', { level: 3 })).toHaveText(['Winter Still Life']);
    await expect(page.getByText('Colour Study Day')).toHaveCount(0); // the draft
    await expect(page.getByText('Cancelled', { exact: true })).toBeVisible();
    // each row has the time (Copenhagen), the price per person and, once loaded, the places left
    const oil = page.getByRole('link', { name: /Oil Painting for Beginners/ });
    await expect(oil).toContainText('10:00–14:00');
    await expect(oil).toContainText('DKK 550 per person');
    await expect(oil).toContainText('8 places left');
  });

  test('the workshop page has date, time, place, price, live places, and an Add to calendar link', async ({ page }) => {
    await page.goto(`/workshops/${OIL}`);
    await expect(page.getByRole('heading', { name: 'Oil Painting for Beginners', level: 1 })).toBeVisible();
    await expect(page.getByText('An unhurried Saturday in the studio.')).toBeVisible();
    const facts = page.locator('dl');
    await expect(facts).toContainText('Saturday');
    await expect(facts).toContainText('10:00–14:00');
    await expect(facts).toContainText('Copenhagen time');
    await expect(facts).toContainText('The studio, Copenhagen');
    await expect(facts).toContainText('DKK 550 per person');
    await expect(page.getByText('8 places left')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Add to calendar' })).toHaveAttribute('href', `/api/events/${OIL}/ics?lang=en`);
  });

  test('the calendar file has the right UTC time, title and place', async ({ page }) => {
    const info = (await (await page.request.get(`/api/events/${OIL}`)).json()) as { startsAt: string; endsAt: string };
    const res = await page.request.get(`/api/events/${OIL}/ics?lang=en`);
    expect(res.headers()['content-type']).toContain('text/calendar');
    const ics = await res.text();
    const stamp = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    expect(ics).toContain(`DTSTART:${stamp(info.startsAt)}`);
    expect(ics).toContain(`DTEND:${stamp(info.endsAt)}`);
    expect(ics).toContain('SUMMARY:Oil Painting for Beginners');
    expect(ics).toContain('LOCATION:The studio\\, Copenhagen');
    expect(ics).toContain('STATUS:CONFIRMED');
  });

  test('times are the Copenhagen times whatever time zone the visitor\'s browser is in', async ({ browser }) => {
    for (const timezoneId of ['America/Los_Angeles', 'Asia/Tokyo', 'UTC']) {
      const context = await browser.newContext({ timezoneId });
      const page = await context.newPage();
      await page.goto(`/workshops/${OIL}`);
      await expect(page.locator('dl')).toContainText('10:00–14:00');
      await context.close();
    }
  });

  test('"Ask about a place" opens the contact form already filled in for that workshop', async ({ page }) => {
    await page.goto(`/workshops/${OIL}`);
    await page.getByRole('link', { name: 'Ask about a place' }).click();
    await expect(page).toHaveURL(new RegExp(`/contact\\?event=${OIL}$`));
    await expect(page.getByLabel('Message')).toHaveValue(/I would like to reserve a place at the workshop "Oil Painting for Beginners" on Saturday/);
    await expect(page.getByText('About the workshop')).toBeVisible();
  });

  test('a cancelled workshop says so and offers no way to book or to add it to a calendar', async ({ page }) => {
    await page.goto('/workshops/autumn-landscape-morning');
    await expect(page.getByRole('heading', { name: 'Autumn Landscape Morning', level: 1 })).toBeVisible();
    await expect(page.getByText('This workshop has been cancelled.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ask about a place' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Add to calendar' })).toHaveCount(0);
  });

  test('a finished workshop says so and offers no booking', async ({ page }) => {
    await page.goto('/workshops/winter-still-life');
    await expect(page.getByText('This workshop has finished.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ask about a place' })).toHaveCount(0);
  });

  test('a draft is not public anywhere: not in the API, the list, the calendar file or the sitemap', async ({ page }) => {
    for (const path of ['/api/events/colour-study-day', '/api/events/colour-study-day/availability', '/api/events/colour-study-day/ics']) {
      expect((await page.request.get(path)).status(), path).toBe(404);
    }
    expect(await (await page.request.get('/api/events')).text()).not.toContain('Colour Study Day');
  });

  test('the home page teases the next workshops (not the cancelled one) and links to all of them', async ({ page }) => {
    await page.goto('/');
    const section = page.getByRole('region', { name: 'Upcoming workshops' });
    await expect(section.getByRole('heading', { level: 3 })).toHaveText(['Oil Painting for Beginners', 'Resin Art Evening']);
    await section.getByRole('link', { name: 'See all workshops' }).click();
    await expect(page).toHaveURL(/\/workshops$/);
  });

  test('the main menu has Workshops and Calendar in both languages', async ({ page }) => {
    await page.goto('/about');
    const nav = page.getByRole('navigation', { name: 'Main menu' });
    for (const name of ['Artworks', 'Workshops', 'Calendar', 'About', 'Contact']) await expect(nav.getByRole('link', { name })).toBeVisible();
    await page.goto('/da/about');
    const da = page.getByRole('navigation', { name: 'Hovedmenu' });
    for (const name of ['Kunstværker', 'Workshops', 'Kalender', 'Om mig', 'Kontakt']) await expect(da.getByRole('link', { name })).toBeVisible();
  });

  test('Danish: titles, dates, prices and wording are Danish, with English where there is no Danish', async ({ page }) => {
    await page.goto('/da/workshops');
    await expect(page.getByRole('heading', { name: 'Workshops', level: 1 })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Kommende workshops' })).toBeVisible();
    const oil = page.getByRole('link', { name: /Oliemaling for begyndere/ });
    await expect(oil).toContainText('550');
    await expect(oil).toContainText('pr. person');
    await expect(oil).toContainText('pladser tilbage');
    await expect(page.getByRole('heading', { name: 'Resin Art Evening', level: 3 })).toBeVisible(); // no Danish title: English

    await page.goto(`/da/workshops/${OIL}`);
    await expect(page.getByRole('heading', { name: 'Oliemaling for begyndere', level: 1 })).toBeVisible();
    await expect(page.getByText('En rolig lørdag i atelieret.')).toBeVisible();
    await expect(page.locator('dl')).toContainText('lørdag');
    await expect(page.locator('dl')).toContainText('dansk tid');
    await expect(page.getByRole('link', { name: 'Tilføj til kalender' })).toHaveAttribute('href', `/api/events/${OIL}/ics?lang=da`);
  });

  test('the workshop page carries Event structured data with an offer and the right start time', async ({ page }) => {
    await page.goto(`/workshops/${OIL}`);
    const raw = await page.locator('script[type="application/ld+json"]').allInnerTexts();
    const event = raw.map((r) => JSON.parse(r)).find((d) => d['@type'] === 'Event');
    expect(event).toBeTruthy();
    expect(event.name).toBe('Oil Painting for Beginners');
    expect(event.eventStatus).toBe('https://schema.org/EventScheduled');
    expect(event.offers).toMatchObject({ '@type': 'Offer', price: '550', priceCurrency: 'DKK' });
    expect(event.startDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:00:00\.000Z$/);
    await expect(page.locator('link[rel="alternate"][hreflang="da"]')).toHaveAttribute('href', new RegExp(`/da/workshops/${OIL}$`));
  });
});

test.describe('calendar (public)', () => {
  test('a month grid, Monday first, with the workshops as links and today marked', async ({ page }) => {
    await page.goto('/calendar');
    await expect(page.getByRole('heading', { name: 'Calendar', level: 1 })).toBeVisible();
    const headers = page.getByRole('columnheader');
    await expect(headers.first()).toHaveText('Mon');
    await expect(headers.last()).toHaveText('Sun');
    // the seeded workshops fall in this or the next two months: find the Oil Painting chip by moving forward
    const chip = page.getByRole('grid').getByRole('link', { name: /Oil Painting for Beginners/ });
    for (let i = 0; i < 3 && !(await chip.count()); i++) await page.getByRole('button', { name: 'Next month' }).click();
    await expect(chip).toBeVisible();
    await expect(chip).toContainText('10:00');
    await chip.click();
    await expect(page).toHaveURL(new RegExp(`/workshops/${OIL}$`));
  });

  test('moving between months changes the title; the phone gets a plain list', async ({ page }) => {
    await page.goto('/calendar');
    const title = page.getByRole('heading', { level: 2 }).first();
    const first = await title.innerText();
    await page.getByRole('button', { name: 'Next month' }).click();
    await expect(title).not.toHaveText(first);
    await page.getByRole('button', { name: 'Previous month' }).click();
    await expect(title).toHaveText(first);
  });

  test('on a phone the calendar is a list of the month\'s workshops', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto('/calendar');
    await expect(page.getByRole('grid')).toBeHidden();
    const link = page.getByRole('link', { name: /Oil Painting for Beginners/ });
    for (let i = 0; i < 3 && !(await link.count()); i++) await page.getByRole('button', { name: 'Next month' }).click();
    await expect(link).toBeVisible();
    await context.close();
  });

  test('speaks Danish', async ({ page }) => {
    await page.goto('/da/calendar');
    await expect(page.getByRole('heading', { name: 'Kalender', level: 1 })).toBeVisible();
    await expect(page.getByRole('columnheader').first()).toHaveText(/man/i);
    await expect(page.getByRole('button', { name: 'Næste måned' })).toBeVisible();
  });
});

test.describe('events (admin)', () => {
  test('create a draft, publish it, take it back, cancel it, and delete it', async ({ page }) => {
    const title = `E2E Workshop ${stamp()}`;
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const id = await createEvent(page, title, { start: '2031-05-10T10:00', end: '2031-05-10T13:00', places: '5', price: '450' });

    // saved as a draft: visible in the admin, invisible to visitors
    await expect(page.getByText('Saved as a draft. Visitors cannot see it yet.')).toBeVisible();
    await expect(page.getByText('Draft', { exact: true })).toBeVisible();
    expect((await page.request.get(`/api/events/${slug}`)).status()).toBe(404);

    // publish
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByText('Published. It appears on the site in a few minutes.')).toBeVisible();
    const pub = (await (await page.request.get(`/api/events/${slug}`)).json()) as { startsAt: string; priceMinor: number };
    expect(pub.startsAt).toBe('2031-05-10T08:00:00.000Z'); // 10:00 Copenhagen summer time
    expect(pub.priceMinor).toBe(45000);
    await page.goto(`/workshops/${slug}`);
    await expect(page.locator('dl')).toContainText('10:00–13:00');
    await expect(page.getByText('5 places left')).toBeVisible();

    // back to draft hides it again
    await page.goto(`/admin/events/edit?id=${id}`);
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: 'Back to draft' }).click();
    await expect(page.getByText('Back to draft. Visitors can no longer see it.')).toBeVisible();
    expect((await page.request.get(`/api/events/${slug}`)).status()).toBe(404);

    // publish again, then cancel: visitors see it as cancelled
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByText('Published.')).toBeVisible();
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: 'Cancel event' }).click();
    await expect(page.getByText('The event is cancelled.')).toBeVisible();
    await expect(page.getByText('Cancelled', { exact: true })).toBeVisible();
    await page.goto(`/workshops/${slug}`);
    await expect(page.getByText('This workshop has been cancelled.')).toBeVisible();
    // a cancelled event can no longer be edited
    await page.goto(`/admin/events/edit?id=${id}`);
    await expect(page.getByText('A cancelled event can no longer be edited.')).toBeVisible();

    await deleteEvent(page, id);
    expect((await page.request.get(`/api/events/${slug}`)).status()).toBe(404);
  });

  test('winter time and summer time: 10:00 on 10 January is 09:00 UTC, on 10 May 08:00 UTC', async ({ page }) => {
    const winter = await createEvent(page, `E2E Winter ${stamp()}`, { start: '2031-01-10T10:00', end: '2031-01-10T12:00' });
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByText('Published.')).toBeVisible();
    const row = (await (await page.request.get('/api/admin/events')).json()) as { events: Array<{ id: string; starts_at: string; starts_local: string }> };
    const w = row.events.find((e) => e.id === winter)!;
    expect(w.starts_at).toBe('2031-01-10T09:00:00.000Z');
    expect(w.starts_local).toBe('2031-01-10T10:00'); // the form shows exactly what was typed
    await deleteEvent(page, winter);
  });

  test('DST: a time that does not exist (clocks go forward) is refused with a clear message', async ({ page }) => {
    await page.goto('/admin/events/new');
    await page.getByLabel('Title (English)').fill('DST test');
    await page.getByLabel('Starts').fill('2031-03-30T02:30'); // the last Sunday of March 2031
    await page.getByLabel('Ends').fill('2031-03-30T05:00');
    await page.getByLabel('Number of places').fill('4');
    await page.getByLabel('Price per person').fill('300');
    await page.getByRole('button', { name: 'Save as draft' }).click();
    // shown under the field and again in the summary
    await expect(page.getByRole('alert').filter({ hasText: 'That time does not exist: the clocks go forward then.' }).first()).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/events\/new$/);

    await page.getByLabel('Starts').fill('2031-03-30T03:00'); // the first summer-time hour
    await page.getByRole('button', { name: 'Save as draft' }).click();
    await expect(page).toHaveURL(/\/admin\/events\/edit\?id=.+&created=1/);
    const id = new URL(page.url()).searchParams.get('id')!;
    const list = (await (await page.request.get('/api/admin/events')).json()) as { events: Array<{ id: string; starts_at: string }> };
    expect(list.events.find((e) => e.id === id)!.starts_at).toBe('2031-03-30T01:00:00.000Z');
    await deleteEvent(page, id);
  });

  test('the form checks times, places and price in plain language', async ({ page }) => {
    await page.goto('/admin/events/new');
    await page.getByRole('button', { name: 'Save as draft' }).click();
    await expect(page.getByText('The English title is required.')).toBeVisible();
    await expect(page.getByText('Choose the start date and time.')).toBeVisible();
    await expect(page.getByText('Choose the end date and time.')).toBeVisible();
    await expect(page.getByText('Enter the price per person (0 for a free workshop).')).toBeVisible();

    await page.getByLabel('Title (English)').fill('Checks');
    await page.getByLabel('Starts').fill('2031-05-10T12:00');
    await page.getByLabel('Ends').fill('2031-05-10T10:00');
    await page.getByLabel('Number of places').fill('0');
    await page.getByLabel('Price per person').fill('0');
    await page.getByRole('button', { name: 'Save as draft' }).click();
    await expect(page.getByText('The end must be after the start.')).toBeVisible();
    await expect(page.getByText('Enter a whole number of places, at least 1.')).toBeVisible();
  });

  test('a free workshop (price 0) shows "Free"', async ({ page }) => {
    const title = `E2E Free ${stamp()}`;
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const id = await createEvent(page, title, { price: '0' });
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByText('Published.')).toBeVisible();
    await page.goto(`/workshops/${slug}`);
    await expect(page.locator('dl')).toContainText('Free');
    await deleteEvent(page, id);
  });

  test('editing keeps the address, and the events list and calendar show the event with booked places', async ({ page }) => {
    const title = `E2E Edit ${stamp()}`;
    // a date a few days ahead, so it shows in this or next month's calendar
    const soon = new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10);
    const id = await createEvent(page, title, { start: `${soon}T15:00`, end: `${soon}T17:00`, places: '6' });
    await page.getByLabel('Number of places').fill('9');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Saved.', { exact: true })).toBeVisible();

    await page.goto('/admin/events');
    const row = page.getByRole('row').filter({ hasText: title });
    await expect(row).toContainText('0 of 9');
    await expect(row).toContainText('Draft');

    await page.goto('/admin/calendar');
    await expect(page.getByRole('grid')).toBeVisible(); // the events have loaded
    const chip = page.getByRole('link', { name: new RegExp(title) });
    for (let i = 0; i < 2 && !(await chip.count()); i++) await page.getByRole('button', { name: 'Next month' }).click();
    await expect(chip).toContainText('0 of 9');
    await chip.click();
    await expect(page).toHaveURL(new RegExp(`/admin/events/edit\\?id=${id}`));
    await deleteEvent(page, id);
  });

  test('the admin menu has Events and Calendar', async ({ page }) => {
    await page.goto('/admin');
    const nav = page.getByRole('navigation', { name: 'Admin' });
    await expect(nav.getByRole('link', { name: 'Events' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Calendar' })).toBeVisible();
    await nav.getByRole('link', { name: 'Events' }).click();
    await expect(page.getByRole('heading', { name: 'Events', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Oil Painting for Beginners' })).toBeVisible();
  });
});

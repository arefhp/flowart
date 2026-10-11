import { expect, test, type Page } from '@playwright/test';
import { createEvent, stamp } from './helpers';

// The whole booking journey against the real local stack. The Worker runs in its pretend-payment mode
// (see `dev:e2e`), so the "Stripe" page is the local stand-in: no account, no internet.
// Workshops are created with unique titles and dated in 2031, so repeated runs do not disturb each other.

async function publishedWorkshop(
  page: Page,
  title: string,
  opts: { places?: string; price?: string; titleDa?: string; start?: string; end?: string } = {},
) {
  const id = await createEvent(page, title, { places: opts.places ?? '5', price: opts.price ?? '450', titleDa: opts.titleDa, start: opts.start, end: opts.end });
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText('Published.')).toBeVisible();
  const slug = ((await (await page.request.get(`/api/admin/events/${id}`)).json()) as { slug: string }).slug;
  return { id, slug };
}

async function fillAndSubmit(page: Page, opts: { name?: string; email?: string; places?: number; button?: RegExp } = {}) {
  await page.getByLabel('Your name').fill(opts.name ?? 'Anna Jensen');
  await page.getByLabel('Email', { exact: true }).fill(opts.email ?? 'anna@example.com');
  if (opts.places) await page.getByLabel('Number of places').selectOption(String(opts.places));
  await page.getByRole('checkbox', { name: /I have read the/ }).check();
  await page.getByRole('button', { name: opts.button ?? /^Pay / }).click();
}

test.describe('booking a paid workshop', () => {
  test('shows the total and the 24-hour rule BEFORE the pay button, takes the pretend payment and confirms', async ({ page }) => {
    const title = `E2E Paid ${stamp()}`;
    const { slug } = await publishedWorkshop(page, title);

    await page.goto(`/workshops/${slug}`);
    await expect(page.getByText('5 places left')).toBeVisible();
    await page.getByLabel('Number of places').selectOption('2');
    await expect(page.getByTestId('booking-total')).toHaveText('DKK 900');

    const notice = await page.getByTestId('cancel-notice').boundingBox();
    const payButton = await page.getByRole('button', { name: 'Pay DKK 900' }).boundingBox();
    expect(notice!.y).toBeLessThan(payButton!.y); // the rule is read before paying
    await expect(page.getByTestId('cancel-notice')).toContainText('at least 24 hours before the workshop starts');
    await expect(page.getByText('held for 30 minutes')).toBeVisible();

    await fillAndSubmit(page, { places: 2 });
    await expect(page.getByRole('heading', { name: 'Pretend payment' }).or(page.getByText('Local test only'))).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pay DKK 900.00' })).toBeVisible();
    await page.getByRole('button', { name: 'Pay (pretend)' }).click();

    await expect(page.getByRole('heading', { name: 'Your place is booked' })).toBeVisible();
    await expect(page.getByText('a***@example.com')).toBeVisible();
    await expect(page.getByText(title)).toBeVisible();
    await expect(page.getByText('DKK 900')).toBeVisible();

    // the places are taken now
    await page.goto(`/workshops/${slug}`);
    await expect(page.getByText('3 places left')).toBeVisible();
  });

  test('the form explains what is missing and does not reserve anything', async ({ page }) => {
    const { slug } = await publishedWorkshop(page, `E2E Validation ${stamp()}`);
    await page.goto(`/workshops/${slug}`);
    await page.getByRole('button', { name: /^Pay / }).click();
    await expect(page.getByText('Please enter your name.')).toBeVisible();
    await expect(page.getByText('Please enter a valid email address.')).toBeVisible();
    await expect(page.getByText('Please tick the box to continue.')).toBeVisible();
    await expect(page.getByText('5 places left')).toBeVisible();
  });

  test('leaving the payment page frees the places when it expires, and keeps them for a short while when you just go back', async ({ page }) => {
    const { slug } = await publishedWorkshop(page, `E2E Abandon ${stamp()}`);
    await page.goto(`/workshops/${slug}`);
    await fillAndSubmit(page, { places: 2 });
    await page.getByRole('button', { name: 'Go back' }).click();
    await expect(page.getByRole('heading', { name: 'Payment cancelled' })).toBeVisible();
    await expect(page.getByText('You have not been charged')).toBeVisible();

    await page.goto(`/workshops/${slug}`);
    await expect(page.getByText('3 places left')).toBeVisible(); // still held

    await page.getByLabel('Your name').fill('Bo');
    await page.getByLabel('Email', { exact: true }).fill('bo@example.com');
    await page.getByRole('checkbox', { name: /I have read the/ }).check();
    await page.getByRole('button', { name: /^Pay / }).click();
    await page.getByRole('button', { name: 'Let the payment page expire' }).click();
    await expect(page.getByRole('heading', { name: 'Payment cancelled' })).toBeVisible();
    await page.goto(`/workshops/${slug}`);
    await expect(page.getByText('3 places left')).toBeVisible(); // Bo's place is free again, Anna's is still held
  });

  test('the last place goes to one person, then the workshop shows sold out and no form', async ({ page }) => {
    const { slug } = await publishedWorkshop(page, `E2E Last ${stamp()}`, { places: '1' });
    await page.goto(`/workshops/${slug}`);
    await expect(page.getByText('1 place left')).toBeVisible();
    await fillAndSubmit(page);
    await page.getByRole('button', { name: 'Pay (pretend)' }).click();
    await expect(page.getByRole('heading', { name: 'Your place is booked' })).toBeVisible();

    await page.goto(`/workshops/${slug}`);
    await expect(page.getByText('Sold out')).toBeVisible();
    await expect(page.getByLabel('Your name')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Have a question first? Write to me.' })).toBeVisible();
  });

  test('somebody else taking the places while the form is open gives a clear message', async ({ page }) => {
    const { slug } = await publishedWorkshop(page, `E2E Race ${stamp()}`, { places: '2' });
    await page.goto(`/workshops/${slug}`);
    await expect(page.getByText('2 places left')).toBeVisible();
    // someone else books both places first
    const other = await page.request.post(`/api/events/${slug}/bookings`, {
      data: { name: 'Quick', email: 'quick@example.com', participants: 2, locale: 'en', consent: true, turnstileToken: 'x' },
    });
    expect(other.status()).toBe(201);
    await fillAndSubmit(page, { places: 2 });
    await expect(page.getByRole('alert').filter({ hasText: 'sold out' })).toBeVisible(); // stays after the form goes away
    await expect(page.getByText('Sold out')).toBeVisible(); // the page refreshed its numbers
  });
});

test.describe('booking a free workshop', () => {
  test('is confirmed at once with no payment page', async ({ page }) => {
    const title = `E2E Free ${stamp()}`;
    const { id, slug } = await publishedWorkshop(page, title, { price: '0', places: '4' });
    await page.goto(`/workshops/${slug}`);
    await expect(page.getByText('This workshop is free. No payment is needed.')).toBeVisible();
    await expect(page.getByTestId('booking-total')).toHaveCount(0);
    await expect(page.getByTestId('cancel-notice')).toHaveCount(0);
    await fillAndSubmit(page, { places: 3, button: /^Book my place$/ });
    await expect(page.getByRole('heading', { name: 'Your place is booked' })).toBeVisible();
    await expect(page.getByText(title)).toBeVisible();

    await page.goto(`/workshops/${slug}`);
    await expect(page.getByText('1 place left')).toBeVisible();

    // the admin sees it, as free and confirmed
    await page.goto(`/admin/bookings?event=${id}`);
    const row = page.getByTestId('booking-row');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Anna Jensen');
    await expect(row).toContainText('Free');
    await expect(row).toContainText('Confirmed');
  });
});

test.describe('Danish', () => {
  test('the whole journey is in Danish, with the Danish title and the Danish confirmation page', async ({ page }) => {
    const { slug } = await publishedWorkshop(page, `E2E Danish ${stamp()}`, { titleDa: `Dansk workshop ${stamp()}` });
    await page.goto(`/da/workshops/${slug}`);
    await expect(page.getByText('5 pladser tilbage')).toBeVisible();
    await page.getByLabel('Dit navn').fill('Anna Jensen');
    await page.getByLabel('E-mail', { exact: true }).fill('anna@example.com');
    await page.getByLabel('Antal pladser').selectOption('2');
    await expect(page.getByTestId('cancel-notice')).toContainText('senest 24 timer før workshoppen starter');
    await page.getByRole('checkbox', { name: /Jeg har læst/ }).check();
    await page.getByRole('button', { name: /^Betal / }).click();
    await page.getByRole('button', { name: 'Pay (pretend)' }).click(); // the local stand-in page is English

    await expect(page).toHaveURL(/\/da\/booking\/success\?token=/);
    await expect(page.getByRole('heading', { name: 'Din plads er booket' })).toBeVisible();
    await expect(page.getByText('Bookingreference')).toBeVisible();
  });

  test('a link without a real booking says so plainly', async ({ page }) => {
    await page.goto('/booking/success?token=not-a-real-token-at-all-1234567890');
    await expect(page.getByRole('heading', { name: 'We could not find this booking' })).toBeVisible();
    await page.goto('/da/booking/success');
    await expect(page.getByRole('heading', { name: 'Vi kunne ikke finde denne booking' })).toBeVisible();
  });
});

test.describe('the owner: bookings, refunds and cancelling a workshop', () => {
  test('lists a booking, downloads the CSV, and "Cancel and refund" gives the places back', async ({ page }) => {
    const title = `E2E Refund ${stamp()}`;
    const { id, slug } = await publishedWorkshop(page, title);
    await page.goto(`/workshops/${slug}`);
    await fillAndSubmit(page, { name: 'Refund Person', email: 'refund@example.com', places: 2 });
    await page.getByRole('button', { name: 'Pay (pretend)' }).click();
    await expect(page.getByRole('heading', { name: 'Your place is booked' })).toBeVisible();

    await page.goto(`/admin/bookings?event=${id}`);
    const row = page.getByTestId('booking-row');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Refund Person');
    await expect(row).toContainText('refund@example.com');
    await expect(row).toContainText('DKK 900');
    await expect(row).toContainText('Confirmed');
    await expect(row).toContainText('Paid');

    const csv = await page.request.get(`/api/admin/bookings/export.csv?event=${id}`);
    expect(csv.status()).toBe(200);
    expect(csv.headers()['content-type']).toContain('text/csv');
    const text = await csv.text();
    expect(text).toContain('refund@example.com');
    expect(text).toContain('900.00');

    let dialogText = '';
    page.once('dialog', (d) => {
      dialogText = d.message();
      void d.accept();
    });
    await page.getByRole('button', { name: 'Cancel and refund' }).click();
    await expect(page.getByText('Cancelled and refunded. The customer has been emailed.')).toBeVisible();
    expect(dialogText.normalize('NFKC')).toContain('refund DKK 900'); // NFKC turns the no-break space into a plain one
    expect(dialogText).toContain('more than 24 hours before the start'); // 2031: far ahead
    await expect(row).toContainText('Cancelled');
    await expect(row).toContainText('Refunded');
    await expect(page.getByRole('button', { name: 'Cancel and refund' })).toHaveCount(0);

    await page.goto(`/workshops/${slug}`);
    await expect(page.getByText('5 places left')).toBeVisible();
  });

  test('cancelling a workshop with bookings asks first, then refunds everyone and shows it cancelled', async ({ page }) => {
    const { id, slug } = await publishedWorkshop(page, `E2E Cancel ${stamp()}`);
    for (const [name, email] of [['Ann', 'ann@example.com'], ['Bo', 'bo@example.com']]) {
      await page.goto(`/workshops/${slug}`);
      await fillAndSubmit(page, { name, email, places: 1 });
      await page.getByRole('button', { name: 'Pay (pretend)' }).click();
      await expect(page.getByRole('heading', { name: 'Your place is booked' })).toBeVisible();
    }

    await page.goto(`/admin/events/edit?id=${id}`);
    let dialogText = '';
    page.once('dialog', (d) => {
      dialogText = d.message();
      void d.accept();
    });
    await page.getByRole('button', { name: 'Cancel event' }).click();
    await expect(page.getByText(/2 bookings cancelled and refunded/)).toBeVisible();
    expect(dialogText).toContain('2 bookings (2 places) will be cancelled');
    expect(dialogText.normalize('NFKC')).toContain('DKK 900 will be refunded');

    await page.goto(`/admin/bookings?event=${id}`);
    const rows = page.getByTestId('booking-row');
    await expect(rows).toHaveCount(2);
    for (let i = 0; i < 2; i++) await expect(rows.nth(i)).toContainText('Refunded');

    await page.goto(`/workshops/${slug}`);
    await expect(page.getByText('This workshop has been cancelled.')).toBeVisible();
    await expect(page.getByLabel('Your name')).toHaveCount(0);
  });

  test('an event with bookings cannot be deleted or put back to draft', async ({ page }) => {
    const { id, slug } = await publishedWorkshop(page, `E2E Keep ${stamp()}`);
    await page.goto(`/workshops/${slug}`);
    await fillAndSubmit(page);
    await page.getByRole('button', { name: 'Pay (pretend)' }).click();
    await expect(page.getByRole('heading', { name: 'Your place is booked' })).toBeVisible();

    await page.goto(`/admin/events/edit?id=${id}`);
    await expect(page.getByRole('link', { name: 'See the bookings for this event' })).toBeVisible();
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: 'Back to draft' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'has bookings' })).toBeVisible();
  });

  test('the bookings overview and the admin home are reachable', async ({ page }) => {
    await page.goto('/admin');
    await page.getByRole('link', { name: 'Bookings', exact: true }).first().click();
    await expect(page).toHaveURL(/\/admin\/bookings$/);
    await expect(page.getByRole('heading', { name: 'Bookings', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: /Download as spreadsheet/ })).toBeVisible();
  });
});

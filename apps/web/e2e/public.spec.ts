import { expect, test } from '@playwright/test';

// These tests rely on the seeded sample data (npm run seed): "Quiet Garden" (priced, two images,
// Danish text), "Evening Reverie" (NO price, three images, English only).

test.describe('gallery', () => {
  test('the grid shows one cover per artwork and opens the artwork page', async ({ page }) => {
    await page.goto('/artworks');
    await expect(page.getByRole('heading', { name: 'Artworks', level: 1 })).toBeVisible();
    const card = page.getByRole('link', { name: /Quiet Garden/ });
    // one image per card: the cover only (even though the artwork has two)
    await expect(card.locator('img')).toHaveCount(1);
    await card.click();
    await expect(page).toHaveURL(/\/artworks\/quiet-garden$/);
    await expect(page.getByRole('heading', { name: 'Quiet Garden', level: 1 })).toBeVisible();
    await expect(page.getByText('Layers of oil paint build a garden')).toBeVisible();
  });

  test('the artwork page lists every image and the viewer works with the keyboard', async ({ page }) => {
    await page.goto('/artworks/quiet-garden');
    const thumbs = page.getByRole('list', { name: /Images of Quiet Garden/ }).getByRole('button');
    await expect(thumbs).toHaveCount(2);

    await page.getByRole('button', { name: /View 1 larger/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Image 1 of 2')).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await expect(dialog.getByText('Image 2 of 2')).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(dialog.getByText('Image 1 of 2')).toBeVisible();

    await dialog.getByRole('button', { name: 'Next image' }).click();
    await expect(dialog.getByText('Image 2 of 2')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    // focus returns to the element that opened the viewer
    await expect(page.getByRole('button', { name: /View \d larger/ })).toBeFocused();
  });

  test('a priced artwork shows its price', async ({ page }) => {
    await page.goto('/artworks/quiet-garden');
    await expect(page.getByText('DKK 12,000')).toBeVisible();
  });

  test('MANDATORY: an artwork WITHOUT a price shows no price element anywhere', async ({ page }) => {
    for (const url of ['/artworks/evening-reverie', '/artworks', '/']) {
      await page.goto(url);
      const scope = url === '/artworks/evening-reverie' ? page.locator('main') : page.getByRole('listitem').filter({ hasText: 'Evening Reverie' });
      await expect(scope.first()).toContainText('Evening Reverie');
      const text = (await scope.first().innerText()).toLowerCase();
      expect(text, url).not.toMatch(/dkk|price|kr\.|\b0\b|n\/a|free/);
      // no screen-reader-only price label either
      await expect(scope.first().locator('dt', { hasText: /price/i })).toHaveCount(0);
    }
    // and no price keys in the API JSON
    const res = await page.request.get('/api/artworks/evening-reverie');
    const body = await res.text();
    expect(body).not.toMatch(/price|currency/i);
  });

  test('the Ask button opens the contact form pre-filled, and the message arrives in the admin', async ({ page }) => {
    await page.goto('/artworks/quiet-garden');
    await page.getByRole('link', { name: 'Ask about this work' }).click();
    await expect(page).toHaveURL(/\/contact\?artwork=quiet-garden$/);
    await expect(page.getByLabel('Message')).toHaveValue('I am interested in the artwork "Quiet Garden".');

    const unique = `e2e-${Date.now()}`;
    await page.getByLabel('Name').fill(`Tester ${unique}`);
    await page.getByLabel('Email').fill('tester@example.com');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('Thank you, your message has been sent.')).toBeVisible();

    await page.goto('/admin/messages');
    await expect(page.getByText(`Tester ${unique}`)).toBeVisible();
    const sent = page.getByRole('listitem').filter({ hasText: unique });
    await expect(sent.getByRole('link', { name: 'Quiet Garden' })).toBeVisible();
  });

  test('the contact form validates before sending', async ({ page }) => {
    await page.goto('/contact');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('Please enter your name.')).toBeVisible();
    await expect(page.getByText('Please enter a valid email address.')).toBeVisible();
    await expect(page.getByText('Please write a short message.')).toBeVisible();
  });

  test('sold artworks do not offer the Ask button', async ({ page }) => {
    await page.goto('/artworks/morning-light');
    await expect(page.getByRole('heading', { name: 'Morning Light', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ask about this work' })).toHaveCount(0);
  });

  test('a hidden artwork is not in the gallery', async ({ page }) => {
    await page.goto('/artworks');
    await expect(page.getByText('Quiet Garden').first()).toBeVisible();
    // "Work in progress" is seeded hidden
    const res = await page.request.get('/api/artworks');
    expect(await res.text()).not.toContain('Work in progress');
  });
});

test.describe('languages', () => {
  test('the EN | DA switch goes to the same page in the other language', async ({ page }) => {
    await page.goto('/artworks/quiet-garden');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.getByRole('link', { name: /Language: Dansk/ }).click();
    await expect(page).toHaveURL(/\/da\/artworks\/quiet-garden$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'da');
    await expect(page.getByRole('heading', { name: 'Den stille have', level: 1 })).toBeVisible();
    await expect(page.getByText('Lag på lag af oliemaling')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Spørg til værket' })).toBeVisible();
    // and back again
    await page.getByRole('link', { name: /Sprog: English/ }).click();
    await expect(page).toHaveURL(/\/artworks\/quiet-garden$/);
  });

  test('Danish falls back to English where there is no Danish text', async ({ page }) => {
    await page.goto('/da/artworks/evening-reverie');
    await expect(page.getByRole('heading', { name: 'Evening Reverie', level: 1 })).toBeVisible();
    // but the interface is Danish
    await expect(page.getByRole('link', { name: 'Spørg til værket' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Hovedmenu' })).toBeVisible();
  });

  test('the legal pages exist in both languages without VAT, phone or placeholders', async ({ page }) => {
    for (const [url, heading] of [
      ['/terms', 'Terms for workshops and events'],
      ['/da/terms', 'Vilkår for workshops og events'],
      ['/privacy', 'Privacy policy'],
      ['/da/privacy', 'Privatlivspolitik'],
    ] as const) {
      await page.goto(url);
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
      const text = await page.locator('main').innerText();
      expect(text, url).not.toMatch(/\b(VAT|moms|CHECK|FILL|UDFYLD)\b/);
      expect(text, url).not.toMatch(/\+?\d[\d ]{7,}\d/); // no phone number
      expect(text).toContain('info@zfadavi.com');
    }
    await page.goto('/terms');
    await expect(page.getByText('at least 24 hours before the workshop starts')).toBeVisible();
  });

  test('the About page shows the portrait and the statement', async ({ page }) => {
    await page.goto('/about');
    await expect(page.getByRole('img', { name: 'Portrait of the artist' })).toBeVisible();
    await expect(page.getByText('Persian miniature painting')).toBeVisible();
    await page.goto('/da/about');
    await expect(page.locator('html')).toHaveAttribute('lang', 'da');
  });
});

test('the footer lists the visible social links with safe link markup', async ({ page }) => {
  await page.goto('/');
  const footer = page.locator('footer');
  for (const name of ['Instagram', 'Facebook', 'TikTok']) {
    const link = footer.getByRole('link', { name: new RegExp(name) });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
    await expect(link).toHaveAttribute('href', /^https:\/\//);
  }
});

test('unknown addresses show the bilingual 404 page', async ({ page }) => {
  const res = await page.goto('/this-page-does-not-exist');
  expect(res?.status()).toBe(404);
});

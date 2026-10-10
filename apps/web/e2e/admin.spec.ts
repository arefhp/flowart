import { expect, test } from '@playwright/test';
import { addImages, createArtwork, deleteArtwork, photo, stamp } from './helpers';

// Admin flows in the real browser against the local stack (the admin login is bypassed locally).
// Every test cleans up what it creates.

test('the admin shows the local development banner and its navigation', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByText('Local development mode')).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Admin' });
  for (const name of ['Overview', 'Artworks', 'Categories', 'About', 'Social links', 'Messages', 'Help']) {
    await expect(nav.getByRole('link', { name })).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();
});

test('create an artwork WITHOUT a price, add an image in the browser, then price it and clear the price', async ({ page }) => {
  const title = `E2E Work ${stamp()}`;
  const id = await createArtwork(page, title, { titleDa: `E2E Værk ${stamp()}` });
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  // an artwork without images is not public yet, and the admin says so
  await expect(page.getByText('This artwork has no images yet, so it is not shown publicly.')).toBeVisible();
  expect((await page.request.get(`/api/artworks/${slug}`)).status()).toBe(404);

  await addImages(page, 1);
  await expect(page.getByText('Cover', { exact: true })).toBeVisible();

  // the browser really produced WebP variants and the Worker stored them
  const detail = (await (await page.request.get(`/api/artworks/${slug}`)).json()) as { images: Array<{ url: string; alt: string; width: number }> };
  expect(detail.images).toHaveLength(1);
  expect(detail.images[0]!.alt).toBe('Photo number 1');
  for (const w of [480, 960, 1920]) {
    const res = await page.request.get(`${detail.images[0]!.url}-${w}.webp`);
    expect(res.status(), `variant ${w}`).toBe(200);
    expect(res.headers()['content-type']).toBe('image/webp');
  }
  expect(detail.images[0]!.width).toBe(1200); // never enlarged past the original

  // public page: no price anywhere
  await page.goto(`/artworks/${slug}`);
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  expect((await page.locator('main').innerText()).toLowerCase()).not.toMatch(/dkk|price/);
  expect(await (await page.request.get(`/api/artworks/${slug}`)).text()).not.toMatch(/price|currency/i);

  // set a price: it appears
  await page.goto(`/admin/artworks/edit?id=${id}`);
  await page.getByLabel('Price (optional)').fill('2500');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Saved. The public site updates in a few minutes.')).toBeVisible();
  await page.goto(`/artworks/${slug}`);
  await expect(page.getByText('DKK 2,500')).toBeVisible();

  // clear it again: saved as NO price (not 0), so nothing is shown
  await page.goto(`/admin/artworks/edit?id=${id}`);
  await page.getByLabel('Price (optional)').fill('');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Saved. The public site updates in a few minutes.')).toBeVisible();
  expect(await (await page.request.get(`/api/artworks/${slug}`)).text()).not.toMatch(/price|currency/i);
  await page.goto(`/artworks/${slug}`);
  expect((await page.locator('main').innerText()).toLowerCase()).not.toMatch(/dkk|\b0\b|price/);

  await deleteArtwork(page, id);
  expect((await page.request.get(`/api/artworks/${slug}`)).status()).toBe(404);
});

test('the admin form checks numbers and keeps Danish optional', async ({ page }) => {
  await page.goto('/admin/artworks/new');
  await page.getByRole('button', { name: 'Create artwork' }).click();
  await expect(page.getByText('The English title is required.')).toBeVisible();
  await page.getByLabel('Title (English)').fill('Invalid numbers');
  await page.getByLabel('Size', { exact: true }).selectOption('small');
  await page.getByLabel('Width (cm)').fill('-3');
  await page.getByLabel('Price (optional)').fill('abc');
  await page.getByRole('button', { name: 'Create artwork' }).click();
  await expect(page.getByText('Enter a number larger than 0, or leave it empty.')).toBeVisible();
  await expect(page.getByText('Enter an amount such as 12000, or leave it empty for no price.')).toBeVisible();
});

test('cover, order and deleting images; the gallery shows only the chosen cover', async ({ page }) => {
  const title = `E2E Cover ${stamp()}`;
  const id = await createArtwork(page, title);
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  await addImages(page, 3);

  const rows = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Save text' }) });
  await expect(rows).toHaveCount(3);

  // choose the third image as the cover
  await rows.nth(2).getByRole('button', { name: 'Set as cover' }).click();
  await expect(page.getByText('Cover changed.')).toBeVisible();
  let list = (await (await page.request.get('/api/artworks')).json()) as { artworks: Array<{ slug: string; cover: { alt: string } }> };
  expect(list.artworks.find((a) => a.slug === slug)!.cover.alt).toBe('Photo number 3');

  // move the first image down: the order changes, the cover stays
  await rows.nth(0).getByRole('button', { name: /Move image 1 down/ }).click();
  await expect.poll(async () => {
    const d = (await (await page.request.get(`/api/artworks/${slug}`)).json()) as { images: Array<{ alt: string }> };
    return d.images.map((i) => i.alt).join('|');
  }).toBe('Photo number 3|Photo number 2|Photo number 1'); // cover first, then the stored order

  // the gallery card has exactly one image; the artwork page has thumbnails for all three
  await page.goto('/artworks');
  await expect(page.getByRole('link', { name: new RegExp(title) }).locator('img')).toHaveCount(1);
  await page.goto(`/artworks/${slug}`);
  await expect(page.getByRole('list', { name: new RegExp(`Images of ${title}`) }).getByRole('button')).toHaveCount(3);

  // edit alt text in both languages
  await page.goto(`/admin/artworks/edit?id=${id}`);
  const first = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Save text' }) }).first();
  await first.getByLabel('Alt text (Danish, optional)').fill('Dansk alt');
  await first.getByRole('button', { name: 'Save text' }).click();
  await expect(page.getByText('Alt text saved.')).toBeVisible();

  // delete the cover image: the cover falls back to the first remaining image
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Save text' }) }).first().getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Image deleted.')).toBeVisible();
  list = (await (await page.request.get('/api/artworks')).json()) as typeof list;
  expect(list.artworks.find((a) => a.slug === slug)!.cover).toBeTruthy();

  await deleteArtwork(page, id);
});

test('a non-image file is rejected with a friendly message and nothing is stored', async ({ page }) => {
  const title = `E2E Bad file ${stamp()}`;
  const id = await createArtwork(page, title);
  await page.locator('input[type=file]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') });
  await page.getByPlaceholder('Describe the painting in one sentence').fill('x');
  await page.getByRole('button', { name: /^Add 1 image/ }).click();
  await expect(page.getByText(/please choose a JPEG, PNG or WebP photo/i)).toBeVisible();
  await deleteArtwork(page, id);
});

test('social links: preview the cleaned link, reject a bad one, hide one and see it leave the footer', async ({ page }) => {
  await page.goto('/admin/social');
  const instagram = page.getByRole('listitem').filter({ has: page.getByRole('combobox') }).first();
  const urlField = instagram.getByLabel('Link');

  await urlField.fill('https://www.instagram.com/zakereh.fadavi.art?vrfl=bTgzcXhjdjdya25x&utm_source=qr');
  await expect(instagram.getByText('Will be saved as:')).toContainText('https://www.instagram.com/zakereh.fadavi.art/');

  await urlField.fill('http://instagram.com/x');
  await expect(instagram.getByRole('alert')).toContainText('must start with https://');
  await urlField.fill('https://example.com/not-instagram');
  await expect(instagram.getByRole('alert')).toContainText('does not look like an Instagram link');
  await urlField.fill('https://www.instagram.com/zakereh.fadavi.art/');

  // hide Facebook, save, check the public footer, then restore
  const facebook = page.getByRole('listitem').filter({ hasText: 'Platform' }).nth(1);
  await facebook.getByLabel('Visible').uncheck();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved. The public site updates in a few minutes.')).toBeVisible();

  await page.goto('/');
  await expect(page.locator('footer').getByRole('link', { name: /Instagram/ })).toBeVisible();
  await expect(page.locator('footer').getByRole('link', { name: /Facebook/ })).toHaveCount(0);

  await page.goto('/admin/social');
  await page.getByRole('listitem').filter({ hasText: 'Platform' }).nth(1).getByLabel('Visible').check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved. The public site updates in a few minutes.')).toBeVisible();
  await page.goto('/');
  await expect(page.locator('footer').getByRole('link', { name: /Facebook/ })).toBeVisible();
});

test('About: Danish text shows on the Danish page and falls back to English when removed', async ({ page }) => {
  await page.goto('/admin/about');
  const danish = page.getByLabel('Text (Danish, optional)', { exact: true });
  const originalDanish = await danish.inputValue(); // the seeded Danish statement; restored at the end
  expect(originalDanish).toContain('persisk miniaturemaleri');
  await danish.fill('Dette er den danske tekst fra e2e-testen.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved. The public site updates in a few minutes.')).toBeVisible();

  await page.goto('/da/about');
  await expect(page.getByText('Dette er den danske tekst fra e2e-testen.')).toBeVisible();

  await page.goto('/admin/about');
  await page.getByLabel('Text (Danish, optional)', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved. The public site updates in a few minutes.')).toBeVisible();
  await page.goto('/da/about');
  await expect(page.getByText('Persian miniature painting')).toBeVisible(); // English fallback

  // put the Danish statement back
  await page.goto('/admin/about');
  await page.getByLabel('Text (Danish, optional)', { exact: true }).fill(originalDanish);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved. The public site updates in a few minutes.')).toBeVisible();
  await page.goto('/da/about');
  await expect(page.getByText('persisk miniaturemaleri')).toBeVisible();
});

test('the portrait needs alt text and the preview shows the page crop', async ({ page }) => {
  await page.goto('/admin/about');
  await expect(page.getByRole('img', { name: 'Portrait of the artist' }).first()).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: await photo(1000, 1250) });
  await expect(page.getByText('New portrait (not saved yet)')).toBeVisible();
  await page.getByRole('button', { name: 'Save portrait' }).click();
  await expect(page.getByText('Please describe the portrait in the alt text field.')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
});

test('Rebuild site says it is skipped locally; Help renders the admin guide', async ({ page }) => {
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Rebuild site' }).click();
  await expect(page.getByText('Rebuild skipped (local)', { exact: true })).toBeVisible();

  await page.goto('/admin/help');
  await expect(page.getByRole('heading', { name: /Admin guide/, level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Signing in/ })).toBeVisible();
});

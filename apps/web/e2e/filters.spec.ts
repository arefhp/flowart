import { expect, test, type Page } from '@playwright/test';

// Relies on the seeded sample data (npm run seed). Shown publicly (4):
//   Quiet Garden    Fine Art  medium  available  DKK 12,000
//   Evening Reverie Fine Art  medium  available  (no price)
//   Morning Light   Fine Art  small   sold       DKK 8,500
//   Resin Tide      Resin     small   available  DKK 4,500
// ("Work in progress" is hidden and never appears.)

const cards = (page: Page) => page.locator('main ul > li');
const titles = async (page: Page) => (await cards(page).locator('.title').allInnerTexts()).sort();
const group = (page: Page, name: string) => page.getByRole('group', { name });

test.describe('artwork filters', () => {
  test('the page shows every artwork until a filter is chosen', async ({ page }) => {
    await page.goto('/artworks');
    await expect(cards(page)).toHaveCount(4);
    for (const name of ['Category', 'Size', 'Price', 'Availability']) await expect(group(page, name)).toBeVisible();
    await expect(page.getByText(/Showing \d+ of/)).toHaveCount(0); // quiet until a filter is used
  });

  test('category: Resin shows only the resin work, the address changes, and Clear brings everything back', async ({ page }) => {
    await page.goto('/artworks');
    await group(page, 'Category').getByRole('button', { name: 'Resin' }).click();
    await expect(cards(page)).toHaveCount(1);
    await expect.poll(() => titles(page)).toEqual(['Resin Tide']);
    await expect(page).toHaveURL(/\?category=resin$/);
    await expect(page.getByText('Showing 1 of 4')).toBeVisible();
    await expect(group(page, 'Category').getByRole('button', { name: 'Resin' })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(cards(page)).toHaveCount(4);
    await expect(page).toHaveURL(/\/artworks$/);
  });

  test('choosing the active choice again, or All, removes that filter', async ({ page }) => {
    await page.goto('/artworks');
    const fine = group(page, 'Category').getByRole('button', { name: 'Fine Art' });
    await fine.click();
    await expect(cards(page)).toHaveCount(3);
    await fine.click();
    await expect(cards(page)).toHaveCount(4);
    await fine.click();
    await group(page, 'Category').getByRole('button', { name: 'All' }).click();
    await expect(cards(page)).toHaveCount(4);
  });

  test('size: Small shows the two small works', async ({ page }) => {
    await page.goto('/artworks');
    await group(page, 'Size').getByRole('button', { name: 'Small' }).click();
    await expect.poll(() => titles(page)).toEqual(['Morning Light', 'Resin Tide']);
    // a size nobody has is not offered at all, so there is never an empty choice
    await expect(group(page, 'Size').getByRole('button')).toHaveText(['All', 'Small', 'Medium']);
  });

  test('price: only the ranges that contain an artwork are offered, and works without a price never match one', async ({ page }) => {
    await page.goto('/artworks');
    const price = group(page, 'Price');
    await expect(price.getByRole('button')).toHaveText(['All', 'Under DKK 5,000', 'DKK 5,000 to DKK 15,000']); // no "Over", nothing costs that much

    await price.getByRole('button', { name: 'Under DKK 5,000' }).click();
    await expect.poll(() => titles(page)).toEqual(['Resin Tide']);

    await price.getByRole('button', { name: 'DKK 5,000 to DKK 15,000' }).click();
    await expect.poll(() => titles(page)).toEqual(['Morning Light', 'Quiet Garden']);
    // "Evening Reverie" has no price: it is in no price range, and its card shows no price at all
    await page.getByRole('button', { name: 'Clear filters' }).click();
    const reverie = cards(page).filter({ hasText: 'Evening Reverie' });
    expect((await reverie.innerText()).toLowerCase()).not.toMatch(/dkk|price|\b0\b/);
  });

  test('filters combine: category + price', async ({ page }) => {
    await page.goto('/artworks');
    await group(page, 'Category').getByRole('button', { name: 'Fine Art' }).click();
    await group(page, 'Price').getByRole('button', { name: 'DKK 5,000 to DKK 15,000' }).click();
    await expect.poll(() => titles(page)).toEqual(['Morning Light', 'Quiet Garden']);
    await expect(page).toHaveURL(/category=fine-art/);
    await expect(page).toHaveURL(/price=mid/);
    await expect(page.getByText('Showing 2 of 4')).toBeVisible();
  });

  test('availability: "Available only" hides the sold work', async ({ page }) => {
    await page.goto('/artworks');
    await group(page, 'Availability').getByRole('button', { name: 'Available only' }).click();
    await expect.poll(() => titles(page)).toEqual(['Evening Reverie', 'Quiet Garden', 'Resin Tide']);
  });

  test('no match: a friendly message and a way back', async ({ page }) => {
    await page.goto('/artworks');
    await group(page, 'Category').getByRole('button', { name: 'Resin' }).click();
    await group(page, 'Size').getByRole('button', { name: 'Medium' }).click(); // the only resin work is small
    await expect(page.getByText('No artworks match these filters.')).toBeVisible();
    await expect(cards(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Clear filters' }).first().click();
    await expect(cards(page)).toHaveCount(4);
  });

  test('a filtered address can be shared: opening it applies the filters', async ({ page }) => {
    await page.goto('/artworks?category=fine-art&size=small');
    await expect(cards(page)).toHaveCount(1);
    await expect.poll(() => titles(page)).toEqual(['Morning Light']);
    await expect(group(page, 'Category').getByRole('button', { name: 'Fine Art' })).toHaveAttribute('aria-pressed', 'true');
    await expect(group(page, 'Size').getByRole('button', { name: 'Small' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('nonsense in the address is ignored', async ({ page }) => {
    await page.goto('/artworks?category=nope&size=huge&price=free&available=1');
    // only "available=1" is a real choice; the rest are ignored. (The page first shows every artwork,
    // then applies the address once it has loaded, so wait for that.)
    await expect.poll(() => titles(page)).toEqual(['Evening Reverie', 'Quiet Garden', 'Resin Tide']);
  });

  test('the filter buttons are keyboard friendly with at least a 44px touch target', async ({ page }) => {
    await page.goto('/artworks');
    const resin = group(page, 'Category').getByRole('button', { name: 'Resin' });
    const box = await resin.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await resin.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => titles(page)).toEqual(['Resin Tide']);
  });

  test('an artwork page links to its category, which opens the filtered gallery', async ({ page }) => {
    await page.goto('/artworks/resin-tide');
    await page.getByRole('link', { name: /Resin/ }).first().click();
    await expect(page).toHaveURL(/\/artworks\?category=resin$/);
    await expect.poll(() => titles(page)).toEqual(['Resin Tide']);
  });

  test('the filters speak Danish on the Danish page, with names falling back to English', async ({ page }) => {
    await page.goto('/da/artworks');
    for (const name of ['Kategori', 'Størrelse', 'Pris', 'Tilgængelighed']) await expect(group(page, name)).toBeVisible();
    await expect(group(page, 'Størrelse').getByRole('button', { name: 'Lille' })).toBeVisible();
    await expect(group(page, 'Størrelse').getByRole('button', { name: 'Mellemstor' })).toBeVisible();
    await expect(group(page, 'Tilgængelighed').getByRole('button', { name: 'Kun tilgængelige' })).toBeVisible();
    await expect(group(page, 'Kategori').getByRole('button', { name: 'Resin' })).toBeVisible(); // no Danish name: English one
    await group(page, 'Pris').getByRole('button', { name: /Under/ }).click();
    await expect(page.getByText('Viser 1 af 4')).toBeVisible();
    await page.getByRole('button', { name: 'Ryd filtre' }).click();
    await expect(cards(page)).toHaveCount(4);
  });

  test('the filtered gallery still has every artwork in the page for people without scripts', async ({ page }) => {
    const html = await (await page.request.get('/artworks')).text();
    for (const title of ['Quiet Garden', 'Evening Reverie', 'Morning Light', 'Resin Tide']) expect(html).toContain(title);
  });
});

test.describe('wording and About', () => {
  test('the tagline reads "Fine Art and workshops in Copenhagen" in both languages', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Zakereh Art' })).toBeVisible();
    await expect(page.getByText('Fine Art and workshops in Copenhagen').first()).toBeVisible();
    await expect(page).toHaveTitle('Zakereh Art, Fine Art in Copenhagen');
    await page.goto('/da');
    await expect(page.getByText('Fine Art og workshops i København').first()).toBeVisible();
    await expect(page).toHaveTitle('Zakereh Art, Fine Art i København');
  });

  test('the About text is in Danish when the language is changed', async ({ page }) => {
    await page.goto('/about');
    await expect(page.getByText('Persian miniature painting')).toBeVisible();
    await page.getByRole('link', { name: /Language: Dansk/ }).click();
    await expect(page).toHaveURL(/\/da\/about$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Om mig' })).toBeVisible();
    await expect(page.getByText('persisk miniaturemaleri')).toBeVisible();
    await expect(page.getByText('Persian miniature painting')).toHaveCount(0);
    expect((await page.locator('main .prose-artist p').count())).toBe(4);
  });
});

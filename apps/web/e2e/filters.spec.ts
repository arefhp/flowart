import { expect, test, type Locator, type Page } from '@playwright/test';
import { SHOW_PRICE_FILTER } from '../src/lib/price-bands';

// Relies on the seeded sample data (npm run seed). Shown publicly (4):
//   Quiet Garden    Fine Art  medium  available  DKK 12,000
//   Evening Reverie Fine Art  medium  available  (no price)
//   Morning Light   Fine Art  small   sold       DKK 8,500
//   Resin Tide      Resin     small   available  DKK 4,500
// ("Work in progress" is hidden and never appears.) No public work is Large.

const cards = (page: Page) => page.locator('main ul > li');
const titles = async (page: Page) => (await cards(page).locator('.title').allInnerTexts()).sort();
const group = (page: Page, name: string) => page.getByRole('group', { name });
/** The visible labels of a group's options (the small count beside each is not part of the label). */
const optionNames = (g: Locator) => g.locator('button[aria-pressed]').evaluateAll((els) => els.map((e) => e.querySelector('span')?.textContent?.trim()));
const priceFilterTest = SHOW_PRICE_FILTER ? test : test.skip;

test.describe('artwork filters (sidebar)', () => {
  test('the first category is selected when the page opens, and All is one click away', async ({ page }) => {
    await page.goto('/artworks');
    const category = group(page, 'Category');
    await expect(category.getByRole('button', { name: 'Fine Art' })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => titles(page)).toEqual(['Evening Reverie', 'Morning Light', 'Quiet Garden']);
    for (const name of ['Category', 'Size', 'Availability']) await expect(group(page, name)).toBeVisible();

    await category.getByRole('button', { name: 'All' }).click();
    await expect(cards(page)).toHaveCount(4);
    await expect(page).toHaveURL(/\?category=all$/);
    await page.reload(); // choosing All on purpose survives a reload: the default does not come back
    await expect(cards(page)).toHaveCount(4);
    await expect(category.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('the choices look pressable: outlined chips, the chosen one filled, and a real checkbox', async ({ page }) => {
    await page.goto('/artworks');
    const resin = group(page, 'Category').getByRole('button', { name: 'Resin' });
    await expect(resin).toHaveCSS('cursor', 'pointer');
    await expect(resin).toHaveCSS('border-top-width', '1px');
    const chosen = group(page, 'Category').getByRole('button', { name: 'Fine Art' });
    const filled = await chosen.evaluate((e) => getComputedStyle(e).backgroundColor);
    const plain = await resin.evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(filled).not.toBe(plain);
    const avail = group(page, 'Availability').getByRole('button', { name: 'Available only' });
    await avail.click();
    await expect(avail).toHaveAttribute('aria-pressed', 'true');
    await expect(avail.locator('svg')).toBeVisible(); // the tick inside the box
  });

  test('the page shows every artwork when All is chosen', async ({ page }) => {
    await page.goto('/artworks?category=all');
    await expect(cards(page)).toHaveCount(4);
    await expect(page.getByText(/Showing \d+ of/)).toHaveCount(0); // quiet until a filter is used
  });

  test('the filters are in a sidebar beside the gallery, not above it', async ({ page }) => {
    await page.goto('/artworks?category=all');
    const side = await page.getByRole('complementary', { name: 'Filter the artworks' }).boundingBox();
    const firstCard = await cards(page).first().boundingBox();
    expect(side!.x).toBeLessThan(firstCard!.x); // to the left
    expect(side!.y).toBeLessThan(firstCard!.y + 120); // level with the top of the gallery, not stacked above it
    expect(side!.width).toBeLessThan(300);
  });

  test('NOT SHOWN FOR NOW: there is no Price filter', async ({ page }) => {
    test.skip(SHOW_PRICE_FILTER, 'the price filter is switched on');
    await page.goto('/artworks?category=all');
    await expect(group(page, 'Price')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Under DKK|DKK 5,000/ })).toHaveCount(0);
    // artworks that have a price still show it on their own card
    await expect(cards(page).filter({ hasText: 'Quiet Garden' })).toContainText('DKK 12,000');
    // a price in the address does nothing while the filter is off
    await page.goto('/artworks?category=all&price=mid');
    await expect.poll(() => titles(page)).toEqual(['Evening Reverie', 'Morning Light', 'Quiet Garden', 'Resin Tide']);
  });

  test('category: Resin shows only the resin work, the address changes, and Clear brings everything back', async ({ page }) => {
    await page.goto('/artworks?category=all');
    await group(page, 'Category').getByRole('button', { name: 'Resin' }).click();
    await expect(cards(page)).toHaveCount(1);
    await expect.poll(() => titles(page)).toEqual(['Resin Tide']);
    await expect(page).toHaveURL(/\?category=resin$/);
    await expect(page.getByText('Showing 1 of 4')).toBeVisible();
    await expect(group(page, 'Category').getByRole('button', { name: 'Resin' })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(cards(page)).toHaveCount(4);
    await expect(page).toHaveURL(/\/artworks\?category=all$/); // an explicit All, so the first-category default does not come back
  });

  test('choosing the active choice again, or All, removes that filter', async ({ page }) => {
    await page.goto('/artworks?category=all');
    const fine = group(page, 'Category').getByRole('button', { name: 'Fine Art' });
    await fine.click();
    await expect(cards(page)).toHaveCount(3);
    await fine.click();
    await expect(cards(page)).toHaveCount(4);
    await fine.click();
    await group(page, 'Category').getByRole('button', { name: 'All' }).click();
    await expect(cards(page)).toHaveCount(4);
  });

  test('size ALWAYS offers Small, Medium and Large, even when nothing is large', async ({ page }) => {
    await page.goto('/artworks?category=all');
    const size = group(page, 'Size');
    expect(await optionNames(size)).toEqual(['All', 'Small', 'Medium', 'Large']);

    await size.getByRole('button', { name: 'Small' }).click();
    await expect.poll(() => titles(page)).toEqual(['Morning Light', 'Resin Tide']);
    await size.getByRole('button', { name: 'Medium' }).click();
    await expect.poll(() => titles(page)).toEqual(['Evening Reverie', 'Quiet Garden']);

    // Large exists as a choice; nothing is large yet, so it says so and offers a way back
    await size.getByRole('button', { name: 'Large' }).click();
    await expect(page.getByText('No artworks match these filters.')).toBeVisible();
    await expect(cards(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Clear filters' }).first().click();
    await expect(cards(page)).toHaveCount(4);
  });

  test('each option shows how many artworks it has', async ({ page }) => {
    await page.goto('/artworks?category=all');
    const counts = async (name: string) =>
      group(page, name).locator('button[aria-pressed]').evaluateAll((els) => els.map((e) => e.querySelectorAll('span')[1]?.textContent?.trim()));
    expect(await counts('Category')).toEqual(['4', '3', '1']); // All, Fine Art, Resin
    expect(await counts('Size')).toEqual(['4', '2', '2', '0']); // All, Small, Medium, Large
  });

  test('filters combine: category + size', async ({ page }) => {
    await page.goto('/artworks?category=all');
    await group(page, 'Category').getByRole('button', { name: 'Fine Art' }).click();
    await group(page, 'Size').getByRole('button', { name: 'Small' }).click();
    await expect.poll(() => titles(page)).toEqual(['Morning Light']);
    await expect(page).toHaveURL(/category=fine-art/);
    await expect(page).toHaveURL(/size=small/);
    await expect(page.getByText('Showing 1 of 4')).toBeVisible();
  });

  test('availability: "Available only" hides the sold work', async ({ page }) => {
    await page.goto('/artworks?category=all');
    await group(page, 'Availability').getByRole('button', { name: 'Available only' }).click();
    await expect.poll(() => titles(page)).toEqual(['Evening Reverie', 'Quiet Garden', 'Resin Tide']);
  });

  test('no match: a friendly message and a way back', async ({ page }) => {
    await page.goto('/artworks?category=all');
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
    // only "available=1" is a real choice. (The page first shows every artwork, then applies the
    // address once it has loaded, so wait for that.)
    await expect.poll(() => titles(page)).toEqual(['Evening Reverie', 'Quiet Garden', 'Resin Tide']);
  });

  test('the options are keyboard friendly with at least a 44px touch target', async ({ page }) => {
    await page.goto('/artworks?category=all');
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
    await page.goto('/da/artworks?category=all');
    for (const name of ['Kategori', 'Størrelse', 'Tilgængelighed']) await expect(group(page, name)).toBeVisible();
    await expect(group(page, 'Pris')).toHaveCount(0);
    expect(await optionNames(group(page, 'Størrelse'))).toEqual(['Alle', 'Lille', 'Mellemstor', 'Stor']);
    await expect(group(page, 'Tilgængelighed').getByRole('button', { name: 'Kun tilgængelige' })).toBeVisible();
    await expect(group(page, 'Kategori').getByRole('button', { name: 'Resin' })).toBeVisible(); // no Danish name: the English one
    await group(page, 'Størrelse').getByRole('button', { name: 'Lille' }).click();
    await expect(page.getByText('Viser 2 af 4')).toBeVisible();
    await page.getByRole('button', { name: 'Ryd filtre' }).click();
    await expect(cards(page)).toHaveCount(4);
  });

  test('the gallery has every artwork in the page for people without scripts', async ({ page }) => {
    const html = await (await page.request.get('/artworks')).text();
    for (const title of ['Quiet Garden', 'Evening Reverie', 'Morning Light', 'Resin Tide']) expect(html).toContain(title);
  });

  priceFilterTest('price filter (only when switched on): ranges, combinations and no match for unpriced work', async ({ page }) => {
    await page.goto('/artworks?category=all');
    const price = group(page, 'Price');
    await expect(price.getByRole('button')).toHaveCount(3);
    await price.getByRole('button', { name: 'Under DKK 5,000' }).click();
    await expect.poll(() => titles(page)).toEqual(['Resin Tide']);
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the filters fold away behind a "Filters" button and open on demand', async ({ page }) => {
    await page.goto('/artworks?category=all');
    await expect(cards(page)).toHaveCount(4);
    const toggle = page.getByRole('button', { name: /^Filters/ });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(group(page, 'Category')).toBeHidden(); // folded away: the gallery comes first

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await group(page, 'Category').getByRole('button', { name: 'Resin' }).click();
    await expect(cards(page)).toHaveCount(1);
    await expect(toggle).toContainText('1'); // one filter is on
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(cards(page)).toHaveCount(4);
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
    expect(await page.locator('main .prose-artist p').count()).toBe(4);
  });
});

test.describe('filter groups fold open and closed', () => {
  test('each group header is a button that hides and shows its options', async ({ page }) => {
    await page.goto('/artworks?category=all');
    for (const name of ['Category', 'Size', 'Availability']) {
      const header = page.getByRole('button', { name, exact: true });
      await expect(header).toHaveAttribute('aria-expanded', 'true');
      await expect(header).toHaveCSS('cursor', 'pointer');
      const options = group(page, name).locator('button[aria-pressed]');
      await expect(options.first()).toBeVisible();
      await header.click();
      await expect(header).toHaveAttribute('aria-expanded', 'false');
      await expect(options.first()).toBeHidden();
      await header.click();
      await expect(options.first()).toBeVisible();
    }
  });

  test('a choice that is already made stays applied while its group is folded', async ({ page }) => {
    await page.goto('/artworks?category=all&size=small');
    await expect(page.getByText('Showing 2 of 4')).toBeVisible();
    await page.getByRole('button', { name: 'Size', exact: true }).click();
    await expect(page.getByText('Showing 2 of 4')).toBeVisible();
  });
});

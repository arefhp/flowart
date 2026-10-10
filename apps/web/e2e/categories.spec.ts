import { expect, test } from '@playwright/test';
import { addImages, createArtwork, deleteArtwork, stamp } from './helpers';

// Admin categories in the real browser. Each test cleans up what it creates.

test('the Categories page lists Fine Art and Resin and is in the admin navigation', async ({ page }) => {
  await page.goto('/admin');
  await page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: 'Categories' }).click();
  await expect(page).toHaveURL(/\/admin\/categories$/);
  await expect(page.getByRole('heading', { name: 'Categories', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete Fine Art' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete Resin' })).toBeVisible();
});

test('every artwork needs a category and a size; a new artwork starts in the first category', async ({ page }) => {
  await page.goto('/admin/artworks/new');
  await expect(page.getByLabel('Category', { exact: true }).locator('option:checked')).toHaveText('Fine Art');
  await page.getByLabel('Title (English)').fill('Needs a size');
  await page.getByRole('button', { name: 'Create artwork' }).click();
  await expect(page.getByText('Choose Small, Medium or Large.')).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/artworks\/new$/); // nothing was created
});

test('add, rename, move artworks out, and delete a category: it cannot be deleted while an artwork is in it', async ({ page }) => {
  const original = `E2E Cat ${stamp()}`;
  const renamed = `${original} Renamed`;

  // add
  await page.goto('/admin/categories');
  await page.locator('#new-name').fill(original);
  await page.locator('#new-name-da').fill('Dansk kategori');
  await page.getByRole('button', { name: 'Add category' }).click();
  await expect(page.getByText(`Added "${original}".`)).toBeVisible();

  // a name that exists is refused (any capitalisation)
  await page.locator('#new-name').fill(original.toUpperCase());
  await page.getByRole('button', { name: 'Add category' }).click();
  await expect(page.getByText('already a category called')).toBeVisible();

  // rename
  const row = (name: string) => page.getByRole('button', { name: `Delete ${name}` }).locator('xpath=ancestor::li[1]');
  await row(original).getByLabel('Name (English)').fill(renamed);
  await row(original).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText(`Saved "${renamed}".`)).toBeVisible();

  // put a SHOWN artwork (it has an image) in the new category
  const title = `E2E in category ${stamp()}`;
  const id = await createArtwork(page, title, { category: renamed });
  await addImages(page, 1);

  // the category now appears as a filter on the public gallery, and filters to that artwork
  await page.goto('/artworks');
  await page.getByRole('group', { name: 'Category' }).getByRole('button', { name: renamed }).click();
  await expect(page.locator('main ul > li')).toHaveCount(1);
  await expect(page.locator('main ul > li').getByText(title)).toBeVisible();

  // delete is refused while the artwork is in it, and says which artwork
  await page.goto('/admin/categories');
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: `Delete ${renamed}` }).click();
  const error = row(renamed).getByRole('alert');
  await expect(error).toContainText(`"${renamed}" cannot be deleted`);
  await expect(error).toContainText('1 artwork is still in it');
  await expect(error).toContainText(title);
  await expect(page.getByRole('button', { name: `Delete ${renamed}` })).toBeVisible(); // still there

  // move the artwork to Fine Art, then the delete works
  await page.goto(`/admin/artworks/edit?id=${id}`);
  await page.getByLabel('Category', { exact: true }).selectOption({ label: 'Fine Art' });
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Saved. The public site updates in a few minutes.')).toBeVisible();

  await page.goto('/admin/categories');
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: `Delete ${renamed}` }).click();
  await expect(page.getByText(`Deleted "${renamed}".`)).toBeVisible();
  await expect(page.getByRole('button', { name: `Delete ${renamed}` })).toHaveCount(0);

  await deleteArtwork(page, id);
});

test('the category and size show in the artwork list and can be changed', async ({ page }) => {
  const title = `E2E list ${stamp()}`;
  const id = await createArtwork(page, title, { category: 'Resin', size: 'large' });
  await page.goto('/admin/artworks');
  const row = page.getByRole('row').filter({ hasText: title });
  await expect(row).toContainText('Resin');
  await expect(row).toContainText('Large');

  await page.goto(`/admin/artworks/edit?id=${id}`);
  await page.getByLabel('Size', { exact: true }).selectOption('small');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Saved. The public site updates in a few minutes.')).toBeVisible();
  await page.goto('/admin/artworks');
  await expect(page.getByRole('row').filter({ hasText: title })).toContainText('Small');
  await deleteArtwork(page, id);
});

test('categories can be reordered and the public filter follows the order', async ({ page }) => {
  await page.goto('/admin/categories');
  await expect(page.getByRole('button', { name: 'Delete Resin' })).toBeVisible(); // the list has loaded
  const names = async () => page.locator('li input[id^="n-"]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  const before = await names();
  expect(before.slice(0, 2)).toEqual(['Fine Art', 'Resin']);

  await page.getByRole('button', { name: 'Move Resin up' }).click();
  await expect(page.getByText('Order saved.')).toBeVisible();
  expect((await names()).slice(0, 2)).toEqual(['Resin', 'Fine Art']);
  await page.goto('/artworks');
  const labels = await page
    .getByRole('group', { name: 'Category' })
    .getByRole('button')
    .evaluateAll((els) => els.map((e) => e.querySelector('span')?.textContent?.trim()));
  expect(labels).toEqual(['All', 'Resin', 'Fine Art']);

  // put it back
  await page.goto('/admin/categories');
  await page.getByRole('button', { name: 'Move Resin down' }).click();
  await expect(page.getByText('Order saved.')).toBeVisible();
  expect((await names()).slice(0, 2)).toEqual(['Fine Art', 'Resin']);
});

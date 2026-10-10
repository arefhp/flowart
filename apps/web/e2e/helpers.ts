import { expect, type Page } from '@playwright/test';
import sharp from 'sharp';

/** A plain coloured photo, made on the fly (no files needed). */
export async function photo(width = 1200, height = 1500, color = '#3a6ea5'): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();
}

export const stamp = () => `${Date.now().toString(36)}`;

/** Create an artwork through the admin form and return its id. Category defaults to the first one; size to Medium. */
export async function createArtwork(
  page: Page,
  title: string,
  opts: { titleDa?: string; status?: string; category?: string; size?: string } = {},
): Promise<string> {
  await page.goto('/admin/artworks/new');
  await page.getByLabel('Title (English)').fill(title);
  if (opts.titleDa) await page.getByLabel('Title (Danish, optional)').fill(opts.titleDa);
  await page.getByLabel('Status', { exact: true }).selectOption(opts.status ?? 'available');
  if (opts.category) await page.getByLabel('Category', { exact: true }).selectOption({ label: opts.category });
  await page.getByLabel('Size', { exact: true }).selectOption(opts.size ?? 'medium');
  await page.getByRole('button', { name: 'Create artwork' }).click();
  await expect(page).toHaveURL(/\/admin\/artworks\/edit\?id=.+&created=1/);
  return new URL(page.url()).searchParams.get('id')!;
}

/** On an artwork's edit page: add `count` photos (the browser makes the web sizes) with alt text. */
export async function addImages(page: Page, count: number) {
  const files = await Promise.all(
    Array.from({ length: count }, async (_, i) => ({
      name: `photo-${i + 1}.png`,
      mimeType: 'image/png',
      buffer: await photo(1200 + i * 100, 1500, ['#3a6ea5', '#a5563a', '#4a8a5a'][i % 3]),
    })),
  );
  await page.locator('input[type=file]').setInputFiles(files);
  const alts = page.getByPlaceholder('Describe the painting in one sentence');
  await expect(alts).toHaveCount(count);
  for (let i = 0; i < count; i++) await alts.nth(i).fill(`Photo number ${i + 1}`);
  await page.getByRole('button', { name: new RegExp(`^Add ${count} image`) }).click();
  await expect(page.getByText(new RegExp(`${count} images? added`))).toBeVisible({ timeout: 30_000 });
}

export async function deleteArtwork(page: Page, id: string) {
  page.once('dialog', (d) => void d.accept());
  await page.goto(`/admin/artworks/edit?id=${id}`);
  await page.getByRole('button', { name: 'Delete artwork' }).click();
  await expect(page).toHaveURL(/\/admin\/artworks$/);
}

/** Create an event (a DRAFT) through the admin form; returns its id. Times are Copenhagen wall-clock "YYYY-MM-DDTHH:mm". */
export async function createEvent(
  page: Page,
  title: string,
  opts: { start?: string; end?: string; places?: string; price?: string; titleDa?: string; location?: string } = {},
): Promise<string> {
  await page.goto('/admin/events/new');
  await page.getByLabel('Title (English)').fill(title);
  if (opts.titleDa) await page.getByLabel('Title (Danish, optional)').fill(opts.titleDa);
  await page.getByLabel('Starts').fill(opts.start ?? '2031-05-10T10:00');
  await page.getByLabel('Ends').fill(opts.end ?? '2031-05-10T13:00');
  await page.getByLabel('Location (English)').fill(opts.location ?? 'The studio, Copenhagen');
  await page.getByLabel('Number of places').fill(opts.places ?? '5');
  await page.getByLabel('Price per person').fill(opts.price ?? '450');
  await page.getByRole('button', { name: 'Save as draft' }).click();
  await expect(page).toHaveURL(/\/admin\/events\/edit\?id=.+&created=1/);
  return new URL(page.url()).searchParams.get('id')!;
}

export async function deleteEvent(page: Page, id: string) {
  page.once('dialog', (d) => void d.accept());
  await page.goto(`/admin/events/edit?id=${id}`);
  await page.getByRole('button', { name: 'Delete event' }).click();
  await expect(page).toHaveURL(/\/admin\/events$/);
}

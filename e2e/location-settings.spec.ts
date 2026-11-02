import { addCard, backToWallet, expect, openWallet, test, tiles } from './fixtures';

// Standing inside a Mega Image, and somewhere ~1 km away.
const IN_STORE = { latitude: 44.4318, longitude: 26.1006 };
const ELSEWHERE = { latitude: 44.4410, longitude: 26.1006 };

test.describe('Location', () => {
  test.use({ geolocation: IN_STORE, permissions: ['geolocation'] });

  test("'I'm in this store now' saves the spot, and the wallet suggests the card there", async ({ page, context, mocks }) => {
    void mocks;
    await openWallet(page);
    await page.getByRole('button', { name: 'Add card' }).click();
    await page.getByLabel('Store').fill('Mega');
    await page.locator('ion-item', { hasText: 'Mega Image' }).first().click();
    await page.getByLabel('Card number').fill('9930003376806');
    await page.getByText("I'm in this store now").click();
    await expect(page.getByText('Location added. Remember to save.')).toBeVisible();
    await expect(page.getByText('Opens within 150 m')).toBeVisible();
    await page.getByRole('button', { name: 'Save' }).click();
    await backToWallet(page);

    // Back at the store: banner + Nearby badge.
    await page.reload();
    await expect(page.getByText(/You're at\s+Mega Image/)).toBeVisible();
    await expect(tiles(page).first()).toContainText('Nearby');

    // Somewhere else: no suggestion.
    await context.setGeolocation(ELSEWHERE);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Wallet' })).toBeVisible();
    await expect(page.getByText(/You're at/)).toHaveCount(0);
  });

  test('with auto-open on, the card opens by itself in the store', async ({ page, mocks }) => {
    void mocks;
    await openWallet(page);
    await page.getByRole('button', { name: 'Add card' }).click();
    await page.getByLabel('Store').fill('Corner Bakery');
    await page.getByText("I'm in this store now").click();
    await expect(page.getByText('Opens within 150 m')).toBeVisible();
    await page.getByRole('button', { name: 'Save' }).click();
    await backToWallet(page);

    await page.getByRole('button', { name: 'Settings' }).click();
    await page.locator('ion-toggle', { hasText: 'Auto-open card' }).click();
    await page.goto('/');
    await expect(page).toHaveURL(/\/card\/[0-9a-f-]{36}$/);
    await expect(page.locator('ion-title', { hasText: 'Corner Bakery' })).toBeVisible();
  });

  test('Find stores automatically adds the chain stores nearby, without duplicates', async ({ page, mocks }) => {
    mocks.overpassElements = [
      { type: 'node', lat: 44.4318, lon: 26.1006, tags: { name: 'Mega Image', 'addr:street': 'Strada Lipscani', 'addr:housenumber': '12' } },
      { type: 'way', center: { lat: 44.4319, lon: 26.1007 }, tags: { brand: 'Mega Image' } }, // same shop as a building
      { type: 'node', lat: 44.4293, lon: 26.1028, tags: { name: 'Mega Image', 'addr:street': 'Bulevardul Unirii' } },
    ];
    await openWallet(page);
    await page.getByRole('button', { name: 'Add card' }).click();
    await page.getByLabel('Store').fill('Mega');
    await page.locator('ion-item', { hasText: 'Mega Image' }).first().click();
    await page.getByText('Find stores automatically').click();
    await expect(page.getByText('Added 2 stores. Remember to save.')).toBeVisible();
    await expect(page.getByText('Mega Image, Strada Lipscani 12')).toBeVisible();
    await expect(page.getByText('Mega Image, Bulevardul Unirii')).toBeVisible();

    // Second search: answered from the 7-day cache, nothing new to add.
    await page.getByText('Find stores automatically').click();
    await expect(page.getByText('Those stores are already saved.')).toBeVisible();
    expect(mocks.overpassCalls).toBe(1);
  });

  test('Find stores needs a store name first', async ({ page, mocks }) => {
    void mocks;
    await openWallet(page);
    await page.getByRole('button', { name: 'Add card' }).click();
    await page.getByText('Find stores automatically').click();
    await expect(page.getByText('Enter the store name first.')).toBeVisible();
  });
});

test.describe('Location denied', () => {
  test.use({ permissions: [] });

  test('explains the problem and offers Open settings', async ({ page, mocks }) => {
    void mocks;
    await openWallet(page);
    await page.getByRole('button', { name: 'Add card' }).click();
    await page.getByLabel('Store').fill('Corner Bakery');
    await page.getByText("I'm in this store now").click();
    await expect(page.getByText('Location permission is off.')).toBeVisible();
    await expect(page.locator('ion-toast').getByRole('button', { name: 'Open settings' })).toBeVisible();
    await expect(page.getByText("Location permission is off, so nearby cards won't be suggested.")).toBeVisible();
  });
});

test.describe('Settings', () => {
  test('switch the wallet between grid and stack', async ({ page, mocks }) => {
    void mocks;
    await openWallet(page);
    await addCard(page, { store: 'Corner Bakery', code: 'BAKE-42' });
    await backToWallet(page);
    await expect(page.locator('.grid app-card-tile')).toHaveCount(1);

    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Stack' }).click();
    await expect(page.getByRole('button', { name: 'Stack' })).toHaveAttribute('aria-pressed', 'true');
    await backToWallet(page);
    await expect(page.locator('.stack app-card-tile')).toHaveCount(1);

    // Kept after a restart.
    await page.reload();
    await expect(page.locator('.stack app-card-tile')).toHaveCount(1);
  });

  test('export is disabled with no cards', async ({ page, mocks }) => {
    void mocks;
    await openWallet(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.locator('ion-item', { hasText: 'Export all cards' })).toHaveAttribute('aria-disabled', 'true');
  });
});

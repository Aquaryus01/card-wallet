import { addCard, backToWallet, expect, openWallet, test, tile, tiles } from './fixtures';

test.describe('Cards', () => {
  test('a new install shows the empty wallet', async ({ page, mocks }) => {
    void mocks;
    await openWallet(page);
    await expect(page.getByText('No cards yet')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Memberships' })).toHaveCount(0);
  });

  test('add a store card from the suggestions: brand colour, barcode, saved across reloads', async ({ page, mocks }) => {
    void mocks;
    await openWallet(page);
    await addCard(page, { store: 'Mega', pick: 'Mega Image', code: '9930003376806' });

    // Card screen: name in the header, the barcode and its number.
    await expect(page.locator('ion-title', { hasText: 'Mega Image' })).toBeVisible();
    await expect(page.getByAltText('Barcode')).toBeVisible();
    await expect(page.getByText('9930003376806')).toBeVisible();

    await backToWallet(page);
    await expect(page.getByText('1 card')).toBeVisible();
    await expect(tiles(page)).toHaveCount(1);
    // Curated brand colour for Mega Image (#e30613).
    await expect(tile(page)).toHaveCSS('background-color', 'rgb(227, 6, 19)');

    await page.reload();
    await expect(tiles(page)).toHaveCount(1);
  });

  test('the card number picks the barcode format by itself', async ({ page, mocks }) => {
    void mocks;
    await openWallet(page);
    await page.getByRole('button', { name: 'Add card' }).click();
    const format = page.locator('ion-select');
    await page.getByLabel('Card number').fill('9930003376806');
    await expect(format).toHaveJSProperty('value', 'EAN_13');
    await page.getByLabel('Card number').fill('96385074');
    await expect(format).toHaveJSProperty('value', 'EAN_8');
  });

  test('a store with no curated colour takes it from its logo', async ({ page, mocks }) => {
    void mocks; // favicons are mocked as solid rgb(0, 82, 155)
    await openWallet(page);
    await addCard(page, { store: 'Sportisimo', pick: 'Sportisimo', code: '9930003376806' });
    await backToWallet(page);
    await expect(tile(page)).toHaveCSS('background-color', 'rgb(0, 82, 155)', { timeout: 15_000 });
  });

  test('a custom card: typed name, chosen colour, name shown when there is no logo', async ({ page, mocks }) => {
    void mocks;
    await openWallet(page);
    await addCard(page, { store: 'Corner Bakery', code: 'BAKE-42', swatch: 'Green' });
    await backToWallet(page);
    await expect(tile(page)).toHaveCSS('background-color', 'rgb(31, 157, 92)');
    await expect(tiles(page).first()).toContainText('Corner Bakery');
  });

  test('a store name is required', async ({ page, mocks }) => {
    void mocks;
    await openWallet(page);
    await page.getByRole('button', { name: 'Add card' }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Store name is required')).toBeVisible();
    await expect(page).toHaveURL(/\/card\/new$/);
  });

  test('search filters the wallet', async ({ page, mocks }) => {
    void mocks;
    await openWallet(page);
    await addCard(page, { store: 'Mega', pick: 'Mega Image', code: '9930003376806' });
    await backToWallet(page);
    await addCard(page, { store: 'Corner Bakery', code: 'BAKE-42' });
    await backToWallet(page);
    await expect(tiles(page)).toHaveCount(2);

    const search = page.getByPlaceholder('Search cards');
    await search.fill('bake');
    await expect(tiles(page)).toHaveCount(1);
    await expect(tiles(page).first()).toContainText('Corner Bakery');
    await search.fill('zzz');
    await expect(page.getByText('No cards match “zzz”.')).toBeVisible();
    await search.fill('');
    await expect(tiles(page)).toHaveCount(2);
  });

  test('edit a card, then delete it', async ({ page, mocks }) => {
    void mocks;
    await openWallet(page);
    await addCard(page, { store: 'Corner Bakery', code: 'BAKE-42' });

    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Store').fill('Bakery 2');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('ion-title', { hasText: 'Bakery 2' })).toBeVisible();

    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByText('Delete card').click();
    await page.locator('ion-alert').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('No cards yet')).toBeVisible();
  });

  test('Cancel leaves without saving', async ({ page, mocks }) => {
    void mocks;
    await openWallet(page);
    await page.getByRole('button', { name: 'Add card' }).click();
    await page.getByLabel('Store').fill('Never saved');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('No cards yet')).toBeVisible();
  });
});

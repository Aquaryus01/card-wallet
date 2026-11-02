import { MEMBER_URL, addCard, backToWallet, expect, memberPage, openWallet, test, tiles } from './fixtures';

test.describe('Memberships', () => {
  // Fixed "today" so days-left labels are stable: 2 Nov 2026.
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-02T10:00:00') });
  });

  test('a gym QR link becomes a membership with entries left and expiry', async ({ page, mocks }) => {
    void mocks; // member page: 8 entries, 6 left, expires 23.11.2026
    await openWallet(page);
    await addCard(page, { store: 'Natural', pick: 'Natural High', code: MEMBER_URL });

    // Card screen: QR (no long URL printed), then the subscription panel.
    await expect(page.getByAltText('Barcode')).toBeVisible();
    await expect(page.getByText(MEMBER_URL)).toHaveCount(0);
    const panel = page.locator('section.membership');
    await expect(panel).toContainText('6');
    await expect(panel).toContainText('/ 8');
    await expect(panel).toContainText('entries left');
    await expect(panel).toContainText('Nov 23, 2026');
    await expect(panel).toContainText('21 days left');

    // Wallet: the switch appears; the gym is under Memberships, not Cards.
    await backToWallet(page);
    await expect(page.getByRole('tab', { name: 'Cards' })).toBeVisible();
    await expect(page.getByText('No store cards yet.')).toBeVisible();
    await page.getByRole('tab', { name: 'Memberships' }).click();
    const row = page.locator('.m-row', { hasText: 'Natural High' });
    await expect(row).toContainText('6');
    await expect(row).toContainText('/ 8');
    await expect(row).toContainText('Expires Nov 23, 2026 · 21 days left');
  });

  test('the QR format is chosen automatically for a link', async ({ page, mocks }) => {
    void mocks;
    await openWallet(page);
    await page.getByRole('button', { name: 'Add card' }).click();
    await page.getByLabel('Card number').fill(MEMBER_URL);
    await expect(page.locator('ion-select')).toHaveJSProperty('value', 'QR_CODE');
    // The membership switch is on and locked for a detected link.
    const toggle = page.locator('ion-toggle', { hasText: 'Membership' });
    await expect(toggle).toHaveJSProperty('checked', true);
    await expect(toggle).toHaveJSProperty('disabled', true);
    await expect(toggle).toContainText('Detected from the code');
  });

  test('refresh picks up a used entry', async ({ page, mocks }) => {
    await openWallet(page);
    await addCard(page, { store: 'Natural', pick: 'Natural High', code: MEMBER_URL });
    const panel = page.locator('section.membership');
    await expect(panel).toContainText('21 days left');

    mocks.memberPage = memberPage(8, 5, '23.11.2026');
    await page.getByRole('button', { name: 'Refresh subscription' }).click();
    await expect(panel.locator('.m-stat strong').first()).toContainText('5');
  });

  test('when the gym site is down, the last known status stays', async ({ page, mocks }) => {
    await openWallet(page);
    await addCard(page, { store: 'Natural', pick: 'Natural High', code: MEMBER_URL });
    const panel = page.locator('section.membership');
    await expect(panel).toContainText('21 days left');

    mocks.memberPage = null;
    await page.getByRole('button', { name: 'Refresh subscription' }).click();
    await expect(panel).toContainText("Couldn't refresh · showing last known");
    await expect(panel).toContainText('21 days left');
  });

  test('an expired subscription is flagged', async ({ page, mocks }) => {
    mocks.memberPage = memberPage(8, 2, '30.10.2026');
    await openWallet(page);
    await addCard(page, { store: 'Natural', pick: 'Natural High', code: MEMBER_URL });
    await expect(page.locator('section.membership .warn')).toHaveText('Expired');
    await backToWallet(page);
    await page.getByRole('tab', { name: 'Memberships' }).click();
    await expect(page.locator('.m-row .m-sub.warn')).toHaveText('Expired');
  });

  test('no active subscription on the page', async ({ page, mocks }) => {
    mocks.memberPage = '<html><body><p>Nu aveti abonament activ</p></body></html>';
    await openWallet(page);
    await addCard(page, { store: 'Natural', pick: 'Natural High', code: MEMBER_URL });
    await expect(page.getByText("No active subscription on the gym's page.")).toBeVisible();
  });

  test('any card can be marked as a membership by hand', async ({ page, mocks }) => {
    void mocks;
    await openWallet(page);
    await addCard(page, { store: 'City Pool', code: 'POOL-7781', membership: true });
    // No readable status: no subscription panel on the card screen.
    await expect(page.locator('section.membership')).toHaveCount(0);
    await backToWallet(page);
    await page.getByRole('tab', { name: 'Memberships' }).click();
    await expect(page.locator('.m-row', { hasText: 'City Pool' })).toContainText('Membership');
  });

  test('store cards and memberships stay on their own tabs, search works in both', async ({ page, mocks }) => {
    void mocks;
    await openWallet(page);
    await addCard(page, { store: 'Mega', pick: 'Mega Image', code: '9930003376806' });
    await backToWallet(page);
    await addCard(page, { store: 'Natural', pick: 'Natural High', code: MEMBER_URL });
    await backToWallet(page);

    await expect(tiles(page)).toHaveCount(1);
    await expect(page.getByText('2 cards')).toBeVisible();
    await page.getByRole('tab', { name: 'Memberships' }).click();
    await expect(page.locator('.m-row')).toHaveCount(1);

    await page.getByPlaceholder('Search cards').fill('mega');
    await expect(page.getByText('No memberships match “mega”.')).toBeVisible();
    await page.getByRole('tab', { name: 'Cards' }).click();
    await expect(tiles(page)).toHaveCount(1);
  });
});

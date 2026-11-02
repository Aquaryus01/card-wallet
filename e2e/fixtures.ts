import { Page, expect, test as base } from '@playwright/test';
import { deflateSync } from 'node:zlib';

/** Placeholder member link (never a real member's). */
export const MEMBER_URL = 'https://nhb.naturalhigh.ro/abonat/0123456789abcdef0123456789abcdef.html';

export function memberPage(total: number, left: number, expires: string): string {
  return `<!DOCTYPE HTML><html><head><title>Abonati NH Bucuresti</title></head><body>
<div class="abonament "><span>Abonament: ${total} intrari</span>${left} intrari <span>Expira: ${expires} </span></div>
</body></html>`;
}

/** Solid-colour PNG, for faking store favicons. */
export function solidPng(r: number, g: number, b: number, size = 64): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CORS = { 'access-control-allow-origin': '*' };

export interface Mocks {
  /** What the gym's member page returns; null → HTTP 500. */
  memberPage: string | null;
  /** Elements the Overpass store search returns. */
  overpassElements: unknown[];
  overpassCalls: number;
}

/**
 * Every test starts with empty storage and all outside services mocked:
 * store favicons (solid blue), the gym's member page, and the Overpass store search.
 */
export const test = base.extend<{ mocks: Mocks }>({
  mocks: async ({ page }, use) => {
    const mocks: Mocks = { memberPage: memberPage(8, 6, '23.11.2026'), overpassElements: [], overpassCalls: 0 };

    await page.route('**/s2/favicons**', (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', headers: CORS, body: solidPng(0, 82, 155) }),
    );
    await page.route('https://nhb.naturalhigh.ro/**', (route) =>
      mocks.memberPage === null
        ? route.fulfill({ status: 500, headers: CORS, body: 'down' })
        : route.fulfill({ status: 200, contentType: 'text/html', headers: CORS, body: mocks.memberPage }),
    );
    await page.route('**/api/interpreter', (route) => {
      mocks.overpassCalls++;
      return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ elements: mocks.overpassElements }) });
    });

    await use(mocks);
  },
});

export { expect };

// ---------- Actions ----------

export async function openWallet(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Wallet' })).toBeVisible();
}

export interface NewCard {
  store: string;
  /** Pick this suggestion from the store list instead of keeping the typed name. */
  pick?: string;
  code?: string;
  swatch?: 'Red' | 'Orange' | 'Yellow' | 'Green' | 'Blue' | 'Purple';
  membership?: boolean;
}

/** Fills the Add card form and saves; ends on the new card's screen. */
export async function addCard(page: Page, card: NewCard): Promise<void> {
  await page.getByRole('button', { name: 'Add card' }).click();
  await expect(page.getByText('New card', { exact: true }).first()).toBeVisible();
  await page.getByLabel('Store').fill(card.store);
  if (card.pick) await page.locator('ion-item', { hasText: card.pick }).first().click();
  if (card.code) await page.getByLabel('Card number').fill(card.code);
  if (card.swatch) await page.getByRole('button', { name: card.swatch, exact: true }).click();
  if (card.membership) await page.locator('ion-toggle', { hasText: 'Membership' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL(/\/card\/[0-9a-f-]{36}$/);
}

export async function backToWallet(page: Page): Promise<void> {
  await page.locator('ion-back-button:visible').click();
  await expect(page.getByRole('heading', { name: 'Wallet' })).toBeVisible();
}

export function tiles(page: Page) {
  return page.locator('app-card-tile:visible');
}

export function tile(page: Page, index = 0) {
  return tiles(page).nth(index).locator('.card');
}

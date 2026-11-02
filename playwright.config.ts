import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end scenarios in a phone-sized Chromium against the dev server.
 * Capacitor runs its web implementations here (Preferences → localStorage, Filesystem → IndexedDB,
 * Geolocation → the browser's), and every outside service is mocked in e2e/fixtures.ts.
 * Native-only paths (camera scanner, ML Kit image reading) are covered on a device, not here.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  workers: 3,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }]],
  use: {
    ...devices['Pixel 7'],
    baseURL: 'http://localhost:4300',
    locale: 'en-US',
    timezoneId: 'Europe/Bucharest',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npx ng serve --port 4300',
    url: 'http://localhost:4300',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});

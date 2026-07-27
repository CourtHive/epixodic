import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './journeys',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  use: {
    baseURL: 'http://localhost:5175',
    viewport: { width: 390, height: 844 },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'mobile', use: { viewport: { width: 390, height: 844 } } },
    { name: 'tablet', use: { viewport: { width: 1024, height: 768 } } },
  ],
  webServer: {
    command: 'npx vite --port 5175',
    url: 'http://localhost:5175',
    reuseExistingServer: !process.env.CI,
    // A cold vite boot pre-bundles the linked factory/courthive-components deps,
    // which exceeds the 60s default on a fresh machine — the run then fails before
    // any test starts. Give it room (a warm/reused server is unaffected).
    timeout: 180_000,
  },
});

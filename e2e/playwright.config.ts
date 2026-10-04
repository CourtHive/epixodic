import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Repo root — this config lives in `<root>/e2e/`. Playwright runs `webServer.command` with
// cwd = the CONFIG'S directory, not the repo root, so vite roots itself in `e2e/`, finds no
// index.html, binds the port and serves 404 forever. The readiness poll never resolves and the
// run dies on the webServer timeout — which reads like a slow boot rather than a wrong cwd.
// courthive-public hit this and documented it; epixodic never got the same fix.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
    // `pnpm exec`, not `npx`: npm is banned ecosystem-wide (it corrupts the pnpm store) and every
    // other e2e config here uses pnpm. On a host whose .npmrc carries pnpm-only keys, `npx` emits
    // "Unknown env config" warnings and never brings the server up — the suite then dies on the
    // webServer timeout below, which reads like a slow boot rather than the wrong package manager.
    command: 'pnpm exec vite --port 5175',
    cwd: ROOT,
    url: 'http://localhost:5175',
    reuseExistingServer: !process.env.CI,
    // A cold vite boot pre-bundles the linked factory/courthive-components deps,
    // which exceeds the 60s default on a fresh machine — the run then fails before
    // any test starts. Give it room (a warm/reused server is unaffected).
    timeout: 180_000,
  },
});

import { Page } from '@playwright/test';

/**
 * Clock manipulation helpers for E2E tests.
 * Uses the dev API to fast-forward clocks rather than waiting real-time.
 */

/** Set the bolt duration for subsequent bolts (milliseconds) */
export async function setBoltDuration(page: Page, ms: number) {
  await page.evaluate((duration) => globalThis['dev'].setBoltDuration?.(duration), ms);
}

/** Get a snapshot of a specific clock */
export async function getClockSnapshot(page: Page, clockId: string) {
  return page.evaluate((id) => globalThis['dev'].getClockSnapshot?.(id), clockId);
}

/** Set remaining time on a clock (clock must be paused/idle) */
export async function setClockRemaining(page: Page, clockId: string, ms: number) {
  await page.evaluate(
    ({ id, remaining }) => globalThis['dev'].setClockRemaining?.(id, remaining),
    { id: clockId, remaining: ms },
  );
}

/** Fast-forward the bolt clock to near expiry (1 second remaining) */
export async function fastForwardBoltClock(page: Page) {
  await setClockRemaining(page, 'boltTimer', 1_000);
}

/** Fast-forward the break clock to near expiry (1 second remaining) */
export async function fastForwardBreakClock(page: Page) {
  await setClockRemaining(page, 'breakTimer', 1_000);
}

/** Wait for the bolt clock to be visible and running */
export async function waitForBoltClockRunning(page: Page) {
  await page.waitForSelector('.clock-display', { timeout: 5_000 });
}

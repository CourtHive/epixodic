import { Page, expect } from '@playwright/test';

/**
 * Bridge between Playwright tests and the Epixodic dev API.
 * All access goes through page.evaluate() calling globalThis.dev.
 */

/** Wait for the app to be fully mounted and the dev API to be available */
export async function waitForApp(page: Page) {
  await page.waitForFunction(() => globalThis['dev'] !== undefined, null, {
    timeout: 15_000,
  });
}

/** Navigate to the archive page and wait for it to render */
export async function goToArchive(page: Page) {
  await page.goto('/#/archive');
  await waitForApp(page);
  // Wait for the archive page content to appear
  await page.waitForSelector('.archive-page, [class*="archive"]', { timeout: 10_000 }).catch(() => {
    // Archive page might not have a distinctive wrapper — wait for the demo button instead
  });
}

/** Clear all localStorage and reload */
export async function resetAppState(page: Page) {
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.reload();
  await waitForApp(page);
}

/** Get the current team matchUp from the dev API */
export async function getTeamMatchUp(page: Page) {
  return page.evaluate(() => globalThis['dev'].teamMatchUp);
}

/** Get the active tieMatchUp ID */
export async function getActiveTieMatchUpId(page: Page) {
  return page.evaluate(() => globalThis['dev'].activeTieMatchUpId);
}

/** Get the scoring engine state */
export async function getScoringState(page: Page) {
  return page.evaluate(() => globalThis['dev'].getScoringState?.());
}

/** Get the player time state */
export async function getPlayerTimeState(page: Page) {
  return page.evaluate(() => globalThis['dev'].getPlayerTimeState?.());
}

/** Get the current score version */
export async function getScoreVersion(page: Page) {
  return page.evaluate(() => globalThis['dev'].getScoreVersion?.());
}

/** Reset all team matchUps (clears persisted state) */
export async function resetTeamMatchUps(page: Page) {
  await page.evaluate(() => globalThis['dev'].resetTeamMatchUps());
}

/** Create an INTENNSE demo programmatically via the dev API */
export async function createDemoViaApi(
  page: Page,
  config: {
    team1Name?: string;
    team2Name?: string;
    boltDurationMinutes?: number;
    assignParticipants?: boolean;
  } = {},
) {
  return page.evaluate((cfg) => globalThis['dev'].createDemo?.(cfg), config);
}

/** Get raw engine state (bypasses Svelte $derived caching) */
export async function getEngineState(page: Page) {
  return page.evaluate(() => globalThis['dev'].getEngineState?.());
}

/** Assert the page is on a specific route */
export async function expectRoute(page: Page, route: string) {
  await expect(page).toHaveURL(new RegExp(`#${route}`));
}

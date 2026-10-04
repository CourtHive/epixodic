import { test, expect } from '@playwright/test';
import { ArchivePage } from '../pages/ArchivePage';
import { ScorecardPage } from '../pages/ScorecardPage';
import { BoltScoringPage } from '../pages/BoltScoringPage';
import { resetAppState, waitForApp, getScoringState } from '../helpers/app-bridge';

/**
 * Persistence / resume (S5 area). The durable backend (courthive-query) is NOT
 * running under e2e, so these assert the LOCAL-FIRST contract: scoring is driven
 * by browserStorage and never blocks on the remote save/hydrate. A failed push to
 * courthive-query is queued and swallowed; hydration falls back to local.
 */

async function startScoredBolt(page: import('@playwright/test').Page) {
  const archive = new ArchivePage(page);
  await archive.goto();
  await archive.createIntennseDemo({ boltMinutes: 1 });

  const scorecard = new ScorecardPage(page);
  await scorecard.expectVisible();
  await scorecard.clickTieMatchUp(0);

  const bolt = new BoltScoringPage(page);
  await bolt.expectVisible();
  await bolt.handleCoinToss(1);
  await bolt.startBolt();
  return bolt;
}

test.describe('Journey 9 — local persistence & resume', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#/archive');
    await waitForApp(page);
    await resetAppState(page);
  });

  test('bolt scores survive a page reload (local-first resume)', async ({ page }) => {
    const bolt = await startScoredBolt(page);

    await bolt.scoreWinner(0); // 2-0
    await bolt.scoreTouch(0); // 2-1
    await bolt.expectBoltScores('2', '1');

    // Reload — the app re-hydrates. courthive-query is unreachable, so hydration
    // must fall back to the locally persisted state.
    await page.reload();
    await waitForApp(page);

    const resumed = new BoltScoringPage(page);
    await resumed.expectVisible();
    await resumed.expectBoltScores('2', '1');

    const state = await getScoringState(page);
    expect(state?.pointCount).toBe(2);
  });

  test('scoring is not blocked when the durable backend is unreachable', async ({ page }) => {
    const bolt = await startScoredBolt(page);

    // Several points in a row — each fires a (failing) push to courthive-query;
    // the offline queue swallows it and scoring keeps working.
    await bolt.scoreWinner(0); // 2-0
    await bolt.scoreWinner(1); // 2-2
    await bolt.scoreTouch(0); // 2-3
    await bolt.expectBoltScores('2', '3');

    const state = await getScoringState(page);
    expect(state?.pointCount).toBe(3);
  });
});

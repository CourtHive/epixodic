import { test, expect } from '@playwright/test';
import { ArchivePage } from '../pages/ArchivePage';
import { ScorecardPage } from '../pages/ScorecardPage';
import { BoltScoringPage } from '../pages/BoltScoringPage';
import { resetAppState, waitForApp } from '../helpers/app-bridge';
import { getClockSnapshot } from '../helpers/clock-helpers';

async function setupActiveBolt(page: import('@playwright/test').Page) {
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

/** Fast-forward the bolt clock: pause → set 50ms remaining → resume → wait for expiry */
async function expireBoltClock(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const dev = globalThis['dev'];
    dev.pauseClock('boltTimer');
    dev.setClockRemaining('boltTimer', 50);
    dev.resumeClock('boltTimer');
  });
  // Wait for the 50ms to elapse + RAF tick + onExpire callback
  await page.waitForTimeout(500);
}

test.describe('Journey 3 — Bolt completion and break clock', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#/archive');
    await waitForApp(page);
    await resetAppState(page);
  });

  test('bolt clock starts counting down after bolt start', async ({ page }) => {
    const bolt = await setupActiveBolt(page);

    const snapshot = await getClockSnapshot(page, 'boltTimer');
    expect(snapshot).toBeTruthy();
    expect(snapshot.state).toBe('running');
  });

  test('bolt expires and enters break after final point', async ({ page }) => {
    const bolt = await setupActiveBolt(page);
    await bolt.scoreWinner(0);

    // Fast-forward bolt clock to expiry
    await expireBoltClock(page);

    // After bolt expires, the next point completes the bolt and starts break
    await bolt.scoreWinner(0);

    // Break should be active (overlay in vertical, break label in horizontal)
    await bolt.expectBreakActive();
  });

  test('break overlay shows point adjustment buttons (vertical only)', async ({ page }) => {
    const bolt = await setupActiveBolt(page);
    await bolt.scoreWinner(0);

    await expireBoltClock(page);
    await bolt.scoreWinner(0);

    await bolt.expectBreakActive();
    // Point adjustment buttons only exist in vertical/mobile layout
    if (await bolt.hasBreakOverlay()) {
      await expect(bolt.breakAdjustBtns).toHaveCount(2);
    }
  });

  test('point adjustment during break updates ARC score', async ({ page }) => {
    const bolt = await setupActiveBolt(page);
    await bolt.scoreWinner(0); // 2-0

    await expireBoltClock(page);
    await bolt.scoreWinner(1); // 2-2 then bolt completes

    await bolt.expectBreakActive();

    // Point adjustment only available in vertical/mobile layout
    if (await bolt.hasBreakOverlay()) {
      const arcBefore = await bolt.getArcScore();

      // Award +1 to side 1 during break
      await bolt.awardBreakPoints(1);

      const arcAfter = await bolt.getArcScore();
      expect(arcAfter).toBeTruthy();
      expect(arcAfter).not.toBe(arcBefore);
    }
  });
});

import { test, expect } from '@playwright/test';
import { ArchivePage } from '../pages/ArchivePage';
import { ScorecardPage } from '../pages/ScorecardPage';
import { BoltScoringPage } from '../pages/BoltScoringPage';
import { resetAppState, waitForApp } from '../helpers/app-bridge';
import { S } from '../helpers/selectors';

/**
 * Journey 8 — Bolt auto-advance through all tieMatchUps
 *
 * Creates an INTENNSE demo with 1-minute bolts and 2-second breaks,
 * then scores through all 7 tieMatchUps (11 total bolts: 4 singles × 2
 * bolts + 3 doubles × 1 bolt). Validates:
 *  - Global bolt number increments across tieMatchUp boundaries
 *  - Break clock runs between every bolt (within and between tieMatchUps)
 *  - Auto-advance navigates to the next tieMatchUp without returning to scorecard
 */

/** Fast-forward bolt clock: pause → set 50ms → resume → wait for expiry */
async function expireBoltClock(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const dev = globalThis['dev'];
    dev.pauseClock('boltTimer');
    dev.setClockRemaining('boltTimer', 50);
    dev.resumeClock('boltTimer');
  });
  await page.waitForTimeout(500);
}

/** Wait for break clock to appear, then fast-forward it to near-expiry */
async function waitAndExpireBreakClock(page: import('@playwright/test').Page) {
  // Wait for break label to appear
  await page.waitForSelector(S.BREAK_LABEL, { timeout: 5_000 });
  // Fast-forward break clock
  await page.evaluate(() => {
    const dev = globalThis['dev'];
    dev.pauseClock('breakTimer');
    dev.setClockRemaining('breakTimer', 50);
    dev.resumeClock('breakTimer');
  });
  await page.waitForTimeout(500);
}

/**
 * Score one complete bolt: start bolt → score a point → expire clock →
 * score final point (triggers bolt completion + break).
 */
async function scoreOneBolt(bolt: BoltScoringPage) {
  await bolt.startBolt();
  // Score a point so there's something in the bolt
  await bolt.scoreWinner(0);
  // Fast-forward bolt clock to expiry
  await expireBoltClock(bolt.page);
  // Score one more point after bolt expired → triggers endSegment + break
  await bolt.scoreWinner(0);
}

test.describe('Journey 8 — Bolt auto-advance through all tieMatchUps', () => {
  test.beforeEach(async ({ page }) => {
    // Use breakSeconds=2 to speed up inter-bolt breaks
    await page.goto('/?breakSeconds=2#/archive');
    await waitForApp(page);
    await resetAppState(page);
  });

  test('global bolt number increments and breaks run across all 11 bolts', async ({ page }) => {
    test.setTimeout(180_000);

    // Create INTENNSE demo with 1-minute bolts
    const archive = new ArchivePage(page);
    await archive.createIntennseDemo({ boltMinutes: 1 });

    const scorecard = new ScorecardPage(page);
    await scorecard.expectVisible();

    // Click first tieMatchUp (MS1 — Men's Singles position 1)
    await scorecard.clickTieMatchUp(0);

    const bolt = new BoltScoringPage(page);
    await bolt.expectVisible();

    // Coin toss only needed for first tieMatchUp
    await bolt.handleCoinToss(1);

    // Track bolt numbers across all tieMatchUps
    // Singles tieMatchUps (MS1, MS2, WS1, WS2): 2 bolts each = 8 bolts
    // Doubles tieMatchUps (MD, WD, XD): 1 bolt each = 3 bolts
    // Total: 11 bolts
    let expectedGlobalBolt = 1;

    // Bolt structure per tieMatchUp: [boltsPerMatch, ...]
    // MS1(2), MS2(2), WS1(2), WS2(2), MD(1), WD(1), XD(1)
    const boltsPerTieMatchUp = [2, 2, 2, 2, 1, 1, 1];

    for (let tmIdx = 0; tmIdx < boltsPerTieMatchUp.length; tmIdx++) {
      const boltsInThisMatch = boltsPerTieMatchUp[tmIdx];

      for (let boltIdx = 0; boltIdx < boltsInThisMatch; boltIdx++) {
        // Verify bolt label shows correct global number
        const label = await bolt.getBoltLabel();
        expect(label, `tieMatchUp ${tmIdx + 1}, bolt ${boltIdx + 1}`).toBe(
          `BOLT ${expectedGlobalBolt}`,
        );

        // Score the bolt (start → points → expire → final point)
        await scoreOneBolt(bolt);

        // Break should appear
        await page.waitForSelector(S.BREAK_LABEL, { timeout: 5_000 });
        const breakLabel = await page.locator(S.BREAK_LABEL).textContent();

        const isLastBoltOfMatch = boltIdx === boltsInThisMatch - 1;
        const isLastTieMatchUp = tmIdx === boltsPerTieMatchUp.length - 1;

        if (isLastBoltOfMatch && !isLastTieMatchUp) {
          // Inter-tieMatchUp break should say "Next match starting..."
          expect(breakLabel?.trim()).toBe('Next match starting...');
        } else if (!isLastBoltOfMatch) {
          // Intra-tieMatchUp break should say "Next bolt starting..."
          expect(breakLabel?.trim()).toBe('Next bolt starting...');
        }

        expectedGlobalBolt++;

        if (isLastBoltOfMatch && isLastTieMatchUp) {
          // Final bolt of final tieMatchUp — no more advancing
          break;
        }

        // Fast-forward the break clock — triggers auto-advance
        await waitAndExpireBreakClock(page);

        if (isLastBoltOfMatch) {
          // Auto-advanced to next tieMatchUp — wait for new bolt page to mount
          await bolt.expectVisible();
          // Small wait for state initialization
          await page.waitForTimeout(300);
        }
      }
    }

    // All 11 bolts scored — expectedGlobalBolt should be 12 (11 bolts completed + 1)
    expect(expectedGlobalBolt).toBe(12);
  });

  test('bolt number is correct after auto-advance to second tieMatchUp', async ({ page }) => {
    // Simpler smoke test: score through MS1 (2 bolts) and verify MS2 starts at bolt 3
    const archive = new ArchivePage(page);
    await archive.createIntennseDemo({ boltMinutes: 1 });

    const scorecard = new ScorecardPage(page);
    await scorecard.expectVisible();
    await scorecard.clickTieMatchUp(0);

    const bolt = new BoltScoringPage(page);
    await bolt.expectVisible();
    await bolt.handleCoinToss(1);

    // Bolt 1
    expect(await bolt.getBoltLabel()).toBe('BOLT 1');
    await scoreOneBolt(bolt);
    await waitAndExpireBreakClock(page);

    // Bolt 2
    expect(await bolt.getBoltLabel()).toBe('BOLT 2');
    await scoreOneBolt(bolt);

    // Break before auto-advance to MS2
    const breakLabel = await page.locator(S.BREAK_LABEL).textContent();
    expect(breakLabel?.trim()).toBe('Next match starting...');

    await waitAndExpireBreakClock(page);
    await bolt.expectVisible();
    await page.waitForTimeout(300);

    // Should be bolt 3 on the new tieMatchUp
    expect(await bolt.getBoltLabel()).toBe('BOLT 3');
  });

  test('break clock is visible between bolts within same tieMatchUp', async ({ page }) => {
    const archive = new ArchivePage(page);
    await archive.createIntennseDemo({ boltMinutes: 1 });

    const scorecard = new ScorecardPage(page);
    await scorecard.expectVisible();
    await scorecard.clickTieMatchUp(0);

    const bolt = new BoltScoringPage(page);
    await bolt.expectVisible();
    await bolt.handleCoinToss(1);

    // Score bolt 1
    await scoreOneBolt(bolt);

    // Break should be visible with "Next bolt starting..." label
    await page.waitForSelector(S.BREAK_LABEL, { timeout: 5_000 });
    const label = await page.locator(S.BREAK_LABEL).textContent();
    expect(label?.trim()).toBe('Next bolt starting...');

    // Break clock should be running
    const clockSnapshot = await page.evaluate(() => globalThis['dev'].getClockSnapshot('breakTimer'));
    expect(clockSnapshot).toBeTruthy();
    expect(clockSnapshot.state).toBe('running');
  });
});

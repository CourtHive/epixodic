import { resetAppState, waitForApp } from '../helpers/app-bridge';
import { BoltScoringPage } from '../pages/BoltScoringPage';
import { ScorecardPage } from '../pages/ScorecardPage';
import { ArchivePage } from '../pages/ArchivePage';
import { test, expect } from '@playwright/test';

test.describe('Journey 6 — Aggregate score across tieMatchUps', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#/archive');
    await waitForApp(page);
    await resetAppState(page);
  });

  test('scoring in MS and returning to scorecard shows updated aggregate', async ({ page }) => {
    const archive = new ArchivePage(page);
    await archive.goto();
    await archive.createIntennseDemo({ boltMinutes: 1 });

    const scorecard = new ScorecardPage(page);
    await scorecard.expectVisible();

    // Navigate to first tieMatchUp (MS)
    await scorecard.clickTieMatchUp(0);

    const bolt = new BoltScoringPage(page);
    await bolt.expectVisible();
    await bolt.handleCoinToss(1);
    await bolt.startBolt();

    // Score several points for side 0
    await bolt.scoreWinner(0); // 2-0
    await bolt.scoreWinner(0); // 4-0
    await bolt.scoreTouch(0); // 5-0

    // Navigate back to scorecard
    await bolt.goBackToScorecard();

    // Should be back on the scorecard
    await scorecard.expectVisible();

    // Header aggregate scores should reflect the 5 points scored
    const scores = await scorecard.getHeaderScores();
    // Side 1 should have points > 0
    expect(scores.length).toBeGreaterThan(0);
    const numericScores = scores.map((s) => Number.parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n));
    expect(numericScores.some((s) => s > 0)).toBeTruthy();
  });

  test('scoring in two tieMatchUps shows cumulative aggregate', async ({ page }) => {
    const archive = new ArchivePage(page);
    await archive.goto();
    await archive.createIntennseDemo({ boltMinutes: 1 });

    const scorecard = new ScorecardPage(page);
    await scorecard.expectVisible();

    // Score in MS
    await scorecard.clickTieMatchUp(0);
    let bolt = new BoltScoringPage(page);
    await bolt.expectVisible();
    await bolt.handleCoinToss(1);
    await bolt.startBolt();
    await bolt.scoreWinner(0); // 2 points for side 1
    await bolt.goBackToScorecard();
    await scorecard.expectVisible();

    // Score in WS (the demo's second tieMatchUp)
    await scorecard.clickTieMatchUp(1);
    bolt = new BoltScoringPage(page);
    await bolt.expectVisible();
    // No coin toss for second tieMatchUp (team already has history)
    await bolt.startBolt();
    await bolt.scoreWinner(1); // 2 points for side 2
    await bolt.goBackToScorecard();
    await scorecard.expectVisible();

    // Both sides should have non-zero aggregate
    const scores = await scorecard.getHeaderScores();
    const numericScores = scores.map((s) => Number.parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n));
    // Should have at least two non-zero scores (one per side)
    expect(numericScores.filter((s) => s > 0).length).toBeGreaterThanOrEqual(2);
  });

  test('ARC score on bolt page reflects other tieMatchUp scores', async ({ page }) => {
    const archive = new ArchivePage(page);
    await archive.goto();
    await archive.createIntennseDemo({ boltMinutes: 1 });

    const scorecard = new ScorecardPage(page);
    await scorecard.expectVisible();

    // Score in MS
    await scorecard.clickTieMatchUp(0);
    let bolt = new BoltScoringPage(page);
    await bolt.expectVisible();
    await bolt.handleCoinToss(1);
    await bolt.startBolt();
    await bolt.scoreWinner(0); // 2 points
    await bolt.scoreWinner(0); // 4 points
    await bolt.goBackToScorecard();
    await scorecard.expectVisible();

    // Navigate to WS — the ARC includes the base score from MS
    await scorecard.clickTieMatchUp(1);
    bolt = new BoltScoringPage(page);
    await bolt.expectVisible();

    // ARC score should be non-zero (carries over from MS)
    const arcText = await bolt.getArcScore();
    // The ARC text contains both side scores, e.g. "4–0"
    expect(arcText).toBeTruthy();
    // At least one side should have points from MS
    const hasNonZero = arcText.split(/[–-]/).some((s) => Number.parseInt(s.trim(), 10) > 0);
    expect(hasNonZero).toBeTruthy();
    // The BOLT row is this tieMatchUp's current bolt only: nothing has been scored in it yet
    expect(await bolt.getBoltCompactScore()).toBe('0–0');
  });
});

import { test, expect } from '@playwright/test';
import { ArchivePage } from '../pages/ArchivePage';
import { ScorecardPage } from '../pages/ScorecardPage';
import { BoltScoringPage } from '../pages/BoltScoringPage';
import { resetAppState, waitForApp, getScoringState } from '../helpers/app-bridge';

/**
 * INTENNSE scoring semantics:
 * - Winner(side): that side wins 2 points
 * - Touch(side): that side "touched" the ball (lost the rally) → opponent gets 1 point
 * - Ace(auto): server wins 2 points
 * - Fault(auto): opponent of server wins the point
 * - Forced/Unforced Error(side): that side made the error → opponent gets the point
 */

test.describe('Journey 2 — Player selection, coin toss, scoring', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#/archive');
    await waitForApp(page);
    await resetAppState(page);
  });

  test('tapping a tieMatchUp card navigates to bolt scoring', async ({ page }) => {
    const archive = new ArchivePage(page);
    await archive.goto();
    await archive.createIntennseDemo({ boltMinutes: 1 });

    const scorecard = new ScorecardPage(page);
    await scorecard.expectVisible();
    await scorecard.clickTieMatchUp(0);

    await expect(page).toHaveURL(/\/#\/bolt\//);

    const bolt = new BoltScoringPage(page);
    await bolt.expectVisible();
  });

  test('coin toss modal appears for first tieMatchUp', async ({ page }) => {
    const archive = new ArchivePage(page);
    await archive.goto();
    await archive.createIntennseDemo({ boltMinutes: 1 });

    const scorecard = new ScorecardPage(page);
    await scorecard.expectVisible();
    await scorecard.clickTieMatchUp(0);

    const bolt = new BoltScoringPage(page);
    await bolt.expectVisible();
    await expect(bolt.coinTossModal).toBeVisible({ timeout: 5_000 });
  });

  test('choosing a side in coin toss dismisses modal', async ({ page }) => {
    const archive = new ArchivePage(page);
    await archive.goto();
    await archive.createIntennseDemo({ boltMinutes: 1 });

    const scorecard = new ScorecardPage(page);
    await scorecard.expectVisible();
    await scorecard.clickTieMatchUp(0);

    const bolt = new BoltScoringPage(page);
    await bolt.expectVisible();
    await bolt.handleCoinToss(1);
    await expect(bolt.coinTossModal).not.toBeVisible();
  });

  test('bolt starts with play button and shows 0-0 score', async ({ page }) => {
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

    const scores = await bolt.getBoltScores();
    expect(scores[0]).toBe('0');
    expect(scores[1]).toBe('0');
  });

  test('scoring a winner awards 2 points to the chosen side', async ({ page }) => {
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

    // Winner(0) → side 0 gets 2 points
    await bolt.scoreWinner(0);
    await bolt.expectBoltScores('2', '0');
  });

  test('touch means pressing side touched — opponent gets 1 point', async ({ page }) => {
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

    // Touch(0) → side 0 touched the ball, opponent (side 1) gets 1 point
    await bolt.scoreTouch(0);
    await bolt.expectBoltScores('0', '1');
  });

  test('winner then touch produces correct cumulative score', async ({ page }) => {
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

    // Winner(0) → side 0 gets 2 points → 2-0
    await bolt.scoreWinner(0);
    await bolt.expectBoltScores('2', '0');

    // Touch(0) → side 0 touched, opponent (side 1) gets 1 → 2-1
    await bolt.scoreTouch(0);
    await bolt.expectBoltScores('2', '1');
  });

  test('undo reverts a winner back to 0-0', async ({ page }) => {
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

    await bolt.scoreWinner(0);
    await bolt.expectBoltScores('2', '0');

    // Undo reverts the winner
    await bolt.undo();
    await bolt.expectBoltScores('0', '0');
  });

  test('redo restores an undone winner', async ({ page }) => {
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

    await bolt.scoreWinner(0);
    await bolt.undo();
    await bolt.expectBoltScores('0', '0');

    // Redo restores the winner
    await bolt.redo();
    await bolt.expectBoltScores('2', '0');
  });

  test('dev API reflects scoring state after points', async ({ page }) => {
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

    await bolt.scoreWinner(0);
    await bolt.scoreTouch(0);

    const state = await getScoringState(page);
    expect(state).toBeTruthy();
    expect(state.pointCount).toBe(2);
  });
});

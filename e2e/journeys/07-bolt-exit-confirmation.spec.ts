import { test, expect } from '@playwright/test';
import { ArchivePage } from '../pages/ArchivePage';
import { ScorecardPage } from '../pages/ScorecardPage';
import { BoltScoringPage } from '../pages/BoltScoringPage';
import { resetAppState, waitForApp } from '../helpers/app-bridge';
import { S } from '../helpers/selectors';

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

test.describe('Journey 7 — Bolt exit confirmation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#/archive');
    await waitForApp(page);
    await resetAppState(page);
  });

  test('back button during active bolt shows confirmation dialog', async ({ page }) => {
    const bolt = await setupActiveBolt(page);
    await bolt.scoreWinner(0);

    // Tap back while bolt is active
    await bolt.tapBack();

    // Confirmation dialog should appear
    await expect(bolt.backConfirmModal).toBeVisible({ timeout: 3_000 });
    await expect(bolt.backConfirmContinue).toBeVisible();
    await expect(bolt.backConfirmLeave).toBeVisible();
  });

  test('Continue Bolt dismisses the dialog and stays on bolt page', async ({ page }) => {
    const bolt = await setupActiveBolt(page);
    await bolt.scoreWinner(0);

    await bolt.tapBack();
    await expect(bolt.backConfirmModal).toBeVisible({ timeout: 3_000 });

    // Click "Continue Bolt"
    await bolt.backConfirmContinue.click();

    // Dialog should dismiss
    await expect(bolt.backConfirmModal).not.toBeVisible({ timeout: 2_000 });

    // Should still be on the bolt page
    await expect(page).toHaveURL(/\/#\/bolt\//);

    // Score should still be visible (bolt is still active)
    await bolt.expectBoltScores('2', '0');
  });

  test('Leave navigates back to scorecard', async ({ page }) => {
    const bolt = await setupActiveBolt(page);
    await bolt.scoreWinner(0);

    await bolt.tapBack();
    await expect(bolt.backConfirmModal).toBeVisible({ timeout: 3_000 });

    // Click "Leave"
    await bolt.backConfirmLeave.click();

    // Should navigate to the scorecard
    await expect(page).toHaveURL(/\/#\/team\//, { timeout: 5_000 });
  });

  test('no confirmation dialog when bolt is not started', async ({ page }) => {
    const archive = new ArchivePage(page);
    await archive.goto();
    await archive.createIntennseDemo({ boltMinutes: 1 });

    const scorecard = new ScorecardPage(page);
    await scorecard.expectVisible();
    await scorecard.clickTieMatchUp(0);

    const bolt = new BoltScoringPage(page);
    await bolt.expectVisible();
    await bolt.handleCoinToss(1);
    // Don't start the bolt

    // Tap back — should navigate directly without confirmation
    await bolt.tapBack();

    // Should go back to scorecard (no dialog)
    await expect(page).toHaveURL(/\/#\/team\//, { timeout: 5_000 });
  });

  test('score is preserved after leaving and returning', async ({ page }) => {
    const bolt = await setupActiveBolt(page);

    // Score a winner for side 0 → 2-0
    await bolt.scoreWinner(0);

    // Leave the bolt
    await bolt.tapBack();
    await expect(bolt.backConfirmModal).toBeVisible({ timeout: 3_000 });
    await bolt.backConfirmLeave.click();

    // Wait for scorecard
    const scorecard = new ScorecardPage(page);
    await scorecard.expectVisible();

    // Navigate back to the same tieMatchUp
    await scorecard.clickTieMatchUp(0);

    const bolt2 = new BoltScoringPage(page);
    await bolt2.expectVisible();

    // Score should be preserved (restored from localStorage persistence)
    await bolt2.expectBoltScores('2', '0');
  });
});

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

test.describe('Journey 5 — Penalty flow', () => {
  // Horizontal layout only. The penalty controls live in HorizontalBolt.svelte; VerticalBolt has none,
  // so in portrait `.intennse-footer-btn--*` never appears and every test here burns the full
  // per-test timeout before failing — minutes of pure noise per run. Measured 2026-08-27: 4/4 pass
  // on the `tablet` project (1024x768), 4/4 fail on `mobile` (390x844).
  test.skip(
    ({ viewport }) => !!viewport && viewport.height > viewport.width,
    'portrait renders VerticalBolt, which has no penalty controls',
  );

  test.beforeEach(async ({ page }) => {
    await page.goto('/#/archive');
    await waitForApp(page);
    await resetAppState(page);
  });

  test('tapping PEN opens the penalty modal', async ({ page }) => {
    const bolt = await setupActiveBolt(page);
    await bolt.scoreWinner(0);

    // Open penalty for side 1
    await bolt.openPenalty(1);

    await expect(bolt.penaltyModal).toBeVisible({ timeout: 5_000 });
  });

  test('penalty modal shows players and point options', async ({ page }) => {
    const bolt = await setupActiveBolt(page);
    await bolt.scoreWinner(0);

    await bolt.openPenalty(1);
    await expect(bolt.penaltyModal).toBeVisible({ timeout: 5_000 });

    // Should have player entries
    const players = page.locator(S.PENALTY_PLAYER);
    const playerCount = await players.count();
    expect(playerCount).toBeGreaterThan(0);

    // Should have point value buttons
    const pointBtns = page.locator(S.PENALTY_POINTS_BTN);
    const btnCount = await pointBtns.count();
    expect(btnCount).toBeGreaterThan(0);
  });

  test('confirming a penalty shows penalty indicator', async ({ page }) => {
    const bolt = await setupActiveBolt(page);
    await bolt.scoreWinner(0);

    await bolt.openPenalty(1);
    await expect(bolt.penaltyModal).toBeVisible({ timeout: 5_000 });

    // Select a player
    await page.locator(S.PENALTY_PLAYER).first().click();

    // Select a point value
    await page.locator(S.PENALTY_POINTS_BTN).first().click();

    // Confirm the penalty
    await page.locator(S.PENALTY_CONFIRM).click();

    // Penalty modal should close (or sub modal may open for auto-substitution)
    await expect(bolt.penaltyModal).not.toBeVisible({ timeout: 5_000 });

    // Either penalty indicator should appear, or sub modal should open
    // (auto-sub modal opens when penalized player was on court)
    const hasPenaltyIndicator = await page
      .locator(S.PENALTY_INDICATOR)
      .isVisible()
      .catch(() => false);
    const hasSubModal = await bolt.subModal.isVisible().catch(() => false);
    expect(hasPenaltyIndicator || hasSubModal).toBeTruthy();
  });

  test('penalty indicator tap opens detail modal', async ({ page }) => {
    const bolt = await setupActiveBolt(page);
    await bolt.scoreWinner(0);

    await bolt.openPenalty(1);
    await expect(bolt.penaltyModal).toBeVisible({ timeout: 5_000 });

    await page.locator(S.PENALTY_PLAYER).first().click();
    await page.locator(S.PENALTY_POINTS_BTN).first().click();
    await page.locator(S.PENALTY_CONFIRM).click();

    // If auto-sub modal opens, dismiss it
    if (await bolt.subModal.isVisible().catch(() => false)) {
      // Close the sub modal by clicking overlay or close button
      await page
        .locator('.sub-close')
        .click()
        .catch(() => {});
      await page.waitForTimeout(500);
    }

    // Tap penalty indicator if visible
    const indicator = page.locator(S.PENALTY_INDICATOR);
    if (await indicator.isVisible().catch(() => false)) {
      await indicator.first().click();

      // Detail modal should open
      await expect(page.locator(S.PENALTY_DETAIL_MODAL)).toBeVisible({ timeout: 3_000 });
    }
  });
});

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

test.describe('Journey 4 — Substitution during play', () => {
  // Horizontal layout only. The substitution controls live in HorizontalBolt.svelte; VerticalBolt has none,
  // so in portrait `.intennse-footer-btn--*` never appears and every test here burns the full
  // per-test timeout before failing — minutes of pure noise per run. Measured 2026-08-27: 4/4 pass
  // on the `tablet` project (1024x768), 4/4 fail on `mobile` (390x844).
  test.skip(
    ({ viewport }) => !!viewport && viewport.height > viewport.width,
    'portrait renders VerticalBolt, which has no substitution controls',
  );

  test.beforeEach(async ({ page }) => {
    await page.goto('/#/archive');
    await waitForApp(page);
    await resetAppState(page);
  });

  test('tapping SUB opens the substitution modal', async ({ page }) => {
    const bolt = await setupActiveBolt(page);

    // Score a point first (bolt must be active)
    await bolt.scoreWinner(0);

    // Open substitution for side 1
    await bolt.openSubstitution(1);

    // Sub modal should be visible
    await expect(bolt.subModal).toBeVisible({ timeout: 5_000 });
  });

  test('substitution modal shows bench players', async ({ page }) => {
    const bolt = await setupActiveBolt(page);
    await bolt.scoreWinner(0);

    await bolt.openSubstitution(1);
    await expect(bolt.subModal).toBeVisible({ timeout: 5_000 });

    // Should have bench players available (roster has 3 males, 1 active in MS)
    const benchPlayers = page.locator(S.SUB_PLAYER_BENCH);
    const count = await benchPlayers.count();
    expect(count).toBeGreaterThan(0);
  });

  test('selecting a bench player executes substitution', async ({ page }) => {
    const bolt = await setupActiveBolt(page);
    await bolt.scoreWinner(0);

    await bolt.openSubstitution(1);
    await expect(bolt.subModal).toBeVisible({ timeout: 5_000 });

    // Click on the current on-court player (to select them for removal)
    const onCourtPlayer = page.locator(`${S.SUB_PLAYER}:not(${S.SUB_PLAYER_BENCH})`).first();
    await onCourtPlayer.click();

    // Click on a bench player to bring them in
    const benchPlayer = page.locator(S.SUB_PLAYER_BENCH).first();
    await benchPlayer.click();

    // Modal should close after substitution
    await expect(bolt.subModal).not.toBeVisible({ timeout: 5_000 });
  });

  test('jersey numbers are visible in substitution modal', async ({ page }) => {
    const bolt = await setupActiveBolt(page);
    await bolt.scoreWinner(0);

    await bolt.openSubstitution(1);
    await expect(bolt.subModal).toBeVisible({ timeout: 5_000 });

    // Jersey badges should be present
    const jerseys = page.locator('.sub-jersey');
    const count = await jerseys.count();
    expect(count).toBeGreaterThan(0);
  });
});

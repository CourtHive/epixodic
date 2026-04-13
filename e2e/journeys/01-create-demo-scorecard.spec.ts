import { test, expect } from '@playwright/test';
import { ArchivePage } from '../pages/ArchivePage';
import { ScorecardPage } from '../pages/ScorecardPage';
import { resetAppState, waitForApp, getTeamMatchUp } from '../helpers/app-bridge';

test.describe('Journey 1 — Create INTENNSE demo and navigate to scorecard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#/archive');
    await waitForApp(page);
    await resetAppState(page);
  });

  test('archive page shows INTENNSE Demo button', async ({ page }) => {
    const archive = new ArchivePage(page);
    await archive.goto();
    await expect(archive.intennseBtn).toBeVisible();
  });

  test('clicking INTENNSE Demo opens config modal', async ({ page }) => {
    const archive = new ArchivePage(page);
    await archive.goto();
    await archive.openIntennseConfig();
    await expect(archive.configModal).toBeVisible();
    await expect(archive.configTeam1).toHaveValue('The Authentics');
    await expect(archive.configTeam2).toHaveValue('Cauldron');
  });

  test('config modal allows custom team names and bolt duration', async ({ page }) => {
    const archive = new ArchivePage(page);
    await archive.goto();
    await archive.openIntennseConfig();
    await archive.fillConfig({
      team1Name: 'Alpha Squad',
      team2Name: 'Beta Force',
      boltMinutes: 2,
    });
    await expect(archive.configTeam1).toHaveValue('Alpha Squad');
    await expect(archive.configTeam2).toHaveValue('Beta Force');
  });

  test('creating demo navigates to scorecard with team names', async ({ page }) => {
    const archive = new ArchivePage(page);
    await archive.goto();
    await archive.createIntennseDemo({
      team1Name: 'Test Team A',
      team2Name: 'Test Team B',
      boltMinutes: 1,
    });

    const scorecard = new ScorecardPage(page);
    await scorecard.expectVisible();

    // Verify we navigated to the team scorecard route
    await expect(page).toHaveURL(/\/#\/team\//);
  });

  test('scorecard renders 7 tieMatchUp cards for standard INTENNSE format', async ({ page }) => {
    const archive = new ArchivePage(page);
    await archive.goto();
    await archive.createIntennseDemo({ boltMinutes: 1 });

    const scorecard = new ScorecardPage(page);
    await scorecard.expectVisible();

    // Standard INTENNSE: 2MS + 2WS + 1MD + 1WD + 1XD = 7
    const count = await scorecard.getTieMatchUpCount();
    expect(count).toBe(7);
  });

  test('scorecard header shows initial score of 0 vs 0', async ({ page }) => {
    const archive = new ArchivePage(page);
    await archive.goto();
    await archive.createIntennseDemo({ boltMinutes: 1 });

    const scorecard = new ScorecardPage(page);
    await scorecard.expectVisible();

    const scores = await scorecard.getHeaderScores();
    // Both sides should show 0
    expect(scores.some((s) => s.includes('0'))).toBeTruthy();
  });

  test('dev API has team matchUp loaded after demo creation', async ({ page }) => {
    const archive = new ArchivePage(page);
    await archive.goto();
    await archive.createIntennseDemo({
      team1Name: 'Dev API Team',
      boltMinutes: 1,
    });

    const matchUp = await getTeamMatchUp(page);
    expect(matchUp).toBeTruthy();
    expect(matchUp.matchUpType).toBe('TEAM');
    expect(matchUp.tieMatchUps).toHaveLength(7);
    expect(matchUp.sides[0].participant.participantName).toBe('Dev API Team');
  });
});

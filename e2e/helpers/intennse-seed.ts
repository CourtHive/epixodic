import { Page } from '@playwright/test';
import { waitForApp } from './app-bridge';

/**
 * Seed an INTENNSE demo matchUp by driving the UI flow:
 * Archive → [+ INTENNSE Demo] → Config modal → Create
 *
 * Returns the matchUpId of the created team matchUp.
 */
export async function seedIntennseDemo(
  page: Page,
  options: {
    team1Name?: string;
    team2Name?: string;
    boltMinutes?: number;
    assignParticipants?: boolean;
  } = {},
) {
  const {
    team1Name = 'The Authentics',
    team2Name = 'Cauldron',
    boltMinutes = 1,
    assignParticipants = true,
  } = options;

  // Navigate to archive
  await page.goto('/#/archive');
  await waitForApp(page);

  // Click "+ INTENNSE Demo" button
  await page.getByText('+ INTENNSE Demo').click();

  // Wait for config modal
  await page.waitForSelector('.icm-modal', { timeout: 5_000 });

  // Fill team names
  const team1Input = page.locator('#icm-team1');
  await team1Input.clear();
  await team1Input.fill(team1Name);

  const team2Input = page.locator('#icm-team2');
  await team2Input.clear();
  await team2Input.fill(team2Name);

  // Set bolt duration
  await page.locator('#icm-bolt').selectOption(String(boltMinutes));

  // Set assign participants checkbox
  const checkbox = page.locator('#icm-assign');
  const isChecked = await checkbox.isChecked();
  if (isChecked !== assignParticipants) {
    await checkbox.click();
  }

  // Click "Create Demo"
  await page.locator('.icm-confirm').click();

  // Wait for scorecard to render (navigation happens after creation)
  await page.waitForSelector('.team-scorecard', { timeout: 10_000 });

  // Return the matchUpId from the dev API
  const matchUpId = await page.evaluate(() => globalThis['dev'].teamMatchUp?.matchUpId);
  return matchUpId as string;
}

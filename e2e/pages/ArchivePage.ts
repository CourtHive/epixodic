import { Page, Locator, expect } from '@playwright/test';
import { S } from '../helpers/selectors';
import { waitForApp } from '../helpers/app-bridge';

/**
 * Page Object Model for the Archive page (matchUp list / landing).
 */
export class ArchivePage {
  readonly page: Page;
  readonly intennseBtn: Locator;
  readonly newMatchBtn: Locator;
  readonly configModal: Locator;
  readonly configTeam1: Locator;
  readonly configTeam2: Locator;
  readonly configBoltDuration: Locator;
  readonly configAssign: Locator;
  readonly configConfirm: Locator;

  constructor(page: Page) {
    this.page = page;
    this.intennseBtn = page.getByText('+ INTENNSE Demo');
    this.newMatchBtn = page.getByText('+ New Match');
    this.configModal = page.locator(S.CONFIG_MODAL);
    this.configTeam1 = page.locator(S.CONFIG_TEAM1);
    this.configTeam2 = page.locator(S.CONFIG_TEAM2);
    this.configBoltDuration = page.locator(S.CONFIG_BOLT_DURATION);
    this.configAssign = page.locator(S.CONFIG_ASSIGN);
    this.configConfirm = page.locator(S.CONFIG_CONFIRM);
  }

  async goto() {
    await this.page.goto('/#/archive');
    await waitForApp(this.page);
  }

  async openIntennseConfig() {
    await this.intennseBtn.click();
    await expect(this.configModal).toBeVisible({ timeout: 5_000 });
  }

  async fillConfig(options: {
    team1Name?: string;
    team2Name?: string;
    boltMinutes?: number;
    assignParticipants?: boolean;
  } = {}) {
    const {
      team1Name = 'The Authentics',
      team2Name = 'Cauldron',
      boltMinutes = 1,
      assignParticipants = true,
    } = options;

    await this.configTeam1.clear();
    await this.configTeam1.fill(team1Name);
    await this.configTeam2.clear();
    await this.configTeam2.fill(team2Name);
    await this.configBoltDuration.selectOption(String(boltMinutes));

    const isChecked = await this.configAssign.isChecked();
    if (isChecked !== assignParticipants) {
      await this.configAssign.click();
    }
  }

  async createDemo() {
    await this.configConfirm.click();
  }

  /** Full flow: open config → fill → create → wait for scorecard */
  async createIntennseDemo(options: {
    team1Name?: string;
    team2Name?: string;
    boltMinutes?: number;
    assignParticipants?: boolean;
  } = {}) {
    await this.openIntennseConfig();
    await this.fillConfig(options);
    await this.createDemo();
    // Wait for navigation to scorecard
    await this.page.waitForSelector('.team-scorecard', { timeout: 10_000 });
  }
}

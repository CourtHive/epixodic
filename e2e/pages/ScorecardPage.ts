import { Page, Locator, expect } from '@playwright/test';
import { S } from '../helpers/selectors';

/**
 * Page Object Model for the Team Scorecard page.
 * The scorecard is rendered by courthive-components' `renderScorecard` inside
 * a `.team-scorecard` wrapper. The rendered DOM uses `.chc-scorecard-*` classes.
 */
export class ScorecardPage {
  readonly page: Page;
  readonly scorecard: Locator;
  readonly headerScores: Locator;
  readonly sideNames: Locator;
  readonly tieMatchUpCards: Locator;

  constructor(page: Page) {
    this.page = page;
    this.scorecard = page.locator(S.SCORECARD);
    this.headerScores = page.locator(S.SCORECARD_HEADER_SCORE);
    this.sideNames = page.locator(S.SCORECARD_SIDE_NAME);
    this.tieMatchUpCards = page.locator(S.TIE_MATCHUP_CARD);
  }

  async expectVisible() {
    await expect(this.scorecard).toBeVisible({ timeout: 10_000 });
  }

  async getTieMatchUpCount() {
    return this.tieMatchUpCards.count();
  }

  async getHeaderScores() {
    const scores = await this.headerScores.allTextContents();
    return scores;
  }

  /** Click on a tieMatchUp card by its index (0-based) */
  async clickTieMatchUp(index: number) {
    await this.tieMatchUpCards.nth(index).click();
  }

  /** Click on a tieMatchUp card containing specific text */
  async clickTieMatchUpByText(text: string) {
    await this.tieMatchUpCards.filter({ hasText: text }).first().click();
  }

  /** Wait for the scorecard to show a specific aggregate score */
  async expectAggregateScores(side1: string, side2: string) {
    const scores = this.headerScores;
    await expect(scores.first()).toContainText(side1);
    await expect(scores.last()).toContainText(side2);
  }
}

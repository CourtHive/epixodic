import { Page, Locator, expect } from '@playwright/test';
import { S } from '../helpers/selectors';

/**
 * Page Object Model for the INTENNSE Bolt Scoring page.
 *
 * Scoring interaction model (vertical layout):
 * 1. Tap an action button (Winner, Touch, Forced, Unforced) → enters "pending" state
 * 2. Tap a side on the score panel to award points to that side
 * Exception: Ace and Fault auto-attribute to server — no side selection needed.
 */
export class BoltScoringPage {
  readonly page: Page;

  // Outcome buttons
  readonly btnWinner: Locator;
  readonly btnTouch: Locator;
  readonly btnAce: Locator;
  readonly btnFault: Locator;
  readonly btnForced: Locator;
  readonly btnUnforced: Locator;

  // Score side tap targets
  readonly scoreSide0: Locator;
  readonly scoreSide1: Locator;

  // Controls
  readonly btnPlay: Locator;
  readonly btnBack: Locator;

  // Score display
  readonly boltScoreSide1: Locator;
  readonly boltScoreSide2: Locator;
  readonly arcScore: Locator;

  // Modals
  readonly coinTossModal: Locator;
  readonly playerSelectModal: Locator;
  readonly subModal: Locator;
  readonly penaltyModal: Locator;

  // Back confirm
  readonly backConfirmModal: Locator;
  readonly backConfirmContinue: Locator;
  readonly backConfirmLeave: Locator;

  // Break overlay
  readonly breakOverlay: Locator;
  readonly breakAdjustBtns: Locator;

  // Player panel
  readonly playerSlots: Locator;
  readonly jerseyBadges: Locator;

  // Footer
  readonly btnSub: Locator;
  readonly btnTimeout: Locator;
  readonly btnPenalty: Locator;

  constructor(page: Page) {
    this.page = page;

    this.btnWinner = page.locator(S.BTN_WINNER);
    this.btnTouch = page.locator(S.BTN_TOUCH);
    this.btnAce = page.locator(S.BTN_ACE);
    this.btnFault = page.locator(S.BTN_FAULT);
    this.btnForced = page.locator(S.BTN_FORCED);
    this.btnUnforced = page.locator(S.BTN_UNFORCED);

    this.scoreSide0 = page.locator('.iv-score-side').nth(0);
    this.scoreSide1 = page.locator('.iv-score-side').nth(1);

    this.btnPlay = page.locator(S.BTN_PLAY);
    this.btnBack = page.locator(S.BTN_BACK);

    this.boltScoreSide1 = page.locator('.iv-score-value').nth(0);
    this.boltScoreSide2 = page.locator('.iv-score-value').nth(1);
    this.arcScore = page.locator(S.ARC_SCORE);

    this.coinTossModal = page.locator(S.COIN_TOSS_MODAL);
    this.playerSelectModal = page.locator(S.PLAYER_SELECT_MODAL);
    this.subModal = page.locator(S.SUB_MODAL);
    this.penaltyModal = page.locator(S.PENALTY_MODAL);

    this.backConfirmModal = page.locator(S.BACK_CONFIRM_MODAL);
    this.backConfirmContinue = page.locator(S.BACK_CONFIRM_CONTINUE);
    this.backConfirmLeave = page.locator(S.BACK_CONFIRM_LEAVE);

    this.breakOverlay = page.locator(S.BREAK_OVERLAY);
    this.breakAdjustBtns = page.locator(S.BREAK_ADJUST_BTN);

    this.playerSlots = page.locator(S.PLAYER_SLOT);
    this.jerseyBadges = page.locator(S.JERSEY_BADGE);

    this.btnSub = page.locator(S.BTN_SUB);
    this.btnTimeout = page.locator(S.BTN_TIMEOUT);
    this.btnPenalty = page.locator(S.BTN_PENALTY);
  }

  /** Wait for the bolt scoring page to be visible */
  async expectVisible() {
    await this.page.waitForSelector(
      `${S.VERTICAL_LAYOUT}, ${S.HORIZONTAL_LAYOUT}`,
      { timeout: 10_000 },
    );
  }

  /** Handle the player select modal if it appears (for unassigned participants) */
  async handlePlayerSelectIfVisible(timeout = 3_000) {
    try {
      await this.playerSelectModal.waitFor({ state: 'visible', timeout });
      await this.page.locator(S.PLAYER_SELECT_PLAYER).first().click();
      await this.page.waitForTimeout(500);
      if (await this.playerSelectModal.isVisible()) {
        await this.page.locator(S.PLAYER_SELECT_PLAYER).first().click();
      }
    } catch {
      // No player select needed
    }
  }

  /** Handle the coin toss modal by choosing a side directly */
  async handleCoinToss(chooseSide: 1 | 2 = 1) {
    await expect(this.coinTossModal).toBeVisible({ timeout: 5_000 });
    const sideSelector = chooseSide === 1 ? S.COIN_SIDE1 : S.COIN_SIDE2;
    await this.page.locator(sideSelector).click();
    await expect(this.coinTossModal).not.toBeVisible({ timeout: 3_000 });
  }

  /** Start the bolt (tap play button) */
  async startBolt() {
    await this.btnPlay.click();
  }

  // ── Scoring: two-step (tap action, then tap side) ──
  // After tapping an action button, the side buttons become enabled
  // (disabled={!pendingAction}). We wait for the side to be enabled.

  private async tapActionThenSide(actionBtn: Locator, side: 0 | 1) {
    await actionBtn.click();
    const sideBtn = side === 0 ? this.scoreSide0 : this.scoreSide1;
    // Wait for the side button to be enabled (pending action set)
    await sideBtn.waitFor({ state: 'attached' });
    await expect(sideBtn).toBeEnabled({ timeout: 2_000 });
    await sideBtn.click();
  }

  /** Score a winner for a specific side (0 = left/side1, 1 = right/side2) */
  async scoreWinner(side: 0 | 1) {
    await this.tapActionThenSide(this.btnWinner, side);
  }

  /** Score a touch for a specific side */
  async scoreTouch(side: 0 | 1) {
    await this.tapActionThenSide(this.btnTouch, side);
  }

  /** Score a forced error for a specific side */
  async scoreForcedError(side: 0 | 1) {
    await this.tapActionThenSide(this.btnForced, side);
  }

  /** Score an unforced error for a specific side */
  async scoreUnforcedError(side: 0 | 1) {
    await this.tapActionThenSide(this.btnUnforced, side);
  }

  /** Score an ace (auto-attributed to server, no side selection) */
  async scoreAce() {
    await this.btnAce.click();
  }

  /** Score a fault (auto-attributed to server, no side selection) */
  async scoreFault() {
    await this.btnFault.click();
  }

  // ── Controls ──

  /** Undo the last action via the dev API (Svelte 5 event delegation prevents Playwright click) */
  async undo() {
    await this.page.evaluate(() => globalThis['dev'].undo());
    await this.page.waitForTimeout(100);
  }

  /** Redo the last undone action via the dev API */
  async redo() {
    await this.page.evaluate(() => globalThis['dev'].redo());
    await this.page.waitForTimeout(100);
  }

  /** Get bolt score values as [side1, side2] */
  async getBoltScores(): Promise<[string, string]> {
    const s1 = await this.boltScoreSide1.textContent() ?? '0';
    const s2 = await this.boltScoreSide2.textContent() ?? '0';
    return [s1.trim(), s2.trim()];
  }

  /** Assert bolt scores match expected values */
  async expectBoltScores(side1: string, side2: string) {
    await expect(this.boltScoreSide1).toHaveText(side1);
    await expect(this.boltScoreSide2).toHaveText(side2);
  }

  /** Get ARC (aggregate) score text */
  async getArcScore(): Promise<string> {
    return (await this.arcScore.textContent() ?? '').trim();
  }

  /** Get the bolt label text (e.g. "BOLT 3") */
  async getBoltLabel(): Promise<string> {
    return (await this.page.locator(S.BOLT_LABEL).textContent() ?? '').trim();
  }

  // ── Navigation ──

  /** Tap the back button */
  async tapBack() {
    await this.btnBack.click();
  }

  /** Navigate back — handles the confirmation dialog if bolt is active */
  async goBackToScorecard() {
    await this.btnBack.click();
    // If back confirm appears, click Leave
    try {
      await this.backConfirmLeave.waitFor({ state: 'visible', timeout: 2_000 });
      await this.backConfirmLeave.click();
    } catch {
      // No confirm dialog — direct navigation
    }
  }

  /** Open substitution modal for a side (1 or 2) */
  async openSubstitution(side: 1 | 2) {
    // SUB buttons are ordered: SUB 1, SUB 2
    const index = side - 1;
    await this.btnSub.nth(index).click();
  }

  /** Open penalty modal for a side (1 or 2) */
  async openPenalty(side: 1 | 2) {
    const index = side - 1;
    await this.btnPenalty.nth(index).click();
  }

  /** Award break points to a side */
  async awardBreakPoints(side: 1 | 2) {
    // Break adjust buttons: first is +1 side1, second is +1 side2
    const index = side - 1;
    await this.breakAdjustBtns.nth(index).click();
  }

  /** Start the next bolt during a break (when break is paused) */
  async startNextBolt() {
    await this.page.locator(S.BTN_BREAK_START).click();
  }
}

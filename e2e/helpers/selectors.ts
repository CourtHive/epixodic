/**
 * Stable CSS selectors for Epixodic E2E tests.
 * Prefer data-testid where added; fall back to semantic class names.
 */
export const S = {
  // Archive page
  NEW_MATCH_BTN: 'text="+ New Match"',
  INTENNSE_DEMO_BTN: 'text="+ INTENNSE Demo"',
  CONFIG_MODAL: '.icm-modal',
  CONFIG_TEAM1: '#icm-team1',
  CONFIG_TEAM2: '#icm-team2',
  CONFIG_BOLT_DURATION: '#icm-bolt',
  CONFIG_ASSIGN: '#icm-assign',
  CONFIG_CONFIRM: '.icm-confirm',
  CONFIG_CLOSE: '.icm-close',

  // Scorecard
  SCORECARD: '.team-scorecard',
  SCORECARD_HEADER_SCORE: '.chc-scorecard-side-score',
  SCORECARD_SIDE_NAME: '.chc-scorecard-side-name',
  TIE_MATCHUP_CARD: '.chc-scorecard-card',

  // Bolt scoring — outcome buttons (single instance each, in vertical actions column)
  BTN_WINNER: '.intennse-btn--winner',
  BTN_TOUCH: '.intennse-btn--touch',
  BTN_ACE: '.intennse-btn--ace',
  BTN_FAULT: '.intennse-btn--fault',
  BTN_FORCED: '.intennse-btn--forced',
  BTN_UNFORCED: '.intennse-btn--unforced',

  // Bolt scoring — score side tap targets
  SCORE_SIDE: '.iv-score-side',
  SCORE_SIDE_0: '.iv-score-side >> nth=0',
  SCORE_SIDE_1: '.iv-score-side >> nth=1',
  SCORE_VALUE: '.iv-score-value, .intennse-score-value',

  // Bolt scoring — controls
  BTN_UNDO: 'button:has-text("↩")',
  BTN_REDO: 'button:has-text("↪")',
  BTN_PLAY: '.intennse-ctrl-btn--point-start',
  BTN_BREAK_START: '.intennse-ctrl-btn--break-start',
  BTN_BACK: '.intennse-ctrl-btn--back-v, .intennse-h-back',

  // Score display (vertical uses .iv-score-value, horizontal uses .intennse-score-value)
  BOLT_SCORE_SIDE1: ':is(.iv-score-value, .intennse-score-value) >> nth=0',
  BOLT_SCORE_SIDE2: ':is(.iv-score-value, .intennse-score-value) >> nth=1',
  SCORE_DISPLAY: '.iv-score, .intennse-score-display',
  ARC_SCORE: '.intennse-arc-compact-score',

  // Aggregate bar
  AGGREGATE_BAR: '.intennse-aggregate-bar',

  // Modals
  COIN_TOSS_MODAL: '.ct-modal',
  COIN_SIDE1: '.ct-side:first-child',
  COIN_SIDE2: '.ct-side:last-child',
  COIN_FLIP_BTN: '.ct-flip',
  COIN_CONFIRM: '.ct-confirm',
  SUB_MODAL: '.sub-modal',
  SUB_PLAYER: '.sub-player',
  SUB_PLAYER_BENCH: '.sub-player--bench',
  PENALTY_MODAL: '.pen-modal',
  PENALTY_PLAYER: '.pen-player',
  PENALTY_POINTS_BTN: '.pen-points-btn',
  PENALTY_CONFIRM: '.pen-confirm',
  PLAYER_SELECT_MODAL: '.ps-modal',
  PLAYER_SELECT_PLAYER: '.ps-player',

  // Back confirmation dialog
  BACK_CONFIRM_OVERLAY: '.back-confirm-overlay',
  BACK_CONFIRM_MODAL: '.back-confirm-modal',
  BACK_CONFIRM_CONTINUE: '.back-confirm-btn--cancel',
  BACK_CONFIRM_LEAVE: '.back-confirm-btn--leave',

  // Penalty box
  PENALTY_INDICATOR: '.pbi',
  PENALTY_DETAIL_MODAL: '.pbd-modal',

  // Clocks
  BOLT_CLOCK: '.clock-display',
  CLOCK_TIME: '.clock-time',

  // Player panel
  PLAYER_SLOT: '.intennse-player-slot',
  JERSEY_BADGE: '.intennse-player-jersey',
  PLAYER_NAME: '.intennse-player-name',

  // Footer controls
  BTN_SUB: '.intennse-footer-btn--sub',
  BTN_TIMEOUT: '.intennse-footer-btn--timeout',
  BTN_PENALTY: '.intennse-footer-btn--penalty',

  // Layout containers
  VERTICAL_LAYOUT: '.intennse-vertical',
  HORIZONTAL_LAYOUT: '.intennse-horizontal',

  // Break overlay (vertical layout only — actions column during break)
  BREAK_OVERLAY: '.iv-break-overlay',
  BREAK_OVERLAY_LABEL: '.iv-break-overlay-label',
  BREAK_ADJUST_BTN: '.iv-break-adjust-btn',

  // Bolt/break labels (vertical uses .iv-bolt-label--break, horizontal uses .intennse-break-label)
  BREAK_LABEL: '.iv-bolt-label--break, .intennse-break-label',
  BOLT_LABEL: '.iv-bolt-label, .intennse-bolt-label',
} as const;

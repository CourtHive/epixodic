import { browserStorage } from '../state/browserStorage';
import { firstAndLast } from '../utils/utilities';
import { scoreGovernor, participantTypes, participantRoles, matchUpTypes, version as factoryVersion } from 'tods-competition-factory';
import { buildEpisodes } from '@courthive/scoring-visualizations';

const { ScoringEngine } = scoreGovernor;
const { INDIVIDUAL } = participantTypes;
const { COMPETITOR } = participantRoles;
const { SINGLES } = matchUpTypes;

console.log('[env] tods-competition-factory version:', factoryVersion());

// Event handler flags set during addPoint/undo/redo (consumed by classAction)
export const engineEvents = {
  gameJustCompleted: false,
  setJustCompleted: false,
  matchJustCompleted: false,
  gameWinner: undefined as 0 | 1 | undefined,
};

export const charts: any = {};

// ── ScoringEngine ──────────────────────────────────────────────────────
function resetEngineEvents() {
  engineEvents.gameJustCompleted = false;
  engineEvents.setJustCompleted = false;
  engineEvents.matchJustCompleted = false;
  engineEvents.gameWinner = undefined;
}

// Engine event hooks — set from the browser console:
//   dev.engineLog.onPoint = true                       // default log
//   dev.engineLog.onPoint = (ctx) => console.log(ctx)  // custom handler
//   dev.engineLog.onPoint = false                      // disable
export const engineLog: Record<string, boolean | ((ctx: any) => void)> = {
  onPoint: false,
  onUndo: false,
  onRedo: false,
  onReset: false,
  onGameComplete: false,
  onSetComplete: false,
  onMatchComplete: false,
};

function fireLog(name: string, ctx: any) {
  const hook = engineLog[name];
  if (!hook) return;
  if (typeof hook === 'function') {
    hook(ctx);
  } else {
    const lastPoint = ctx.state?.history?.points?.at(-1);
    console.log(`[engine:${name}]`, { lastPoint, score: ctx.score, ...ctx });
  }
}

function createEngine(format = 'SET3-S:6/TB7') {
  return new ScoringEngine({
    matchUpFormat: format,
    eventHandlers: {
      onPoint: (ctx: any) => fireLog('onPoint', ctx),
      onUndo: (ctx: any) => fireLog('onUndo', ctx),
      onRedo: (ctx: any) => fireLog('onRedo', ctx),
      onReset: (ctx: any) => fireLog('onReset', ctx),
      onGameComplete: (ctx: any) => {
        engineEvents.gameJustCompleted = true;
        engineEvents.gameWinner = ctx.gameWinner;
        fireLog('onGameComplete', ctx);
      },
      onSetComplete: (ctx: any) => {
        engineEvents.setJustCompleted = true;
        fireLog('onSetComplete', ctx);
      },
      onMatchComplete: (ctx: any) => {
        engineEvents.matchJustCompleted = true;
        fireLog('onMatchComplete', ctx);
      },
    },
  });
}

// ── Metadata Store ─────────────────────────────────────────────────────
function createDefaultMetadata() {
  return {
    players: [
      {
        participantName: 'Player One',
        participantId: 'player_0',
        participantType: INDIVIDUAL,
        participantRole: COMPETITOR,
        person: { standardGivenName: 'Player', standardFamilyName: 'One' },
      },
      {
        participantName: 'Player Two',
        participantId: 'player_1',
        participantType: INDIVIDUAL,
        participantRole: COMPETITOR,
        person: { standardGivenName: 'Player', standardFamilyName: 'Two' },
      },
    ] as any[],
    match: {} as any,
    tournament: {} as any,
  };
}

export const app: any = {
  user_uuid: undefined,
};

export const settings: any = {
  track_shot_types: true,
  audible_clicks: false,
  display_gamefish: true,
  auto_swap_sides: true,
  point_buttons: false,
  decoration_profile: 'standard',
};

export const env: any = {
  lets: 0,
  rally: 0,
  undone: [],
  view: 'entry',
  serve2nd: false,
  rally_mode: false,
  edit_player: undefined,
  match_swap: false,
  swap_sides: false,
  orientation: 'vertical',
  serving: 0,
  receiving: 1,
  edit_point_index: undefined,
  provider: undefined,
  engine: createEngine(),
  metadata: createDefaultMetadata(),
  loading_match: false,
  directActions: [] as any[],
};

const c1 = 'rgb(64, 168, 75)';
const c2 = 'rgb(255, 116, 51)';
const c3 = 'rgb(221, 56, 48)';
export const buttons: any = {
  first_serve: { color: c1, type: 'toggle' },
  second_serve: { color: c2, type: 'toggle' },
  double_fault: { color: c3, type: 'flash' },
  penalty: { color: c3, type: 'flash' },
  first_ace: { color: c1, type: 'flash' },
  second_ace: { color: c2, type: 'flash' },
  server_winner: { color: c1, type: 'flash' },
  server_unforced: { color: c3, type: 'flash' },
  server_forced: { color: c2, type: 'flash' },
  receiving_winner: { color: c1, type: 'flash' },
  receiving_unforced: { color: c3, type: 'flash' },
  receiving_forced: { color: c2, type: 'flash' },
};
export const options = {
  user_swap: false,
  highlight_better_stats: true,
  vertical_view: browserStorage.get('vertical_view') || 'vblack',
  horizontal_view: browserStorage.get('horizontal_view') || 'hblack',
};

export const device: any = {
  isStandalone: 'standalone' in globalThis.navigator && globalThis.navigator.standalone,
  isIDevice: /iphone|ipod|ipad/i.test(globalThis.navigator.userAgent),
  isMobile:
    globalThis.matchMedia('(max-width: 768px)').matches ||
    /mobile|android|iphone|ipod|ipad/i.test(globalThis.navigator.userAgent),
  geoposition: {},
};

export const default_players = ['Player One', 'Player Two'];

// ── Helper: Get episodes from engine state ────────────────────────────
export function getEpisodes(): any[] {
  return buildEpisodes(env.engine.getState());
}

// ── Helper: Get score for display (compatible with updateScore) ───────
export function getScoreForDisplay() {
  const state = env.engine.getState();
  const engineScore = env.engine.getScore();
  const sets = state.score?.sets || [];

  const side1SetWins = sets.filter((s: any) => s.winningSide === 1).length;
  const side2SetWins = sets.filter((s: any) => s.winningSide === 2).length;

  // Use engine's pointDisplay (handles tiebreak, AD, NoAD automatically)
  const pointDisplay = engineScore.pointDisplay || ['0', '0'];

  return {
    counters: {
      sets: [side1SetWins, side2SetWins],
      games: engineScore.games,
    },
    points: `${pointDisplay[0]}-${pointDisplay[1]}`,
    components: {
      sets: sets.map((s: any) => ({
        games: [s.side1Score || 0, s.side2Score || 0],
      })),
    },
  };
}

// ── Delegates to ScoringEngine API ────────────────────────────────────
export function getSetsToWin(): number {
  return env.engine.getSetsToWin();
}

export function getNextServer(): number {
  const points = env.engine.getState().history?.points || [];
  if (points.length === 0) return env.serving;

  return env.engine.getNextServer();
}

export function getNoAd(): boolean {
  return env.engine.isNoAd();
}

// ── Metadata Helpers ──────────────────────────────────────────────────
export function definePlayer(opts: { index: number; firstName: string; lastName: string }) {
  const player = env.metadata.players[opts.index] || {};
  player.participantName = `${opts.firstName} ${opts.lastName}`.trim();
  player.person = {
    ...player.person,
    standardGivenName: opts.firstName,
    standardFamilyName: opts.lastName,
  };
  player.participantId = player.participantId || `player_${opts.index}`;
  player.participantType = INDIVIDUAL;
  player.participantRole = COMPETITOR;
  env.metadata.players[opts.index] = player;
  syncParticipantToEngine(opts.index, player);
}

export function updateParticipant(update: any) {
  const index = (update.sideNumber || 1) - 1;
  const player = env.metadata.players[index] || {};
  if (update.person) {
    player.person = { ...player.person, ...update.person };
    const given = update.person.standardGivenName || player.person.standardGivenName || '';
    const family = update.person.standardFamilyName || player.person.standardFamilyName || '';
    player.participantName = `${given} ${family}`.trim();
  }
  // Copy other attributes
  const skipKeys = new Set(['sideNumber', 'person']);
  Object.keys(update).forEach((key) => {
    if (!skipKeys.has(key)) player[key] = update[key];
  });
  env.metadata.players[index] = player;
  syncParticipantToEngine(index, player);
}

function syncParticipantToEngine(index: number, player: any) {
  const side = env.engine.getState().sides?.[index];
  if (side) {
    side.participant = {
      participantId: player.participantId,
      participantName: player.participantName,
      participantType: player.participantType || INDIVIDUAL,
      participantRole: player.participantRole || COMPETITOR,
      person: player.person,
    };
  }
}

/** Read participant names from the engine state (source of truth) */
export function getParticipantNames(): [string, string] {
  const sides = env.engine.getState().sides;
  return [
    sides?.[0]?.participant?.participantName || 'Player 1',
    sides?.[1]?.participant?.participantName || 'Player 2',
  ];
}

// ── No-ops (replaced functionality) ──────────────────────────────────
export function clearActionEvents() {
  // No-op: events system removed with UMO
}

// ── Position and Archive ─────────────────────────────────────────────
export function updatePositions() {
  const left_side = env.swap_sides ? 1 : 0;
  const right_side = env.swap_sides ? 0 : 1;

  updateMatchArchive();

  const player_names = env.metadata.players;
  const p1 = document.getElementById('playerone');
  const p2 = document.getElementById('playertwo');
  if (p1) p1.innerHTML = firstAndLast(player_names[left_side].participantName || '');
  if (p2) p2.innerHTML = firstAndLast(player_names[right_side].participantName || '');

  const display_player_0 = Array.from(document.querySelectorAll('.display_player_0'));
  display_player_0.forEach((element) => (element.innerHTML = player_names[left_side].participantName || ''));
  const display_player_1 = Array.from(document.querySelectorAll('.display_player_1'));
  display_player_1.forEach((element) => (element.innerHTML = player_names[right_side].participantName || ''));
}

function shouldSaveArchive(force: boolean | undefined, matchPoints: any[]): boolean {
  if (force || matchPoints.length || env.directActions.length) return true;
  const players = env.metadata.players;
  return players[0].participantName != default_players[0] && players[1].participantName != default_players[1];
}

function ensureInArchive(match_id: string) {
  const match_archive = JSON.parse(browserStorage.get('match_archive') || '[]');
  if (!match_archive.includes(match_id)) {
    match_archive.push(match_id);
    browserStorage.set('match_archive', JSON.stringify(match_archive));
  }
}

function buildTodsSides(players: any[]) {
  return players.map((player: any, index: number) => ({
    sideNumber: index + 1,
    participantId: player.participantId,
    participant: {
      participantId: player.participantId,
      participantRole: COMPETITOR,
      participantType: INDIVIDUAL,
      participantName: player.participantName,
      person: player.person || {
        standardGivenName: player.participantName?.split(' ')[0] || '',
        standardFamilyName: player.participantName?.split(' ').slice(1).join(' ') || '',
      },
    },
  }));
}

export function updateMatchArchive(force?: boolean) {
  if (env.loading_match) return;

  const match_id = browserStorage.get('current_match');
  if (!match_id) return;

  const state = env.engine.getState();
  const matchPoints = state.history?.points || [];

  if (!shouldSaveArchive(force, matchPoints)) return;

  ensureInArchive(match_id);

  const matchUpFormat = env.engine.getFormat();
  const scoreboard = env.engine.getScoreboard();
  const engineScore = env.engine.getScore();
  const isComplete = env.engine.isComplete();
  const sets = (state.score?.sets || []).map((s: any) => ({ ...s }));

  if (!isComplete && sets.length > 0 && engineScore.pointDisplay) {
    const lastSet = sets[sets.length - 1];
    lastSet.side1PointScore = engineScore.pointDisplay[0];
    lastSet.side2PointScore = engineScore.pointDisplay[1];
  }

  const winningSide = env.engine.getWinner();
  const matchUpStatus = isComplete ? 'COMPLETED' : (matchPoints.length || env.directActions.length) ? 'IN_PROGRESS' : undefined;

  const matchDate = env.metadata.match?.date;
  const scheduledDate = matchDate
    ? new Date(matchDate).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];
  const schedule = { scheduledDate };

  const todsMatchUp: any = {
    tournamentId: env.metadata.tournament?.tournamentId || env.metadata.match?.tournamentId,
    matchUpId: match_id,
    matchUpFormat,
    matchUpType: env.matchUpType || SINGLES,
    matchUpStatus,
    winningSide,
    sides: buildTodsSides(env.metadata.players),
    score: {
      sets,
      points: matchPoints,
      scoreStringSide1: scoreboard,
      scoreStringSide2: scoreboard,
    },
    schedule,
    _appData: {
      scoreboard,
      first_service: env.serving,
    },
  };

  browserStorage.set(match_id, JSON.stringify(todsMatchUp));
  window.dispatchEvent(new CustomEvent('matcharchive:updated', { detail: { matchUpId: match_id } }));
}

export function loadStoredMatch(match_id: string): any {
  const stored = browserStorage.get(match_id);
  if (!stored) return null;

  try {
    return JSON.parse(stored);
  } catch (e) {
    console.error('Error loading match:', e);
    return null;
  }
}

// ── Engine Reset Helper ──────────────────────────────────────────────
export function resetEngine(format = 'SET3-S:6/TB7') {
  env.engine = createEngine(format);
  env.metadata = createDefaultMetadata();
  env.directActions = [];
  resetEngineEvents();
}

export function restoreAppState() {
  const app_settings = browserStorage.get('CH_AppSettings');
  if (app_settings) Object.assign(settings, JSON.parse(app_settings));
  const app_state = browserStorage.get('CH_AppState');
  if (app_state) Object.assign(app, JSON.parse(app_state));
}

export function updateAppState() {
  browserStorage.set('CH_AppSettings', JSON.stringify(settings));
  browserStorage.set('CH_AppState', JSON.stringify(app));
}

export function setOrientation() {
  // When running inside a scoring modal iframe, force portrait
  const forcePortrait = globalThis.location.hash.includes('forcePortrait');
  if (forcePortrait) {
    env.orientation = 'portrait';
    return;
  }

  if (device.isMobile) {
    env.orientation = globalThis.screen.orientation.type == 'landscape-primary' ? 'landscape' : 'portrait';
  } else {
    env.orientation = globalThis.innerWidth > globalThis.innerHeight ? 'landscape' : 'portrait';
  }
}

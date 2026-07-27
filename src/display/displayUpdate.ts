import {
  env,
  options,
  settings,
  updateMatchArchive,
  updatePositions,
  getScoreForDisplay,
  getSetsToWin,
  getNextServer,
} from '../state/env';
import { FORMAT_NAMES, isLegacyFormat, migrateFormat } from '../services/matchObject/formatMigration';
import { finalizeMatchOutcome } from '../match/finalizeMatchOutcome';
import { relayCrowdScoreIfLaunched } from '../services/messaging/crowdScoreRelay';
import { sendScore } from '../services/messaging/scoreRelay';
import { browserStorage } from '../state/browserStorage';
import { groupGames } from '../engine/groupGames';
import { cModal, renderForm } from 'courthive-components';
import { updateChartData } from './configureViz';

const selectLabel = '- select -';

export function updateScore() {
  const score = getScoreForDisplay();
  const sets_counter = score.counters.sets;
  const games_counter = score.counters.games;
  const points = score.points.split('-');
  const left_side = env.swap_sides ? 1 : 0;
  const right_side = env.swap_sides ? 0 : 1;

  // old way
  const point_fields: any = Array.from(document.getElementsByClassName('points'));
  point_fields.forEach((field: any, index: number) => {
    field.value = points[env.swap_sides ? 1 - index : index];
  });

  // new way
  const display_point_0 = Array.from(document.querySelectorAll('.display_points_0'));
  display_point_0.forEach((element) => (element.innerHTML = points[left_side]));
  const display_point_1 = Array.from(document.querySelectorAll('.display_points_1'));
  display_point_1.forEach((element) => (element.innerHTML = points[right_side]));

  const display_game_0 = Array.from(document.querySelectorAll('.display_games_0'));
  display_game_0.forEach((element) => (element.innerHTML = games_counter[left_side]));
  const display_game_1 = Array.from(document.querySelectorAll('.display_games_1'));
  display_game_1.forEach((element) => (element.innerHTML = games_counter[right_side]));

  const display_set_0 = Array.from(document.querySelectorAll('.display_sets_0'));
  display_set_0.forEach((element) => (element.innerHTML = sets_counter[left_side]));
  const display_set_1 = Array.from(document.querySelectorAll('.display_sets_1'));
  display_set_1.forEach((element) => (element.innerHTML = sets_counter[right_side]));

  const sets = score.components.sets;
  const setsToWin = getSetsToWin();
  const max_games = setsToWin == 1 ? 0 : setsToWin > 2 ? 4 : 2;
  [0, 1, 2, 3, 4].forEach((index) => {
    if (!sets || (sets && !sets[index])) {
      // old way
      const set_fields = Array.from(document.getElementsByClassName('games' + index));
      set_fields.forEach((field: any) => (field.value = '-'));
      // new way
      const player0_games = Array.from(document.getElementsByClassName('display_set_' + index + '_games_0'));
      player0_games.forEach((field) => (field.innerHTML = index > max_games ? ' ' : '-'));
      const player1_games = Array.from(document.getElementsByClassName('display_set_' + index + '_games_1'));
      player1_games.forEach((field) => (field.innerHTML = index > max_games ? ' ' : '-'));
    }
  });

  if (!sets) return;

  sets.forEach((set: any, index: number) => {
    // old way
    const set_fields: any = Array.from(document.getElementsByClassName('games' + index));
    set_fields.forEach((field: any, index: number) => (field.value = set.games[env.swap_sides ? 1 - index : index]));
    // new way
    const player0_games = Array.from(document.getElementsByClassName('display_set_' + index + '_games_0'));
    player0_games.forEach((field) => (field.innerHTML = set.games[env.swap_sides ? 1 : 0]));
    const player1_games = Array.from(document.getElementsByClassName('display_set_' + index + '_games_1'));
    player1_games.forEach((field) => (field.innerHTML = set.games[env.swap_sides ? 0 : 1]));
  });
}

// loadDetails refreshes scoring-view display elements (player names, stats headers).
// Match/tournament/player detail forms are now cModal-based and self-contained.
export function loadDetails() {
  updatePositions();
}

let inStateChange = false;

export function stateChangeEvent() {
  if (inStateChange) return; // Prevent recursive calls (swapServer → setCourtSide chain)
  inStateChange = true;
  try {
    updateMatchArchive();
    env.serve2nd = false;
    env.rally_mode = false;
    updateState();
    updateScore();
    visibleButtons();

    // Update embedded chart data (entry view charts from configureViz)
    updateChartData();

    // Notify current page component to update visualizations
    const router = (globalThis as any).appRouter;
    if (router) {
      const currentPage = router.getCurrentPage();
      if (currentPage && typeof currentPage.updateVisualizations === 'function') {
        currentPage.updateVisualizations();
      }
    }

    // Broadcast live score to relay
    broadcastScore();

    // Standalone (mobile) scoring page: submit the final outcome to CFS when the
    // match completes. The desktop modal runs this scorer in an iframe and
    // finalizes from the parent on close, so skip when framed to avoid a double
    // submit.
    maybeFinalizeStandalone();
  } finally {
    inStateChange = false;
  }
}

let lastFinalizeKey: string | undefined;

function maybeFinalizeStandalone(): void {
  if (typeof globalThis === 'undefined' || globalThis.self !== globalThis.top) return;
  if (!env.engine?.isComplete?.()) return;
  const matchUpId = env.metadata?.match?.matchUpId;
  if (!matchUpId) return;

  // Fire once per unique completed outcome (re-fires on a correction).
  const state = env.engine.getState();
  const key = `${matchUpId}|${state?.winningSide ?? ''}|${JSON.stringify(state?.score?.sets ?? [])}`;
  if (key === lastFinalizeKey) return;
  lastFinalizeKey = key;

  void finalizeMatchOutcome(matchUpId);
}

export function visibleButtons() {
  const pointCount = env.engine.getPointCount();
  const hasGames = (env.engine.getScore().games || []).some((g: number) => g > 0);
  const hasSets = (env.engine.getState().score?.sets || []).length > 0;
  const matchStarted = pointCount > 0 || hasGames || hasSets;
  const match_archive = JSON.parse(browserStorage.get('match_archive') || '[]');
  Array.from(document.querySelectorAll('.view_stats')).forEach(
    (div: any) => (div.style.display = pointCount > 0 ? 'inline' : 'none'),
  );
  Array.from(document.querySelectorAll('.change_server')).forEach(
    (div: any) => (div.style.display = !matchStarted ? 'inline' : 'none'),
  );
  Array.from(document.querySelectorAll('.view_archive')).forEach(
    (div: any) => (div.style.display = !matchStarted && match_archive.length ? 'inline' : 'none'),
  );
  Array.from(document.querySelectorAll('.view_settings')).forEach(
    (div: any) => (div.style.display = !matchStarted && !match_archive.length ? 'inline' : 'none'),
  );
  Array.from(document.querySelectorAll('.view_history')).forEach(
    (div: any) => (div.style.display = matchStarted ? 'inline' : 'none'),
  );
  Array.from(document.querySelectorAll('.undo')).forEach((div: any) => {
    div.style.display = matchStarted || env.serve2nd || env.rally_mode ? 'flex' : 'none';
  });
  Array.from(document.querySelectorAll('.redo')).forEach((div: any) => {
    div.style.display = env.engine.canRedo() ? 'flex' : 'none';
  });
  const status_message = statusMessage();
  env.status = status_message;
  Array.from(document.querySelectorAll('.status_message')).forEach((div) => (div.innerHTML = status_message));

  function statusMessage() {
    if (env.engine.isComplete()) return 'COMPLETE';
    const situation = env.engine.getScore().situation;
    if (situation) {
      if (situation.isMatchPoint) return 'MATCH POINT';
      if (situation.isSetPoint) return 'SET POINT';
      if (situation.isGoldenPoint) return 'GOLDEN POINT';
      if (situation.isBreakPoint) return 'BREAK POINT';
      if (situation.isGamePoint) return 'GAME POINT';
    }
    if (env.lets) return `Lets: ${env.lets}`;
    return '';
  }
}

export function updateState() {
  if (getNextServer() != env.serving) swapServer();
  resetButtons();
  updatePositions();
  updateScore(); // CRITICAL: Update score display when points are added
}

export function resetButtons() {
  const server_side = env.swap_sides ? 1 - env.serving : env.serving;
  const receiver_side = env.swap_sides ? 1 - env.receiving : env.receiving;

  Array.from(document.querySelectorAll('.fault')).forEach((div) => (div.innerHTML = 'Fault'));

  const server_mode = `.modeaction_player${server_side}`;
  Array.from(document.querySelectorAll(server_mode)).forEach((div) => (div.innerHTML = 'Serve'));

  const server_fault = `.modeerr_player${server_side}`;
  Array.from(document.querySelectorAll(server_fault)).forEach((div) => (div.innerHTML = 'Fault'));
  const server_ace = `.modewin_player${server_side}`;
  Array.from(document.querySelectorAll(server_ace)).forEach((div) => (div.innerHTML = 'Ace'));
  const server_let = `.modeforce_player${server_side}`;
  Array.from(document.querySelectorAll(server_let)).forEach((div) => (div.innerHTML = 'Let'));

  const receiver_mode = `.modeaction_player${receiver_side}`;
  Array.from(document.querySelectorAll(receiver_mode)).forEach((div) => (div.innerHTML = 'Return'));

  const receiver_ufe = `.modeerr_player${receiver_side}`;
  Array.from(document.querySelectorAll(receiver_ufe)).forEach((div) => (div.innerHTML = 'UFE'));
  const receiver_winner = `.modewin_player${receiver_side}`;
  Array.from(document.querySelectorAll(receiver_winner)).forEach((div) => (div.innerHTML = 'Winner'));
  const receiver_forced = `.modeforce_player${receiver_side}`;
  Array.from(document.querySelectorAll(receiver_forced)).forEach((div) => (div.innerHTML = 'Forced'));

  Array.from(document.querySelectorAll('.vs_point_button')).forEach(
    (div: any) => (div.style.display = settings.point_buttons ? 'flex' : 'none'),
  );

  Array.from(document.querySelectorAll('.rally')).forEach((div) => (div.innerHTML = 'Rally'));
}

export function swapServer() {
  env.serving = getNextServer();
  env.receiving = 1 - getNextServer();

  if (settings.auto_swap_sides) {
    const games = groupGames();
    let game_number: number = games.length;
    if (games[games.length - 1].complete) game_number += 1;
    env.match_swap = swapSides(game_number);
  } else {
    env.match_swap = false;
  }
  setCourtSide();

  const server_side = env.swap_sides ? 1 - env.serving : env.serving;
  const receiver_side = env.swap_sides ? 1 - env.receiving : env.receiving;

  /**
  let div = document.getElementById(server_side ? 'player_receiving' : 'player_serving');
  div.parentNode.insertBefore(div, document.getElementById('team_two'));
  div = document.getElementById(server_side ? 'player_serving' : 'player_receiving');
  div.parentNode.insertBefore(div, document.getElementById('entry_end'));
  */

  changeTextColor(`.indicate_serve.display_player_${server_side}`, 'yellow');
  changeTextColor(`.indicate_serve.display_player_${receiver_side}`, 'white');

  /**
  document.getElementById("team_one_role").innerHTML = server_side ? 'Receiving:' : 'Serving:';
  document.getElementById("team_two_role").innerHTML = server_side ? 'Serving:' : 'Receiving:';
  */

  if (server_side) {
    changeClassDisplay('.display_0_serving', 'none');
    changeClassDisplay('.display_1_serving', 'flex');
  } else {
    changeClassDisplay('.display_0_serving', 'flex');
    changeClassDisplay('.display_1_serving', 'none');
  }

  const point_fields = Array.from(document.getElementsByClassName('points'));
  point_fields.forEach((field: any, index) => {
    const player = env.swap_sides ? 1 - index : index;
    field.style.backgroundColor = player == env.serving ? '#FBF781' : '#D1FBFB';
  });
  resetButtons();
}

function swapSides(number: number) {
  const iterations = [true].concat([...new Array(number).keys()].map((i) => (i + 1) % 4 < 2));
  return !iterations[number];
}

export function setCourtSide() {
  env.swap_sides = env.match_swap;
  if (options.user_swap) env.swap_sides = !env.swap_sides;
}

function changeTextColor(classes: string, value: any) {
  const objs = Array.from(document.querySelectorAll(classes));
  objs.forEach((obj: any) => (obj.style.color = value));
}

function changeClassDisplay(className: string, display: string) {
  const elements = Array.from(document.querySelectorAll(className));
  elements.forEach((element: any) => (element.style.display = display));
}

export function editMatchDetails() {
  const matchMeta = env.metadata.match;
  const tournament = env.metadata.tournament;
  const rawFormat = env.engine.getFormat();
  const formatCode = isLegacyFormat(rawFormat) ? migrateFormat(rawFormat) : rawFormat;
  const knownName = FORMAT_NAMES[formatCode];
  const formatDisplay = knownName ? `${knownName} (${formatCode})` : formatCode;

  let inputs: any;

  const content = (elem: HTMLElement) => {
    elem.style.maxHeight = '70vh';
    elem.style.overflowY = 'auto';
    inputs = renderForm(elem, [
      { text: '<b>Match</b>', header: true },
      { text: formatDisplay },
      { label: 'Court', field: 'court', placeholder: 'Court Number or Name', value: matchMeta.court || '' },
      { label: 'Umpire', field: 'umpire', placeholder: 'Match Umpire', value: matchMeta.umpire || '' },
      { text: '<b>Event</b>', header: true },
      { label: 'Name', field: 'tname', placeholder: 'Tournament Name', value: tournament.name || '' },
      { label: 'Date', field: 'date', placeholder: 'Start Date', value: tournament.start_date || '' },
      { label: 'Tour', field: 'tour', placeholder: 'Tour', value: tournament.tour || '' },
      { label: 'Rank', field: 'rank', placeholder: 'Tournament Rank', value: tournament.rank || '' },
      {
        label: 'Surface',
        field: 'surface',
        options: [
          { label: selectLabel, value: '' },
          { label: 'Clay', value: 'clay', selected: tournament.surface === 'clay' },
          { label: 'Hard', value: 'hard', selected: tournament.surface === 'hard' },
          { label: 'Grass', value: 'grass', selected: tournament.surface === 'grass' },
          { label: 'Carpet', value: 'carpet', selected: tournament.surface === 'carpet' },
        ],
      },
      {
        label: 'In/Out',
        field: 'in_out',
        options: [
          { label: selectLabel, value: '' },
          { label: 'Indoor', value: 'in', selected: tournament.in_out === 'in' },
          { label: 'Outdoor', value: 'out', selected: tournament.in_out === 'out' },
        ],
      },
      {
        label: 'Draw',
        field: 'draw',
        options: [
          { label: selectLabel, value: '' },
          { label: 'Main', value: 'main', selected: tournament.draw === 'main' },
          { label: 'Qualification', value: 'qual', selected: tournament.draw === 'qual' },
        ],
      },
      {
        label: 'Draw Size',
        field: 'draw_size',
        options: [
          { label: '- Select -', value: '' },
          ...['8', '12', '16', '24', '32', '48', '64', '128'].map((s) => ({
            label: s,
            value: s,
            selected: tournament.draw_size === s,
          })),
        ],
      },
      {
        label: 'Round',
        field: 'round',
        options: [
          { label: '- Select -', value: '' },
          { label: 'Final', value: 'F', selected: tournament.round === 'F' },
          { label: 'Semifinal', value: 'SF', selected: tournament.round === 'SF' },
          { label: 'Quarterfinal', value: 'QF', selected: tournament.round === 'QF' },
          { label: 'Round of 16', value: 'R16', selected: tournament.round === 'R16' },
          { label: 'Round of 32', value: 'R32', selected: tournament.round === 'R32' },
          { label: 'Round of 64', value: 'R64', selected: tournament.round === 'R64' },
          { label: 'Round of 128', value: 'R128', selected: tournament.round === 'R128' },
          { label: 'Round Robin', value: 'RR', selected: tournament.round === 'RR' },
        ],
      },
      { text: '<b>Provider</b>', header: true },
      { label: 'Name', field: 'provider', placeholder: 'Name of provider', value: env.provider || '' },
    ]);
  };

  const save = () => {
    // Match details
    if (inputs.court.value) matchMeta.court = inputs.court.value;
    else delete matchMeta.court;
    if (inputs.umpire.value) matchMeta.umpire = inputs.umpire.value;
    else delete matchMeta.umpire;

    // Tournament details
    const tFields: [string, string][] = [
      ['tname', 'name'],
      ['date', 'start_date'],
      ['tour', 'tour'],
      ['rank', 'rank'],
      ['surface', 'surface'],
      ['in_out', 'in_out'],
      ['draw', 'draw'],
      ['draw_size', 'draw_size'],
      ['round', 'round'],
    ];
    for (const [field, key] of tFields) {
      if (inputs[field].value) tournament[key] = inputs[field].value.trim();
      else delete tournament[key];
    }

    // Provider
    const providerValue = inputs.provider.value.trim();
    env.provider = providerValue;
    if (providerValue) browserStorage.set('mobile-provider', providerValue);

    updateMatchArchive();
  };

  cModal.open({
    title: 'Match Details',
    content,
    config: { clickAway: false },
    buttons: [
      { label: 'Cancel', close: true },
      { label: 'Save', intent: 'is-info', onClick: save, close: true },
    ],
  });
}

function broadcastScore(): void {
  const matchUpId = env.metadata?.match?.matchUpId;
  if (!matchUpId) return;
  if (!env.engine?.getPointCount()) return;

  const state = env.engine.getState();
  const score = state.score || {};
  const scoreDisplay = getScoreForDisplay();

  const tournamentId = env.metadata.tournament?.tournamentId || env.metadata.match?.tournamentId;
  const isComplete = env.engine.isComplete();
  const winningSide = isComplete ? state.winningSide : undefined;

  const points = state.history?.points;
  const lastPoint = points?.length ? points[points.length - 1] : undefined;

  sendScore({
    matchUpId,
    tournamentId,
    score: {
      sets: score.sets,
      scoreStringSide1: scoreDisplay,
      scoreStringSide2: scoreDisplay,
    },
    matchUpStatus: isComplete ? 'COMPLETED' : 'IN_PROGRESS',
    winningSide,
    // The full CODES `Point` so the relay persists point-by-point to
    // courthive-query; sendScore dedups per pointNumber.
    point: lastPoint,
  });

  // When launched from courthive-public with a HiveID identity, also relay to
  // the /crowd namespace as that scorer (Phase D) — no-op otherwise.
  relayCrowdScoreIfLaunched({
    matchUpId,
    tournamentId,
    currentScore: { sets: score.sets, winningSide, scoreboard: scoreDisplay, matchUpStatus: isComplete ? 'COMPLETED' : 'IN_PROGRESS' },
    formatHint: env.metadata.match?.matchUpFormat,
  });
}

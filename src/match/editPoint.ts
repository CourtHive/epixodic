import { getProfile, resultToContext } from '../decorations';
import { stateChangeEvent } from '../display/displayUpdate';
import { cModal, renderForm } from 'courthive-components';
import { env, getEpisodes, settings } from '../state/env';
import { browserStorage } from '../state/browserStorage';
import { escapeHtml } from '../utils/escapeHtml';
import { matchPath } from '../router/routes';
import { loadMatch } from './loadMatch';
import {
  ACE,
  WINNER,
  DOUBLE_FAULT,
  UNFORCED_ERROR,
  FORCED_ERROR,
  FOREHAND,
  BACKHAND,
  WINNER_RESULTS,
  NO_DECORATION_RESULTS,
} from '../utils/constants';

const selectLabel = '- select -';

function rebuildStrokeSelect(select: HTMLSelectElement, result: string, currentStroke: string) {
  select.innerHTML = '';
  select.appendChild(new Option(selectLabel, ''));
  const profileId = settings.decoration_profile || 'standard';
  const profile = getProfile(profileId);
  if (!profile) return;
  const context = result ? resultToContext(result) : undefined;
  const visible = profile.strokes.filter((s: any) => !s.context || !context || s.context === context);
  for (const s of visible) select.appendChild(new Option(s.name, s.name));
  select.value = currentStroke;
}

function buildStrokeOptionsList(result: string, currentStroke: string) {
  const opts: { label: string; value: string; selected?: boolean }[] = [{ label: selectLabel, value: '' }];
  const profileId = settings.decoration_profile || 'standard';
  const profile = getProfile(profileId);
  if (!profile) return opts;
  const context = result ? resultToContext(result) : undefined;
  const visible = profile.strokes.filter((s: any) => !s.context || !context || s.context === context);
  for (const s of visible) opts.push({ label: s.name, value: s.name, selected: s.name === currentStroke });
  return opts;
}

export function editPoint(index: number) {
  const episodes = getEpisodes();
  const episodePoint = episodes[index].point;
  const players = env.metadata.players;

  // Get the engine's actual point (episodes contain copies, not references)
  const enginePoints = env.engine.getState().history?.points || [];
  const pointIndex = episodePoint.index ?? index;
  const enginePoint = enginePoints[pointIndex];
  if (!enginePoint) return;

  let score = episodePoint.server ? episodePoint.score.split('-').reverse().join('-') : episodePoint.score;
  if (score === '0-0') score = 'Gamepoint';
  const title = `Set ${episodePoint.set + 1}, Game ${episodePoint.game + 1} — ${score}`;

  // Local state for the form (read from engine point which has all fields)
  const currentResult: string = enginePoint.result || '';
  const currentWinner: number = enginePoint.winner ?? 0;
  let currentPlayer: number = WINNER_RESULTS.includes(currentResult) ? currentWinner : 1 - currentWinner;
  const currentHand: string = enginePoint.hand || '';
  const currentStroke: string = enginePoint.stroke || '';
  const currentRally: number = enginePoint.rallyLength || 0;

  // If no result, default player to winner
  if (!currentResult) currentPlayer = currentWinner;

  // renderForm writes option labels as HTML (courthive-components renderOptions); a name is record data
  const playerOptions = players.map((p: any, i: number) => ({
    label: escapeHtml(p.participantName),
    value: String(i),
  }));

  const hideDecorations = NO_DECORATION_RESULTS.includes(currentResult);

  const relationships = [
    {
      control: 'result',
      onChange: ({ inputs, fields }: any) => {
        const result = inputs.result.value;
        const server = enginePoint.server;
        if (result === ACE) {
          inputs.winner.value = String(server);
          inputs.player.value = String(server);
        } else if (result === DOUBLE_FAULT) {
          inputs.winner.value = String(1 - server);
          inputs.player.value = String(server);
        } else if (WINNER_RESULTS.includes(result)) {
          inputs.player.value = inputs.winner.value;
        } else if (result === UNFORCED_ERROR || result === FORCED_ERROR) {
          inputs.player.value = String(1 - Number(inputs.winner.value));
        }
        if (NO_DECORATION_RESULTS.includes(result)) {
          inputs.rally.value = '';
        }
        rebuildStrokeSelect(inputs.stroke, result, '');
        const hide = NO_DECORATION_RESULTS.includes(result);
        if (fields) {
          fields.hand.style.display = hide ? 'none' : '';
          fields.stroke.style.display = hide ? 'none' : '';
        }
      },
    },
    {
      control: 'winner',
      onChange: ({ inputs }: any) => {
        const result = inputs.result.value;
        const winner = Number(inputs.winner.value);
        if (WINNER_RESULTS.includes(result)) {
          inputs.player.value = String(winner);
        } else if (result) {
          inputs.player.value = String(1 - winner);
        }
      },
    },
    {
      control: 'player',
      onChange: ({ inputs }: any) => {
        const result = inputs.result.value;
        const player = Number(inputs.player.value);
        if (WINNER_RESULTS.includes(result)) {
          inputs.winner.value = String(player);
        } else if (result) {
          inputs.winner.value = String(1 - player);
        }
      },
    },
  ];

  let inputs: any;

  const content = (elem: HTMLElement) => {
    elem.style.maxHeight = '70vh';
    elem.style.overflowY = 'auto';
    inputs = renderForm(
      elem,
      [
        {
          label: 'Result',
          field: 'result',
          options: [
            { label: selectLabel, value: '' },
            { label: WINNER, value: WINNER, selected: currentResult === WINNER },
            { label: UNFORCED_ERROR, value: UNFORCED_ERROR, selected: currentResult === UNFORCED_ERROR },
            { label: FORCED_ERROR, value: FORCED_ERROR, selected: currentResult === FORCED_ERROR },
            { label: ACE, value: ACE, selected: currentResult === ACE },
            { label: DOUBLE_FAULT, value: DOUBLE_FAULT, selected: currentResult === DOUBLE_FAULT },
          ],
        },
        {
          label: 'Winner',
          field: 'winner',
          options: playerOptions.map((o) => ({ ...o, selected: o.value === String(currentWinner) })),
        },
        {
          label: 'Player',
          field: 'player',
          options: playerOptions.map((o) => ({ ...o, selected: o.value === String(currentPlayer) })),
        },
        {
          label: 'Hand',
          field: 'hand',
          visible: !hideDecorations,
          options: [
            { label: selectLabel, value: '' },
            { label: FOREHAND, value: FOREHAND, selected: currentHand === FOREHAND },
            { label: BACKHAND, value: BACKHAND, selected: currentHand === BACKHAND },
          ],
        },
        {
          label: 'Stroke',
          field: 'stroke',
          visible: !hideDecorations,
          options: buildStrokeOptionsList(currentResult, currentStroke),
        },
        { label: 'Rally', field: 'rally', type: 'number', value: currentRally ? String(currentRally) : '' },
      ],
      relationships,
    );
  };

  const submit = () => {
    enginePoint.winner = Number(inputs.winner.value);
    enginePoint.result = inputs.result.value || undefined;
    enginePoint.hand = inputs.hand.value || undefined;
    enginePoint.stroke = inputs.stroke.value || undefined;
    const rally = Number.parseInt(inputs.rally.value, 10);
    enginePoint.rallyLength = rally > 0 ? rally : undefined;
    enginePoint.code = undefined;

    stateChangeEvent();
    const current_match_id = browserStorage.get('current_match');
    if (current_match_id) {
      loadMatch(current_match_id);
      const router = (globalThis as any).appRouter;
      router?.navigate(matchPath(current_match_id, 'history'));
    }
  };

  cModal.open({
    title,
    content,
    config: { clickAway: false },
    buttons: [
      { label: 'Submit', intent: 'is-info', onClick: submit, close: true },
      { label: 'Cancel', close: true },
    ],
  });
}

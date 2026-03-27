import { env, updateMatchArchive, updatePositions, updateParticipant, definePlayer } from '../state/env';
import { cModal, renderForm } from 'courthive-components';
import { loadDetails } from '../display/displayUpdate';
import iocCodes from '../assets/ioc_codes.json';

export function editPlayer(element: any) {
  const index = Number.parseInt(element.getAttribute('playerIndex') ?? 0);
  const playerIndex = env.swap_sides ? 1 - index : index;
  const player = env.metadata.players[playerIndex];

  const selectLabel = '- select -';
  const seedOptions = [{ label: 'Unseeded', value: '' }];
  for (let i = 1; i <= 32; i++) seedOptions.push({ label: String(i), value: String(i) });

  const drawPosOptions = [{ label: selectLabel, value: '' }];
  for (let i = 1; i <= 128; i++) drawPosOptions.push({ label: String(i), value: String(i) });

  const iocOptions = [{ label: '- select -', value: '' }];
  for (const entry of iocCodes) iocOptions.push({ label: entry.name, value: entry.ioc });

  let inputs: any;

  const content = (elem: HTMLElement) => {
    elem.style.maxHeight = '70vh';
    elem.style.overflowY = 'auto';
    inputs = renderForm(elem, [
      { label: 'Name', field: 'name', placeholder: 'Player Name', value: player.participantName || '' },
      { label: 'Team', field: 'team', placeholder: 'Team', value: player.team || '' },
      { label: 'Player ID', field: 'id', placeholder: 'Player Id', value: player.id || '' },
      {
        label: 'Hand',
        field: 'hand',
        options: [
          { label: selectLabel, value: '' },
          { label: 'Right', value: 'R', selected: player.hand === 'R' },
          { label: 'Left', value: 'L', selected: player.hand === 'L' },
        ],
      },
      {
        label: 'Entry',
        field: 'entry',
        options: [
          { label: selectLabel, value: '' },
          { label: 'Main Draw', value: 'MD', selected: player.entry === 'MD' },
          { label: 'Qualifier', value: 'Q', selected: player.entry === 'Q' },
          { label: 'Wildcard', value: 'WC', selected: player.entry === 'WC' },
          { label: 'Special Exception', value: 'SE', selected: player.entry === 'SE' },
        ],
      },
      {
        label: 'Seed',
        field: 'seed',
        options: seedOptions.map((o) => ({ ...o, selected: o.value === (player.seed || '') })),
      },
      {
        label: 'Draw Pos',
        field: 'draw_position',
        options: drawPosOptions.map((o) => ({ ...o, selected: o.value === (player.draw_position || '') })),
      },
      { label: 'Rank', field: 'rank', placeholder: 'Ranking', value: player.rank || '' },
      { label: 'WTN', field: 'wtn', placeholder: 'WTN Rating', value: player.wtn || '' },
      { label: 'UTR', field: 'utr', placeholder: 'UTR Rating', value: player.utr || '' },
      {
        label: 'Country',
        field: 'ioc',
        options: [{ label: selectLabel, value: '' }, ...iocOptions.slice(1)],
      },
    ]);
  };

  const save = () => {
    const sideNumber = playerIndex + 1;
    const playerUpdate: any = { sideNumber };

    if (inputs.name.value.trim()) {
      const fullName = inputs.name.value.trim();
      const nameParts = fullName.split(/\s+/);
      playerUpdate.person = {
        standardGivenName: nameParts[0] || '',
        standardFamilyName: nameParts.slice(1).join(' ') || '',
      };
    }

    const optionalFields = ['team', 'id', 'hand', 'entry', 'seed', 'draw_position', 'rank', 'wtn', 'utr', 'ioc'];
    for (const field of optionalFields) {
      if (inputs[field].value) playerUpdate[field] = inputs[field].value;
    }

    try {
      updateParticipant(playerUpdate);
    } catch (error: any) {
      if (error.message?.includes('No participant found')) {
        const firstName = playerUpdate.person?.standardGivenName || 'Player';
        const lastName = playerUpdate.person?.standardFamilyName || String(sideNumber);
        definePlayer({ index: playerIndex, firstName, lastName });
      } else {
        throw error;
      }
    }

    updatePositions();
    loadDetails();
    updateMatchArchive();
  };

  cModal.open({
    title: 'Player Details',
    content,
    config: { clickAway: false },
    buttons: [
      { label: 'Cancel', close: true },
      { label: 'Save', intent: 'is-info', onClick: save, close: true },
    ],
  });
}

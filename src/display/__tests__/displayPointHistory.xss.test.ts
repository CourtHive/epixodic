// @vitest-environment happy-dom
import { expectRenderedAsText, resetXssProbe, XSS_PAYLOAD } from '../../__tests__/helpers/xssProbe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { episodePointPatch } = vi.hoisted(() => ({ episodePointPatch: { value: undefined as any } }));

// Episodes come from scoring-visualizations' buildEpisodes, which (at 0.2.21) carries result and
// rallyLength onto the episode point but not hand. A patch lets the hand case reach the renderer, so
// the renderer is safe whichever decorations a future episode builder carries.
vi.mock('../../state/env', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    getEpisodes: () =>
      actual
        .getEpisodes()
        .map((episode: any) => ({ ...episode, point: { ...episode.point, ...episodePointPatch.value } })),
  };
});

import { env, resetEngine, updateParticipant } from '../../state/env';
import { displayPointHistory } from '../displayPointHistory';

// E2 of Mentat/assessment/2026-10-17-epixodic-public-xss-assessment.md: point history interpolated
// names, point decorations and direct-action values into an HTML string. loadPoints carries stored
// result/hand/stroke/rallyLength into addPoint unchanged, so these are record data.
function playGame(decoration: Record<string, string>) {
  for (let i = 0; i < 4; i++) env.engine.addPoint({ winner: 0, ...(i === 0 ? decoration : {}) });
}

function frame() {
  return document.getElementById('ph_frame');
}

describe('displayPointHistory renders record data as text', () => {
  beforeEach(() => {
    resetXssProbe();
    episodePointPatch.value = undefined;
    resetEngine('SET3-S:6/TB7');
    document.body.innerHTML = '<div id="ph_frame"></div>';
    updateParticipant({ sideNumber: 1, person: { standardGivenName: 'Ann', standardFamilyName: 'Lee' } });
    updateParticipant({ sideNumber: 2, person: { standardGivenName: 'Bo', standardFamilyName: 'Ray' } });
  });

  it('shows a hostile point result literally', () => {
    playGame({ result: XSS_PAYLOAD });
    displayPointHistory();
    expectRenderedAsText(frame());
  });

  it('shows a hostile hand literally', () => {
    playGame({ result: 'Winner' });
    episodePointPatch.value = { hand: XSS_PAYLOAD };
    displayPointHistory();
    expectRenderedAsText(frame());
  });

  it('shows a hostile rally length literally', () => {
    playGame({ result: 'Winner', rallyLength: XSS_PAYLOAD });
    displayPointHistory();
    expectRenderedAsText(frame());
  });

  it('shows a hostile server name literally', () => {
    updateParticipant({ sideNumber: 1, person: { standardGivenName: XSS_PAYLOAD, standardFamilyName: 'Lee' } });
    playGame({ result: 'Ace' });
    displayPointHistory();
    expectRenderedAsText(frame());
  });

  it('shows hostile direct-action values and winner names literally', () => {
    updateParticipant({ sideNumber: 2, person: { standardGivenName: XSS_PAYLOAD, standardFamilyName: 'Ray' } });
    env.directActions.push(
      { type: 'set', side1Score: XSS_PAYLOAD, side2Score: 4, winner: 1 },
      { type: 'game', score: [XSS_PAYLOAD, 1], winner: 1 },
    );
    displayPointHistory();
    expectRenderedAsText(frame());
    expect(frame()?.textContent).toContain(`${XSS_PAYLOAD}-4`);
    expect(frame()?.textContent).toContain(`${XSS_PAYLOAD}-1`);
  });

  it('keeps application markup: game rows and the duration footer still render', () => {
    playGame({ result: 'Winner', rallyLength: '9' });
    episodePointPatch.value = { hand: 'Forehand' };
    displayPointHistory();
    expect(frame()?.querySelectorAll('.ph_game').length).toBeGreaterThan(1);
    expect(frame()?.querySelectorAll('.ph_episode')).toHaveLength(4);
    expect(frame()?.querySelector('.ph_rally b')?.textContent).toBe('1-0');
    expect(frame()?.textContent).toContain('AL: Forehand Winner');
    expect(frame()?.textContent).toContain('Duration 00:00:00');
  });
});

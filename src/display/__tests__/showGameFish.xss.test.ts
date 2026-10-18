// @vitest-environment happy-dom
import { expectRenderedAsText, resetXssProbe, XSS_PAYLOAD } from '../../__tests__/helpers/xssProbe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { openMock, namesMock } = vi.hoisted(() => ({ openMock: vi.fn(), namesMock: vi.fn() }));

vi.mock('courthive-components', async (importOriginal) => ({
  ...(await importOriginal<any>()),
  cModal: { open: openMock, close: vi.fn() },
}));

// getParticipantNames reads the engine's sides, which the metadata sync does not currently reach
// (getState returns a copy). Stubbing it isolates the modal's own sink, as the assessment's E3 does.
vi.mock('../../state/env', async (importOriginal) => ({
  ...(await importOriginal<any>()),
  getParticipantNames: () => namesMock(),
}));

import { env, resetEngine } from '../../state/env';
import { showGameFish } from '../configureViz';

// E3 of Mentat/assessment/2026-10-17-epixodic-public-xss-assessment.md.
describe('showGameFish renders participant names as text', () => {
  beforeEach(() => {
    resetXssProbe();
    openMock.mockReset();
    resetEngine('SET3-S:6/TB7');
    for (let i = 0; i < 4; i++) env.engine.addPoint({ winner: 0 });
    // the chart is drawn on the next frame; this test is about the name row only
    vi.stubGlobal('requestAnimationFrame', () => 0);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows hostile names literally in the gf_player row', () => {
    namesMock.mockReturnValue([XSS_PAYLOAD, `Bo ${XSS_PAYLOAD}`]);
    showGameFish();
    expect(openMock).toHaveBeenCalledTimes(1);
    const elem = document.createElement('div');
    openMock.mock.calls[0][0].content(elem);
    const players = elem.querySelectorAll('.gf_players .gf_player');
    expect(players).toHaveLength(2);
    expectRenderedAsText(players[0]);
    expectRenderedAsText(players[1], `Bo ${XSS_PAYLOAD}`);
  });
});

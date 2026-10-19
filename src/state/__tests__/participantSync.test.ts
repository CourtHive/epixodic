// @vitest-environment happy-dom
import { expectRenderedAsText, resetXssProbe, XSS_PAYLOAD } from '../../__tests__/helpers/xssProbe';
import { env, getParticipantNames, resetEngine, updateParticipant } from '../env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scoreGovernor } from 'tods-competition-factory';

const { openMock } = vi.hoisted(() => ({ openMock: vi.fn() }));

vi.mock('courthive-components', async (importOriginal) => ({
  ...(await importOriginal<any>()),
  cModal: { open: openMock, close: vi.fn() },
}));

import { showGameFish } from '../../display/configureViz';

// An undo rebuilds the state; a factory with #5515(factory) keeps the sides' participants through it,
// 7.15.0 recreates the sides empty. Measured on the engine itself rather than read from a version.
function rebuildKeepsParticipants(): boolean {
  const engine = new scoreGovernor.ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
  const state: any = engine.getState();
  state.sides[0].participant = { participantId: 'probe', participantName: 'Probe' };
  engine.setState(state);
  engine.addPoint({ winner: 0 });
  engine.undo();
  return (engine.getState() as any).sides?.[0]?.participant?.participantName === 'Probe';
}

// The classic scorer's names reach the engine. syncParticipantToEngine wrote the side onto the copy
// getState() returns, so the engine kept 'Player 1'/'Player 2' and every view reading engine sides
// (GameFish, getParticipantNames) never showed the names a scorer entered or a tournament staged.
describe('updateParticipant writes the participant into the engine', () => {
  beforeEach(() => {
    resetXssProbe();
    openMock.mockReset();
    resetEngine('SET3-S:6/TB7');
    vi.stubGlobal('requestAnimationFrame', () => 0);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('the engine reports the names entered for each side', () => {
    updateParticipant({ sideNumber: 1, person: { standardGivenName: 'Ann', standardFamilyName: 'Lee' } });
    updateParticipant({ sideNumber: 2, person: { standardGivenName: 'Bo', standardFamilyName: 'Kim' } });
    expect(getParticipantNames()).toEqual(['Ann Lee', 'Bo Kim']);
  });

  it('a rename mid-match keeps the score, the history and what redo would restore', () => {
    for (let i = 0; i < 5; i++) env.engine.addPoint({ winner: 0 });
    env.engine.undo();
    const score = env.engine.getScore();
    const points = env.engine.getPointCount();
    expect(env.engine.canRedo()).toBe(true);

    updateParticipant({ sideNumber: 1, person: { standardGivenName: 'Ann', standardFamilyName: 'Lee' } });

    expect(getParticipantNames()[0]).toBe('Ann Lee');
    expect(env.engine.getScore()).toEqual(score);
    expect(env.engine.getPointCount()).toBe(points);
    expect(env.engine.canRedo()).toBe(true);
    env.engine.redo();
    expect(env.engine.getPointCount()).toBe(points + 1);
  });

  it('the names survive undo, which rebuilds the state from its timeline', (ctx) => {
    if (!rebuildKeepsParticipants()) ctx.skip();
    updateParticipant({ sideNumber: 2, person: { standardGivenName: 'Bo', standardFamilyName: 'Kim' } });
    for (let i = 0; i < 3; i++) env.engine.addPoint({ winner: 1 });
    env.engine.undo();
    expect(getParticipantNames()[1]).toBe('Bo Kim');
  });

  it('a hostile name now reaches GameFish, and is shown there as text', () => {
    updateParticipant({ sideNumber: 1, person: { standardGivenName: XSS_PAYLOAD, standardFamilyName: 'Smith' } });
    for (let i = 0; i < 4; i++) env.engine.addPoint({ winner: 0 });
    showGameFish();
    const elem = document.createElement('div');
    openMock.mock.calls[0][0].content(elem);
    expectRenderedAsText(elem.querySelectorAll('.gf_players .gf_player')[0], `${XSS_PAYLOAD} Smith`);
  });
});

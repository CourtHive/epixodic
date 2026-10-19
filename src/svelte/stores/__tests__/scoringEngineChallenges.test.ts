import { describe, it, expect, beforeEach } from 'vitest';
import {
  initScoringEngine,
  destroyScoringEngine,
  addPoint,
  undo,
  recordChallengeEntry,
  removeChallengeEntry,
  getEngineState,
  setEngineState,
} from '../scoringEngine.svelte';

/**
 * Challenges are `challenge` entries on the engine's timeline. They used to be pushed onto a
 * getState() copy and lost, so BoltScoringPage's one-per-arc limit counted 0 forever.
 */

function challenges(): { index: number; side: number }[] {
  const entries: any[] = getEngineState()?.history?.entries ?? [];
  return entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry?.type === 'challenge')
    .map(({ entry, index }) => ({ index, side: entry.data?.sideNumber }));
}

describe('challenge entries', () => {
  beforeEach(() => {
    destroyScoringEngine();
    initScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    addPoint(0);
  });

  it('a recorded challenge is on the timeline', () => {
    recordChallengeEntry(2);
    expect(challenges()).toEqual([{ index: 1, side: 2 }]);
  });

  it('a removed challenge is gone, and removing a point entry is refused', () => {
    recordChallengeEntry(1);
    removeChallengeEntry(0); // index 0 is the point, not a challenge
    expect(challenges()).toHaveLength(1);
    removeChallengeEntry(1);
    expect(challenges()).toEqual([]);
    expect(getEngineState().history.points).toHaveLength(1);
  });

  it('survives undoing a later point, and a reload', () => {
    recordChallengeEntry(1);
    addPoint(1);
    undo();
    expect(challenges()).toEqual([{ index: 1, side: 1 }]);

    const saved = getEngineState();
    destroyScoringEngine();
    initScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    setEngineState(saved);
    expect(challenges()).toEqual([{ index: 1, side: 1 }]);
  });

  it('does not change the score', () => {
    const before = getEngineState().score;
    recordChallengeEntry(2);
    expect(getEngineState().score).toEqual(before);
  });
});

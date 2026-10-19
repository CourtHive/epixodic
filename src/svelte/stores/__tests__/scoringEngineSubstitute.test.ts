import { scoreGovernor } from 'tods-competition-factory';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  initScoringEngine,
  destroyScoringEngine,
  setLineUp,
  substitute,
  getEngineState,
} from '../scoringEngine.svelte';

/**
 * The store passes the engine's substitution result through, so BoltScoringPage's
 * executeSubstitution moves its clocks, side ids and tie participant only when the engine accepted
 * the substitution: the host and the engine cannot disagree about who is on court.
 */

// The refusals need a factory whose substitute() returns a result (it ships with evaluateSubstitution)
const REFUSES = typeof (scoreGovernor.ScoringEngine.prototype as any).evaluateSubstitution === 'function';

function onCourt(sideNumber: 1 | 2): string[] {
  const side = getEngineState()?.sides?.find((s: any) => s.sideNumber === sideNumber);
  return (side?.lineUp ?? []).map((tc: any) => tc.participantId);
}

describe('substitute — the engine result', () => {
  beforeEach(() => {
    destroyScoringEngine();
    initScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    setLineUp(1, [{ participantId: 'A' }, { participantId: 'B' }]);
    setLineUp(2, [{ participantId: 'C' }, { participantId: 'D' }]);
  });

  it('a valid substitution succeeds and changes who is on court', () => {
    expect(substitute(1, 'A', 'E')).toEqual({ success: true });
    expect(onCourt(1)).toEqual(['E', 'B']);
  });

  it.skipIf(!REFUSES)('a player already on court is refused, and nothing changes', () => {
    expect(substitute(1, 'A', 'B')).toEqual({ success: false, error: 'IN_ALREADY_ON_COURT' });
    expect(substitute(1, 'A', 'C')).toEqual({ success: false, error: 'IN_ALREADY_ON_COURT' });
    expect(onCourt(1)).toEqual(['A', 'B']);
    expect(getEngineState()?.history?.substitutions ?? []).toEqual([]);
  });

  it.skipIf(!REFUSES)('an outgoing player not on that side is refused', () => {
    expect(substitute(1, 'C', 'E')).toEqual({ success: false, error: 'OUT_NOT_ON_SIDE' });
  });

  it('without an engine there is nothing to substitute', () => {
    destroyScoringEngine();
    expect(substitute(1, 'A', 'E')).toEqual({ success: false, error: 'NO_ENGINE' });
  });
});

import { describe, expect, it } from 'vitest';

import { ARC_DECIDING_POINT_RULE, arcIsLevel, arcWinningSide, buildArcDecisionOutcome } from '../arcDecision';

const teamMatchUp: any = { matchUpId: 'dual-1', drawId: 'draw-1', tournamentId: 'tourn-1', matchUpType: 'TEAM' };

describe('the Arc deciding point (PORTFOLIO-016)', () => {
  it('is needed only when the team total is level', () => {
    expect(arcIsLevel({ side1: 140, side2: 140 })).toBe(true);
    expect(arcIsLevel({ side1: 141, side2: 140 })).toBe(false);
  });

  it('the team total decides when it is not level; the deciding point cannot overturn it', () => {
    expect(arcWinningSide({ side1: 141, side2: 140 })).toBe(1);
    expect(arcWinningSide({ side1: 139, side2: 140 }, 1)).toBe(2);
  });

  it('a level total is won by the deciding point, and has no winner before it', () => {
    expect(arcWinningSide({ side1: 140, side2: 140 })).toBeUndefined();
    expect(arcWinningSide({ side1: 140, side2: 140 }, 2)).toBe(2);
  });

  it('is recorded on the TEAM dual as a competition-rule decision, with no sets and no tieMatchUp', () => {
    const dto = buildArcDecisionOutcome({ teamMatchUp, decidingPointSide: 2 });
    expect(dto).toEqual({
      tournamentId: 'tourn-1',
      matchUpId: 'dual-1',
      drawId: 'draw-1',
      outcome: {
        matchUpStatus: 'COMPLETED',
        winningSide: 2,
        score: {
          overtime: {
            decidedIn: 'EXTERNAL',
            decidedBy: { method: 'COMPETITION_RULE', rule: ARC_DECIDING_POINT_RULE, tally: [0, 1] },
          },
        },
      },
    });
    // sets would replace the dual's aggregate; the decision is laid over it (factory #6288)
    expect(dto?.outcome.score.sets).toBeUndefined();
  });

  it('is not submitted without a backing tournament (demo mode)', () => {
    expect(buildArcDecisionOutcome({ teamMatchUp: null, decidingPointSide: 1 })).toBeNull();
    expect(
      buildArcDecisionOutcome({ teamMatchUp: { ...teamMatchUp, tournamentId: undefined }, decidingPointSide: 1 }),
    ).toBeNull();
  });
});

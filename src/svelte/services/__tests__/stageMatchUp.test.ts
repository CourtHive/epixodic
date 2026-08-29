import { describe, expect, it } from 'vitest';

import { buildMatchData } from '../stageMatchUp';

const FORMAT = 'SET5-S:6/TB7-F:TB10';

/** Non-degenerate on purpose: a format that is NOT the historic hardcoded default. */
const matchUp: any = {
  matchUpId: 'm1',
  matchUpFormat: FORMAT,
  tournamentId: 't1',
  drawId: 'd1',
  sides: [{ sideNumber: 1 }, { sideNumber: 2 }],
  score: { sets: [] },
};

describe('buildMatchData', () => {
  it('carries the factory format through untouched', () => {
    const staged = buildMatchData(matchUp);
    expect(staged.ok).toBe(true);
    if (!staged.ok) return;
    expect(staged.matchData.matchUpFormat).toBe(FORMAT);
    expect(staged.matchData.drawId).toBe('d1');
    expect(staged.matchData.match.tournamentId).toBe('t1');
  });

  it('REFUSES a matchUp with no matchUpFormat rather than defaulting it', () => {
    // The whole point. A score stored against a guessed format is uninterpretable, not merely
    // imprecise, and nothing downstream could tell it apart from a real one.
    const { matchUpFormat, ...withoutFormat } = matchUp;
    expect(matchUpFormat).toBe(FORMAT); // control: the field really was there to remove
    // toMatchObject rather than narrowing: the assertion is about the whole refusal, and it keeps the
    // discriminant and the reason checked together.
    expect(buildMatchData(withoutFormat as any)).toMatchObject({
      reason: expect.stringContaining('matchUpFormat'),
      ok: false,
    });
  });

  it('REFUSES an empty-string format — falsy is not a format', () => {
    expect(buildMatchData({ ...matchUp, matchUpFormat: '' }).ok).toBe(false);
  });

  it('REFUSES a matchUp with no matchUpId', () => {
    expect(buildMatchData({ ...matchUp, matchUpId: undefined }).ok).toBe(false);
  });
});

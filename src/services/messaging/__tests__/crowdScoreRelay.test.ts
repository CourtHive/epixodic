import { beforeEach, describe, expect, it, vi } from 'vitest';

// Capture what reaches the relay producer; the identity is swapped per test.
const { submitCrowdScore, identity } = vi.hoisted(() => ({
  submitCrowdScore: vi.fn(),
  identity: { current: null as any },
}));
vi.mock('../crowdRelay', () => ({ submitCrowdScore }));
vi.mock('../crowdScorerIdentity', () => ({ getCrowdScorerIdentity: () => identity.current }));

import { crowdSessionId, relayCrowdScoreIfLaunched } from '../crowdScoreRelay';

const MATCHUP_ID = 'm-1';

function scorer(personId: string | null, token = `token-${personId}`): any {
  return { token, personId, displayName: `Scorer ${personId}`, verified: true };
}

function relay(): any {
  relayCrowdScoreIfLaunched({ matchUpId: MATCHUP_ID, tournamentId: 't-1', currentScore: {} });
  const calls = submitCrowdScore.mock.calls;
  return calls[calls.length - 1]?.[0];
}

describe('relayCrowdScoreIfLaunched session ids', () => {
  beforeEach(() => {
    submitCrowdScore.mockClear();
    identity.current = null;
  });

  it('gives two scorers of the same matchUp different sessions (the relay rejects a non-owner)', () => {
    identity.current = scorer('person-a');
    const first = relay().sessionId;
    identity.current = scorer('person-b');
    const second = relay().sessionId;
    expect(first).not.toBe(second);
    expect(first).toBe(crowdSessionId(MATCHUP_ID, 'person-a'));
  });

  it('keeps one scorer on one session across points', () => {
    identity.current = scorer('person-a');
    expect(relay().sessionId).toBe(relay().sessionId);
  });

  it('falls back to the device client id when the token carries no personId', () => {
    identity.current = scorer(null, 'anon-token');
    const sessionId = relay().sessionId;
    expect(sessionId).toMatch(/^epx-crowd-epx-.+-m-1$/);
    expect(sessionId).not.toBe(`epx-crowd-${MATCHUP_ID}`);
  });

  it('sends nothing without a launched scorer identity', () => {
    relayCrowdScoreIfLaunched({ matchUpId: MATCHUP_ID, currentScore: {} });
    expect(submitCrowdScore).not.toHaveBeenCalled();
  });
});

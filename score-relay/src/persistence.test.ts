import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { buildScorePayload, configurePersistence, persistMatchHistory } from './persistence.js';
import type { MatchHistory } from './types.js';

vi.mock('axios', () => ({
  default: { post: vi.fn() },
}));

const mockedPost = vi.mocked(axios.post);

const baseHistory: MatchHistory = {
  matchUpId: 'mu-1',
  tournamentId: 't-abc',
  matchUpFormat: 'SET3-S:6/TB7',
  points: [],
};

describe('buildScorePayload', () => {
  it('produces a flat SetMatchUpStatusDto with outcome block', () => {
    const payload = buildScorePayload({
      ...baseHistory,
      score: { sets: [{ setNumber: 1, side1Score: 6, side2Score: 4, winningSide: 1 }], winningSide: 1 },
    });
    expect(payload).toEqual({
      tournamentId: 't-abc',
      matchUpId: 'mu-1',
      matchUpFormat: 'SET3-S:6/TB7',
      outcome: {
        matchUpStatus: 'COMPLETED',
        winningSide: 1,
        matchUpFormat: 'SET3-S:6/TB7',
        score: { sets: [{ setNumber: 1, side1Score: 6, side2Score: 4, winningSide: 1 }] },
      },
    });
  });

  it('marks matchUpStatus IN_PROGRESS when winningSide is unset', () => {
    const payload = buildScorePayload({ ...baseHistory, score: { sets: [{ setNumber: 1, side1Score: 3, side2Score: 2 }] } });
    expect(payload.outcome.matchUpStatus).toBe('IN_PROGRESS');
    expect(payload.outcome.winningSide).toBeUndefined();
  });

  it('omits outcome.score when no sets are present', () => {
    const payload = buildScorePayload({ ...baseHistory, score: { winningSide: 2 } });
    expect(payload.outcome.score).toBeUndefined();
    expect(payload.outcome.winningSide).toBe(2);
  });

  it('does not emit drawId — CFS resolves it server-side', () => {
    const payload = buildScorePayload(baseHistory) as Record<string, unknown>;
    expect('drawId' in payload).toBe(false);
  });
});

// T1 — persistMatchHistory HTTP path coverage. Previously only the pure
// payload builder had assertions; the axios POST, bearer attach,
// retry+backoff loop, and skip branches were untested. A regression that
// drops the Authorization header or inverts the skip-guard would have
// shipped green.
describe('persistMatchHistory (HTTP path)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedPost.mockReset();
    // Reset module-level config before each test.
    configurePersistence(undefined, undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('skips silently when factoryServerUrl is not configured', async () => {
    // No configurePersistence call — both URL and JWT remain undefined.
    await persistMatchHistory({ ...baseHistory });
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('skips when history is missing tournamentId', async () => {
    configurePersistence('https://courthive.net');
    await persistMatchHistory({ ...baseHistory, tournamentId: undefined } as any);
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('POSTs to /factory/score with the buildScorePayload body and no Authorization header when no JWT is configured', async () => {
    configurePersistence('https://courthive.net');
    mockedPost.mockResolvedValueOnce({ status: 200, data: { success: true } } as any);

    const history: MatchHistory = {
      ...baseHistory,
      score: { sets: [{ setNumber: 1, side1Score: 6, side2Score: 4, winningSide: 1 }], winningSide: 1 },
    };
    await persistMatchHistory(history);

    expect(mockedPost).toHaveBeenCalledTimes(1);
    const [url, body, config] = mockedPost.mock.calls[0] as [string, unknown, { headers: Record<string, string> }];
    expect(url).toBe('https://courthive.net/factory/score');
    expect(body).toEqual(buildScorePayload(history));
    expect(config.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(config.headers.Authorization).toBeUndefined();
  });

  it('attaches Authorization: Bearer <jwt> when a service JWT is configured', async () => {
    configurePersistence('https://courthive.net', 'svc.jwt.value');
    mockedPost.mockResolvedValueOnce({ status: 200 } as any);

    await persistMatchHistory({ ...baseHistory });

    expect(mockedPost).toHaveBeenCalledTimes(1);
    const [, , config] = mockedPost.mock.calls[0] as [string, unknown, { headers: Record<string, string> }];
    expect(config.headers.Authorization).toBe('Bearer svc.jwt.value');
  });

  it('retries up to 3 times on consecutive failures and never throws', async () => {
    configurePersistence('https://courthive.net', 'svc.jwt');
    mockedPost.mockRejectedValue(new Error('boom'));

    const promise = persistMatchHistory({ ...baseHistory });
    // BASE_DELAY_MS = 1000, exponential backoff → 1s after attempt 1,
    // 2s after attempt 2. After 3 seconds of fake-time, the loop has
    // exhausted MAX_RETRIES = 3 and resolves.
    await vi.advanceTimersByTimeAsync(3000);
    await expect(promise).resolves.toBeUndefined();

    expect(mockedPost).toHaveBeenCalledTimes(3);
  });

  it('stops retrying after the first successful attempt', async () => {
    configurePersistence('https://courthive.net');
    mockedPost
      .mockRejectedValueOnce(new Error('first fails'))
      .mockResolvedValueOnce({ status: 200 } as any);

    const promise = persistMatchHistory({ ...baseHistory });
    await vi.advanceTimersByTimeAsync(1000);
    await promise;

    expect(mockedPost).toHaveBeenCalledTimes(2);
  });
});

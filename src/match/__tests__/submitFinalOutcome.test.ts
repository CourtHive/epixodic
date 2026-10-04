import { beforeEach, describe, expect, it, vi } from 'vitest';

const { store, submitMock, loginMock } = vi.hoisted(() => ({
  store: new Map<string, string>(),
  submitMock: vi.fn(),
  loginMock: vi.fn(),
}));

vi.mock('../../state/browserStorage', () => ({
  browserStorage: {
    get: (k: string) => store.get(k) ?? null,
    set: (k: string, v: string) => store.set(k, v),
    remove: (k: string) => store.delete(k),
  },
}));
vi.mock('../../services/auth/loginState', () => ({ getLoginState: () => loginMock() }));
vi.mock('../../services/messaging/scoreSubmitApi', () => ({ submitOfficialScore: (p: any) => submitMock(p) }));

import { buildOutcomeFromStored, submitFinalOutcomeIfReady, __test__ } from '../submitFinalOutcome';

const COMPLETE = {
  matchUpId: 'mu-1',
  tournamentId: 't-1',
  drawId: 'd-1',
  matchUpStatus: 'COMPLETED',
  winningSide: 1,
  score: { sets: [{ side1Score: 6, side2Score: 3 }] },
};

function seed(matchUpId: string, data: any) {
  store.set(matchUpId, JSON.stringify(data));
}

describe('submitFinalOutcome', () => {
  beforeEach(() => {
    store.clear();
    submitMock.mockReset();
    loginMock.mockReset();
    __test__.reset();
    loginMock.mockReturnValue({ userId: 'u-1' });
    submitMock.mockResolvedValue({ success: true });
  });

  describe('buildOutcomeFromStored', () => {
    it('builds a /factory/score payload from a stored matchUp', () => {
      expect(buildOutcomeFromStored(COMPLETE)).toEqual({
        tournamentId: 't-1',
        matchUpId: 'mu-1',
        drawId: 'd-1',
        outcome: { score: { sets: COMPLETE.score.sets }, winningSide: 1, matchUpStatus: 'COMPLETED' },
      });
    });

    it('returns null when drawId is missing', () => {
      expect(buildOutcomeFromStored({ ...COMPLETE, drawId: undefined })).toBeNull();
    });

    it('falls back to nested match.* ids', () => {
      const out = buildOutcomeFromStored({
        match: { matchUpId: 'mu-2', tournamentId: 't-2', drawId: 'd-2' },
        winningSide: 2,
        score: { sets: [] },
      });
      expect(out?.matchUpId).toBe('mu-2');
      expect(out?.drawId).toBe('d-2');
    });
  });

  it('skips when nothing is stored', async () => {
    expect(await submitFinalOutcomeIfReady('mu-1')).toEqual({ status: 'skipped', reason: 'not-found' });
    expect(submitMock).not.toHaveBeenCalled();
  });

  it('skips an incomplete match', async () => {
    seed('mu-1', { ...COMPLETE, winningSide: undefined, matchUpStatus: 'IN_PROGRESS' });
    expect(await submitFinalOutcomeIfReady('mu-1')).toEqual({ status: 'skipped', reason: 'incomplete' });
    expect(submitMock).not.toHaveBeenCalled();
  });

  it('skips when unauthenticated', async () => {
    loginMock.mockReturnValue(null);
    seed('mu-1', COMPLETE);
    expect(await submitFinalOutcomeIfReady('mu-1')).toEqual({ status: 'skipped', reason: 'unauthenticated' });
    expect(submitMock).not.toHaveBeenCalled();
  });

  it('skips a non-tournament match (no drawId)', async () => {
    seed('mu-1', { ...COMPLETE, drawId: undefined, match: undefined });
    expect(await submitFinalOutcomeIfReady('mu-1')).toEqual({ status: 'skipped', reason: 'not-tournament' });
    expect(submitMock).not.toHaveBeenCalled();
  });

  it('reports not-tournament (not unauthenticated) for a local match with no session', async () => {
    loginMock.mockReturnValue(null);
    seed('mu-1', { ...COMPLETE, drawId: undefined, match: undefined });
    expect(await submitFinalOutcomeIfReady('mu-1')).toEqual({ status: 'skipped', reason: 'not-tournament' });
  });

  it('submits a complete, authorized, tournament-linked outcome', async () => {
    seed('mu-1', COMPLETE);
    const result = await submitFinalOutcomeIfReady('mu-1');
    expect(result).toEqual({ status: 'submitted' });
    expect(submitMock).toHaveBeenCalledWith(
      expect.objectContaining({ tournamentId: 't-1', drawId: 'd-1', matchUpId: 'mu-1' }),
    );
  });

  it('does not re-submit an unchanged outcome (idempotent)', async () => {
    seed('mu-1', COMPLETE);
    await submitFinalOutcomeIfReady('mu-1');
    await submitFinalOutcomeIfReady('mu-1');
    expect(submitMock).toHaveBeenCalledTimes(1);
  });

  it('re-submits when the outcome changes (correction)', async () => {
    seed('mu-1', COMPLETE);
    await submitFinalOutcomeIfReady('mu-1');
    seed('mu-1', { ...COMPLETE, winningSide: 2, score: { sets: [{ side1Score: 3, side2Score: 6 }] } });
    await submitFinalOutcomeIfReady('mu-1');
    expect(submitMock).toHaveBeenCalledTimes(2);
  });

  it('reports an error and does not mark submitted (so it retries)', async () => {
    submitMock.mockResolvedValue({ success: false, error: 'Session expired — please log in again' });
    seed('mu-1', COMPLETE);
    const first = await submitFinalOutcomeIfReady('mu-1');
    expect(first).toEqual({ status: 'error', error: 'Session expired — please log in again' });
    submitMock.mockResolvedValue({ success: true });
    const second = await submitFinalOutcomeIfReady('mu-1');
    expect(second).toEqual({ status: 'submitted' });
    expect(submitMock).toHaveBeenCalledTimes(2);
  });
});

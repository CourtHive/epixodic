import { beforeEach, describe, expect, it, vi } from 'vitest';

const { submitMock, fetchMock, stateMock, requestLoginMock } = vi.hoisted(() => ({
  submitMock: vi.fn(),
  fetchMock: vi.fn(),
  stateMock: vi.fn(),
  requestLoginMock: vi.fn(),
}));

vi.mock('../submitFinalOutcome', () => ({ submitFinalOutcomeIfReady: (id: string) => submitMock(id) }));
vi.mock('../../svelte/stores/eventData.svelte', () => ({
  fetchEventMatchUps: (t: string, e: string) => fetchMock(t, e),
  getEventDataState: () => stateMock(),
}));
vi.mock('../../services/auth/loginPrompt', () => ({ requestLogin: (cb?: () => void) => requestLoginMock(cb) }));

import { finalizeMatchOutcome } from '../finalizeMatchOutcome';

describe('finalizeMatchOutcome', () => {
  beforeEach(() => {
    submitMock.mockReset();
    fetchMock.mockReset();
    stateMock.mockReset();
    requestLoginMock.mockReset();
    (globalThis as any).dispatchEvent = vi.fn();
    stateMock.mockReturnValue({ tournamentId: 't-1', eventId: 'e-1' });
  });

  it('refreshes the draw after a successful submit', async () => {
    submitMock.mockResolvedValue({ status: 'submitted' });
    await finalizeMatchOutcome('mu-1');
    expect(fetchMock).toHaveBeenCalledWith('t-1', 'e-1');
    expect((globalThis as any).dispatchEvent).toHaveBeenCalled();
    expect(requestLoginMock).not.toHaveBeenCalled();
  });

  it('does not refresh when there is no loaded tournament context', async () => {
    submitMock.mockResolvedValue({ status: 'submitted' });
    stateMock.mockReturnValue({ tournamentId: undefined, eventId: undefined });
    await finalizeMatchOutcome('mu-1');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('prompts login (with a retry callback) when unauthenticated', async () => {
    submitMock.mockResolvedValue({ status: 'skipped', reason: 'unauthenticated' });
    await finalizeMatchOutcome('mu-1');
    expect(requestLoginMock).toHaveBeenCalledTimes(1);
    expect(typeof requestLoginMock.mock.calls[0][0]).toBe('function');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing for other skip reasons', async () => {
    submitMock.mockResolvedValue({ status: 'skipped', reason: 'not-tournament' });
    await finalizeMatchOutcome('mu-1');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(requestLoginMock).not.toHaveBeenCalled();
  });

  it('never throws when the submit rejects', async () => {
    submitMock.mockRejectedValue(new Error('boom'));
    await expect(finalizeMatchOutcome('mu-1')).resolves.toBeUndefined();
  });
});

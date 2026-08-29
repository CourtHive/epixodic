import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the shared axios wrapper so the factory API layer can be tested without a
// live server. Note the module also reads import.meta.env / creates an axios
// instance at load — mocking it wholesale avoids that side effect too.
vi.mock('../../../services/messaging/baseApi', () => ({
  baseApi: { post: vi.fn() },
}));

import { baseApi } from '../../../services/messaging/baseApi';
import { getTournamentInfo, getEventData } from '../factoryApi';

const post = () => vi.mocked(baseApi.post);

describe('factoryApi.getTournamentInfo', () => {
  beforeEach(() => {
    vi.mocked(baseApi.post).mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('unwraps { tournamentInfo } into { data } on success', async () => {
    post().mockResolvedValue({ data: { success: true, tournamentInfo: { tournamentName: 'Demo', tournamentId: 't1' } } });
    const res = await getTournamentInfo('t1');
    expect(res.data).toMatchObject({ tournamentName: 'Demo', tournamentId: 't1' });
    expect(res.error).toBeUndefined();
  });

  it('returns a not-found error when the response carries no tournamentInfo', async () => {
    post().mockResolvedValue({ data: { success: true } });
    const res = await getTournamentInfo('t1');
    expect(res.data).toBeUndefined();
    expect(res.error).toBe('Tournament not found: t1');
  });

  it('maps a rejected request to { error } instead of throwing (interceptor no longer swallows)', async () => {
    // Regression guard: the baseApi response interceptor now re-rejects failed
    // requests. Previously it resolved `undefined`, and reading `response.data`
    // here threw the misleading "Cannot read properties of undefined (reading
    // 'data')". This asserts a failed request surfaces the real message.
    post().mockRejectedValue(new Error('Request failed with status code 401'));
    const res = await getTournamentInfo('t1');
    expect(res.data).toBeUndefined();
    expect(res.error).toBe('Request failed with status code 401');
  });
});

describe('factoryApi.getEventData', () => {
  beforeEach(() => {
    vi.mocked(baseApi.post).mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('passes the response body through as { data }', async () => {
    post().mockResolvedValue({ data: { success: true, eventData: { drawsData: [] } } });
    const res = await getEventData('t1', 'e1');
    expect(res.data).toEqual({ success: true, eventData: { drawsData: [] } });
  });

  it('asks for hydrated participants EXPLICITLY — this app renders side.participant directly', async () => {
    // hydrateParticipants is opt-OUT on getEventData, so omitting it happened to work. It also meant
    // sharing a cache entry with callers that send `false` (courthive-public does), which serves this
    // app sides carrying only a participantId and renders them nameless. Declare what we need.
    post().mockResolvedValue({ data: { success: true, eventData: { drawsData: [] } } });
    await getEventData('t1', 'e1');

    expect(vi.mocked(baseApi.post)).toHaveBeenCalledWith('/factory/eventdata', {
      hydrateParticipants: true,
      tournamentId: 't1',
      eventId: 'e1',
    });
  });

  it('maps a rejected request to { error }', async () => {
    post().mockRejectedValue(new Error('Network Error'));
    const res = await getEventData('t1', 'e1');
    expect(res.error).toBe('Network Error');
  });
});

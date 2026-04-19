import { describe, it, expect, vi, beforeEach } from 'vitest';
import { submitOfficialScore, type ScoreSubmitParams } from '../scoreSubmitApi';
import { baseApi } from '../baseApi';

vi.mock('../baseApi', () => ({
  baseApi: {
    post: vi.fn(),
  },
}));

const mockPost = vi.mocked(baseApi.post);

function makeParams(overrides: Partial<ScoreSubmitParams> = {}): ScoreSubmitParams {
  return {
    tournamentId: 'tid-001',
    matchUpId: 'mu-001',
    drawId: 'draw-001',
    outcome: {
      score: { sets: [{ side1Score: 14, side2Score: 9 }] },
      matchUpStatus: 'IN_PROGRESS',
    },
    ...overrides,
  };
}

describe('submitOfficialScore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success on 200 response', async () => {
    mockPost.mockResolvedValue({ status: 200, data: { success: true } });

    const result = await submitOfficialScore(makeParams());

    expect(result.success).toBe(true);
    expect(mockPost).toHaveBeenCalledWith('/factory/score', expect.objectContaining({
      tournamentId: 'tid-001',
      matchUpId: 'mu-001',
    }));
  });

  it('returns success when data.success is true', async () => {
    mockPost.mockResolvedValue({ status: 201, data: { success: true } });

    const result = await submitOfficialScore(makeParams());
    expect(result.success).toBe(true);
  });

  it('returns failure on non-success response', async () => {
    mockPost.mockResolvedValue({ status: 500, data: { error: 'Server error' } });

    const result = await submitOfficialScore(makeParams());
    expect(result.success).toBe(false);
    expect(result.error).toBe('Server error');
  });

  it('returns auth error on 401', async () => {
    mockPost.mockRejectedValue({ response: { status: 401 } });

    const result = await submitOfficialScore(makeParams());
    expect(result.success).toBe(false);
    expect(result.error).toContain('Session expired');
  });

  it('returns network error on rejection', async () => {
    mockPost.mockRejectedValue(new Error('Network Error'));

    const result = await submitOfficialScore(makeParams());
    expect(result.success).toBe(false);
    expect(result.error).toBe('Network Error');
  });

  it('passes the full DTO to the server', async () => {
    mockPost.mockResolvedValue({ status: 200, data: { success: true } });

    const params = makeParams({
      outcome: {
        score: { sets: [{ side1Score: 20, side2Score: 15 }] },
        winningSide: 1,
        matchUpStatus: 'COMPLETED',
      },
    });

    await submitOfficialScore(params);

    expect(mockPost).toHaveBeenCalledWith('/factory/score', {
      tournamentId: 'tid-001',
      matchUpId: 'mu-001',
      drawId: 'draw-001',
      outcome: {
        score: { sets: [{ side1Score: 20, side2Score: 15 }] },
        winningSide: 1,
        matchUpStatus: 'COMPLETED',
      },
    });
  });
});

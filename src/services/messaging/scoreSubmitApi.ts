import { baseApi } from './baseApi';

export interface ScoreSubmitParams {
  tournamentId: string;
  matchUpId: string;
  drawId: string;
  outcome: {
    score: { sets: any[] };
    winningSide?: number;
    matchUpStatus: string;
  };
}

export interface ScoreSubmitResult {
  success: boolean;
  error?: string;
}

export async function submitOfficialScore(params: ScoreSubmitParams): Promise<ScoreSubmitResult> {
  try {
    const res = await baseApi.post('/factory/score', params);
    if (res?.status === 200 || res?.data?.success) {
      return { success: true };
    }
    return { success: false, error: res?.data?.error || 'Unexpected response' };
  } catch (err: any) {
    if (err?.response?.status === 401) {
      return { success: false, error: 'Session expired — please log in again' };
    }
    return { success: false, error: err?.message || 'Network error' };
  }
}

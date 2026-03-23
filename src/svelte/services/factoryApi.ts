import { baseApi } from '../../services/messaging/baseApi';
import type { TournamentInfo, HydratedMatchUp } from '../types';

interface ApiResult<T> {
  data?: T;
  error?: string;
}

export interface ScheduledMatchUpsResponse {
  dateMatchUps?: Record<string, HydratedMatchUp[]>;
  completedMatchUps?: HydratedMatchUp[];
  groupInfo?: Record<string, any>;
  mappedParticipants?: Record<string, any>;
  courtsData?: any[];
}

export async function getTournamentInfo(tournamentId: string): Promise<ApiResult<TournamentInfo>> {
  try {
    const params = { tournamentId, withMatchUpStats: true, withStructureDetails: true };
    console.log(`[factoryApi] POST /factory/tournamentinfo`, params);
    const response = await baseApi.post('/factory/tournamentinfo', params);
    console.log('[factoryApi] getTournamentInfo response:', response.data);
    // Server wraps the data as { success, tournamentInfo: { ... } }
    const info = response.data?.tournamentInfo || response.data;
    return { data: info };
  } catch (e: any) {
    console.error('[factoryApi] getTournamentInfo error:', e.message, e.response?.status, e.response?.data);
    return { error: e.message || 'Failed to fetch tournament info' };
  }
}

export async function getEventData(
  tournamentId: string,
  eventId: string,
): Promise<ApiResult<any>> {
  try {
    console.log(`[factoryApi] POST /factory/eventdata`, { tournamentId, eventId });
    const response = await baseApi.post('/factory/eventdata', { tournamentId, eventId });
    console.log('[factoryApi] getEventData response:', response.data);
    return { data: response.data };
  } catch (e: any) {
    console.error('[factoryApi] getEventData error:', e.message, e.response?.status, e.response?.data);
    return { error: e.message || 'Failed to fetch event data' };
  }
}

export async function getScheduledMatchUps(
  tournamentId: string,
  options?: Record<string, any>,
): Promise<ApiResult<ScheduledMatchUpsResponse>> {
  try {
    const params = { tournamentId, usePublishState: true, hydrateParticipants: true, ...options };
    console.log('[factoryApi] POST /factory/scheduledmatchups', { params });
    const response = await baseApi.post('/factory/scheduledmatchups', { params });
    console.log('[factoryApi] getScheduledMatchUps response:', response.data);
    return { data: response.data };
  } catch (e: any) {
    console.error('[factoryApi] getScheduledMatchUps error:', e.message, e.response?.status, e.response?.data);
    return { error: e.message || 'Failed to fetch scheduled matchUps' };
  }
}

export async function getParticipants(
  tournamentId: string,
  options?: Record<string, any>,
): Promise<ApiResult<any>> {
  try {
    console.log('[factoryApi] POST /factory/participants', { tournamentId, ...options });
    const response = await baseApi.post('/factory/participants', { tournamentId, ...options });
    console.log('[factoryApi] getParticipants response:', response.data);
    return { data: response.data };
  } catch (e: any) {
    console.error('[factoryApi] getParticipants error:', e.message, e.response?.status, e.response?.data);
    return { error: e.message || 'Failed to fetch participants' };
  }
}

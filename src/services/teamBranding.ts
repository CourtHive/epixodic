import { resolveTeamColors, type TeamPresentation } from 'courthive-components/team-colors';

/** Low-frequency, complete replacement of a match's TEAM identities. Sides are canonical 1/2, never server 0/1. */
export interface TeamBrandingSnapshot {
  matchUpId: string;
  tournamentId?: string;
  teams: Partial<Record<1 | 2, { participantId: string; participantName?: string; colors?: TeamBrandColors }>>;
}

/** Resolved display values for the relay; this is not Participant.teamColors. */
export interface TeamBrandColors {
  roles: Partial<Record<'team.surface' | 'team.text' | 'team.accent' | 'score.surface' | 'score.text', string>>;
}

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200;
const hex = (value: unknown): value is string => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);

const roleNames = new Set(['team.surface', 'team.text', 'team.accent', 'score.surface', 'score.text']);

export function normalizeDisplayColors(value: unknown): TeamBrandColors | undefined {
  if (!object(value) || Object.keys(value).some((key) => key !== 'roles') || !object(value.roles)) return undefined;
  const roles: TeamBrandColors['roles'] = {};
  for (const [role, color] of Object.entries(value.roles)) {
    if (!roleNames.has(role) || !hex(color)) return undefined;
    roles[role as keyof typeof roles] = color.toUpperCase();
  }
  return { roles };
}

/** Refuse malformed replacements atomically; only known fields cross the relay boundary. */
export const hasTeams = (snapshot: TeamBrandingSnapshot | undefined): boolean =>
  !!snapshot && (!!snapshot.teams[1] || !!snapshot.teams[2]);

export function parseTeamBranding(value: unknown): TeamBrandingSnapshot | undefined {
  if (!object(value) || !id(value.matchUpId) || !object(value.teams)) return undefined;
  if (value.tournamentId !== undefined && !id(value.tournamentId)) return undefined;
  if (Object.keys(value.teams).some((key) => key !== '1' && key !== '2')) return undefined;
  const teams: TeamBrandingSnapshot['teams'] = {};
  for (const side of [1, 2] as const) {
    const team = value.teams[side];
    if (team === undefined) continue;
    if (!object(team) || !id(team.participantId)) return undefined;
    if (
      team.participantName !== undefined &&
      (typeof team.participantName !== 'string' || team.participantName.length > 200)
    )
      return undefined;
    const colors = team.colors === undefined ? undefined : normalizeDisplayColors(team.colors);
    if (team.colors !== undefined && !colors) return undefined;
    teams[side] = {
      participantId: team.participantId,
      ...(typeof team.participantName === 'string' && { participantName: team.participantName }),
      ...(colors && { colors }),
    };
  }
  if (teams[1] && teams[1].participantId === teams[2]?.participantId) return undefined;
  return { matchUpId: value.matchUpId, ...(id(value.tournamentId) && { tournamentId: value.tournamentId }), teams };
}

/** The hydrated TEAM object is the privacy boundary; never look up raw tournament participants here.
 * Returns undefined when no side resolves to a TEAM: every frame is a whole replacement downstream,
 * so an empty snapshot would erase branding a consumer already holds. */
export function brandingFromSides(
  matchUpId: string,
  tournamentId: string | undefined,
  sides: any[],
  presentation?: TeamPresentation,
): TeamBrandingSnapshot | undefined {
  if (!id(matchUpId)) return undefined;
  const teams: TeamBrandingSnapshot['teams'] = {};
  for (const side of sides ?? []) {
    if (side.sideNumber !== 1 && side.sideNumber !== 2) continue;
    const team = side.teamParticipant ?? (side.participant?.participantType === 'TEAM' ? side.participant : undefined);
    if (!id(team?.participantId)) continue;
    if (team.participantType !== undefined && team.participantType !== 'TEAM') continue;
    const colors = resolveTeamColors(team.teamColors, { participantId: team.participantId, presentation });
    teams[side.sideNumber as 1 | 2] = {
      participantId: team.participantId,
      ...(typeof team.participantName === 'string' && { participantName: team.participantName.slice(0, 200) }),
      ...(colors && { colors }),
    };
  }
  if (!teams[1] && !teams[2]) return undefined;
  return { matchUpId, ...(tournamentId && { tournamentId }), teams };
}

/** True when `teamMatchUp` is the scored match or the TEAM parent of the scored tie matchUp. */
export function teamMatchUpOwns(teamMatchUp: any, matchUpId: string | undefined): boolean {
  if (!id(matchUpId) || !teamMatchUp) return false;
  if (teamMatchUp.matchUpId === matchUpId) return true;
  return (teamMatchUp.tieMatchUps ?? []).some((tieMatchUp: any) => tieMatchUp?.matchUpId === matchUpId);
}

/**
 * Branding for the scored matchUp, or undefined while the loaded TEAM matchUp is missing or still
 * belongs to a previous match: publishing another match's teams (or none) would replace good branding.
 */
export function brandingForMatchUp(
  matchUpId: string | undefined,
  teamMatchUp: any,
  tournamentId?: string,
): TeamBrandingSnapshot | undefined {
  if (!teamMatchUpOwns(teamMatchUp, matchUpId)) return undefined;
  return brandingFromSides(
    matchUpId,
    tournamentId ?? teamMatchUp.tournamentId,
    teamMatchUp.sides ?? [],
    teamMatchUp.teamPresentation,
  );
}

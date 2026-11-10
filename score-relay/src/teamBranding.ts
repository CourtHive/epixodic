/** Low-frequency, complete replacement of a match's TEAM identities. Sides are canonical 1/2, never server 0/1. */
export interface TeamBrandingSnapshot {
  matchUpId: string;
  tournamentId?: string;
  teams: Partial<Record<1 | 2, { participantId: string; participantName?: string; colors?: TeamBrandColors }>>;
}

export interface TeamBrandColors {
  primary: string;
  secondary?: string;
}

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200;
const hex = (value: unknown): value is string => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);

export function normalizeTeamColors(value: unknown): TeamBrandColors | undefined {
  if (!object(value) || Object.keys(value).some((key) => key !== 'primary' && key !== 'secondary')) return undefined;
  if (!hex(value.primary) || (value.secondary !== undefined && !hex(value.secondary))) return undefined;
  return {
    primary: value.primary.toUpperCase(),
    ...(hex(value.secondary) && { secondary: value.secondary.toUpperCase() }),
  };
}

/** Refuse malformed replacements atomically; only known fields cross the relay boundary. */
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
    const colors = team.colors === undefined ? undefined : normalizeTeamColors(team.colors);
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

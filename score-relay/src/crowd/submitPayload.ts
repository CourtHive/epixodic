/** The fields `/crowd` requires on every `submitCrowdScore` frame. */
export interface SubmitPayloadShape {
  sessionId: string;
  matchUpId: string;
  tournamentId: string;
  clientId: string;
  point: { winner: 1 | 2 };
}

/**
 * The shape check `/crowd` applies to every `submitCrowdScore` frame. Kept free
 * of server imports so a producer's tests (epixodic's crowd bridge) can run the
 * relay's own rule instead of a copy of it.
 */
export function isValidSubmitPayload(payload: unknown): payload is SubmitPayloadShape {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Partial<SubmitPayloadShape>;
  return (
    typeof p.sessionId === 'string' &&
    typeof p.matchUpId === 'string' &&
    typeof p.tournamentId === 'string' &&
    typeof p.clientId === 'string' &&
    p.point != null &&
    typeof p.point === 'object' &&
    (p.point.winner === 1 || p.point.winner === 2)
  );
}

/**
 * Payload shapes pushed to score-relay by competition-factory-server's
 * ProjectorService. These mirror the canonical types in
 * competition-factory-server/src/modules/projectors/types/.
 *
 * Kept narrow on purpose: score-relay only forwards these payloads, it
 * doesn't introspect them.
 *
 * The scorebug intake accepts both ScorebugPayload (event-driven) and
 * ScorebugClockTick (sub-second cadence). They are discriminated by
 * the required `kind` field — `'event'` vs `'tick'`.
 */
export function isScorebugTick(payload) {
    return payload.kind === 'tick';
}

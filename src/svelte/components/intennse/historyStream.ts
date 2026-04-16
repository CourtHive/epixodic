/**
 * Pure helpers that convert the raw `engine.getState().history.points`
 * stream into display-ready rows for the point-history viewer. Kept out
 * of the Svelte component so the derivation is independently unit-
 * testable and the Svelte file stays a thin renderer on top.
 *
 * Phase 2 of the penalty-history-derivation workstream.
 * Phase 3 will consume the same `PointHistoryEntry.pointIndex` +
 * `sourceTieMatchUpId` handles to surface edit/remove actions.
 */

export type PointResultKind =
  | 'winner'
  | 'touch'
  | 'forcedError'
  | 'unforcedError'
  | 'ace'
  | 'fault'
  | 'penalty'
  | 'adjustment'
  | 'other';

export interface PointHistoryEntry {
  /** Stable index of the point within its tieMatchUp's history. */
  pointIndex: number;
  /** Original ISO timestamp when present (from addPoint). */
  timestamp?: string;
  /** Short HH:MM clock label derived from the timestamp. */
  timeLabel: string;
  /** Which side earned the point — 1 or 2. */
  winningSide: 1 | 2;
  /** Display label for the winning side (falls back to "Side N"). */
  sideLabel: string;
  /** Normalised classification driving icon + colour. */
  kind: PointResultKind;
  /** Raw `result` field from the point, for tooltips / detail modals. */
  rawResult?: string;
  /** Short glyph shown in the row. */
  glyph: string;
  /** Score value awarded (>1 for penalty multi-point awards). */
  scoreValue: number;
  /** True when the winner was the server at the time of the point. */
  wonOnServe: boolean;
  /** Player name penalised (penalty rows only). */
  penaltyAgainstParticipantName?: string;
  /** Length of the rally in shots, when the scorer logged it. */
  rallyLength?: number;
}

export interface HistoryStreamSides {
  side1Name?: string;
  side2Name?: string;
}

export interface BuildHistoryStreamOptions extends HistoryStreamSides {
  /**
   * When true, filter out `adjustmentEvent` rows (break-point awards).
   * Default false — the scorekeeper's audit view wants everything.
   */
  hideAdjustments?: boolean;
}

/**
 * Classify a point's `result` field. The factory does not enforce an
 * enum — scorer, penalty path and adjustment path all set `result` to
 * plain strings — so we normalise here.
 */
export function classifyPointResult(point: any): PointResultKind {
  if (point?.adjustmentEvent) return 'adjustment';
  if (point?.penaltyEvent) return 'penalty';
  const raw = (point?.result ?? '').toString().toLowerCase().replace(/\s+/g, '');
  if (raw === 'winner') return 'winner';
  if (raw === 'touch') return 'touch';
  if (raw === 'forcederror') return 'forcedError';
  if (raw === 'unforcederror') return 'unforcedError';
  if (raw === 'error') return 'unforcedError';
  if (raw === 'ace') return 'ace';
  if (raw === 'fault') return 'fault';
  return 'other';
}

const GLYPH_BY_KIND: Record<PointResultKind, string> = {
  winner: 'W',
  touch: 'T',
  forcedError: 'FE',
  unforcedError: 'UE',
  ace: 'A',
  fault: 'F',
  penalty: 'P',
  adjustment: '±',
  other: '•',
};

export function glyphForKind(kind: PointResultKind): string {
  return GLYPH_BY_KIND[kind];
}

/**
 * Format an ISO timestamp into a short "HH:MM" label. Undefined input
 * returns an empty string so the renderer doesn't have to branch.
 */
export function formatTimeLabel(timestamp?: string): string {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return '';
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Side label with a safe fallback. */
function sideLabelFor(sideNumber: 1 | 2, sides: HistoryStreamSides): string {
  if (sideNumber === 1) return sides.side1Name || 'Side 1';
  return sides.side2Name || 'Side 2';
}

/** Was the winner serving at the time of the point? */
function wonOnServe(point: any): boolean {
  if (typeof point?.winner !== 'number') return false;
  if (typeof point?.server !== 'number') return false;
  return point.winner === point.server;
}

/**
 * Project a single point into the display shape. Exposed so Phase 3 can
 * re-use the mapping for its detail modal.
 */
export function buildHistoryEntry(
  point: any,
  fallbackIndex: number,
  sides: HistoryStreamSides,
): PointHistoryEntry {
  const winningSide: 1 | 2 = (point?.winningSide === 1 || point?.winningSide === 2)
    ? point.winningSide
    : (point?.winner === 0 ? 1 : 2);
  const kind = classifyPointResult(point);
  return {
    pointIndex: typeof point?.index === 'number' ? point.index : fallbackIndex,
    timestamp: point?.timestamp,
    timeLabel: formatTimeLabel(point?.timestamp),
    winningSide,
    sideLabel: sideLabelFor(winningSide, sides),
    kind,
    rawResult: point?.result,
    glyph: glyphForKind(kind),
    scoreValue: typeof point?.scoreValue === 'number' ? point.scoreValue : 1,
    wonOnServe: wonOnServe(point),
    penaltyAgainstParticipantName: point?.penaltyAgainstParticipantName,
    rallyLength: typeof point?.rallyLength === 'number' ? point.rallyLength : undefined,
  };
}

/**
 * Build the full display list, most-recent-first. Skips null/undefined
 * points defensively (historical serialisations have occasionally
 * contained holes).
 */
export function buildHistoryStream(
  points: any[] | undefined | null,
  options: BuildHistoryStreamOptions = {},
): PointHistoryEntry[] {
  if (!Array.isArray(points) || points.length === 0) return [];
  const rows: PointHistoryEntry[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!p) continue;
    if (options.hideAdjustments && p.adjustmentEvent) continue;
    rows.push(buildHistoryEntry(p, i, options));
  }
  // Most recent at the top — scorekeeper's eye goes there first.
  rows.reverse();
  return rows;
}

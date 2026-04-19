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

/** An entry in the unified stream — either a scored point, a bolt boundary, or a substitution. */
export type StreamEntryType = 'point' | 'boltBoundary' | 'substitution' | 'challenge';

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

/**
 * Why a point's winner was corrected after the fact.
 *
 * - `scorekeepingError` — the live scorekeeper recorded the wrong side;
 *   play continued with the actual (correct) winner, so the rebuild
 *   re-derives score + serve order from the flipped chain.
 * - `reviewCorrection` — the original on-court call was later reversed
 *   (video review, umpire change). Play already continued based on the
 *   now-flipped call, so the serve order of subsequent points is
 *   preserved as historically played via `serverPinned: true`.
 */
export type WinnerEditReason = 'scorekeepingError' | 'reviewCorrection';

export interface PointHistoryEntry {
  /** What kind of stream item — points are the primary; bolt boundaries
   *  and substitutions are interleaved visual separators. */
  entryType: StreamEntryType;
  /** Stable index of the point within its tieMatchUp's history.
   *  -1 for non-point entries. */
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

  // ── Non-point entry fields ─────────────────────────────────────────
  /** Substitution: outgoing player name. */
  subOutName?: string;
  /** Substitution: incoming player name. */
  subInName?: string;
  /** Substitution: side number. */
  subSideNumber?: 1 | 2;
  /** Bolt boundary: label for the divider (e.g. "BOLT 1 → 2"). */
  boundaryLabel?: string;
  /** Challenge: side that used their challenge. */
  challengeSideNumber?: 1 | 2;
  /** Challenge: team name of the challenging side. */
  challengeTeamName?: string;
  /** Index into the engine's history.entries array (for deletion). */
  entryIndex?: number;

  // ── Audit fields — present only if the point has been corrected ────
  /** ISO timestamp of the most recent winner flip. */
  editedAt?: string;
  /** Distinguishes a live scorekeeping error from a post-review correction. */
  editReason?: WinnerEditReason;
  /** First-recorded awarding side — survives later flips and flip-backs. */
  originalWinningSide?: 1 | 2;
  /** True when the rebuild was told to retain the actual-played serve order. */
  serverPinned?: boolean;
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
  /**
   * The engine's `history.entries` array. When provided, substitution
   * events and bolt boundaries (endSegment) are interleaved into the
   * stream as non-point visual separators.
   */
  entries?: any[];
  /**
   * Maps participantId → display name. Used to resolve substitution
   * entries (which only carry IDs) into human-readable names.
   * Typically sourced from the playerTime store's registered players.
   */
  participantNames?: Record<string, string>;
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
  const editReason: WinnerEditReason | undefined =
    point?.editReason === 'scorekeepingError' || point?.editReason === 'reviewCorrection'
      ? point.editReason
      : undefined;
  const originalWinningSide: 1 | 2 | undefined =
    point?.originalWinningSide === 1 || point?.originalWinningSide === 2
      ? point.originalWinningSide
      : undefined;

  return {
    entryType: 'point' as StreamEntryType,
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
    editedAt: typeof point?.editedAt === 'string' ? point.editedAt : undefined,
    editReason,
    originalWinningSide,
    serverPinned: point?.serverPinned === true ? true : undefined,
  };
}

/** Swap 1 → 2 and 2 → 1. Centralised so the detail modal + tests share one copy. */
export function oppositeWinningSide(side: 1 | 2): 1 | 2 {
  return side === 1 ? 2 : 1;
}

/**
 * Build the `editPoint` payload that flips a past point's winner to the
 * other side. Kept pure so Phase 3 can be unit-tested without a DOM.
 *
 * Returns both `winner` (0-based engine field) and `winningSide` (1-based
 * display field) so either consumer reads the same truth.
 */
export function buildEditWinnerPayload(nextWinningSide: 1 | 2): {
  winner: 0 | 1;
  winningSide: 1 | 2;
} {
  return {
    winner: (nextWinningSide - 1) as 0 | 1,
    winningSide: nextWinningSide,
  };
}

/**
 * Audit metadata to attach to a PENALTY-free point when its winner has
 * been flipped after the fact. Captures the scenario (scorekeeping error
 * vs post-review correction), the original awarding side (preserved
 * across repeat flips so the very first award stays recorded), and a
 * flag for the pinned-serve-order path.
 *
 * Shared by both flip modes so the viewer / detail modal can surface a
 * consistent "this point was edited" indicator with accurate context.
 */
export function buildWinnerEditDecorations(opts: {
  currentWinningSide: 1 | 2;
  mode: 'recalculate' | 'preserveServers';
  /** Already-stored first-recorded awarding side — preserve through repeat flips. */
  existingOriginalWinningSide?: 1 | 2;
  /** ISO timestamp injection point for deterministic tests. */
  editedAt?: string;
}): {
  editedAt: string;
  editReason: WinnerEditReason;
  originalWinningSide: 1 | 2;
  serverPinned?: true;
} {
  const editReason: WinnerEditReason =
    opts.mode === 'preserveServers' ? 'reviewCorrection' : 'scorekeepingError';
  // If this is the first flip, the "original" is whatever the point
  // currently shows. Later flips (incl. flip-back) preserve the very
  // first recorded awarding side.
  const originalWinningSide: 1 | 2 =
    opts.existingOriginalWinningSide ?? opts.currentWinningSide;
  const base: {
    editedAt: string;
    editReason: WinnerEditReason;
    originalWinningSide: 1 | 2;
    serverPinned?: true;
  } = {
    editedAt: opts.editedAt ?? new Date().toISOString(),
    editReason,
    originalWinningSide,
  };
  if (opts.mode === 'preserveServers') base.serverPinned = true;
  return base;
}

/**
 * Parse a free-text rally-length input into either a non-negative integer
 * or `undefined` (blank input clears the field). Returns a parsed number
 * in an object plus a `dirty` flag indicating whether the parsed value
 * differs from the current entry's rallyLength — useful for enabling a
 * Save button only when a change is pending.
 */
export function parseRallyLengthInput(
  raw: string,
  current: number | undefined,
): { value: number | undefined; dirty: boolean; valid: boolean } {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { value: undefined, dirty: current !== undefined, valid: true };
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return { value: undefined, dirty: false, valid: false };
  }
  return { value: parsed, dirty: parsed !== current, valid: true };
}

/**
 * Build a substitution display entry from an engine `substitution`
 * history entry. Resolves participantIds to names via `nameMap`.
 */
function buildSubstitutionEntry(
  entry: any,
  nameMap?: Record<string, string>,
): PointHistoryEntry {
  const sideNumber = entry?.data?.sideNumber as 1 | 2 | undefined;
  const outId = entry?.data?.outParticipantId ?? '';
  const inId = entry?.data?.inParticipantId ?? '';
  return {
    entryType: 'substitution',
    pointIndex: -1,
    timestamp: entry?.timestamp,
    timeLabel: formatTimeLabel(entry?.timestamp),
    winningSide: sideNumber ?? 1,
    sideLabel: '',
    kind: 'other',
    glyph: '↔',
    scoreValue: 0,
    wonOnServe: false,
    subOutName: nameMap?.[outId] ?? outId,
    subInName: nameMap?.[inId] ?? inId,
    subSideNumber: sideNumber,
  };
}

/**
 * Build a coach-challenge display entry.
 */
function buildChallengeEntry(
  entry: any,
  entryIndex: number,
  options?: BuildHistoryStreamOptions,
): PointHistoryEntry {
  const sideNumber = entry?.data?.sideNumber as 1 | 2;
  const teamName = sideNumber === 1 ? (options?.side1Name ?? 'Side 1') : (options?.side2Name ?? 'Side 2');
  return {
    entryType: 'challenge',
    pointIndex: -1,
    timestamp: entry?.timestamp,
    timeLabel: formatTimeLabel(entry?.timestamp),
    winningSide: sideNumber,
    sideLabel: teamName,
    kind: 'other',
    glyph: '⚑',
    scoreValue: 0,
    wonOnServe: false,
    challengeSideNumber: sideNumber,
    challengeTeamName: teamName,
    entryIndex,
  };
}

/**
 * Build a bolt-boundary (segment end) display entry.
 */
function buildBoltBoundaryEntry(entry: any, boltNumber: number): PointHistoryEntry {
  return {
    entryType: 'boltBoundary',
    pointIndex: -1,
    timestamp: entry?.timestamp,
    timeLabel: formatTimeLabel(entry?.timestamp),
    winningSide: 1,
    sideLabel: '',
    kind: 'other',
    glyph: '—',
    scoreValue: 0,
    wonOnServe: false,
    boundaryLabel: `Bolt ${boltNumber} ended`,
  };
}

/**
 * Build the full display list in chronological order (oldest at top,
 * latest at bottom — the list auto-scrolls to the end). Interleaves point
 * events with substitution and bolt-boundary markers when `entries`
 * is provided. Skips null/undefined points defensively (historical
 * serialisations have occasionally contained holes).
 */
export function buildHistoryStream(
  points: any[] | undefined | null,
  options: BuildHistoryStreamOptions = {},
): PointHistoryEntry[] {
  if (!Array.isArray(points) || points.length === 0) {
    // Even with no points we might have entries (subs before first point).
    if (!Array.isArray(options.entries) || options.entries.length === 0) return [];
  }

  // Build the point rows first, indexed by their position in points[].
  const pointRows: PointHistoryEntry[] = [];
  const safePoints = Array.isArray(points) ? points : [];
  for (let i = 0; i < safePoints.length; i++) {
    const p = safePoints[i];
    if (!p) continue;
    if (options.hideAdjustments && p.adjustmentEvent) continue;
    pointRows.push(buildHistoryEntry(p, i, options));
  }

  if (!Array.isArray(options.entries) || options.entries.length === 0) {
    return pointRows;
  }

  // Interleave non-point entries (substitution, endSegment) by walking
  // the unified entries array. Point entries reference their pointIndex
  // so we can insert non-point items at the right chronological position.
  const unified: PointHistoryEntry[] = [];
  let pointCursor = 0;
  let boltNumber = 1;

  for (let entryIdx = 0; entryIdx < options.entries.length; entryIdx++) {
    const entry = options.entries[entryIdx];
    if (!entry) continue;
    if (entry.type === 'point') {
      // Advance the point cursor — the corresponding pointRow is at
      // the same offset (entries and points are kept in sync by the
      // factory). When an entry is a point we emit the pre-built
      // pointRow so its full metadata (audit fields, etc.) is preserved.
      if (pointCursor < pointRows.length) {
        unified.push(pointRows[pointCursor]);
        pointCursor++;
      }
    } else if (entry.type === 'substitution') {
      unified.push(buildSubstitutionEntry(entry, options.participantNames));
    } else if (entry.type === 'endSegment') {
      unified.push(buildBoltBoundaryEntry(entry, boltNumber));
      boltNumber++;
    } else if (entry.type === 'challenge') {
      unified.push(buildChallengeEntry(entry, entryIdx, options));
    }
    // Other entry types (setServer, setInitialScore, etc.) are skipped
    // — they're internal bookkeeping, not user-visible events.
  }

  // Any remaining points that weren't covered by an entry (edge case:
  // entries array shorter than points, or entries disabled).
  while (pointCursor < pointRows.length) {
    unified.push(pointRows[pointCursor]);
    pointCursor++;
  }

  return unified;
}

import { describe, it, expect } from 'vitest';
import {
  buildHistoryEntry,
  buildHistoryStream,
  classifyPointResult,
  formatTimeLabel,
  glyphForKind,
} from '../historyStream';

describe('classifyPointResult', () => {
  it('maps the standard point results to their kind', () => {
    expect(classifyPointResult({ result: 'Winner' })).toBe('winner');
    expect(classifyPointResult({ result: 'Touch' })).toBe('touch');
    expect(classifyPointResult({ result: 'Ace' })).toBe('ace');
    expect(classifyPointResult({ result: 'Fault' })).toBe('fault');
    expect(classifyPointResult({ result: 'Forced Error' })).toBe('forcedError');
    expect(classifyPointResult({ result: 'Unforced Error' })).toBe('unforcedError');
  });

  it('treats "Error" as an unforced error for back-compat with older payloads', () => {
    expect(classifyPointResult({ result: 'Error' })).toBe('unforcedError');
  });

  it('penaltyEvent wins over the raw result string', () => {
    expect(classifyPointResult({ result: 'Winner', penaltyEvent: true })).toBe('penalty');
  });

  it('adjustmentEvent wins over everything', () => {
    expect(classifyPointResult({ result: 'PointAdjustment', adjustmentEvent: true })).toBe('adjustment');
    expect(classifyPointResult({ result: 'Winner', adjustmentEvent: true })).toBe('adjustment');
  });

  it('unknown results fall back to "other"', () => {
    expect(classifyPointResult({ result: 'Something Weird' })).toBe('other');
    expect(classifyPointResult({})).toBe('other');
    expect(classifyPointResult({ result: '' })).toBe('other');
  });

  it('is whitespace + case insensitive', () => {
    expect(classifyPointResult({ result: '  winner  ' })).toBe('winner');
    expect(classifyPointResult({ result: 'WINNER' })).toBe('winner');
    expect(classifyPointResult({ result: 'Forced  Error' })).toBe('forcedError');
  });
});

describe('glyphForKind', () => {
  it('returns a short label for every kind', () => {
    expect(glyphForKind('winner')).toBe('W');
    expect(glyphForKind('touch')).toBe('T');
    expect(glyphForKind('ace')).toBe('A');
    expect(glyphForKind('fault')).toBe('F');
    expect(glyphForKind('forcedError')).toBe('FE');
    expect(glyphForKind('unforcedError')).toBe('UE');
    expect(glyphForKind('penalty')).toBe('P');
    expect(glyphForKind('adjustment')).toBe('±');
    expect(glyphForKind('other')).toBe('•');
  });
});

describe('formatTimeLabel', () => {
  it('returns HH:MM for a valid ISO timestamp', () => {
    // UTC timestamp; the test environment sets TZ=UTC (see package.json "test")
    // so the output is deterministic.
    expect(formatTimeLabel('2026-04-16T14:32:05Z')).toBe('14:32');
  });

  it('returns empty string on undefined / invalid input', () => {
    expect(formatTimeLabel()).toBe('');
    expect(formatTimeLabel('not-a-date')).toBe('');
    expect(formatTimeLabel('')).toBe('');
  });

  it('pads hours and minutes', () => {
    expect(formatTimeLabel('2026-04-16T04:05:00Z')).toBe('04:05');
  });
});

describe('buildHistoryEntry', () => {
  const sides = { side1Name: 'Alpha', side2Name: 'Bravo' };

  it('maps a standard winner with full context', () => {
    const entry = buildHistoryEntry(
      {
        index: 3,
        winner: 0,
        server: 0,
        winningSide: 1,
        result: 'Winner',
        timestamp: '2026-04-16T14:32:05Z',
        rallyLength: 7,
      },
      3,
      sides,
    );
    expect(entry).toMatchObject({
      pointIndex: 3,
      winningSide: 1,
      sideLabel: 'Alpha',
      kind: 'winner',
      glyph: 'W',
      scoreValue: 1,
      wonOnServe: true,
      rallyLength: 7,
      timeLabel: '14:32',
    });
  });

  it('derives winningSide from winner when missing', () => {
    const entry = buildHistoryEntry({ winner: 1 }, 0, sides);
    expect(entry.winningSide).toBe(2);
    expect(entry.sideLabel).toBe('Bravo');
  });

  it('side label falls back when the team name is empty', () => {
    const entry = buildHistoryEntry({ winner: 0 }, 0, {});
    expect(entry.sideLabel).toBe('Side 1');
  });

  it('penalty rows carry the penalised player + multi-point scoreValue', () => {
    const entry = buildHistoryEntry(
      {
        index: 10,
        winner: 1,
        winningSide: 2,
        result: 'Penalty',
        penaltyEvent: true,
        penaltyAgainstParticipantId: 'p-42',
        penaltyAgainstParticipantName: 'Jones',
        scoreValue: 5,
        timestamp: '2026-04-16T14:40:00Z',
      },
      10,
      sides,
    );
    expect(entry.kind).toBe('penalty');
    expect(entry.glyph).toBe('P');
    expect(entry.scoreValue).toBe(5);
    expect(entry.penaltyAgainstParticipantName).toBe('Jones');
    expect(entry.sideLabel).toBe('Bravo');
  });

  it('adjustment rows classify correctly and use the ± glyph', () => {
    const entry = buildHistoryEntry(
      {
        index: 0,
        winner: 0,
        result: 'PointAdjustment',
        adjustmentEvent: true,
        scoreValue: 1,
      },
      0,
      sides,
    );
    expect(entry.kind).toBe('adjustment');
    expect(entry.glyph).toBe('±');
  });

  it('wonOnServe is false when server is missing', () => {
    const entry = buildHistoryEntry({ winner: 0 }, 0, sides);
    expect(entry.wonOnServe).toBe(false);
  });

  it('rawResult is surfaced for tooltips / detail modals', () => {
    const entry = buildHistoryEntry({ winner: 0, result: 'Touch' }, 0, sides);
    expect(entry.rawResult).toBe('Touch');
  });

  it('falls back to the provided index when point.index is missing', () => {
    const entry = buildHistoryEntry({ winner: 0 }, 7, sides);
    expect(entry.pointIndex).toBe(7);
  });
});

describe('buildHistoryStream', () => {
  const sides = { side1Name: 'Alpha', side2Name: 'Bravo' };

  const winner0 = { winner: 0, result: 'Winner', timestamp: '2026-04-16T14:30:00Z' };
  const touch1 = { winner: 1, result: 'Touch', timestamp: '2026-04-16T14:31:00Z' };
  const penalty1 = {
    winner: 1,
    result: 'Penalty',
    penaltyEvent: true,
    penaltyAgainstParticipantName: 'Jones',
    scoreValue: 3,
    timestamp: '2026-04-16T14:32:00Z',
  };
  const adjustment0 = {
    winner: 0,
    result: 'PointAdjustment',
    adjustmentEvent: true,
    scoreValue: 1,
    timestamp: '2026-04-16T14:33:00Z',
  };

  it('returns empty for nullish / empty input', () => {
    expect(buildHistoryStream(undefined, sides)).toEqual([]);
    expect(buildHistoryStream(null, sides)).toEqual([]);
    expect(buildHistoryStream([], sides)).toEqual([]);
  });

  it('returns rows in most-recent-first order', () => {
    const rows = buildHistoryStream([winner0, touch1, penalty1], sides);
    expect(rows.map((r) => r.kind)).toEqual(['penalty', 'touch', 'winner']);
  });

  it('skips null / undefined holes defensively', () => {
    const rows = buildHistoryStream([winner0, undefined as any, null as any, touch1], sides);
    expect(rows).toHaveLength(2);
  });

  it('hideAdjustments filters out adjustmentEvent rows when requested', () => {
    const rows = buildHistoryStream([winner0, adjustment0, touch1], { ...sides, hideAdjustments: true });
    expect(rows.map((r) => r.kind)).toEqual(['touch', 'winner']);
  });

  it('hideAdjustments defaults to false — audit view sees everything', () => {
    const rows = buildHistoryStream([winner0, adjustment0, touch1], sides);
    expect(rows.map((r) => r.kind)).toEqual(['touch', 'adjustment', 'winner']);
  });

  it('preserves the original pointIndex even after reversing', () => {
    const rows = buildHistoryStream([winner0, touch1, penalty1], sides);
    // After reverse, the penalty (originally index 2) comes first.
    expect(rows[0].pointIndex).toBe(2);
    expect(rows[1].pointIndex).toBe(1);
    expect(rows[2].pointIndex).toBe(0);
  });

  it('uses point.index when provided, falling back to position otherwise', () => {
    const points = [
      { winner: 0, result: 'Winner', index: 100 },
      { winner: 1, result: 'Touch' }, // no explicit index → use position 1
    ];
    const rows = buildHistoryStream(points, sides);
    // Most-recent first: touch at position 1 first, winner at index 100 second.
    expect(rows[0].pointIndex).toBe(1);
    expect(rows[1].pointIndex).toBe(100);
  });
});

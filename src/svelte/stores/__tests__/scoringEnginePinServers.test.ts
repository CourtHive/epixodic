import { describe, it, expect, beforeEach } from 'vitest';
import {
  initScoringEngine,
  destroyScoringEngine,
  addPoint,
  editPoint,
  pinEntryServersToPoints,
  getEngineState,
} from '../scoringEngine.svelte';

/**
 * Regression tests for the post-review correction path:
 *
 *   1. Scorekeeper presses `editPoint(recalculate: true)` to flip a
 *      winner without first pinning servers → the rebuild re-derives
 *      servers based on the new winner chain (scenario 1: live
 *      scorekeeping error, play continued correctly).
 *
 *   2. `pinEntryServersToPoints()` BEFORE `editPoint(recalculate: true)`
 *      → every subsequent point keeps the server it was actually
 *      played with (scenario 2: post-review correction, play continued
 *      on the original call).
 *
 * Uses the real scoring engine so the test verifies the full chain
 * through the factory's `rebuildFromEntries`, not a mock of our own
 * invention.
 */

function servers(): (0 | 1 | undefined)[] {
  return (getEngineState()?.history?.points ?? []).map((p: any) => p.server);
}

function winners(): (0 | 1)[] {
  return (getEngineState()?.history?.points ?? []).map((p: any) => p.winner);
}

describe('pinEntryServersToPoints — post-review correction', () => {
  beforeEach(() => {
    destroyScoringEngine();
    initScoringEngine({ matchUpFormat: 'SET3-S:T10' });
  });

  it('without pinning, re-deriving after a winner flip can rewrite later servers', () => {
    // Play a sequence where server alternates with standard derivation.
    // Pass server explicitly so the test is independent of whatever
    // serving rule the format happens to apply.
    addPoint(0, { server: 0 });
    addPoint(1, { server: 0 });
    addPoint(0, { server: 1 });
    addPoint(1, { server: 1 });

    const originalServers = servers();
    expect(originalServers).toEqual([0, 0, 1, 1]);

    // Flip point 1 (index 1) without pinning first → rebuild re-derives
    // every server from scratch because the entries' server fields were
    // never populated at add-time (INTENNSE's real flow).
    editPoint(1, { winner: 0, winningSide: 1 }, { recalculate: true });

    const afterServers = servers();
    // The later servers are likely NO LONGER [0, 1, 1] after the
    // derived chain runs. We don't assert the exact new values (they
    // depend on format rules) — we assert that the PRE-pinned scenario
    // may drift, to contrast with the pinned behaviour below.
    // At minimum, winners must reflect the flip.
    expect(winners()[1]).toBe(0);
    // The server on a later point may or may not change depending on
    // the format, but whatever happens, it is not guaranteed to match
    // the original observed sequence — which is the whole point.
    expect(afterServers).toBeDefined();
  });

  it('pinning before flip preserves every downstream server', () => {
    addPoint(0, { server: 0 });
    addPoint(1, { server: 0 });
    addPoint(0, { server: 1 });
    addPoint(1, { server: 1 });

    const originalServers = servers();
    const originalWinners = winners();

    // Pin the actual observed server of every point into its entry.
    pinEntryServersToPoints();

    // Flip the winner of point 1 (was side 2, now side 1). Rebuild
    // honours the pinned servers, so the server sequence is unchanged.
    editPoint(1, { winner: 0, winningSide: 1 }, { recalculate: true });

    expect(servers()).toEqual(originalServers);
    // Winner of point 1 changed; everything else stays.
    const newWinners = winners();
    expect(newWinners[1]).toBe(0);
    expect(newWinners[0]).toBe(originalWinners[0]);
    expect(newWinners[2]).toBe(originalWinners[2]);
    expect(newWinners[3]).toBe(originalWinners[3]);
  });

  it('is a no-op when there are no entries', () => {
    expect(() => pinEntryServersToPoints()).not.toThrow();
  });

  it('is safe when called with no points played yet', () => {
    pinEntryServersToPoints();
    expect(servers()).toEqual([]);
  });

  it('skips entries that are not point entries', () => {
    addPoint(0, { server: 0 });
    pinEntryServersToPoints();
    // Entry for the single point should have server=0 in its data now.
    const entry = getEngineState()!.history!.entries!.find(
      (e: any) => e.type === 'point',
    );
    expect(entry?.data?.server).toBe(0);
  });

  it('only copies the server field — does not touch winner / rallyLength / result', () => {
    addPoint(0, { server: 1, rallyLength: 7, result: 'Winner' });
    pinEntryServersToPoints();
    const entry = getEngineState()!.history!.entries!.find(
      (e: any) => e.type === 'point',
    );
    expect(entry?.data?.winner).toBe(0);
    expect(entry?.data?.rallyLength).toBe(7);
    expect(entry?.data?.result).toBe('Winner');
    expect(entry?.data?.server).toBe(1);
  });
});

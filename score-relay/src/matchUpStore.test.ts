import { describe, it, expect, beforeEach } from 'vitest';
import {
  updateMatch,
  setMatchHistory,
  getMatch,
  getActiveMatchIds,
  getMatchUpsByTournament,
  removeMatch,
  pruneStaleMatches,
} from './matchUpStore.js';

// Reset the module-level Map between tests by removing all matches
function clearAll() {
  for (const id of getActiveMatchIds()) {
    removeMatch(id);
  }
}

describe('matchUpStore', () => {
  beforeEach(() => {
    clearAll();
  });

  describe('updateMatch()', () => {
    it('should store a new match', () => {
      updateMatch({
        matchUpId: 'mu-001',
        tournamentId: 'tid-1',
        score: { scoreStringSide1: '6-4', scoreStringSide2: '4-6' },
      });

      const match = getMatch('mu-001');
      expect(match).toBeDefined();
      expect(match!.matchUpId).toBe('mu-001');
      expect(match!.tournamentId).toBe('tid-1');
      expect(match!.lastUpdate.score.scoreStringSide1).toBe('6-4');
    });

    it('should update an existing match and preserve tournamentId', () => {
      updateMatch({
        matchUpId: 'mu-001',
        tournamentId: 'tid-1',
        score: { scoreStringSide1: '1-0' },
      });

      // Second update without tournamentId
      updateMatch({
        matchUpId: 'mu-001',
        score: { scoreStringSide1: '2-0' },
      });

      const match = getMatch('mu-001');
      expect(match!.tournamentId).toBe('tid-1'); // preserved
      expect(match!.lastUpdate.score.scoreStringSide1).toBe('2-0'); // updated
    });

    it('should preserve existing history when updating score', () => {
      const history = {
        matchUpId: 'mu-001',
        points: [{ winner: 0 }, { winner: 1 }],
      };
      setMatchHistory(history);

      updateMatch({
        matchUpId: 'mu-001',
        score: { scoreStringSide1: '1-1' },
      });

      const match = getMatch('mu-001');
      expect(match!.history).toBeDefined();
      expect(match!.history!.points).toHaveLength(2);
    });
  });

  describe('setMatchHistory()', () => {
    it('should store history for a new match', () => {
      setMatchHistory({
        matchUpId: 'mu-002',
        tournamentId: 'tid-2',
        points: [{ winner: 0 }],
      });

      const match = getMatch('mu-002');
      expect(match).toBeDefined();
      expect(match!.history!.points).toHaveLength(1);
      expect(match!.lastUpdate.matchUpId).toBe('mu-002');
    });

    it('should update history on an existing match', () => {
      updateMatch({
        matchUpId: 'mu-002',
        score: { scoreStringSide1: '3-2' },
      });

      setMatchHistory({
        matchUpId: 'mu-002',
        points: [{ winner: 0 }, { winner: 1 }, { winner: 0 }],
      });

      const match = getMatch('mu-002');
      expect(match!.history!.points).toHaveLength(3);
      // Original score update preserved
      expect(match!.lastUpdate.score.scoreStringSide1).toBe('3-2');
    });
  });

  describe('getActiveMatchIds()', () => {
    it('should return empty array when no matches', () => {
      expect(getActiveMatchIds()).toEqual([]);
    });

    it('should return all active match IDs', () => {
      updateMatch({ matchUpId: 'mu-a', score: {} });
      updateMatch({ matchUpId: 'mu-b', score: {} });
      updateMatch({ matchUpId: 'mu-c', score: {} });

      const ids = getActiveMatchIds();
      expect(ids).toHaveLength(3);
      expect(ids).toContain('mu-a');
      expect(ids).toContain('mu-b');
      expect(ids).toContain('mu-c');
    });
  });

  describe('getMatchUpsByTournament()', () => {
    it('should return matches for a given tournament', () => {
      updateMatch({ matchUpId: 'mu-t1', tournamentId: 'tid-1', score: { scoreStringSide1: '1-0' } });
      updateMatch({ matchUpId: 'mu-t2', tournamentId: 'tid-1', score: { scoreStringSide1: '2-0' } });
      updateMatch({ matchUpId: 'mu-t3', tournamentId: 'tid-2', score: { scoreStringSide1: '3-0' } });

      const results = getMatchUpsByTournament('tid-1');
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.matchUpId).sort()).toEqual(['mu-t1', 'mu-t2']);
    });

    it('should return empty array when no matches for tournament', () => {
      updateMatch({ matchUpId: 'mu-x', tournamentId: 'tid-other', score: {} });
      expect(getMatchUpsByTournament('tid-none')).toEqual([]);
    });
  });

  describe('removeMatch()', () => {
    it('should remove a match', () => {
      updateMatch({ matchUpId: 'mu-del', score: {} });
      expect(getMatch('mu-del')).toBeDefined();

      removeMatch('mu-del');
      expect(getMatch('mu-del')).toBeUndefined();
    });

    it('should be a no-op for non-existent match', () => {
      removeMatch('does-not-exist'); // should not throw
      expect(getActiveMatchIds()).toEqual([]);
    });
  });

  describe('pruneStaleMatches()', () => {
    it('should remove matches older than maxAgeMs', () => {
      updateMatch({ matchUpId: 'mu-old', score: {} });

      // Manually backdate the updatedAt
      const match = getMatch('mu-old')!;
      (match as any).updatedAt = Date.now() - 5 * 60 * 60 * 1000; // 5 hours ago

      updateMatch({ matchUpId: 'mu-new', score: {} });

      const pruned = pruneStaleMatches(4 * 60 * 60 * 1000); // 4 hour threshold
      expect(pruned).toBe(1);
      expect(getMatch('mu-old')).toBeUndefined();
      expect(getMatch('mu-new')).toBeDefined();
    });

    it('should return 0 when nothing to prune', () => {
      updateMatch({ matchUpId: 'mu-fresh', score: {} });
      const pruned = pruneStaleMatches(4 * 60 * 60 * 1000);
      expect(pruned).toBe(0);
    });
  });
});

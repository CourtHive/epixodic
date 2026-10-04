import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// browserStorage keys off `window.localStorage`, and the overlay registers
// `window` event listeners at import time — so provide a real EventTarget-backed
// window + a localStorage stub BEFORE importing the module (dynamic import).
const memStore: Record<string, string> = {};
const ls = {
  getItem: (k: string) => memStore[k] ?? null,
  setItem: (k: string, v: string) => {
    memStore[k] = v;
  },
  removeItem: (k: string) => {
    delete memStore[k];
  },
  clear: () => {
    for (const k of Object.keys(memStore)) delete memStore[k];
  },
};
const win: any = new EventTarget();
win.localStorage = ls;

let overlay: typeof import('../localScoreOverlay.svelte');

beforeAll(async () => {
  (globalThis as any).window = win;
  (globalThis as any).localStorage = ls;
  overlay = await import('../localScoreOverlay.svelte');
});

afterAll(() => {
  delete (globalThis as any).window;
  delete (globalThis as any).localStorage;
});

function seedLocal(matchUpId: string, data: any): void {
  memStore[matchUpId] = JSON.stringify(data);
}

const serverMatchUp: any = {
  matchUpId: 'mu-1',
  matchUpStatus: 'TO_BE_PLAYED',
  readyToScore: true,
  score: undefined,
};

describe('localScoreOverlay', () => {
  beforeEach(() => {
    for (const k of Object.keys(memStore)) delete memStore[k];
  });

  describe('readLocalScore', () => {
    it('returns undefined when nothing is stored', () => {
      expect(overlay.readLocalScore('mu-1')).toBeUndefined();
    });

    it('returns undefined for a stored match with no scoring progress', () => {
      seedLocal('mu-1', { matchUpId: 'mu-1', matchUpStatus: 'TO_BE_PLAYED', score: { sets: [] } });
      expect(overlay.readLocalScore('mu-1')).toBeUndefined();
    });

    it('returns the score patch when sets have been scored', () => {
      seedLocal('mu-1', {
        matchUpId: 'mu-1',
        matchUpStatus: 'IN_PROGRESS',
        score: { sets: [{ side1Score: 3, side2Score: 2 }], scoreStringSide1: '3-2' },
      });
      const patch = overlay.readLocalScore('mu-1');
      expect(patch?.matchUpStatus).toBe('IN_PROGRESS');
      expect(patch?.score?.scoreStringSide1).toBe('3-2');
    });

    it('ignores corrupt JSON', () => {
      memStore['mu-1'] = '{not json';
      expect(overlay.readLocalScore('mu-1')).toBeUndefined();
    });
  });

  describe('overlayLocalScore', () => {
    it('returns the server matchUp unchanged when there is no local score', () => {
      expect(overlay.overlayLocalScore(serverMatchUp)).toBe(serverMatchUp);
    });

    it('merges an in-progress local score and clears readyToScore', () => {
      seedLocal('mu-1', {
        matchUpId: 'mu-1',
        matchUpStatus: 'IN_PROGRESS',
        score: { sets: [{ side1Score: 4, side2Score: 1 }], scoreStringSide1: '4-1' },
      });
      const out = overlay.overlayLocalScore(serverMatchUp);
      expect(out.matchUpStatus).toBe('IN_PROGRESS');
      expect(out.score?.scoreStringSide1).toBe('4-1');
      expect(out.readyToScore).toBe(false);
      expect(out.hasLocalScore).toBe(true);
    });

    it('merges a locally-completed result', () => {
      seedLocal('mu-1', {
        matchUpId: 'mu-1',
        matchUpStatus: 'COMPLETED',
        winningSide: 2,
        score: { sets: [{ side1Score: 4, side2Score: 6 }], scoreStringSide1: '4-6' },
      });
      const out = overlay.overlayLocalScore(serverMatchUp);
      expect(out.winningSide).toBe(2);
      expect(out.hasLocalScore).toBe(true);
    });

    it('never regresses a server-final result with local state', () => {
      seedLocal('mu-1', { matchUpId: 'mu-1', matchUpStatus: 'IN_PROGRESS', score: { sets: [{ side1Score: 1 }] } });
      const serverFinal: any = { matchUpId: 'mu-1', matchUpStatus: 'COMPLETED', winningSide: 1 };
      const out = overlay.overlayLocalScore(serverFinal);
      expect(out).toBe(serverFinal);
      expect(out.hasLocalScore).toBeUndefined();
    });
  });

  describe('localScoreVersion', () => {
    it('bumps on storage and matcharchive:updated events', () => {
      const before = overlay.localScoreVersion();
      win.dispatchEvent(new Event('storage'));
      expect(overlay.localScoreVersion()).toBe(before + 1);
      win.dispatchEvent(new CustomEvent('matcharchive:updated'));
      expect(overlay.localScoreVersion()).toBe(before + 2);
    });
  });
});

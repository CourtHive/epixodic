/**
 * Integration tests for the score relay.
 *
 * Spins up an actual Socket.IO server and connects clients to verify
 * the full tracker → relay → listener pipeline.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Server } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createServer } from 'http';
import { createRelay } from './relay.js';
import { getActiveMatchIds, removeMatch } from './matchUpStore.js';

let httpServer: ReturnType<typeof createServer>;
let ioServer: Server;
let port: number;

function connectClient(namespace: string): Promise<ClientSocket> {
  return new Promise((resolve) => {
    const socket = ioClient(`http://localhost:${port}${namespace}`, {
      transports: ['websocket'],
      forceNew: true,
    });
    socket.on('connect', () => resolve(socket));
  });
}

function clearStore() {
  for (const id of getActiveMatchIds()) {
    removeMatch(id);
  }
}

function waitForEvent<T = any>(socket: ClientSocket, event: string, timeoutMs = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for "${event}"`)), timeoutMs);
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

describe('Score Relay Integration', () => {
  beforeAll(async () => {
    httpServer = createServer();
    ioServer = new Server(httpServer, { cors: { origin: '*' } });
    createRelay(ioServer, {
      port: 0,
      persistScores: false,
      corsOrigin: '*',
      staleMatchHours: 4,
      pruneIntervalMinutes: 30,
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const addr = httpServer.address();
        port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve();
      });
    });
  });

  afterAll(async () => {
    ioServer.close();
    httpServer.close();
  });

  beforeEach(() => {
    clearStore();
  });

  describe('/tracker namespace', () => {
    it('should acknowledge score updates', async () => {
      const tracker = await connectClient('/tracker');

      const ackPromise = waitForEvent(tracker, 'ack');
      tracker.emit('score', {
        matchUpId: 'mu-100',
        score: { scoreStringSide1: '1-0' },
      });

      const ack = await ackPromise;
      expect(ack.received).toBe(true);
      expect(ack.matchUpId).toBe('mu-100');

      tracker.disconnect();
    });

    it('should reject score without matchUpId', async () => {
      const tracker = await connectClient('/tracker');

      const errorPromise = waitForEvent(tracker, 'error');
      tracker.emit('score', { score: {} });

      const error = await errorPromise;
      expect(error.message).toBe('matchUpId required');

      tracker.disconnect();
    });

    it('should acknowledge history updates', async () => {
      const tracker = await connectClient('/tracker');

      const ackPromise = waitForEvent(tracker, 'ack');
      tracker.emit('history', {
        matchUpId: 'mu-101',
        points: [{ winner: 0 }, { winner: 1 }],
      });

      const ack = await ackPromise;
      expect(ack.received).toBe(true);
      expect(ack.matchUpId).toBe('mu-101');

      tracker.disconnect();
    });
  });

  describe('/live namespace', () => {
    it('should receive score updates when subscribed to a match', async () => {
      const tracker = await connectClient('/tracker');
      const listener = await connectClient('/live');

      // Subscribe to a specific match
      listener.emit('subscribe', 'mu-200');

      // Give the subscription time to register
      await new Promise((r) => setTimeout(r, 50));

      // Tracker sends a score
      const scorePromise = waitForEvent(listener, 'score');
      tracker.emit('score', {
        matchUpId: 'mu-200',
        score: { scoreStringSide1: '2-1' },
      });

      const received = await scorePromise;
      expect(received.matchUpId).toBe('mu-200');
      expect(received.score.scoreStringSide1).toBe('2-1');

      tracker.disconnect();
      listener.disconnect();
    });

    it('should NOT receive scores for unsubscribed matches', async () => {
      const tracker = await connectClient('/tracker');
      const listener = await connectClient('/live');

      // Subscribe only to mu-300
      listener.emit('subscribe', 'mu-300');
      await new Promise((r) => setTimeout(r, 50));

      // Tracker sends score for a different match
      let receivedUnexpected = false;
      listener.on('score', (data: any) => {
        if (data.matchUpId === 'mu-301') {
          receivedUnexpected = true;
        }
      });

      tracker.emit('score', {
        matchUpId: 'mu-301',
        score: { scoreStringSide1: '3-0' },
      });

      await new Promise((r) => setTimeout(r, 200));
      expect(receivedUnexpected).toBe(false);

      tracker.disconnect();
      listener.disconnect();
    });

    it('should receive all scores when subscribed to "all"', async () => {
      const tracker = await connectClient('/tracker');
      const listener = await connectClient('/live');

      listener.emit('subscribe:all');
      await new Promise((r) => setTimeout(r, 50));

      const scorePromise = waitForEvent(listener, 'score');
      tracker.emit('score', {
        matchUpId: 'mu-any',
        score: { scoreStringSide1: '4-4' },
      });

      const received = await scorePromise;
      expect(received.matchUpId).toBe('mu-any');

      tracker.disconnect();
      listener.disconnect();
    });

    it('should send current state when subscribing to active match', async () => {
      const tracker = await connectClient('/tracker');

      // Tracker sends a score first
      const ackPromise = waitForEvent(tracker, 'ack');
      tracker.emit('score', {
        matchUpId: 'mu-400',
        score: { scoreStringSide1: '5-3' },
      });
      await ackPromise;

      // Now a listener joins and subscribes
      const listener = await connectClient('/live');
      const statePromise = waitForEvent(listener, 'score');
      listener.emit('subscribe', 'mu-400');

      const state = await statePromise;
      expect(state.matchUpId).toBe('mu-400');
      expect(state.score.scoreStringSide1).toBe('5-3');

      tracker.disconnect();
      listener.disconnect();
    });

    it('should send active match IDs on subscribe:all', async () => {
      const tracker = await connectClient('/tracker');

      // Create some active matches
      tracker.emit('score', { matchUpId: 'mu-a', score: {} });
      tracker.emit('score', { matchUpId: 'mu-b', score: {} });
      await new Promise((r) => setTimeout(r, 100));

      const listener = await connectClient('/live');
      const activePromise = waitForEvent(listener, 'active');
      listener.emit('subscribe:all');

      const activeIds = await activePromise;
      expect(activeIds).toContain('mu-a');
      expect(activeIds).toContain('mu-b');

      tracker.disconnect();
      listener.disconnect();
    });

    it('should stop receiving after unsubscribe', async () => {
      const tracker = await connectClient('/tracker');
      const listener = await connectClient('/live');

      listener.emit('subscribe', 'mu-500');
      await new Promise((r) => setTimeout(r, 50));

      // Verify we receive first
      const firstPromise = waitForEvent(listener, 'score');
      tracker.emit('score', { matchUpId: 'mu-500', score: { scoreStringSide1: '1-0' } });
      await firstPromise;

      // Unsubscribe
      listener.emit('unsubscribe', 'mu-500');
      await new Promise((r) => setTimeout(r, 50));

      // Should NOT receive this one
      let receivedAfterUnsub = false;
      listener.on('score', (data: any) => {
        if (data.matchUpId === 'mu-500' && data.score.scoreStringSide1 === '2-0') {
          receivedAfterUnsub = true;
        }
      });

      tracker.emit('score', { matchUpId: 'mu-500', score: { scoreStringSide1: '2-0' } });
      await new Promise((r) => setTimeout(r, 200));
      expect(receivedAfterUnsub).toBe(false);

      tracker.disconnect();
      listener.disconnect();
    });
  });

  describe('Tournament subscriptions', () => {
    it('should receive scores for matches in a subscribed tournament', async () => {
      const tracker = await connectClient('/tracker');
      const listener = await connectClient('/live');

      listener.emit('subscribe:tournament', 'tid-1');
      await new Promise((r) => setTimeout(r, 50));

      const scorePromise = waitForEvent(listener, 'score');
      tracker.emit('score', {
        matchUpId: 'mu-700',
        tournamentId: 'tid-1',
        score: { scoreStringSide1: '3-2' },
      });

      const received = await scorePromise;
      expect(received.matchUpId).toBe('mu-700');
      expect(received.tournamentId).toBe('tid-1');

      tracker.disconnect();
      listener.disconnect();
    });

    it('should NOT receive scores for a different tournament', async () => {
      const tracker = await connectClient('/tracker');
      const listener = await connectClient('/live');

      listener.emit('subscribe:tournament', 'tid-1');
      await new Promise((r) => setTimeout(r, 50));

      let receivedUnexpected = false;
      listener.on('score', (data: any) => {
        if (data.tournamentId === 'tid-2') {
          receivedUnexpected = true;
        }
      });

      tracker.emit('score', {
        matchUpId: 'mu-701',
        tournamentId: 'tid-2',
        score: { scoreStringSide1: '1-0' },
      });

      await new Promise((r) => setTimeout(r, 200));
      expect(receivedUnexpected).toBe(false);

      tracker.disconnect();
      listener.disconnect();
    });

    it('should send existing tournament matches on subscribe', async () => {
      const tracker = await connectClient('/tracker');

      // Create matches for tid-1
      tracker.emit('score', { matchUpId: 'mu-710', tournamentId: 'tid-1', score: { scoreStringSide1: '1-0' } });
      tracker.emit('score', { matchUpId: 'mu-711', tournamentId: 'tid-1', score: { scoreStringSide1: '2-1' } });
      tracker.emit('score', { matchUpId: 'mu-712', tournamentId: 'tid-other', score: { scoreStringSide1: '0-0' } });
      await new Promise((r) => setTimeout(r, 100));

      const listener = await connectClient('/live');
      const received: any[] = [];
      listener.on('score', (data: any) => received.push(data));
      listener.emit('subscribe:tournament', 'tid-1');

      await new Promise((r) => setTimeout(r, 200));
      expect(received.length).toBe(2);
      expect(received.map((r: any) => r.matchUpId).sort()).toEqual(['mu-710', 'mu-711']);

      tracker.disconnect();
      listener.disconnect();
    });

    it('should stop receiving after unsubscribe:tournament', async () => {
      const tracker = await connectClient('/tracker');
      const listener = await connectClient('/live');

      listener.emit('subscribe:tournament', 'tid-1');
      await new Promise((r) => setTimeout(r, 50));

      // Verify we receive first
      const firstPromise = waitForEvent(listener, 'score');
      tracker.emit('score', { matchUpId: 'mu-720', tournamentId: 'tid-1', score: { scoreStringSide1: '1-0' } });
      await firstPromise;

      // Unsubscribe
      listener.emit('unsubscribe:tournament', 'tid-1');
      await new Promise((r) => setTimeout(r, 50));

      let receivedAfterUnsub = false;
      listener.on('score', (data: any) => {
        if (data.matchUpId === 'mu-721') {
          receivedAfterUnsub = true;
        }
      });

      tracker.emit('score', { matchUpId: 'mu-721', tournamentId: 'tid-1', score: { scoreStringSide1: '2-0' } });
      await new Promise((r) => setTimeout(r, 200));
      expect(receivedAfterUnsub).toBe(false);

      tracker.disconnect();
      listener.disconnect();
    });
  });

  describe('INTENNSE event relay', () => {
    it('should acknowledge intennse snapshots from tracker', async () => {
      const tracker = await connectClient('/tracker');

      const ackPromise = waitForEvent(tracker, 'ack');
      tracker.emit('intennse', {
        matchUpId: 'mu-intennse-1',
        tournamentId: 'tid-1',
        boltScore: { side1: 14, side2: 9 },
        aggregateScore: { side1: 14, side2: 9 },
        server: 0,
        serveSide: 'DEUCE',
      });

      const ack = await ackPromise;
      expect(ack.received).toBe(true);
      expect(ack.matchUpId).toBe('mu-intennse-1');

      tracker.disconnect();
    });

    it('should reject intennse without matchUpId', async () => {
      const tracker = await connectClient('/tracker');

      const errorPromise = waitForEvent(tracker, 'error');
      tracker.emit('intennse', { boltScore: {} });

      const error = await errorPromise;
      expect(error.message).toBe('matchUpId required');

      tracker.disconnect();
    });

    it('should fan out intennse to match-level listeners', async () => {
      const tracker = await connectClient('/tracker');
      const listener = await connectClient('/live');

      listener.emit('subscribe', 'mu-intennse-2');
      await new Promise((r) => setTimeout(r, 50));

      const snapshotPromise = waitForEvent(listener, 'intennse');
      tracker.emit('intennse', {
        matchUpId: 'mu-intennse-2',
        boltScore: { side1: 7, side2: 3 },
        aggregateScore: { side1: 7, side2: 3 },
        server: 1,
        serveSide: 'AD',
        activePlayers: { side1: ['p1'], side2: ['p2'] },
      });

      const received = await snapshotPromise;
      expect(received.matchUpId).toBe('mu-intennse-2');
      expect(received.boltScore.side1).toBe(7);
      expect(received.serveSide).toBe('AD');

      tracker.disconnect();
      listener.disconnect();
    });

    it('should fan out intennse to tournament-level listeners', async () => {
      const tracker = await connectClient('/tracker');
      const listener = await connectClient('/live');

      listener.emit('subscribe:tournament', 'tid-intennse');
      await new Promise((r) => setTimeout(r, 50));

      const snapshotPromise = waitForEvent(listener, 'intennse');
      tracker.emit('intennse', {
        matchUpId: 'mu-intennse-3',
        tournamentId: 'tid-intennse',
        boltScore: { side1: 10, side2: 10 },
        aggregateScore: { side1: 20, side2: 18 },
        server: 0,
      });

      const received = await snapshotPromise;
      expect(received.matchUpId).toBe('mu-intennse-3');
      expect(received.tournamentId).toBe('tid-intennse');
      expect(received.aggregateScore.side1).toBe(20);

      tracker.disconnect();
      listener.disconnect();
    });

    it('should fan out intennse to "all" listeners', async () => {
      const tracker = await connectClient('/tracker');
      const listener = await connectClient('/live');

      listener.emit('subscribe:all');
      await new Promise((r) => setTimeout(r, 50));

      const snapshotPromise = waitForEvent(listener, 'intennse');
      tracker.emit('intennse', {
        matchUpId: 'mu-intennse-4',
        boltScore: { side1: 5, side2: 2 },
        aggregateScore: { side1: 5, side2: 2 },
        server: 0,
        playerStats: { p1: { pointsWon: 5 } },
      });

      const received = await snapshotPromise;
      expect(received.matchUpId).toBe('mu-intennse-4');
      expect(received.playerStats.p1.pointsWon).toBe(5);

      tracker.disconnect();
      listener.disconnect();
    });

    it('should NOT send intennse to unsubscribed listeners', async () => {
      const tracker = await connectClient('/tracker');
      const listener = await connectClient('/live');

      listener.emit('subscribe', 'mu-other');
      await new Promise((r) => setTimeout(r, 50));

      let receivedUnexpected = false;
      listener.on('intennse', (data: any) => {
        if (data.matchUpId === 'mu-intennse-5') {
          receivedUnexpected = true;
        }
      });

      tracker.emit('intennse', {
        matchUpId: 'mu-intennse-5',
        boltScore: { side1: 1, side2: 0 },
      });

      await new Promise((r) => setTimeout(r, 200));
      expect(receivedUnexpected).toBe(false);

      tracker.disconnect();
      listener.disconnect();
    });
  });

  describe('End-to-end: Epixodic tracker → relay → TMX listener', () => {
    it('full crowdsourced score flow: tracker emits score, tournament listener receives', async () => {
      // Simulates the exact flow: Epixodic (tracker) → relay → TMX (listener on /live)
      const epixodic = await connectClient('/tracker');
      const tmx = await connectClient('/live');

      // TMX subscribes to a tournament (mirrors TMX connectRelay behavior)
      tmx.emit('subscribe:tournament', 'tid-e2e');
      await new Promise((r) => setTimeout(r, 50));

      // Epixodic sends a score update (mirrors sendScore in epixodic scoreRelay.ts)
      const tmxReceived = waitForEvent(tmx, 'score');
      epixodic.emit('score', {
        matchUpId: 'mu-e2e-1',
        tournamentId: 'tid-e2e',
        score: {
          sets: [{ side1Score: 14, side2Score: 9 }],
          scoreStringSide1: '14-9',
          scoreStringSide2: '9-14',
        },
        matchUpStatus: 'IN_PROGRESS',
      });

      // TMX receives the score — this is what handleRelayScore processes
      const data = await tmxReceived;
      expect(data.matchUpId).toBe('mu-e2e-1');
      expect(data.score.scoreStringSide1).toBe('14-9');
      expect(data.matchUpStatus).toBe('IN_PROGRESS');

      epixodic.disconnect();
      tmx.disconnect();
    });

    it('full INTENNSE snapshot flow: tracker emits intennse, tournament listener receives', async () => {
      const epixodic = await connectClient('/tracker');
      const tmx = await connectClient('/live');

      tmx.emit('subscribe:tournament', 'tid-e2e-intennse');
      await new Promise((r) => setTimeout(r, 50));

      // Epixodic sends an INTENNSE snapshot (mirrors sendIntennseUpdate)
      const tmxReceived = waitForEvent(tmx, 'intennse');
      epixodic.emit('intennse', {
        matchUpId: 'mu-e2e-bolt-1',
        tournamentId: 'tid-e2e-intennse',
        boltScore: { side1: 7, side2: 3 },
        aggregateScore: { side1: 21, side2: 18 },
        activePlayers: { side1: ['p1'], side2: ['p3'] },
        server: 0,
        serveSide: 'AD',
        playerStats: { p1: { pointsWon: 7 }, p3: { pointsWon: 3 } },
        penaltyBox: [{ participantId: 'p2', participantName: 'Smith', remainingMs: 60000 }],
        boltTimerRemainingMs: 300000,
        serveClockRemainingMs: 12000,
        matchUpStatus: 'IN_PROGRESS',
      });

      const data = await tmxReceived;
      expect(data.boltScore.side1).toBe(7);
      expect(data.aggregateScore.side1).toBe(21);
      expect(data.serveSide).toBe('AD');
      expect(data.penaltyBox).toHaveLength(1);
      expect(data.penaltyBox[0].participantName).toBe('Smith');

      epixodic.disconnect();
      tmx.disconnect();
    });

    it('completed match score flows through relay', async () => {
      const epixodic = await connectClient('/tracker');
      const tmx = await connectClient('/live');

      tmx.emit('subscribe:tournament', 'tid-e2e-complete');
      await new Promise((r) => setTimeout(r, 50));

      const tmxReceived = waitForEvent(tmx, 'score');
      epixodic.emit('score', {
        matchUpId: 'mu-e2e-final',
        tournamentId: 'tid-e2e-complete',
        score: {
          sets: [
            { side1Score: 14, side2Score: 9 },
            { side1Score: 12, side2Score: 8 },
          ],
        },
        matchUpStatus: 'COMPLETED',
        winningSide: 1,
      });

      const data = await tmxReceived;
      expect(data.matchUpStatus).toBe('COMPLETED');
      expect(data.winningSide).toBe(1);
      expect(data.score.sets).toHaveLength(2);

      epixodic.disconnect();
      tmx.disconnect();
    });
  });

  describe('Multi-listener fan-out', () => {
    it('should broadcast to multiple listeners subscribed to same match', async () => {
      const tracker = await connectClient('/tracker');
      const listener1 = await connectClient('/live');
      const listener2 = await connectClient('/live');
      const listener3 = await connectClient('/live');

      listener1.emit('subscribe', 'mu-600');
      listener2.emit('subscribe', 'mu-600');
      listener3.emit('subscribe', 'mu-600');
      await new Promise((r) => setTimeout(r, 50));

      const p1 = waitForEvent(listener1, 'score');
      const p2 = waitForEvent(listener2, 'score');
      const p3 = waitForEvent(listener3, 'score');

      tracker.emit('score', {
        matchUpId: 'mu-600',
        score: { scoreStringSide1: '6-4' },
      });

      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
      expect(r1.matchUpId).toBe('mu-600');
      expect(r2.matchUpId).toBe('mu-600');
      expect(r3.matchUpId).toBe('mu-600');

      tracker.disconnect();
      listener1.disconnect();
      listener2.disconnect();
      listener3.disconnect();
    });
  });

  describe('Relay-native clock ticks', () => {
    it('should emit scorebug-tick after receiving an intennse event with running clocks', async () => {
      const tracker = await connectClient('/tracker');
      const listener = await connectClient('/live');

      listener.emit('subscribe', 'mu-tick-1');
      await new Promise((r) => setTimeout(r, 50));

      // Consume the intennse event itself first
      const intennsePromise = waitForEvent(listener, 'intennse');
      tracker.emit('intennse', {
        matchUpId: 'mu-tick-1',
        boltTimerRemainingMs: 300000,
        serveClockRemainingMs: 12000,
        matchUpStatus: 'IN_PROGRESS',
      });
      await intennsePromise;

      // Now wait for a tick — should arrive within ~200ms (10Hz interval)
      const tick = await waitForEvent(listener, 'scorebug-tick', 500);
      expect(tick.kind).toBe('tick');
      expect(tick.matchUpId).toBe('mu-tick-1');
      expect(typeof tick.boltTimerRemainingMs).toBe('number');
      expect(typeof tick.serveClockRemainingMs).toBe('number');
      expect(tick.boltTimerRemainingMs).toBeLessThanOrEqual(300000);
      expect(tick.boltTimerRemainingMs).toBeGreaterThan(299000);
      expect(typeof tick.generatedAt).toBe('string');

      tracker.disconnect();
      listener.disconnect();
    });

    it('should stop ticking when a COMPLETED intennse event arrives', async () => {
      const tracker = await connectClient('/tracker');
      const listener = await connectClient('/live');

      listener.emit('subscribe', 'mu-tick-stop');
      await new Promise((r) => setTimeout(r, 50));

      // Start ticking
      tracker.emit('intennse', {
        matchUpId: 'mu-tick-stop',
        boltTimerRemainingMs: 100000,
        serveClockRemainingMs: 10000,
        matchUpStatus: 'IN_PROGRESS',
      });
      await waitForEvent(listener, 'intennse');
      await waitForEvent(listener, 'scorebug-tick', 500);

      // Now send a completed event
      tracker.emit('intennse', {
        matchUpId: 'mu-tick-stop',
        boltTimerRemainingMs: 0,
        serveClockRemainingMs: 0,
        matchUpStatus: 'COMPLETED',
      });
      await waitForEvent(listener, 'intennse');

      // Wait and verify NO more ticks arrive
      let ticksAfterComplete = 0;
      listener.on('scorebug-tick', () => { ticksAfterComplete++; });
      await new Promise((r) => setTimeout(r, 300));
      expect(ticksAfterComplete).toBe(0);

      tracker.disconnect();
      listener.disconnect();
    });

    it('should re-anchor clocks when a new intennse event arrives', async () => {
      const tracker = await connectClient('/tracker');
      const listener = await connectClient('/live');

      listener.emit('subscribe', 'mu-tick-reanchor');
      await new Promise((r) => setTimeout(r, 50));

      // First event: bolt at 5 minutes
      tracker.emit('intennse', {
        matchUpId: 'mu-tick-reanchor',
        boltTimerRemainingMs: 300000,
        serveClockRemainingMs: 14000,
        matchUpStatus: 'IN_PROGRESS',
      });
      await waitForEvent(listener, 'intennse');
      const tick1 = await waitForEvent(listener, 'scorebug-tick', 500);
      expect(tick1.boltTimerRemainingMs).toBeGreaterThan(299000);

      // Second event: bolt at 4 minutes (new point scored, 1 minute elapsed)
      tracker.emit('intennse', {
        matchUpId: 'mu-tick-reanchor',
        boltTimerRemainingMs: 240000,
        serveClockRemainingMs: 14000,
        matchUpStatus: 'IN_PROGRESS',
      });
      await waitForEvent(listener, 'intennse');
      const tick2 = await waitForEvent(listener, 'scorebug-tick', 500);
      // After re-anchor, ticks should be near 240000, not still near 300000
      expect(tick2.boltTimerRemainingMs).toBeLessThan(241000);
      expect(tick2.boltTimerRemainingMs).toBeGreaterThan(239000);

      tracker.disconnect();
      listener.disconnect();
    });

    it('should stop ticking when bolt clock reaches zero', async () => {
      const tracker = await connectClient('/tracker');
      const listener = await connectClient('/live');

      listener.emit('subscribe', 'mu-tick-zero');
      await new Promise((r) => setTimeout(r, 50));

      // Start with only 150ms remaining — should auto-stop quickly
      tracker.emit('intennse', {
        matchUpId: 'mu-tick-zero',
        boltTimerRemainingMs: 150,
        serveClockRemainingMs: 150,
        matchUpStatus: 'IN_PROGRESS',
      });
      await waitForEvent(listener, 'intennse');

      // Wait for the bolt to expire + one tick cycle
      await new Promise((r) => setTimeout(r, 400));

      // Should have stopped — no more ticks
      let lateTicks = 0;
      listener.on('scorebug-tick', () => { lateTicks++; });
      await new Promise((r) => setTimeout(r, 300));
      expect(lateTicks).toBe(0);

      tracker.disconnect();
      listener.disconnect();
    });

    it('should NOT emit ticks to listeners not subscribed to the match', async () => {
      const tracker = await connectClient('/tracker');
      const listener = await connectClient('/live');

      // Subscribe to a different match
      listener.emit('subscribe', 'mu-other-match');
      await new Promise((r) => setTimeout(r, 50));

      tracker.emit('intennse', {
        matchUpId: 'mu-tick-isolated',
        boltTimerRemainingMs: 300000,
        serveClockRemainingMs: 14000,
        matchUpStatus: 'IN_PROGRESS',
      });

      let receivedTick = false;
      listener.on('scorebug-tick', () => { receivedTick = true; });
      await new Promise((r) => setTimeout(r, 300));
      expect(receivedTick).toBe(false);

      tracker.disconnect();
      listener.disconnect();
    });

    it('should emit ticks to "all" subscribers', async () => {
      const tracker = await connectClient('/tracker');
      const listener = await connectClient('/live');

      listener.emit('subscribe:all');
      await new Promise((r) => setTimeout(r, 50));

      tracker.emit('intennse', {
        matchUpId: 'mu-tick-all',
        boltTimerRemainingMs: 200000,
        serveClockRemainingMs: 10000,
        matchUpStatus: 'IN_PROGRESS',
      });
      await waitForEvent(listener, 'intennse');

      const tick = await waitForEvent(listener, 'scorebug-tick', 500);
      expect(tick.matchUpId).toBe('mu-tick-all');

      tracker.disconnect();
      listener.disconnect();
    });

    it('should auto-stop ticking after idle timeout (no re-anchor)', async () => {
      // Spin up a SEPARATE relay with a very short idle timeout (0.3s)
      // so we can test the timeout without waiting 30 minutes.
      const shortHttpServer = createServer();
      const shortIoServer = new Server(shortHttpServer, { cors: { origin: '*' } });
      createRelay(shortIoServer, {
        port: 0,
        persistScores: false,
        corsOrigin: '*',
        staleMatchHours: 4,
        pruneIntervalMinutes: 30,
        tickerIdleTimeoutSeconds: 0.3, // 300ms idle threshold
      });

      const shortPort = await new Promise<number>((resolve) => {
        shortHttpServer.listen(0, () => {
          const addr = shortHttpServer.address();
          resolve(typeof addr === 'object' && addr ? addr.port : 0);
        });
      });

      const shortConnect = (ns: string) => new Promise<ClientSocket>((resolve) => {
        const s = ioClient(`http://localhost:${shortPort}${ns}`, { transports: ['websocket'], forceNew: true });
        s.on('connect', () => resolve(s));
      });

      const tracker = await shortConnect('/tracker');
      const listener = await shortConnect('/live');

      listener.emit('subscribe', 'mu-idle');
      await new Promise((r) => setTimeout(r, 50));

      // Start ticking — 5 minutes on the bolt clock
      tracker.emit('intennse', {
        matchUpId: 'mu-idle',
        boltTimerRemainingMs: 300000,
        serveClockRemainingMs: 14000,
        matchUpStatus: 'IN_PROGRESS',
      });
      await waitForEvent(listener, 'intennse');
      await waitForEvent(listener, 'scorebug-tick', 500);

      // Wait longer than the idle timeout (300ms + buffer)
      await new Promise((r) => setTimeout(r, 600));

      // Should have auto-stopped — no more ticks
      let ticksAfterIdle = 0;
      listener.on('scorebug-tick', () => { ticksAfterIdle++; });
      await new Promise((r) => setTimeout(r, 300));
      expect(ticksAfterIdle).toBe(0);

      tracker.disconnect();
      listener.disconnect();
      shortIoServer.close();
      shortHttpServer.close();
    });
  });

  describe('clockSync event', () => {
    it('should stop ticking when clockSync with paused state arrives', async () => {
      const tracker = await connectClient('/tracker');
      const listener = await connectClient('/live');

      listener.emit('subscribe', 'mu-sync-1');
      await new Promise((r) => setTimeout(r, 50));

      // Start ticking via score event with clocks
      tracker.emit('score', {
        matchUpId: 'mu-sync-1',
        score: {},
        boltTimerRemainingMs: 300000,
        serveClockRemainingMs: 14000,
        matchUpStatus: 'IN_PROGRESS',
      });
      await waitForEvent(listener, 'score');
      await waitForEvent(listener, 'scorebug-tick', 500);

      // Send clockSync with paused state
      tracker.emit('clockSync', {
        matchUpId: 'mu-sync-1',
        boltTimerRemainingMs: 295000,
        serveClockRemainingMs: 14000,
        clockState: 'paused',
      });
      await waitForEvent(listener, 'clockSync');

      // Ticks should have stopped
      let ticksAfterPause = 0;
      listener.on('scorebug-tick', () => { ticksAfterPause++; });
      await new Promise((r) => setTimeout(r, 300));
      expect(ticksAfterPause).toBe(0);

      tracker.disconnect();
      listener.disconnect();
    });

    it('should resume ticking when clockSync with running state arrives', async () => {
      const tracker = await connectClient('/tracker');
      const listener = await connectClient('/live');

      listener.emit('subscribe', 'mu-sync-2');
      await new Promise((r) => setTimeout(r, 50));

      // Start paused (no ticks yet)
      tracker.emit('clockSync', {
        matchUpId: 'mu-sync-2',
        boltTimerRemainingMs: 280000,
        serveClockRemainingMs: 14000,
        clockState: 'paused',
      });
      await waitForEvent(listener, 'clockSync');
      await new Promise((r) => setTimeout(r, 200));

      // Resume
      tracker.emit('clockSync', {
        matchUpId: 'mu-sync-2',
        boltTimerRemainingMs: 280000,
        serveClockRemainingMs: 14000,
        clockState: 'running',
      });
      await waitForEvent(listener, 'clockSync');

      // Ticks should now arrive
      const tick = await waitForEvent(listener, 'scorebug-tick', 500);
      expect(tick.matchUpId).toBe('mu-sync-2');
      expect(tick.boltTimerRemainingMs).toBeGreaterThan(279000);

      tracker.disconnect();
      listener.disconnect();
    });

    it('should keep bolt ticking but freeze serve clock during rally', async () => {
      const tracker = await connectClient('/tracker');
      const listener = await connectClient('/live');

      listener.emit('subscribe', 'mu-rally-1');
      await new Promise((r) => setTimeout(r, 50));

      // Start with both clocks running (pre-rally)
      tracker.emit('score', {
        matchUpId: 'mu-rally-1',
        score: {},
        boltTimerRemainingMs: 300000,
        serveClockRemainingMs: 14000,
        matchUpStatus: 'IN_PROGRESS',
      });
      await waitForEvent(listener, 'score');
      await waitForEvent(listener, 'scorebug-tick', 500);

      // Rally starts — serve clock paused, bolt still running
      tracker.emit('clockSync', {
        matchUpId: 'mu-rally-1',
        boltTimerRemainingMs: 298000,
        serveClockRemainingMs: 12000, // frozen at paused value
        serveClockRunning: false,
        activeClock: 'bolt',
        clockState: 'running',
      });
      await waitForEvent(listener, 'clockSync');

      // Wait for a tick and verify bolt counts down but serve stays frozen
      const tick = await waitForEvent(listener, 'scorebug-tick', 500);
      expect(tick.matchUpId).toBe('mu-rally-1');
      expect(tick.activeClock).toBe('bolt');
      expect(tick.boltTimerRemainingMs).toBeGreaterThan(0);
      expect(tick.boltTimerRemainingMs).toBeLessThan(298000);
      // Serve clock must hold its anchored value (not count down)
      expect(tick.serveClockRemainingMs).toBe(12000);

      tracker.disconnect();
      listener.disconnect();
    });

    it('should resume counting serve clock when serveClockRunning becomes true', async () => {
      const tracker = await connectClient('/tracker');
      const listener = await connectClient('/live');

      listener.emit('subscribe', 'mu-rally-3');
      await new Promise((r) => setTimeout(r, 50));

      // Rally in progress — serve frozen
      tracker.emit('clockSync', {
        matchUpId: 'mu-rally-3',
        boltTimerRemainingMs: 290000,
        serveClockRemainingMs: 10000,
        serveClockRunning: false,
        activeClock: 'bolt',
        clockState: 'running',
      });
      await waitForEvent(listener, 'clockSync');
      const tick1 = await waitForEvent(listener, 'scorebug-tick', 500);
      expect(tick1.serveClockRemainingMs).toBe(10000);

      // Point scored, serve clock restarts via new score event
      tracker.emit('score', {
        matchUpId: 'mu-rally-3',
        score: {},
        boltTimerRemainingMs: 288000,
        serveClockRemainingMs: 14000,
        matchUpStatus: 'IN_PROGRESS',
      });
      await waitForEvent(listener, 'score');
      const tick2 = await waitForEvent(listener, 'scorebug-tick', 500);
      // Serve clock should now be counting down from 14000
      expect(tick2.serveClockRemainingMs).toBeLessThan(14000);

      tracker.disconnect();
      listener.disconnect();
    });

    it('should include activeClock and serveClockRunning in clockSync fan-out', async () => {
      const tracker = await connectClient('/tracker');
      const listener = await connectClient('/live');

      listener.emit('subscribe', 'mu-rally-2');
      await new Promise((r) => setTimeout(r, 50));

      tracker.emit('clockSync', {
        matchUpId: 'mu-rally-2',
        boltTimerRemainingMs: 295000,
        serveClockRemainingMs: 11000,
        serveClockRunning: false,
        activeClock: 'bolt',
        clockState: 'running',
      });

      const sync = await waitForEvent(listener, 'clockSync');
      expect(sync.activeClock).toBe('bolt');
      expect(sync.clockState).toBe('running');
      expect(sync.serveClockRunning).toBe(false);
      expect(sync.serveClockRemainingMs).toBe(11000);

      tracker.disconnect();
      listener.disconnect();
    });

    it('should fan out clockSync to all subscriber types', async () => {
      const tracker = await connectClient('/tracker');
      const matchListener = await connectClient('/live');
      const allListener = await connectClient('/live');

      matchListener.emit('subscribe', 'mu-sync-3');
      allListener.emit('subscribe:all');
      await new Promise((r) => setTimeout(r, 50));

      const p1 = waitForEvent(matchListener, 'clockSync');
      const p2 = waitForEvent(allListener, 'clockSync');
      tracker.emit('clockSync', {
        matchUpId: 'mu-sync-3',
        boltTimerRemainingMs: 200000,
        serveClockRemainingMs: 10000,
        clockState: 'paused',
      });

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1.clockState).toBe('paused');
      expect(r2.clockState).toBe('paused');

      tracker.disconnect();
      matchListener.disconnect();
      allListener.disconnect();
    });
  });
});

/**
 * Integration tests for the score relay.
 *
 * Spins up an actual Socket.IO server and connects clients to verify
 * the full tracker → relay → listener pipeline.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import { createServer } from 'http';
import { createRelay } from './relay.js';
import { getActiveMatchIds, removeMatch } from './matchStore.js';
let httpServer;
let ioServer;
let port;
function connectClient(namespace) {
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
function waitForEvent(socket, event, timeoutMs = 2000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timeout waiting for "${event}"`)), timeoutMs);
        socket.once(event, (data) => {
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
        await new Promise((resolve) => {
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
            listener.on('score', (data) => {
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
            listener.on('score', (data) => {
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
});

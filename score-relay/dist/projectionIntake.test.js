/**
 * Integration tests for the projection intake routes.
 *
 * Spins up a real HTTP + Socket.IO server, connects a /live client,
 * subscribes it to scorebug/videoboard rooms, POSTs payloads to the
 * intake routes, and verifies the client receives the fan-out events.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { io as ioClient } from 'socket.io-client';
import { createProjectionIntake } from './projectionIntake.js';
async function startHarness(apiKey) {
    let intake = null;
    const httpServer = createServer((req, res) => {
        if (req.method === 'POST' && req.url === '/api/projection/scorebug') {
            void intake?.handleScorebug(req, res);
            return;
        }
        if (req.method === 'POST' && req.url === '/api/projection/video-board') {
            void intake?.handleVideoBoard(req, res);
            return;
        }
        res.writeHead(404);
        res.end();
    });
    const io = new Server(httpServer, { cors: { origin: '*' } });
    intake = createProjectionIntake({ io, apiKey });
    await new Promise((resolve) => httpServer.listen(0, () => resolve()));
    const address = httpServer.address();
    if (!address || typeof address === 'string')
        throw new Error('failed to bind');
    return { httpServer, io, port: address.port, apiKey };
}
async function stopHarness(h) {
    h.io.close();
    await new Promise((resolve) => h.httpServer.close(() => resolve()));
}
function connectLive(port) {
    return new Promise((resolve) => {
        const socket = ioClient(`http://localhost:${port}/live`, {
            transports: ['websocket'],
            forceNew: true,
        });
        socket.on('connect', () => resolve(socket));
    });
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
async function postJson(port, path, body, headers = {}) {
    const response = await fetch(`http://localhost:${port}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
}
describe('projectionIntake', () => {
    let harness;
    beforeEach(async () => {
        harness = await startHarness();
    });
    afterEach(async () => {
        await stopHarness(harness);
    });
    it('fans out scorebug-event when payload kind is event', async () => {
        const client = await connectLive(harness.port);
        client.emit('subscribe:scorebug', 'tie-1');
        await new Promise((r) => setTimeout(r, 50));
        const eventPromise = waitForEvent(client, 'scorebug-event');
        await postJson(harness.port, '/api/projection/scorebug', {
            kind: 'event',
            matchUpId: 'tie-1',
            tournamentId: 'tour-1',
            format: 'INTENNSE',
            side1: { boltScore: 5 },
            side2: { boltScore: 3 },
            bolt: { number: 1, boltClockMs: 600000, serveClockMs: 25000, state: 'play' },
            matchUpStatus: 'IN_PROGRESS',
            generatedAt: new Date().toISOString(),
        });
        const event = await eventPromise;
        expect(event.kind).toBe('event');
        expect(event.matchUpId).toBe('tie-1');
        client.disconnect();
    });
    it('fans out scorebug-tick when payload kind is tick (and NOT on scorebug-event)', async () => {
        const client = await connectLive(harness.port);
        client.emit('subscribe:scorebug', 'tie-1');
        await new Promise((r) => setTimeout(r, 50));
        let eventName = null;
        client.on('scorebug-tick', () => { eventName = 'scorebug-tick'; });
        client.on('scorebug-event', () => { eventName = 'scorebug-event'; });
        await postJson(harness.port, '/api/projection/scorebug', {
            kind: 'tick',
            matchUpId: 'tie-1',
            tournamentId: 'tour-1',
            format: 'INTENNSE',
            state: 'play',
            boltClockMs: 412000,
            serveClockMs: 18000,
            generatedAt: new Date().toISOString(),
        });
        await new Promise((r) => setTimeout(r, 80));
        expect(eventName).toBe('scorebug-tick');
        client.disconnect();
    });
    it('does not emit on the bare "scorebug" event name (no legacy alias)', async () => {
        const client = await connectLive(harness.port);
        client.emit('subscribe:scorebug', 'tie-1');
        await new Promise((r) => setTimeout(r, 50));
        let receivedBareScorebug = false;
        client.on('scorebug', () => { receivedBareScorebug = true; });
        await postJson(harness.port, '/api/projection/scorebug', {
            kind: 'event',
            matchUpId: 'tie-1',
            tournamentId: 'tour-1',
            format: 'INTENNSE',
            side1: { boltScore: 5 },
            side2: { boltScore: 3 },
            bolt: { number: 1, boltClockMs: 600000, serveClockMs: 25000, state: 'play' },
            matchUpStatus: 'IN_PROGRESS',
            generatedAt: new Date().toISOString(),
        });
        await new Promise((r) => setTimeout(r, 80));
        expect(receivedBareScorebug).toBe(false);
        client.disconnect();
    });
    it('fans out video-board payloads to subscribed /live clients', async () => {
        const client = await connectLive(harness.port);
        client.emit('subscribe:videoboard', 'tie-1');
        await new Promise((r) => setTimeout(r, 50));
        const eventPromise = waitForEvent(client, 'videoboard');
        await postJson(harness.port, '/api/projection/video-board', {
            matchUpId: 'tie-1',
            bolt: {
                number: 1,
                state: 'play',
                boltClock: { remainingMs: 600000, anchorTimestamp: new Date().toISOString(), running: true },
                serveClock: { remainingMs: 25000, anchorTimestamp: new Date().toISOString(), running: true },
            },
            scoreboard: { side1: { boltScore: 5, arcScore: 5, isServing: true }, side2: { boltScore: 3, arcScore: 3, isServing: false } },
            sequence: 42,
            generatedAt: new Date().toISOString(),
        });
        const event = await eventPromise;
        expect(event.sequence).toBe(42);
        client.disconnect();
    });
    it('rejects payloads missing matchUpId', async () => {
        const result = await postJson(harness.port, '/api/projection/scorebug', { format: 'INTENNSE' });
        expect(result.status).toBe(400);
        expect(result.body.error).toMatch(/matchUpId/);
    });
    it('does not deliver to clients subscribed to a different matchUpId', async () => {
        const client = await connectLive(harness.port);
        client.emit('subscribe:scorebug', 'tie-A');
        await new Promise((r) => setTimeout(r, 50));
        let received = false;
        client.on('scorebug', () => {
            received = true;
        });
        await postJson(harness.port, '/api/projection/scorebug', {
            matchUpId: 'tie-B',
            format: 'INTENNSE',
            side1: {},
            side2: {},
            bolt: { number: 1, boltClockMs: 0, serveClockMs: 0, state: 'pre' },
            matchUpStatus: 'IN_PROGRESS',
            generatedAt: new Date().toISOString(),
        });
        await new Promise((r) => setTimeout(r, 100));
        expect(received).toBe(false);
        client.disconnect();
    });
});
describe('projectionIntake auth', () => {
    let harness;
    beforeEach(async () => {
        harness = await startHarness('secret-key');
    });
    afterEach(async () => {
        await stopHarness(harness);
    });
    it('rejects requests without Authorization', async () => {
        const result = await postJson(harness.port, '/api/projection/scorebug', { matchUpId: 'tie-1' });
        expect(result.status).toBe(401);
    });
    it('rejects requests with the wrong api key', async () => {
        const result = await postJson(harness.port, '/api/projection/scorebug', { matchUpId: 'tie-1' }, { Authorization: 'Bearer wrong' });
        expect(result.status).toBe(401);
    });
    it('accepts requests with the correct api key', async () => {
        const result = await postJson(harness.port, '/api/projection/scorebug', {
            matchUpId: 'tie-1',
            format: 'INTENNSE',
            side1: {},
            side2: {},
            bolt: { number: 1, boltClockMs: 0, serveClockMs: 0, state: 'pre' },
            matchUpStatus: 'IN_PROGRESS',
            generatedAt: new Date().toISOString(),
        }, { Authorization: 'Bearer secret-key' });
        expect(result.status).toBe(200);
    });
});

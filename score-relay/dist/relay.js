import { updateMatch, setMatchHistory, getMatch, getActiveMatchIds, getMatchesByTournament, pruneStaleMatches, } from './matchUpStore.js';
import { persistMatchHistory } from './persistence.js';
// Metrics counters
let trackerCount = 0;
let listenerCount = 0;
let scoresRelayed = 0;
const startTime = Date.now();
export function getMetrics() {
    return {
        trackers: trackerCount,
        listeners: listenerCount,
        activeMatches: getActiveMatchIds().length,
        scoresRelayed,
        uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    };
}
export function createRelay(io, config) {
    const staleMatchAgeMs = config.staleMatchHours * 60 * 60 * 1000;
    const pruneIntervalMs = config.pruneIntervalMinutes * 60 * 1000;
    // --- Tracker namespace: mobile trackers push scores here ---
    const tracker = io.of('/tracker');
    tracker.on('connection', (socket) => {
        trackerCount++;
        console.log(`[tracker] connected: ${socket.id} (${trackerCount} active)`);
        socket.on('score', (data) => {
            if (!data?.matchUpId) {
                socket.emit('error', { message: 'matchUpId required' });
                return;
            }
            updateMatch(data);
            scoresRelayed++;
            socket.emit('ack', { matchUpId: data.matchUpId, received: true });
            // Fan out to all listeners subscribed to this match
            listeners.to(data.matchUpId).emit('score', data);
            // Fan out to tournament room if tournamentId is present
            if (data.tournamentId) {
                listeners.to(`tournament:${data.tournamentId}`).emit('score', data);
            }
            // Also emit to the "all" room for dashboards
            listeners.to('all').emit('score', data);
        });
        socket.on('history', async (data) => {
            if (!data?.matchUpId) {
                socket.emit('error', { message: 'matchUpId required' });
                return;
            }
            setMatchHistory(data);
            socket.emit('ack', { matchUpId: data.matchUpId, received: true });
            // Persist to factory server if configured
            await persistMatchHistory(data);
            // Notify listeners
            listeners.to(data.matchUpId).emit('history', data);
        });
        socket.on('disconnect', () => {
            trackerCount--;
            console.log(`[tracker] disconnected: ${socket.id} (${trackerCount} active)`);
        });
    });
    // --- Listener namespace: TMX, scoreboards, epixodic displays subscribe here ---
    const listeners = io.of('/live');
    listeners.on('connection', (socket) => {
        listenerCount++;
        console.log(`[live] connected: ${socket.id} (${listenerCount} active)`);
        // Subscribe to score updates for a specific match
        socket.on('subscribe', (matchUpId) => {
            socket.join(matchUpId);
            // Send current state if available
            const match = getMatch(matchUpId);
            if (match) {
                socket.emit('score', match.lastUpdate);
            }
        });
        // Unsubscribe from a match
        socket.on('unsubscribe', (matchUpId) => {
            socket.leave(matchUpId);
        });
        // Subscribe to all matches for a tournament
        socket.on('subscribe:tournament', (tournamentId) => {
            socket.join(`tournament:${tournamentId}`);
            // Send all current matches for this tournament
            const matches = getMatchesByTournament(tournamentId);
            for (const update of matches) {
                socket.emit('score', update);
            }
        });
        socket.on('unsubscribe:tournament', (tournamentId) => {
            socket.leave(`tournament:${tournamentId}`);
        });
        // Subscribe to all score updates (for dashboards/schedule views)
        socket.on('subscribe:all', () => {
            socket.join('all');
            // Send list of active matches
            socket.emit('active', getActiveMatchIds());
        });
        socket.on('unsubscribe:all', () => {
            socket.leave('all');
        });
        socket.on('disconnect', () => {
            listenerCount--;
            console.log(`[live] disconnected: ${socket.id} (${listenerCount} active)`);
        });
    });
    // Periodically prune stale matches
    setInterval(() => {
        const pruned = pruneStaleMatches(staleMatchAgeMs);
        if (pruned > 0) {
            console.log(`[relay] pruned ${pruned} stale matches`);
        }
    }, pruneIntervalMs);
}

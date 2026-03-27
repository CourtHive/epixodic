import { Server } from 'socket.io';
import { createServer } from 'http';
import { createRelay, getMetrics } from './relay.js';
import { configurePersistence } from './persistence.js';
const config = {
    port: parseInt(process.env.RELAY_PORT || '8384', 10),
    factoryServerUrl: process.env.FACTORY_SERVER_URL || undefined,
    persistScores: process.env.PERSIST_SCORES !== 'false',
    corsOrigin: process.env.CORS_ORIGIN?.split(',') || '*',
    staleMatchHours: parseFloat(process.env.STALE_MATCH_HOURS || '6'),
    pruneIntervalMinutes: parseFloat(process.env.PRUNE_INTERVAL_MINUTES || '30'),
};
const httpServer = createServer((req, res) => {
    if (req.url === '/metrics') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(getMetrics()));
        return;
    }
    // Health check endpoint
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'score-relay' }));
});
const io = new Server(httpServer, {
    cors: {
        origin: config.corsOrigin,
        methods: ['GET', 'POST'],
    },
});
if (config.persistScores && config.factoryServerUrl) {
    configurePersistence(config.factoryServerUrl);
    console.log(`[relay] persistence enabled → ${config.factoryServerUrl}`);
}
else {
    console.log('[relay] persistence disabled (no FACTORY_SERVER_URL or PERSIST_SCORES=false)');
}
createRelay(io, config);
httpServer.listen(config.port, () => {
    console.log(`[relay] score-relay listening on port ${config.port}`);
    console.log(`[relay] tracker namespace: /tracker (mobile trackers connect here)`);
    console.log(`[relay] live namespace:    /live    (listeners subscribe here)`);
    console.log(`[relay] metrics:          GET /metrics`);
    console.log(`[relay] stale prune: ${config.staleMatchHours}h threshold, ${config.pruneIntervalMinutes}min interval`);
});

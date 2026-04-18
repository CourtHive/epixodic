import { Server } from 'socket.io';
import { createServer } from 'http';
import { createRelay, getMetrics } from './relay.js';
import { createProjectionIntake } from './projectionIntake.js';
import { configureVideoBoardForwarder } from './videoBoardForwarder.js';
import { configurePersistence } from './persistence.js';
import type { RelayConfig } from './types.js';

const config: RelayConfig = {
  port: parseInt(process.env.RELAY_PORT || '8384', 10),
  factoryServerUrl: process.env.FACTORY_SERVER_URL || undefined,
  persistScores: process.env.PERSIST_SCORES !== 'false',
  corsOrigin: process.env.CORS_ORIGIN?.split(',') || '*',
  staleMatchHours: parseFloat(process.env.STALE_MATCH_HOURS || '6'),
  pruneIntervalMinutes: parseFloat(process.env.PRUNE_INTERVAL_MINUTES || '30'),
  tickerIdleTimeoutSeconds: parseInt(process.env.TICKER_IDLE_TIMEOUT_SECONDS || '1800', 10),
};

let projectionIntake: ReturnType<typeof createProjectionIntake> | null = null;

const httpServer = createServer((req, res) => {
  // Projection intake routes (POST from competition-factory-server's projector)
  if (req.method === 'POST' && req.url === '/api/projection/scorebug') {
    void projectionIntake?.handleScorebug(req, res);
    return;
  }
  if (req.method === 'POST' && req.url === '/api/projection/video-board') {
    void projectionIntake?.handleVideoBoard(req, res);
    return;
  }

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
} else {
  console.log('[relay] persistence disabled (no FACTORY_SERVER_URL or PERSIST_SCORES=false)');
}

createRelay(io, config);

projectionIntake = createProjectionIntake({
  io,
  apiKey: process.env.PROJECTION_API_KEY?.trim() || undefined,
});
configureVideoBoardForwarder(process.env.VIDEO_BOARD_UDP_TARGET);

httpServer.listen(config.port, () => {
  console.log(`[relay] score-relay listening on port ${config.port}`);
  console.log(`[relay] tracker namespace: /tracker (mobile trackers connect here)`);
  console.log(`[relay] live namespace:    /live    (listeners subscribe here)`);
  console.log(`[relay] projection intake: POST /api/projection/{scorebug,video-board}`);
  console.log(`[relay] metrics:          GET /metrics`);
  console.log(`[relay] stale prune: ${config.staleMatchHours}h threshold, ${config.pruneIntervalMinutes}min interval`);
});

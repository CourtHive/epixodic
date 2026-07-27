import { Server } from 'socket.io';
import { createServer } from 'http';
import { Pool } from 'pg';
import { createRelay, getMetrics } from './relay.js';
import { createProjectionIntake } from './projectionIntake.js';
import { configureVideoBoardForwarder } from './videoBoardForwarder.js';
import { configurePersistence } from './persistence.js';
import { runMigrations } from './crowd/migrationRunner.js';
import { CrowdScoringStorage } from './crowd/storage.js';
import { startInactivityScheduler, type InactivityScheduler } from './crowd/inactivityScheduler.js';
import { createMatchUpFinalizedHandler } from './crowd/webhookReceiver.js';
import { attachCrowdNamespace } from './crowd/crowdNamespace.js';
import { UserLimits } from './crowd/userLimits.js';
import { createCrowdRestApi, type CrowdRestApi } from './crowd/restApi.js';
import { loadEs256Keys } from './crowd/jwtVerify.js';
import { configurePointHistoryPersistence } from './pointHistoryPersistence.js';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RelayConfig } from './types.js';

// ES256 public keys for dual-accept verification during the signing migration.
// Read once from the shared env (same JWT_PUBLIC_KEY/JWT_KID the co-located CFS
// signer publishes); empty until keys are provisioned, then dual-accept begins.
const es256Keys = loadEs256Keys();

const config: RelayConfig = {
  port: parseInt(process.env.RELAY_PORT || '8384', 10),
  factoryServerUrl: process.env.FACTORY_SERVER_URL || undefined,
  persistScores: process.env.PERSIST_SCORES !== 'false',
  corsOrigin: process.env.CORS_ORIGIN?.split(',') || '*',
  staleMatchHours: parseFloat(process.env.STALE_MATCH_HOURS || '6'),
  pruneIntervalMinutes: parseFloat(process.env.PRUNE_INTERVAL_MINUTES || '30'),
  tickerIdleTimeoutSeconds: parseInt(process.env.TICKER_IDLE_TIMEOUT_SECONDS || '1800', 10),
  upstreamRelayUrl: process.env.UPSTREAM_RELAY_URL?.trim() || undefined,
  trackerJwtSecret: process.env.TRACKER_JWT_SECRET?.trim() || undefined,
  es256Keys,
  trackerRequireAuth: process.env.TRACKER_REQUIRE_AUTH === 'true',
  trackerMaxEventsPerSecond: parseFloat(process.env.TRACKER_MAX_EVENTS_PER_SECOND || '10'),
};

// Strict-auth-without-a-secret check. Without this gate the relay would
// silently admit every /tracker connection as anonymous-admin — exactly
// the misconfiguration an operator is most likely to hit under deploy
// pressure (TRACKER_REQUIRE_AUTH gets toggled, TRACKER_JWT_SECRET gets
// forgotten or unset, env file load order swaps).
// See Mentat/standards/architectural-standards.md A3 (open defaults are
// fail-open).
if (config.trackerRequireAuth && !config.trackerJwtSecret) {
  console.error(
    '[relay] FATAL: TRACKER_REQUIRE_AUTH=true but TRACKER_JWT_SECRET is unset.\n' +
      '         Strict auth without a secret would admit every connection as\n' +
      '         anonymous-admin. Set TRACKER_JWT_SECRET to the same value as CFS\'s\n' +
      '         JWT_SECRET, or unset TRACKER_REQUIRE_AUTH to run in legacy permissive mode.',
  );
  process.exit(1);
}

let projectionIntake: ReturnType<typeof createProjectionIntake> | null = null;
let matchUpFinalizedHandler: ((req: IncomingMessage, res: ServerResponse) => Promise<void>) | null = null;
let crowdRestApi: CrowdRestApi | null = null;

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

  // Crowd internal webhook — TD finalized a matchUp; cancel any active crowd sessions for it
  if (req.url === '/api/internal/matchup-finalized') {
    if (!matchUpFinalizedHandler) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'crowd-storage-disabled' }));
      return;
    }
    void matchUpFinalizedHandler(req, res);
    return;
  }

  // Crowd REST API (TMX-facing). Returns false when path is unrelated.
  if (crowdRestApi && req.url?.startsWith('/api/crowd-sessions')) {
    void crowdRestApi.route(req, res);
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
  const serviceJwt = process.env.RELAY_SERVICE_JWT?.trim() || undefined;
  configurePersistence(config.factoryServerUrl, serviceJwt);
  const authMode = serviceJwt ? 'authenticated' : 'anonymous (will be rejected by CFS RolesGuard)';
  console.log(`[relay] persistence enabled → ${config.factoryServerUrl} (${authMode})`);
} else {
  console.log('[relay] persistence disabled (no FACTORY_SERVER_URL or PERSIST_SCORES=false)');
}

// Per-point history persistence → courthive-query (S3). Reuses the score-role
// RELAY_SERVICE_JWT (courthive-query verifies the same ecosystem JWT). Disabled
// when POINT_HISTORY_URL is unset. See MATCHUP_HISTORY_PERSISTENCE.md.
const pointHistoryUrl = process.env.POINT_HISTORY_URL?.trim();
if (pointHistoryUrl) {
  const pointHistoryJwt = process.env.RELAY_SERVICE_JWT?.trim() || undefined;
  configurePointHistoryPersistence(pointHistoryUrl, pointHistoryJwt);
  const authMode = pointHistoryJwt ? 'authenticated' : 'anonymous (courthive-query will 401)';
  console.log(`[relay] point-history persistence enabled → ${pointHistoryUrl} (${authMode})`);
} else {
  console.log('[relay] point-history persistence disabled (set POINT_HISTORY_URL to enable)');
}

createRelay(io, config);

projectionIntake = createProjectionIntake({
  io,
  apiKey: process.env.PROJECTION_API_KEY?.trim() || undefined,
});
configureVideoBoardForwarder(process.env.VIDEO_BOARD_UDP_TARGET);

// Crowd-scoring foundation (Phase 3 slice 1).
// When CROWD_POSTGRES_URL is set, bootstrap the `crowd` schema and apply
// pending migrations before accepting traffic. Skipped silently otherwise
// so existing deployments keep working unchanged.
const crowdPostgresUrl = process.env.CROWD_POSTGRES_URL?.trim();
let crowdPool: Pool | null = null;
let crowdStorage: CrowdScoringStorage | null = null;
let crowdInactivityScheduler: InactivityScheduler | null = null;
if (crowdPostgresUrl) {
  crowdPool = new Pool({ connectionString: crowdPostgresUrl });
  try {
    await runMigrations(crowdPool);
    crowdStorage = new CrowdScoringStorage(crowdPool);
    console.log('[relay] crowd-scoring storage ready (Postgres)');
  } catch (err) {
    console.error('[relay] crowd migration failed — aborting startup', err);
    await crowdPool.end().catch(() => undefined);
    process.exit(1);
  }

  // Slice 5 — background sweep that auto-cancels sessions idle longer than 2 hours.
  crowdInactivityScheduler = startInactivityScheduler(crowdStorage);
  console.log('[relay] crowd inactivity scheduler started (30min interval, 2h threshold)');

  // Slice 4 — internal webhook for TD-finalized matchUps (server-to-server, shared secret).
  const internalSecret = process.env.INTERNAL_WEBHOOK_SECRET?.trim();
  if (internalSecret) {
    matchUpFinalizedHandler = createMatchUpFinalizedHandler({ storage: crowdStorage, secret: internalSecret });
    console.log('[relay] crowd internal webhook: POST /api/internal/matchup-finalized (X-Internal-Secret required)');
  } else {
    console.warn('[relay] crowd internal webhook disabled (set INTERNAL_WEBHOOK_SECRET to enable)');
  }

  // Slice 2 — /crowd Socket.IO namespace with JWT validation + per-user rate limits.
  // Slice 3 — REST API for TMX (same JWT secret).
  const jwtSecret = process.env.JWT_SECRET?.trim();
  if (jwtSecret) {
    const userLimits = new UserLimits({ eventsPerSecond: 5, maxConcurrentSessions: 3 });
    attachCrowdNamespace({ io, storage: crowdStorage, userLimits, jwtSecret, es256Keys });
    console.log(
      `[relay] /crowd namespace ready (JWT-gated; 5 events/sec/user, 3 sessions/user; ES256 keys: ${es256Keys.size})`,
    );

    crowdRestApi = createCrowdRestApi({ storage: crowdStorage, jwtSecret, es256Keys });
    console.log('[relay] crowd REST API ready: GET/POST/DELETE /api/crowd-sessions/* (JWT bearer required)');
  } else {
    console.warn('[relay] /crowd namespace + REST API disabled (set JWT_SECRET to enable)');
  }
} else {
  console.log('[relay] crowd-scoring storage disabled (set CROWD_POSTGRES_URL to enable)');
}

httpServer.listen(config.port, () => {
  console.log(`[relay] score-relay listening on port ${config.port}`);
  console.log(`[relay] tracker namespace: /tracker (mobile trackers connect here)`);
  console.log(`[relay] live namespace:    /live    (listeners subscribe here)`);
  console.log(`[relay] projection intake: POST /api/projection/{scorebug,video-board}`);
  console.log(`[relay] metrics:          GET /metrics`);
  console.log(`[relay] stale prune: ${config.staleMatchHours}h threshold, ${config.pruneIntervalMinutes}min interval`);
});

async function shutdown() {
  crowdInactivityScheduler?.stop();
  if (crowdPool) await crowdPool.end().catch(() => undefined);
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Mentat Orchestration (READ FIRST)

Before doing anything else, read `../Mentat/CLAUDE.md`, `../Mentat/TASKS.md`, `../Mentat/standards/coding-standards.md`, and every file in `../Mentat/in-flight/`. Mentat is the orchestration layer for the entire CourtHive ecosystem; its standards override per-repo conventions when they conflict. If you are about to start **building** (not just planning), you must claim a surface in `../Mentat/in-flight/` and run the air-traffic-control conflict check first. See the parent `../CLAUDE.md` "Mentat Orchestration" section for the full protocol.

## Project Overview

Epixodic is a Svelte 5 point-by-point match tracker for tennis. It provides interactive scoring interfaces, live match display, and integrates with D3 visualizations from `@courthive/scoring-visualizations`. It supports standard tennis scoring and the INTENNSE team tennis format.

Epixodic is also a live **score tracker**: while scoring, it pushes advisory score/clock updates to the score-relay (see Architecture below), which fans them out to display clients (TMX schedule views, arena scoreboards, courthive-public). Epixodic never mutates authoritative tournament records — official scores are submitted through the normal authenticated CFS mutation flow.

Private package (not published to npm). Deployed as a standalone web app (base path `/epixodic/`).

This repo contains two independently-versioned packages:

- **`/`** — the epixodic client app (`epixodic`, Svelte 5, Vite).
- **`/score-relay`** — the `@epixodic/score-relay` Socket.IO relay server (Node, Postgres). It is bundled into `competition-factory-server`'s release tarball and promotes atomically with the server under unified PM2. See `score-relay/README.md`.

## Commands

```bash
pnpm install              # Install dependencies (use pnpm only)
pnpm start                # Vite dev server (opens browser, port 5182)
pnpm build                # tsc + Vite development build → dist/
pnpm build:prod           # tsc + Vite production build → dist/
pnpm deploy:pages         # Build prod + deploy
pnpm check-types          # TypeScript type-check only (tsc --noEmit)
pnpm lint                 # ESLint — non-mutating, fails on any warning
pnpm lint:fix             # ESLint with auto-fix (rewrites source)
pnpm format               # Prettier on src/
pnpm test                 # Vitest (TZ=UTC, watch mode; score-relay/** excluded)
pnpm test:e2e             # Playwright E2E tests (spawns dev server on :5175)
pnpm test:e2e:ui          # Playwright with interactive UI
pnpm test:e2e:headed      # Playwright headed mode (visible browser)
pnpm preview              # Preview built app
pnpm commit               # Interactive conventional commit (cz-git)
pnpm scorebug             # CLI relay listener (score-relay/cli/scorebug-client.ts)
pnpm scorebug:ticks       # Same, printing relay-native clock ticks
pnpm scorebug:save        # Same, saving received packets to packets.jsonl
```

Score-relay has its own commands (run inside `score-relay/`):

```bash
pnpm dev                  # tsx watch src/server.ts (port 8384)
pnpm build                # tsc → dist/
pnpm start                # node dist/server.js
pnpm test                 # Vitest (unit + integration)
```

## Architecture

### Entry Flow

`index.html` -> `src/main.ts` -> mounts Svelte app

### Source Layout

```
src/
├── main.ts               # App entry point
├── init.ts               # Initialization
├── clock/                # Drift-free clock primitive + manager (see Clock System)
├── components/           # Svelte components
├── config/               # App configuration
├── decorations/          # Visual decoration utilities
├── dev/                  # Development helpers (globalThis.dev bridge for E2E)
├── display/              # Display/rendering logic
├── engine/               # Scoring engine integration
├── events/               # Event handling
├── functions/            # Shared utility functions
├── intennse/             # INTENNSE team tennis scoring + clock orchestration
├── match/                # Match state management
├── modals/               # Modal dialogs
├── pages/                # Page-level components
├── player/               # Player data handling
├── router/               # Client-side routing
├── scoring/              # Scoring logic and UI
├── services/             # External service integration (incl. score-relay client)
└── state/                # App state stores
```

### Key Dependencies

| Package | Purpose |
|---|---|
| `svelte` | UI framework (v5 with runes) |
| `@courthive/scoring-visualizations` | D3 match visualization charts |
| `courthive-components` | Shared CourtHive UI components |
| `tods-competition-factory` | TODS types and tournament engine |
| `d3` | Additional charting |
| `navigo` | Client-side routing |
| `socket.io-client` | Real-time score-relay communication |
| `jwt-decode` | Decode CFS-issued JWTs client-side |

### Score-Relay Federation

The relay (`score-relay/`) is a Socket.IO + hand-rolled-HTTP server that broadcasts live, advisory scores. It mutates no tournament records. Topology (`score-relay/src/relay.ts`, `server.ts`):

- **`/tracker` namespace** — score producers (epixodic scorers, mobile trackers) push events here. Two Socket.IO middlewares run before `connection`: a per-IP connect-rate cap (`ConnectLimits`, default 60 connects/min, `src/connectLimits.ts`) then a JWT auth/ownership gate (`src/trackerAuth.ts`).
- **`/live` namespace** — listeners (TMX, scoreboards, dashboards, epixodic displays) subscribe per-match (`subscribe`), per-tournament (`subscribe:tournament`), or globally (`subscribe:all`). The relay replays current state on subscribe.
- **In-memory match store** (`src/matchUpStore.ts`) — last-update + history + clock anchors per matchUp; stale matches pruned on an interval (`STALE_MATCH_HOURS`, default 6h).
- **Upstream federation** (`src/upstreamFederation.ts`) — a local relay can set `UPSTREAM_RELAY_URL` to forward every tracker event to a cloud relay's `/tracker` namespace over a reconnecting client, using `volatile.emit` (fire-and-forget; ephemeral data, durable delivery handled by persistence). This is the local↔cloud federation path.
- **Persistence** (`src/persistence.ts`) — when `FACTORY_SERVER_URL` + `PERSIST_SCORES` are set, final match history is POSTed to CFS `POST /factory/score` (SCORE-role endpoint), authenticated with `RELAY_SERVICE_JWT`. Anonymous posts are rejected by CFS's RolesGuard.
- **Projection intake** (`src/projectionIntake.ts`) — CFS's projector POSTs to `POST /api/projection/{scorebug,video-board}`; the video-board forwarder (`src/videoBoardForwarder.ts`) can relay to a UDP target.
- **Rate limits** — per-matchUp + per-user token buckets (`src/trackerLimits.ts`, default 10 events/sec/matchUp with a 5× per-user fan-out ceiling that closes the cross-matchUp bypass); the `/crowd` namespace uses `UserLimits` (`src/crowd/userLimits.ts`, 5 events/sec/user, 3 concurrent sessions/user).
- **Fail-closed startup** — `server.ts` exits if `TRACKER_REQUIRE_AUTH=true` but `TRACKER_JWT_SECRET` is unset (a strict-auth-without-secret config would otherwise admit every connection as anonymous-admin; see Mentat architectural-standards A3).

#### Relay event schema

The relay does **not** use a `liveBoltScores` event — that name is not present in the code. The real events are:

Tracker → relay (all rate-limited via `guardFrame` except `clockSync`/`history` which are ownership-checked only):

- **`score`** `{ matchUpId, tournamentId?, score, point?, matchUpStatus?, winningSide? }` — a scored point; may carry `boltTimerRemainingMs` / `serveClockRemainingMs` to anchor the clock ticker.
- **`intennse`** — enriched INTENNSE snapshot (per-player stats, aggregate scores, penalty box, clock fields). Anchors clocks for relay-native ticks.
- **`clockSync`** `{ matchUpId, tournamentId?, boltTimerRemainingMs, serveClockRemainingMs, activeClock?, activeClockRemainingMs?, serveClockRunning?, clockState }` — low-frequency clock transition (pause/resume/timeout/break/navigation) that re-anchors or stops the relay ticker without a point being scored.
- **`history`** — final-state event (points/score/sides); fires once per match, triggers persistence.

Relay → listeners (fanned out to `<matchUpId>`, `tournament:<id>`, and `all` rooms): **`score`**, **`intennse`**, **`clockSync`**, **`history`**, plus **`active`** (list of active matchUpIds on `subscribe:all`) and **`scorebug-tick`** (see Clock System). Trackers receive **`ack`** and, on limit breach, **`rejected`**.

The epixodic client of this relay lives in `src/services/messaging/scoreRelay.ts` (`connectTracker`/`sendScore`/`sendIntennseUpdate`/`sendClockSync`/`sendHistory` and `connectListener`/`subscribeToMatch`/`subscribeToAll`). It targets `http://localhost:8384` in dev and the same-origin nginx `/relay/socket.io/` path in production.

### Crowd Scoring + HiveID Auth

The `/crowd` namespace (`score-relay/src/crowd/crowdNamespace.ts`) lets authenticated visitors (courthive-public, and a provider's own app such as IONSport) stream unofficial point-by-point "crowd" scores. These persist to a dedicated `crowd` Postgres schema (`src/crowd/storage.ts`, migrations under `src/crowd/migrations/`, bootstrapped by `src/crowd/migrationRunner.ts` when `CROWD_POSTGRES_URL` is set) and are **never** echoed back as authoritative scores.

- **JWT audience gating** — the handshake verifies an HS256 JWT against CFS's shared `JWT_SECRET` (native `node:crypto` verifier, no `jsonwebtoken` dep; `src/crowd/jwtVerify.ts`). `resolveAudience` maps the CFS `aud` claim to `hiveid` (canonical Person identity), `provider` (provider-minted, e.g. IONSport via the provisioner key, scoped to a `tournamentId` claim), or `admin` (legacy/unaudienced default). `hiveid`/`provider` tokens must carry a `personId` claim or the socket is rejected.
- **`email_verified` attribution / ownership** — the JWT `email_verified` claim is carried onto `crowdScoredBy.verified`. For `hiveid`/`provider` sockets the JWT-attested `personId` is the source of truth and overrides any client-supplied `scorer` block (defense-in-depth against impersonation). Sessions are owned by the creating `userId`; only the owner may append points or end a session. `submitCrowdScore` uses optimistic versioning (`expectedVersion` → `acked`/`rejected version-conflict`).
- **REST API** (`src/crowd/restApi.ts`) — TMX-facing, same JWT secret (Bearer): `GET /api/crowd-sessions?matchUpId=… | ?tournamentId=…&trustedOnly=…&activeOnly=…`, `POST /api/crowd-sessions/:id/promote`, `POST …/demote`, `DELETE …/:id`. Provider-scoped tokens (with a `tournamentId` claim) may only promote/nominate sessions within their tournament scope.
- **Lifecycle** — an inactivity scheduler (`src/crowd/inactivityScheduler.ts`, 30-min sweep, 2h idle threshold) auto-cancels stale sessions; an internal webhook `POST /api/internal/matchup-finalized` (`src/crowd/webhookReceiver.ts`, `X-Internal-Secret` shared secret) cancels active crowd sessions when a TD finalizes a matchUp.

Note: the epixodic client app itself does not connect to `/crowd`; it is a `/tracker` producer. Crowd consumers live in courthive-public / TMX.

### Clock System

`src/clock/` is a general-purpose, framework-agnostic timer layer:

- **`Clock.ts`** — a drift-free clock using `performance.now()` + `requestAnimationFrame`. Supports countdown/countup, pause/resume/reset/restart, `setRemainingMs`, and `onTick`/`onExpire`/`onPause`/`onResume` callbacks (default 100 ms / 10 fps tick).
- **`ClockManager.ts`** — singleton (`clockManager`) managing multiple named clocks (create/get/destroy/pauseAll/resumeAll).
- **`clockStore.svelte.ts`** — Svelte-runes store bridging clocks into reactive UI (`createClock`, `getClockSnapshot`, `pauseClock`, `resumeClock`, `setClockRemaining`, etc.). This is the surface the E2E dev bridge drives.

INTENNSE-specific clock behavior lives in `src/intennse/clockOrchestration.ts` (pure functions returning clock *commands*): a 10-minute `boltTimer`, a 14-second `serveClock`, and a 60-second `timeout` clock, with urgent/critical thresholds. `clockEditing.ts` handles manual clock adjustment.

**Relay-native clock ticks**: rather than CFS emitting 10 Hz HTTP POSTs, the relay extrapolates clock countdowns itself (`startClockTicker` in `src/relay.ts`). Each `score`/`intennse`/`clockSync` event re-anchors the countdown (correcting drift); between events the relay subtracts wall-clock elapsed time and emits `scorebug-tick` at 10 Hz to the match/tournament/all rooms. It handles bolt, timeout, and break clocks, freezes the serve clock mid-rally (`serveClockRunning: false`), auto-stops when the active clock hits zero, and idles out after `TICKER_IDLE_TIMEOUT_SECONDS` (default 1800s) without a re-anchor.

### Build

Svelte 5 with `@sveltejs/vite-plugin-svelte` and `vitePreprocess`. TypeScript with bundler module resolution. Two build-time Vite plugins in `vite.config.ts`:

- **`emitVersionJson`** — emits `dist/version.json` (`{ version, commit, builtAt }`) so `/epixodic/version.json` returns real JSON instead of the SPA index.html fallback; the courthive.net `/services` page fetches it to show the deployed build.
- **`stampServiceWorkerVersion`** — rewrites the `__EPIXODIC_BUILD_COMMIT__` token in `public/sw.js` to the build short-SHA so the SW cache version changes each build and the activate-time sweep evicts stale caches.

## Key Conventions

- Svelte 5 runes syntax (`$state`, `$derived`, `$effect`)
- Commitlint with conventional commits (husky pre-commit)
- ESLint with sonarjs plugin
- `strictNullChecks` is OFF, `noImplicitAny` is OFF
- Target: ES2020

## E2E Testing (Playwright)

37 E2E tests covering the INTENNSE scoring interface. Planning: `Mentat/planning/EPIXODIC_PLAYWRIGHT_E2E.md`.

```
e2e/
├── playwright.config.ts        # Mobile-first (390x844), port 5175, single worker
├── helpers/
│   ├── selectors.ts            # 80+ stable CSS selectors for INTENNSE components
│   ├── app-bridge.ts           # Dev API bridge (state access, reset, navigation)
│   ├── intennse-seed.ts        # UI-driven demo seeding helper
│   └── clock-helpers.ts        # Clock fast-forward via dev API
├── pages/
│   ├── ArchivePage.ts          # POM for archive + config modal
│   ├── ScorecardPage.ts        # POM for team scorecard
│   └── BoltScoringPage.ts      # POM for bolt scoring (two-step interaction)
└── journeys/                   # 7 spec files, 37 tests
```

**Dev API** (`globalThis.dev`): Extended for E2E with `createDemo`, `getScoringState`, `getEngineState`, `setBoltDuration`, `getClockSnapshot`, `setClockRemaining`, `pauseClock`, `resumeClock`, `undo`, `redo`, `clearLocalStorage`.

**Key patterns:**
- Scoring is two-step: tap action button → tap side panel. Ace/Fault auto-attribute to server.
- Touch semantics: pressing Touch on side N = "side N touched the ball" → opponent gets 1 point
- Clock fast-forward: `dev.pauseClock('boltTimer')` → `dev.setClockRemaining('boltTimer', 50)` → `dev.resumeClock('boltTimer')`
- Vitest exclusion: `vite.config.ts` has `test: { exclude: ['e2e/**', ..., 'score-relay/**'] }`

## Ecosystem Coding Standards

This project follows the CourtHive ecosystem coding standards.
See [CourtHive/Mentat/standards/coding-standards.md](https://github.com/CourtHive/Mentat/blob/main/standards/coding-standards.md) for the full reference.

Key repo-specific notes:
- Package manager: pnpm only
- Test runner: vitest (client) / vitest (score-relay, run inside `score-relay/`)
- Lint command: `pnpm lint`

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Mentat Orchestration (READ FIRST)

Before doing anything else, read `../Mentat/CLAUDE.md`, `../Mentat/TASKS.md`, `../Mentat/standards/coding-standards.md`, and every file in `../Mentat/in-flight/`. Mentat is the orchestration layer for the entire CourtHive ecosystem; its standards override per-repo conventions when they conflict. If you are about to start **building** (not just planning), you must claim a surface in `../Mentat/in-flight/` and run the air-traffic-control conflict check first. See the parent `../CLAUDE.md` "Mentat Orchestration" section for the full protocol.

## Project Overview

Epixodic is a Svelte 5 point-by-point match tracker for tennis. It provides interactive scoring interfaces, live match display, and integrates with D3 visualizations from `@tennisvisuals/scoring-visualizations`. Supports standard tennis scoring and the INTENNSE team tennis format.

Private package (not published to npm). Deployed as a standalone web app.

## Commands

```bash
pnpm install              # Install dependencies (use pnpm only)
pnpm start                # Vite dev server (opens browser)
pnpm build                # tsc + Vite development build → dist/
pnpm build:prod           # tsc + Vite production build → dist/
pnpm deploy:pages         # Build prod + deploy
pnpm check-types          # TypeScript type-check only (tsc --noEmit)
pnpm lint                 # ESLint with auto-fix + cache
pnpm format               # Prettier on src/
pnpm test                 # Vitest (TZ=UTC, watch mode)
pnpm test:e2e             # Playwright E2E tests (requires dev server on :5175)
pnpm test:e2e:ui          # Playwright with interactive UI
pnpm test:e2e:headed      # Playwright headed mode (visible browser)
pnpm preview              # Preview built app
pnpm commit               # Interactive conventional commit (cz-git)
```

## Architecture

### Entry Flow

`index.html` -> `src/main.ts` -> mounts Svelte app

### Source Layout

```
src/
├── main.ts               # App entry point
├── init.ts               # Initialization
├── clock/                # Clock/timer system (general + INTENNSE)
├── components/           # Svelte components
├── config/               # App configuration
├── decorations/          # Visual decoration utilities
├── dev/                  # Development helpers
├── display/              # Display/rendering logic
├── engine/               # Scoring engine integration
├── events/               # Event handling
├── functions/            # Shared utility functions
├── intennse/             # INTENNSE team tennis scoring
├── match/                # Match state management
├── modals/               # Modal dialogs
├── pages/                # Page-level components
├── player/               # Player data handling
├── router/               # Client-side routing
├── scoring/              # Scoring logic and UI
└── services/             # External service integration
```

### Key Dependencies

| Package | Purpose |
|---|---|
| `svelte` | UI framework (v5 with runes) |
| `@tennisvisuals/scoring-visualizations` | D3 match visualization charts |
| `courthive-components` | Shared CourtHive UI components |
| `tods-competition-factory` | TODS types and tournament engine |
| `d3` | Additional charting |
| `navigo` | Client-side routing |
| `socket.io-client` | Real-time communication |

### Build

Svelte 5 with `@sveltejs/vite-plugin-svelte` and `vitePreprocess`. TypeScript with bundler module resolution.

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
- Vitest exclusion: `vite.config.ts` has `test: { exclude: ['e2e/**'] }`

## Ecosystem Coding Standards

This project follows the CourtHive ecosystem coding standards.
See [CourtHive/Mentat/standards/coding-standards.md](https://github.com/CourtHive/Mentat/blob/main/standards/coding-standards.md) for the full reference.

Key repo-specific notes:
- Package manager: pnpm only
- Test runner: vitest
- Lint command: `pnpm lint`

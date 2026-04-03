# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

## Ecosystem Coding Standards

This project follows the CourtHive ecosystem coding standards.
See [CourtHive/Mentat/standards/coding-standards.md](https://github.com/CourtHive/Mentat/blob/main/standards/coding-standards.md) for the full reference.

Key repo-specific notes:
- Package manager: pnpm only
- Test runner: vitest
- Lint command: `pnpm lint`

# Epixodic

**[Live Demo](https://epixodic.com/#/welcome)**

A browser-based match tracker for tennis and racquet sports with real-time data visualizations. Built on the [CourtHive](https://courthive.com/) ecosystem, Epixodic uses the [Competition Factory](https://courthive.github.io/competition-factory/) scoring engine and the [Scoring Visualizations](https://github.com/CourtHive/scoringVisualizations) charting library to capture point-by-point data and render it through interactive D3 visualizations.

All data is stored locally in the browser — no server required.

## Features

- **Point-by-point scoring** with touch-optimized portrait and landscape skins
- **Multiple match formats** — standard, No-Ad, Fast4, pro sets, college, Grand Slam variants
- **Shot decoration** — track stroke types (drive, slice, volley, lob, etc.) and shot results (winner, error, forced/unforced)
- **Real-time visualizations** that update as points are scored:
  - **Game Tree** — Sankey diagram of point progression through games (0-0 to game)
  - **GameFish** — single-game overview with score grid, serve indicators, and rally lengths
  - **Momentum Chart** — nose-to-tail GameFish across an entire match showing flow and momentum
  - **PTS Chart** — points-per-set timeline with brushing
- **Match statistics** — serve %, winners/errors, break points, and more
- **Match archive** — save, load, and manage multiple matches in browser storage
- **Import/Export** — load legacy match data or export as JSON
- **Format-aware visualizations** — Game Tree and GameFish are automatically hidden for scoring formats where they don't apply (timed sets, consecutive-point formats, team sports)
- **Responsive** — adapts between portrait (momentum chart) and landscape (PTS chart) orientations
- **Offline-capable** — runs entirely in the browser with no network dependency

## Views

| Route                 | View          | Description                                     |
| --------------------- | ------------- | ----------------------------------------------- |
| `/welcome`            | Welcome       | Landing page                                    |
| `/archive`            | Match Archive | Browse and manage saved matches                 |
| `/match/:id/scoring`  | Scoring       | Main point entry interface                      |
| `/match/:id/stats`    | Statistics    | Match statistics dashboard                      |
| `/match/:id/tree`     | Game Tree     | Point progression visualization                 |
| `/match/:id/momentum` | Momentum      | Match flow visualization                        |
| `/match/:id/history`  | Point History | Point-by-point log with GameFish access         |
| `/match/:id/details`  | Match Details | Player names, tournament info, format selection |

## Getting Started

### Prerequisites

- Node.js >= 20
- pnpm >= 8

### Running

```bash
pnpm install
pnpm start        # dev server with hot reload (opens browser)
```

### Building

```bash
pnpm build         # development build to dist/
pnpm build:prod    # production build to dist/
pnpm launch        # serve the built dist/ folder
```

## Scripts

| Script             | Description                              |
| ------------------ | ---------------------------------------- |
| `pnpm start`       | Start Vite dev server                    |
| `pnpm build`       | TypeScript check + development build     |
| `pnpm build:prod`  | TypeScript check + production build      |
| `pnpm launch`      | Serve built `dist/` with http-server     |
| `pnpm test`        | Run tests with Vitest                    |
| `pnpm check-types` | TypeScript type checking (no emit)       |
| `pnpm lint`        | ESLint with auto-fix                     |
| `pnpm format`      | Prettier formatting                      |
| `pnpm analyze`     | Bundle analysis with source-map-explorer |

## Supported Match Formats

Epixodic uses the [matchUpFormatCode](https://courthive.github.io/competition-factory/codes/matchup-format) system from the Competition Factory:

| Format Code               | Description               |
| ------------------------- | ------------------------- |
| `SET3-S:6/TB7`            | Standard Best of 3        |
| `SET5-S:6/TB7`            | Best of 5                 |
| `SET3-S:6NOAD/TB7`        | Best of 3, No-Ad          |
| `SET3-S:4NOAD/TB7-F:TB10` | Fast4 with Supertiebreak  |
| `SET5-S:6/TB7-F:6`        | Best of 5, Long Final Set |
| `SET1-S:8/TB7`            | 8-Game Pro Set            |
| `SET1-S:4NOAD/TB7@3`      | Short Set (Under 10)      |

Legacy format codes from earlier versions are automatically migrated on load.

## Architecture

```
src/
  main.ts                 # Entry point, router init
  init.ts                 # App initialization, event setup
  router/                 # Navigo-based hash routing
  state/                  # Global state (env, settings, browserStorage)
  pages/                  # View components (ViewPage subclasses)
  scoring/                # Scoring skins (portrait/landscape)
  display/                # Visualization setup, score display, view management
  engine/                 # ScoringEngine integration, match end detection
  events/                 # Touch/click handling, stroke decoration
  decorations/            # Shot type profiles (standard, intennse)
  match/                  # Load, export, archive management
  services/               # Format migration, match object helpers
  visualizations/         # Re-exports from scoring-visualizations
  styles/                 # CSS (Bulma + app styles)
  assets/                 # Images, audio, icons
```

### Key Dependencies

| Package                                                                          | Role                                                  |
| -------------------------------------------------------------------------------- | ----------------------------------------------------- |
| [Competition Factory](https://courthive.github.io/competition-factory/)          | Scoring engine, match format parsing, statistics      |
| [Scoring Visualizations](https://github.com/CourtHive/scoringVisualizations) | D3 visualizations (GameTree, GameFish, Momentum, PTS) |
| [CourtHive Components](https://github.com/CourtHive/courthive-components)        | Modal dialogs, UI components                          |
| [D3.js v7](https://d3js.org/)                                                    | SVG rendering for all visualizations                  |
| [Navigo](https://github.com/krasimir/navigo)                                     | Client-side hash routing                              |
| [Bulma](https://bulma.io/)                                                       | CSS framework                                         |
| [Vite](https://vitejs.dev/)                                                      | Build tool and dev server                             |

## License

See [LICENSE](LICENSE) for details.

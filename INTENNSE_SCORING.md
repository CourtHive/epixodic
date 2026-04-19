# INTENNSE Scoring Interface — Epixodic

> Comprehensive feature documentation for the INTENNSE team tennis scoring system in Epixodic, the CourtHive point-by-point match tracker.

## High-Level Overview

Epixodic provides a full-featured, mobile-first scoring interface for **INTENNSE** — a team tennis format where two teams compete across multiple tieMatchUps (singles and doubles), scoring points within timed segments called **Bolts**. Points accumulate into an aggregate **ARC** score that spans all tieMatchUps in a team matchUp.

The interface handles the complete lifecycle: team creation or tournament import, player roster management, real-time point-by-point scoring with serve tracking, clock management, substitutions, penalties with penalty box timers, undo/redo, cross-device synchronization, and live score broadcasting.

### Entry Points

There are two ways to reach the INTENNSE scoring interface:

1. **Demo Mode** — from the Archive page, tap **+ INTENNSE Demo** to create a fully populated team matchUp with configurable team names, bolt duration, and pre-assigned rosters. This is the fastest way to explore the interface.

2. **Tournament Import** — when browsing a published tournament's scheduled matchUps, tapping a TEAM matchUp with INTENNSE-format tieMatchUps automatically routes to the Team Scorecard. The format is auto-detected by checking `competitionFormat.sport === 'INTENNSE'` or matching `matchUpFormat` patterns containing `XA-S:T` (cross-accumulate timed sets). No manual configuration is needed — the INTENNSE interface activates seamlessly when the data matches.

### Navigation Flow

```text
Archive / Tournament Event
  → Team Scorecard (grid of 7 tieMatchUps: 2MS + 2WS + 1MD + 1WD + 1XD)
    → Tap a tieMatchUp card
      → Player Selection (if players not yet assigned)
        → Coin Toss (first tieMatchUp only)
          → Bolt Scoring Interface
```

The Team Scorecard shows aggregate scores, individual tieMatchUp status, and participant names. Each card is tappable to enter the Bolt Scoring page for that tieMatchUp.

---

## Responsive Layouts

The scoring interface adapts to the device orientation:

### Mobile (Portrait) — Vertical Layout

Optimized for phones (primary target: 390x844, iPhone 14). Content stacks vertically:

- **Top bar**: Bolt timer (left), bolt label (center), serve clock (right), back button
- **Score panel**: Side-by-side tap targets showing team names, bolt scores, player names. Tap a side to attribute a pending action.
- **ARC bar**: Compact aggregate score with penalty box indicators flanking left/right
- **Action buttons**: Full-width column — Winner, Touch, Forced, Error, Ace, Fault
- **Footer grid**: 3-column layout with SUB/TO/PEN buttons per side, undo/redo in center column, play/pause button in center

### Tablet / Desktop (Landscape) — Horizontal Layout

Activated when `window.innerWidth > window.innerHeight`:

- **Left panel**: Side 1 action buttons + player panel
- **Center column**: Clocks, score display, ARC bar, control buttons
- **Right panel**: Side 2 action buttons + player panel

Both layouts receive identical props and callbacks — the difference is purely presentational.

---

## Scoring System

### Point Actions

Every rally outcome is recorded as one of six actions. Each action identifies which side pressed the button and resolves who receives points:

| Action             | Points | Attribution               | Description                                                                       |
| ------------------ | ------ | ------------------------- | --------------------------------------------------------------------------------- |
| **Winner**         | 2      | Pressing side wins        | Clean winner — rally ends decisively                                              |
| **Ace**            | 2      | Server wins (auto)        | Unreturnable serve — no side selection needed                                     |
| **Touch**          | 1      | Opponent of pressing side | Pressing side touched the ball but lost — limits opponent to 1 point instead of 2 |
| **Forced Error**   | 1      | Opponent of pressing side | Pressing side made an error under pressure                                        |
| **Unforced Error** | 1      | Opponent of pressing side | Self-induced error by pressing side                                               |
| **Fault**          | 0      | Serve passes to opponent  | Serving violation — no points awarded, serve changes                              |

**Interaction model (mobile):** Tap an action button (Winner, Touch, Forced, Unforced) to enter "pending" state, then tap the side panel (left or right) to attribute the action. Ace and Fault auto-attribute to the server — no side selection needed.

Point values are driven by the INTENNSE competition format's `pointMultipliers` configuration: `[{condition: {results: ['Winner']}, value: 2}, {condition: {results: ['Ace']}, value: 2}]`. All other results default to 1.

### Per-Point Data Captured

Every point records:

- Winner (side 0 or 1) and result type (Winner, Touch, Ace, Fault, Forced Error, Unforced Error, Penalty)
- Active participants for both sides (participantIds)
- Server and server participant ID
- Within-side server index (for doubles rotation)
- Serve side (DEUCE or AD)
- Timestamp
- Score value (if non-default)

### Undo and Redo

Full undo/redo support via the scoring engine's history timeline:

- **Undo** reverts the most recent point, restoring the previous score, server, and serve side
- **Redo** re-applies an undone point
- Available throughout the bolt — no action limit
- Undo/redo buttons are in the footer control bar (between SUB and TO rows)
- State is correctly rebuilt from the history timeline using the engine's `rebuildFromEntries()` mechanism

---

## Serving Rules

INTENNSE uses a distinctive serving system:

- **Winner serves next** — after each point, the winning side serves (unlike tennis where service alternates by game)
- **Serve side** — derived from the **aggregate score parity**: even total = DEUCE side, odd total = AD side
- **Fault** — serve passes to the opponent with no points awarded
- **Server indicator** — the serving side's score and player name are highlighted in teal/green
- **Serve side badge** — DEUCE or AD displayed next to the serving player's panel

### Doubles Server Rotation

In doubles tieMatchUps, each side has two players who rotate serving duties:

- Each side tracks a `serverIndex` (0 or 1) pointing to the current designated server
- When a side **loses** serve (opponent wins), that side's `serverIndex` flips so the partner serves when they regain serve
- The receiving side's index remains unchanged until they lose and regain serve
- This produces the INTENNSE rotation pattern where both partners get regular serving turns

### Coin Toss

Before the first bolt of each team matchUp, a coin toss determines the initial server:

- **Choose directly** — tap a team name button to select them as first server
- **Flip** — tap the coin flip button for an animated random selection (800ms), then confirm
- Subsequent tieMatchUps in the same team matchUp skip the coin toss (server is already determined)

---

## Clock System

Three independent clocks govern the pace of play:

### Bolt Timer

- **Duration**: 10 minutes (default), configurable via tieFormat (`boltDurationMinutes`), URL parameter (`?boltMinutes=N`), or dev API
- **Tick**: 200ms resolution
- **Urgency states**: normal (>60s), urgent/orange (60-30s), critical/red (<30s), expired/gray (0s)
- **Behavior**: starts on first play press; pauses during timeouts and official pauses; resumes on unpause
- **Expiry**: sets `boltExpired` flag — the next point scored after expiry completes the bolt and starts the break clock

### Serve Clock

- **Duration**: 14 seconds per serve
- **Tick**: 100ms resolution
- **Urgency states**: normal (>5s), urgent/orange (5-3s), critical/red (<3s)
- **Behavior**: restarts after each point; pauses when rally starts (receiver initiates); pauses during timeouts
- **Expiry**: triggers a serve violation modal — the scorer can award the point to the receiver or dismiss (play on)

### Break Timer

- **Duration**: 2 minutes between bolts
- **Behavior**: auto-starts when a bolt completes; can be paused by the scorer
- **Expiry**: auto-triggers the next bolt (clocks recreated, state reset)
- **During break**: point adjustment buttons appear (+1 per side) for post-bolt corrections; the break can be ended early via "Start Bolt N+1"

### Timer Adjustment

All clocks support manual editing:

- **Tap the clock display** to enter edit mode
- **+/- buttons** step by 1 second per tap
- **Confirm** (checkmark) or **Cancel** (X) to apply or discard changes
- Clock must be paused to edit (bolt timer auto-pauses on edit tap)
- Limits enforced: bolt timer (0 to configured max), serve clock (0 to 14s)

### Rally Start Button

The **play/pause** button in the control bar serves multiple functions:

- **Before bolt**: "▶" starts the bolt (bolt timer begins, serve clock starts)
- **During bolt**: toggles official pause (pauses all clocks and player time)
- **Rally start**: when tapped during an active serve clock, it signals the rally has begun — the serve clock pauses (the server has made the serve, now play is live)

---

## Team Roster and Substitutions

### Pre-Bolt Player Selection

Before a bolt can start, each side must have the required number of active players:

- **Singles**: 1 player per side
- **Doubles**: 2 players per side

If participants are pre-assigned (demo default or tournament roster), selection is automatic. If not, a player selection modal auto-opens for the incomplete side.

The selection modal shows the full team roster. Tap to select (order matters for doubles — first selected = first server). The "Confirm" button enables only when exactly the required number are selected.

### Substitution During Play

Available at any time during an active bolt via the **SUB** buttons (one per side) in the footer:

- **Two-section layout**: On Court (current players) | Bench (available replacements)
- **Tap on-court player** to select for removal, then **tap bench player** to bring in
- **Court time displayed** per player with color-coded urgency (green → orange → red)
- **Exhausted players** (court time limit reached) are marked and locked — cannot be selected from bench
- **Penalized players** (in penalty box) are locked — cannot be removed from court until their penalty expires
- **Jersey numbers** displayed on all players for quick identification

Substitution updates:

- Scoring engine lineup
- Player time tracking (outgoing player's clock pauses, incoming player's clock starts if bolt is running)
- TieMatchUp side participants (reflected on scorecard)
- Score relay broadcast

---

## Penalty System

### Assigning a Penalty

Tap **PEN** (one per side) in the footer to open the penalty modal:

1. **Select player** from the side's roster (on-court and bench)
2. **Choose point value** — 1, 2, 5, or 10 points awarded to the opponent
3. **Confirm** — penalty is recorded, points added, player sent to penalty box

### Penalty Box

Penalized players enter a timed penalty box:

- **Duration**: 120 seconds (default), configurable per competition format
- **Individual countdown clock** per penalized player
- **Auto-release** when penalty timer expires
- **Penalty box indicator** — compact badge flanking the ARC score showing jersey numbers and countdown of nearest release
- **Detail modal** — tap the indicator to see full penalty box view with all entries, side-by-side

### Auto-Substitution

When a penalized player was **on court**, the substitution modal auto-opens immediately after the penalty is confirmed, prompting the scorer to select a replacement from the bench.

### Player Time Tracking

INTENNSE enforces maximum court time per player per tieMatchUp:

- **Default limit**: 12 minutes (2 bolts x 6 minutes per bolt for singles)
- **Individual up-counting clocks** per player, running only while on court
- **Time display**: remaining time shown in player panels and substitution modal
- **Warning toast**: appears when any player drops below 2 minutes remaining (orange) or 1 minute (red)
- **Exhaustion**: at 0 remaining, the player is marked "TIME EXHAUSTED — must substitute" (pulsing red alert), locked out from bench selection, and an auto-penalty triggers via the reactive time monitoring system

### Player Time Info Panel

A collapsible panel (toggle via "TIME" button in footer) showing all players from both sides:

- Sorted by remaining time (most urgent first)
- Two columns (side 1 left, side 2 right)
- On-court indicator dot per player
- Color-coded time display matching the urgency scale

---

## Timeouts

Each side has a configurable number of timeouts per team matchUp (default: 5).

- Tap **TO** button (per side) in the footer to start a timeout
- **60-second countdown** displayed in a full-screen overlay with team name
- **End Timeout** button dismisses and counts the timeout
- **Cancel** button dismisses without counting (doesn't decrement the limit)
- During timeout: bolt timer paused, serve clock paused (if it was running)
- Remaining timeouts shown as count in the TO button label: "TO (3)"

---

## Bolt Lifecycle

A complete bolt follows this sequence:

```text
[Pre-bolt]
  Player Selection → Coin Toss (first bolt only)

[Active Bolt]
  ▶ Start Bolt → Bolt timer starts, serve clock starts
    → Server serves → Rally Start (serve clock pauses)
      → Point outcome → Score updates, serve clock restarts
        → [loop until bolt timer expires]
    → Bolt timer expires → boltExpired flag set
      → Next point scored → Bolt complete, break timer starts

[Break]
  Break timer (2:00) → Point adjustments available (+1 per side)
    → Break expires → Next bolt auto-starts
    OR → Scorer pauses break → "Start Bolt N+1" button appears
```

### Bolt Completion

When the bolt timer reaches zero:

1. The `boltExpired` flag is set
2. All player time clocks pause
3. The current rally (if active) continues — the scorer records the final point
4. The final point triggers `endSegment({ reason: 'bolt_expired' })` in the engine
5. The break timer auto-starts (unless the match is complete)

### Match Completion

The engine detects match completion when scoring format criteria are met. On the final bolt of the final tieMatchUp, the interface shows a completion state and no further bolts are started.

---

## Score Display

### Bolt Score

The central score panel shows the current bolt's score for both sides:

- Large numerals (e.g., "14 — 9")
- Server side highlighted in teal/green
- Team names above, player names below
- Tappable for side selection when an action is pending

### ARC (Aggregate) Score

A compact bar below the bolt score showing the cumulative score across all bolts in the current tieMatchUp, plus scores from other tieMatchUps in the team matchUp:

- Format: `[side1 total]  ARC  [side2 total]`
- Leading side highlighted
- Includes base scores from other tieMatchUps (computed on mount)

### Scorecard Header

When viewing the Team Scorecard, the header displays the aggregate score across all 7 tieMatchUps. Individual tieMatchUp cards show per-bolt scores and match status.

---

## State Persistence and Recovery

### Local Persistence (localStorage)

The entire bolt state is persisted to localStorage on:

- Every point scored (via `broadcastState()`)
- Navigation away from the bolt page (via `pauseAndPersistOnExit()`)
- Page unload / tab close (via `beforeunload` handler)

Persisted data includes:

- Engine state (full scoring history, sets, points)
- Bolt clock remaining milliseconds
- Serve clock remaining milliseconds
- Player time snapshots (per-player elapsed court time)
- Bolt lifecycle flags (started, expired, complete)
- Timeouts used per side
- Server indices per side (doubles rotation)
- Paused-on-exit flag (resumes as officially paused)

### Page Refresh Recovery

On page refresh or returning to a bolt:

1. The team matchUp is restored from localStorage (keyed by matchUpId)
2. The tieMatchUp's persisted engine state is loaded via `setEngineState()`
3. Clocks are recreated and set to their persisted remaining values
4. Player time snapshots are restored
5. If the bolt was active when the user left, it resumes in **official pause** state (clocks paused, awaiting manual resume)

### Exit Safeguards

When navigating away from an active bolt (back button or route change):

- **Confirmation dialog** appears: "Leave active Bolt? Clocks are still running."
- **"Continue Bolt"** — dismisses dialog, stays on bolt page
- **"Leave"** — pauses all clocks, persists state, navigates to scorecard
- Clocks continue running during the dialog (no implicit pause)
- No confirmation when the bolt hasn't started or is already complete

### Cross-Device Synchronization

For authenticated users with server connectivity:

- On mount, `hydrateBoltHistoryOnMount()` compares the local tieMatchUp's `updatedAt` with the server's version
- If the server has a newer document, it's applied to the local store via `applyServerDocument()`
- Every `broadcastState()` pushes a `BoltHistoryDocument` to the server
- Version conflict resolution: on `VERSION_CONFLICT`, the client refetches and applies the server's document if newer
- Offline queue: failed pushes are queued in-memory and auto-retried on reconnection

---

## Live Score Broadcasting

During active scoring, epixodic broadcasts enriched state to connected displays:

- **Score relay**: Socket.IO connection to the score-relay microservice
- **Per-point updates**: `sendScore()` emits score string and matchUp status
- **INTENNSE snapshots**: `sendIntennseUpdate()` emits a rich `IntennseSnapshot` containing:
  - Bolt score and aggregate score
  - Active players per side with IDs
  - Per-player statistics (winners, touches, aces, errors, court time)
  - Penalty box entries with remaining timers
  - Clock states (bolt remaining, serve clock remaining)
  - Server and match status
- Connected listeners (courthive-public, spectator displays) receive real-time updates

---

## Demo Mode

The Archive page offers a one-tap **+ INTENNSE Demo** button that creates a fully populated team matchUp for testing and demonstration:

### Configuration Modal

- **Team 1 name** (default: "The Authentics")
- **Team 2 name** (default: "Cauldron")
- **Bolt duration** — select from 1 min (testing), 2 min (testing), 3 min (exhibition), 5 min, 10 min (standard)
- **Pre-assign players** — checkbox to auto-assign players to tieMatchUps or leave unassigned for manual selection

### Generated Structure

- Two team participants with 6-player rosters each (3 male, 3 female)
- Realistic player names with jersey numbers (1-6)
- Standard INTENNSE tieFormat: 7 tieMatchUps
  - 1x Men's Singles (SET2XA-S:T10)
  - 1x Women's Singles (SET2XA-S:T10)
  - 1x Men's Doubles (SET1A-S:T10)
  - 1x Women's Doubles (SET1A-S:T10)
  - 1x Mixed Doubles (SET1A-S:T10)
- Aggregate scoring (`winCriteria: { aggregateValue: true }`)
- All tieMatchUps start as `TO_BE_PLAYED`

The demo is immediately stored in localStorage and navigated to the Team Scorecard view.

---

## E2E Test Coverage

The INTENNSE scoring interface has comprehensive end-to-end test coverage using Playwright, organized as 7 user journeys with 37 tests.

### Running Tests

```bash
pnpm test:e2e             # Run all 37 tests (headless, mobile viewport)
pnpm test:e2e:ui          # Interactive Playwright UI
pnpm test:e2e:headed      # Visible browser window
```

Tests require a running dev server on port 5175. The Playwright config (`e2e/playwright.config.ts`) auto-starts one if not already running.

### Test Infrastructure

| Component    | Location                       | Purpose                                              |
| ------------ | ------------------------------ | ---------------------------------------------------- |
| Config       | `e2e/playwright.config.ts`     | Mobile-first (390x844), single worker, 2min timeout  |
| Selectors    | `e2e/helpers/selectors.ts`     | 80+ stable CSS selectors for all INTENNSE components |
| App Bridge   | `e2e/helpers/app-bridge.ts`    | Dev API access, state reset, navigation assertions   |
| Seed Helper  | `e2e/helpers/intennse-seed.ts` | UI-driven demo creation for test setup               |
| Clock Helper | `e2e/helpers/clock-helpers.ts` | Clock fast-forward via pause/setRemaining/resume     |
| Page Objects | `e2e/pages/`                   | ArchivePage, ScorecardPage, BoltScoringPage POMs     |

### Journey Coverage

**Journey 1 — Create Demo and Navigate to Scorecard (7 tests)**

- Archive page shows INTENNSE Demo button
- Config modal opens with default values
- Custom team names and bolt duration accepted
- Demo creation navigates to scorecard
- Scorecard renders 7 tieMatchUp cards
- Header shows initial 0 vs 0 aggregate
- Dev API confirms team matchUp is loaded

**Journey 2 — Player Selection, Coin Toss, Scoring (10 tests)**

- Tapping tieMatchUp card navigates to bolt scoring
- Coin toss modal appears for first tieMatchUp
- Choosing a side dismisses coin toss
- Bolt starts with play button at 0-0
- Winner awards 2 points to chosen side
- Touch gives opponent 1 point (inverted attribution)
- Winner + Touch produces correct cumulative score
- Undo reverts a winner back to 0-0
- Redo restores the undone winner
- Dev API reflects scoring state after points

**Journey 3 — Bolt Completion and Break Clock (4 tests)**

- Bolt clock starts counting down after bolt start
- Bolt expires and enters break after final point (clock fast-forwarded via dev API)
- Break overlay shows point adjustment buttons (+1 per side)
- Point adjustment during break updates ARC score

**Journey 4 — Substitution During Play (4 tests)**

- Tapping SUB opens substitution modal
- Modal shows bench players available for selection
- Selecting a bench player executes substitution and closes modal
- Jersey numbers are visible in substitution modal

**Journey 5 — Penalty Flow (4 tests)**

- Tapping PEN opens penalty modal
- Modal shows players and point value options
- Confirming penalty shows penalty indicator (or auto-sub modal)
- Penalty indicator tap opens detail modal

**Journey 6 — Aggregate Score Across TieMatchUps (3 tests)**

- Scoring in MS1 and returning shows updated scorecard aggregate
- Scoring in two tieMatchUps shows cumulative aggregate for both sides
- ARC score on bolt page reflects other tieMatchUps' scores

**Journey 7 — Bolt Exit Confirmation (5 tests)**

- Back button during active bolt shows confirmation dialog
- "Continue Bolt" dismisses dialog, stays on bolt page
- "Leave" navigates to scorecard
- No confirmation when bolt hasn't started
- Score is preserved after leaving and returning

### Dev API for Testing

The `globalThis.dev` object is extended with testing-specific functions:

| Function                    | Purpose                                       |
| --------------------------- | --------------------------------------------- |
| `createDemo(config)`        | Create INTENNSE demo programmatically         |
| `getScoringState()`         | Snapshot of scoring engine reactive state     |
| `getEngineState()`          | Raw engine state (bypasses Svelte reactivity) |
| `undo()` / `redo()`         | Trigger scoring undo/redo                     |
| `setBoltDuration(ms)`       | Configure bolt timer for subsequent bolts     |
| `getClockSnapshot(id)`      | Read clock state                              |
| `pauseClock(id)`            | Pause a clock                                 |
| `setClockRemaining(id, ms)` | Set clock remaining (must be paused)          |
| `resumeClock(id)`           | Resume a paused clock                         |
| `clearLocalStorage()`       | Full state reset                              |

---

## Technical Architecture

### Component Hierarchy

```text
BoltScoringPage.svelte (orchestrator — 1,355 lines)
├── VerticalBolt.svelte (mobile) OR HorizontalBolt.svelte (tablet)
│   ├── ClockDisplay.svelte (bolt timer + serve clock)
│   ├── ScoreDisplay.svelte (bolt score)
│   ├── AggregateBar.svelte (ARC score)
│   ├── ActionPanel.svelte (6 scoring buttons)
│   ├── PlayerPanel.svelte (per-side player display)
│   ├── ControlBar.svelte (undo/redo, play/pause, timeout overlay)
│   ├── PenaltyBoxIndicator.svelte (per-side badge)
│   └── PlayerTimeInfoPanel.svelte (collapsible court time view)
├── CoinTossModal.svelte
├── PlayerSelectModal.svelte
├── SubstitutionModal.svelte
├── PenaltyModal.svelte
├── PenaltyBoxDetailModal.svelte
└── PlayerTimeWarning.svelte (toast alert)
```

### State Stores (Svelte 5 Runes)

| Store                     | Responsibility                                        |
| ------------------------- | ----------------------------------------------------- |
| `scoringEngine.svelte.ts` | Wraps factory ScoringEngine with reactive state       |
| `teamMatchUp.svelte.ts`   | Team matchUp tree, tieMatchUp CRUD, localStorage sync |
| `playerTime.svelte.ts`    | Per-player court time clocks                          |
| `penaltyBox.svelte.ts`    | Penalty box entries with countdown clocks             |

### Pure Business Logic (no framework dependency)

| Module                  | Responsibility                                        |
| ----------------------- | ----------------------------------------------------- |
| `pointRules.ts`         | Action → point attribution mapping                    |
| `servingRules.ts`       | Server derivation, serve side, doubles rotation       |
| `clockOrchestration.ts` | Clock lifecycle commands (start/pause/resume/destroy) |
| `scoreComputation.ts`   | Bolt score and aggregate score from engine state      |
| `clockEditing.ts`       | Timer edit limits, step values, input parsing         |

# INTENNSE Scoring — User Guide

> A guide for scorers using the INTENNSE team tennis scoring interface in Epixodic.

## What is INTENNSE?

INTENNSE is a team tennis format where two teams compete across five matchUps — singles and doubles — scoring points within timed segments called **Bolts**. Points from every bolt accumulate into a running **ARC** (aggregate) score. The team with the higher ARC score at the end wins.

A standard INTENNSE ARC has **5 matchUps** totaling **7 bolts**:

| MatchUp         | Bolts | Players per side |
| --------------- | ----- | ---------------- |
| Men's Singles   | 2     | 1                |
| Women's Singles | 2     | 1                |
| Men's Doubles   | 1     | 2                |
| Women's Doubles | 1     | 2                |
| Mixed Doubles   | 1     | 2                |

The **host team** determines whether men's or women's singles goes first. This choice sets the gender order for the entire ARC — if men's singles leads, men's doubles precedes women's doubles; if women's singles leads, women's doubles comes first. Mixed doubles is always the final bolt.

For example, if the host chooses **men first**: MS (bolt 1, bolt 2) → WS (bolt 3, bolt 4) → MD (bolt 5) → WD (bolt 6) → XD (bolt 7).

The interface guides you through all 7 bolts automatically.

---

## Getting Started

### From a TMX-Published Tournament

When a tournament director publishes an INTENNSE event from TMX, scorers can pull it into Epixodic using the **tournamentId**. Epixodic recognizes the INTENNSE format automatically — no manual configuration is needed. The Team Scorecard appears immediately, showing all five matchUp cards ready to score.

This is the primary workflow for live scoring at a real event.

### Using the Demo Button

From the **Archive** page, tap **+ INTENNSE Demo** to create a practice match instantly. A configuration dialog lets you set:

- Team names (defaults: "The Authentics" vs "Cauldron")
- Bolt duration (1, 2, 3, 5, or 10 minutes)
- Whether players are pre-assigned to matchUps

The demo creates the same structure as a TMX-published event — everything you practice in demo mode works identically during a live tournament.

---

## The Team Scorecard

After entering an INTENNSE match, you land on the **Team Scorecard** — a grid of five matchUp cards showing:

- Team names and the running **ARC** score in the header
- Each matchUp's type (MS, WS, MD, WD, XD), assigned players, and status
- Per-matchUp bolt scores once scoring begins

Tap any matchUp card to enter the **Bolt Scoring** interface for that matchUp.

---

## Starting a Bolt

### Gender Order

The **host team** determines whether men's or women's singles goes first. This choice sets the bolt sequence for the entire ARC — the gender that leads in singles also leads in doubles, with mixed doubles always closing. Once the order is set, bolt progression follows it automatically.

### Player Selection

Before the first bolt of a matchUp, each side needs the right number of active players:

- **Singles**: 1 player per side
- **Doubles**: 2 players per side

If players aren't pre-assigned, a selection modal opens automatically. Tap players from the roster to select them. In doubles, selection order matters — the first player selected is the first server for that side. Confirm when you have the right number selected.

### Coin Toss

Before the very first bolt of the entire team match, a **coin toss** determines who serves first:

- Tap a team name to choose directly, or
- Tap the coin flip button for a random result, then confirm

Subsequent matchUps skip the coin toss — the serving pattern carries forward.

### Starting Play

Tap the **▶ START BOLT** button in the control bar. The bolt timer begins counting down, and the serve clock starts its 14-second countdown.

---

## Scoring Points

### One-Tap Scoring

Each action button is paired with a side — one tap records both what happened and who did it. The system resolves point attribution automatically:

| Action             | Points | Attribution                                                                                                                  |
| ------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **Winner**         | 2      | The side you tap (they hit a clean winner)                                                                                   |
| **Ace**            | 2      | The side you tap (unreturnable serve)                                                                                        |
| **Touch**          | 1      | The _opponent_ of the side you tap (that side touched the ball but lost the rally — limiting the opponent to 1 instead of 2) |
| **Forced Error**   | 1      | The _opponent_ of the side you tap (that side was forced into an error)                                                      |
| **Unforced Error** | 1      | The _opponent_ of the side you tap (that side made an unforced error)                                                        |
| **Fault**          | 0      | No points — serve passes to the other side                                                                                   |

### Serving Rules

- **Winner serves next** — after each point, the side that won the point serves
- **Fault** — serve passes to the opponent with no points
- **Serve side** — DEUCE or AD court is determined by the aggregate score (even total = DEUCE, odd = AD)
- The serving side is highlighted in teal/green on the score display

In **doubles**, partners rotate serving duties. When a side loses serve and later regains it, the other partner takes over. This happens automatically.

### Undo and Redo

Made a mistake? Tap **Undo** in the control bar to revert the last point. **Redo** re-applies it. You can undo/redo as many times as needed — the full history is preserved.

---

## Clocks

### Bolt Timer (Main Clock)

The primary countdown clock in the top bar. Default duration is 10 minutes (configurable).

- Color changes as time runs low: **white** → **orange** (under 60s) → **red** (under 30s) → **gray** (expired)
- When it reaches zero, the current rally finishes normally. The next point scored ends the bolt and starts the break.

### Serve Clock (14 seconds)

Counts down from 14 seconds after each point. The server must serve before it expires.

- Tap the **play/pause** button once the serve is made to signal the rally has started (this pauses the serve clock)
- If it expires, a **serve violation** prompt appears: award the point to the receiver, or dismiss if play continued

### Break Timer (Between Bolts)

A 2-minute countdown between bolts. During the break you can:

- Adjust scores with **+1** buttons (for post-bolt corrections)
- End the break early by tapping **Start Bolt N+1**

When the break expires, the next bolt starts automatically.

### Editing Clocks

Tap any clock display to enter edit mode. Use the **+/−** buttons to adjust by 1-second increments, then confirm with the checkmark or cancel with X. The bolt timer auto-pauses when you tap it.

---

## Automatic Bolt Progression

One of the key features of the INTENNSE interface is **automatic progression**. You do not need to return to the scorecard between bolts or matchUps:

1. A bolt ends → the **break timer** starts automatically
2. The break expires → the **next bolt** starts automatically
3. When a matchUp's final bolt ends → the next matchUp in the sequence auto-loads

This continues through all 7 bolts of the ARC. The **bolt number** (displayed in the bolt label) increments continuously, so you always know where you are in the match.

You can always pause a break and return to the scorecard manually, but for live scoring, the auto-advance keeps you in flow.

---

## Substitutions

Tap the **SUB** button (one per side in the footer) to swap a player during a bolt.

The substitution modal shows two sections:

- **On Court** — tap the player you want to take off
- **Bench** — tap the replacement you want to bring in

Each player shows their remaining court time. Players who have exhausted their time or are in the penalty box are locked and cannot be selected.

Once you confirm, the swap happens immediately — the outgoing player's court time clock pauses and the incoming player's starts.

---

## Penalties

Tap the **PEN** button (one per side) to assess a penalty.

1. Select the penalized player from the roster
2. Choose the point value: **1, 2, 5, or 10** points (awarded to the opponent)
3. Confirm

The penalized player enters the **penalty box** with a 120-second countdown timer. A compact indicator appears next to the ARC score showing who's in the box and when they'll be released. Tap the indicator for a detailed view.

If the penalized player was on court, the **substitution modal opens automatically** — you must select a replacement before scoring continues.

Players are automatically released when their penalty timer expires.

---

## Timeouts

Tap the **TO** button to call a timeout for a side. A full-screen overlay shows:

- Team name
- 60-second countdown
- **End Timeout** — ends the timeout (counts against the side's limit)
- **Cancel** — cancels without counting it

Each side has a limited number of timeouts per match (displayed as a count on the TO button). All clocks pause during timeouts.

---

## Player Court Time

INTENNSE tracks how long each player has been on court during **singles** matchUps:

- **Limit**: 12 minutes per player across the 2-bolt singles matchUp (each bolt is 10 minutes, so a player cannot occupy the full matchUp alone)
- **Warnings** appear as toast alerts when a player drops below 2 minutes (orange) or 1 minute (red)
- **TIME button** in the footer toggles a panel showing all players' remaining time
- When a player's time is **exhausted**, they must be substituted off

**Doubles matchUps have no court time limit** — each doubles matchUp is a single bolt, so time management is not a factor.

Court time clocks run only while the player is actively on court and pause during official pauses and between bolts.

---

## Navigation Guardrails

The interface protects against accidental data loss:

- **Back button during an active bolt** shows a confirmation dialog: "Leave active Bolt?" with options to **Continue Bolt** or **Leave**
- **Page refresh / tab close** automatically pauses all clocks and saves the complete state
- **Returning to a bolt** after leaving or refreshing restores everything exactly where you left off — score, clocks, player times, server — in a paused state ready for you to resume

No confirmation is shown if the bolt hasn't started yet or is already complete.

---

## Login and Official Score Submission

Scoring in Epixodic works without logging in — demo mode and local scoring are always available. Login is only required to **officially submit scores** back to the source tournament in TMX.

### Logging In

Tap the **Login** button in the top navigation bar. Enter your email and password in the modal that appears. On success, the button changes to a green indicator showing your initial. Tap it to log out.

Your session persists across page refreshes. If your session expires, you'll be prompted to log in again the next time you attempt a score submission.

### Who Can Submit

Official score submission requires the **score** role on your account. Tournament directors assign this role to officials and authorized scorers. If you're logged in but don't have the score role, submit buttons won't appear.

### Manual Submission

When you're logged in with the score role and scoring a tournament matchUp (not a demo), a **Submit Score** button appears in two places:

- **During the break** between bolts — in the break overlay, below the point adjustment buttons. This lets you submit the bolt score after making any corrections during the review period.
- **After the final bolt** — a **Submit Final Score** button appears in the control area, since there's no break after the last bolt of the ARC.

If you tap Submit without being logged in, the login modal opens first. After successful login, the score submits automatically.

### Automatic Submission

For authenticated officials, scores are **auto-submitted when the break expires**. The 2-minute break between bolts doubles as the review period — any point adjustments you make during the break are captured in the submitted score.

Auto-submit happens at the end of every break **except after the final bolt** (bolt 7). There is no break after the last bolt, so the final score must be submitted manually.

If you've already tapped Submit manually during the break, the auto-submit is skipped to avoid duplicates.

### What Happens on Submit

The score is sent directly to the competition-factory-server via `POST /factory/score`. The server:

1. Validates your credentials and score role
2. Applies the score to the tournament record
3. Broadcasts the update to all connected TMX clients

Tournament directors viewing the event in TMX see the score update in real time. No manual data entry needed on the TMX side.

### Submission Failures

If a submission fails (network error, session expired), scoring continues uninterrupted. You'll see a brief error notification. You can retry by tapping Submit again, or the auto-submit will try again at the next break.

---

## Live Score Relay

During active scoring, Epixodic broadcasts live data to connected applications via the score relay service. This happens independently of official score submission — even unauthenticated scorers generate live data.

- **Score updates** — per-point score and match status sent after every point
- **INTENNSE snapshots** — rich data packages including bolt score, aggregate score, serve side (DEUCE/AD), active players, per-player statistics (winners, touches, aces, errors, court time), penalty box state, and clock values
- **Connected displays** — scorebugs, spectator apps, and public-facing sites (like courthive-public) receive these updates in real time
- **TMX live indicators** — tournament directors viewing the event in TMX see a green pulse on matchUp score cells when relay scores arrive, providing real-time awareness of scoring activity

The relay uses Socket.IO with automatic reconnection. Scoring continues normally if the relay connection drops — updates queue and sync when connectivity returns. Configuration of display applications and scorebugs is outside the scope of this guide.

---

## Automated Test Coverage

The INTENNSE interface has **37 end-to-end tests** organized across 8 user journeys, built with Playwright:

| Journey                              | Tests | What it covers                                                      |
| ------------------------------------ | ----- | ------------------------------------------------------------------- |
| Demo Creation & Scorecard            | 7     | Creating a demo, navigating to scorecard, verifying 5 matchUp cards |
| Player Selection, Coin Toss, Scoring | 10    | Full scoring flow with point attribution, undo/redo                 |
| Bolt Completion & Break              | 4     | Bolt expiry, break clock, post-bolt point adjustments               |
| Substitution                         | 4     | Player swaps during active play                                     |
| Penalty Flow                         | 4     | Penalty assignment, penalty box, auto-substitution                  |
| Aggregate Score                      | 3     | Cross-matchUp score accumulation                                    |
| Exit Confirmation                    | 5     | Navigation guardrails and state preservation                        |
| Auto-Advance                         | 4     | 7-bolt progression across all matchUps in the ARC                   |

Tests run on both mobile (iPhone 14, 390×844) and tablet viewports to validate the scoring experience across device sizes.

### Call to Action: Help Us Expand Coverage

The automated tests cover the core scoring journeys, but real-world scoring produces countless variations. **If you're testing the INTENNSE interface, we want to hear from you.**

Describe user journeys you encounter that should be added to the test suite — especially:

- **Edge cases** — unusual sequences of substitutions, penalties during break, rapid undo/redo chains
- **Clock interactions** — serve violations at bolt expiry, timeouts near bolt end, editing clocks mid-rally
- **Multi-matchUp flows** — scoring patterns across the 7-bolt ARC sequence, returning to earlier matchUps
- **Recovery scenarios** — refreshing mid-penalty, losing connection during auto-advance, re-entering a completed matchUp
- **Doubles-specific** — server rotation across substitutions, partner swaps between bolts

File your test journey descriptions as issues or reach out to the development team. Each new journey strengthens the safety net for every scorer.

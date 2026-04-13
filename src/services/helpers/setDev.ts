import { createIntennseDemoMatchUp } from '../../fixtures/intennseDemo';
import { getClockSnapshot, setClockRemaining, pauseClock, resumeClock } from '../../clock';
import { submitCredentials } from '../messaging/authApi';
import { app, env, engineLog } from '../../state/env';
import { version } from '../../config/version';
import { logOut } from '../auth/loginState';
import {
  getPlayerTimeState,
} from '../../svelte/stores/playerTime.svelte';
import {
  getScoringState,
  getEngineState,
  undo as scoringUndo,
  redo as scoringRedo,
} from '../../svelte/stores/scoringEngine.svelte';
import {
  resetAllTeamMatchUps,
  getTeamMatchUpState,
  setTeamMatchUp,
  getTieMatchUp,
} from '../../svelte/stores/teamMatchUp.svelte';
import {
  setBoltDuration,
} from '../../intennse/clockOrchestration';

export function setDev() {
  window['dev'] = {
    submitCredentials,
    get router() {
      return (window as any).appRouter;
    },
    version,
    logOut,
    app,
    env,
    engineLog,
    /** Clear all persisted team matchUps + tie→parent lookups for test resets */
    resetTeamMatchUps: () => {
      const result = resetAllTeamMatchUps();
      console.log('[dev] reset team matchUps', result);
      return result;
    },
    /** The team matchUp currently loaded into the scorecard / bolt page store */
    get teamMatchUp() {
      return getTeamMatchUpState().teamMatchUp;
    },
    /** The id of the active tieMatchUp (set when navigating into bolt scoring) */
    get activeTieMatchUpId() {
      return getTeamMatchUpState().activeTieMatchUpId;
    },
    /** The active tieMatchUp object — works on both scorecard and bolt page */
    get activeTieMatchUp() {
      const id = getTeamMatchUpState().activeTieMatchUpId;
      return id ? getTieMatchUp(id) : undefined;
    },
    /** Look up any tieMatchUp by id from the current team matchUp */
    getTieMatchUp,

    // ── E2E testing API ──

    /** Create an INTENNSE demo matchUp programmatically (bypasses UI) */
    createDemo: (config: any) => createIntennseDemoMatchUp(config),
    /** Load a team matchUp directly into the store */
    setTeamMatchUp,
    /** Get the current scoring engine reactive state */
    getScoringState: () => {
      const state = getScoringState();
      // Return a plain snapshot (not reactive getters) for page.evaluate()
      return {
        score: state.score,
        pointCount: state.pointCount,
        isComplete: state.isComplete,
        server: state.server,
        canUndo: state.canUndo,
        canRedo: state.canRedo,
        sets: state.sets,
        boltScores: state.boltScores,
        aggregateScore: state.aggregateScore,
        version: state.version,
      };
    },
    /** Get the player time state */
    getPlayerTimeState: () => {
      const state = getPlayerTimeState();
      return {
        maxCourtTimeMs: state.maxCourtTimeMs,
        version: state.version,
      };
    },
    /** Get the score version from the team matchUp store */
    getScoreVersion: () => getTeamMatchUpState().scoreVersion,
    /** Set bolt duration in milliseconds (for fast tests) */
    setBoltDuration,
    /** Get a clock snapshot by id */
    getClockSnapshot,
    /** Set remaining time on a clock (must be paused first) */
    setClockRemaining,
    /** Pause a clock by id */
    pauseClock,
    /** Resume a paused clock by id */
    resumeClock,
    /** Undo the last scoring action */
    undo: scoringUndo,
    /** Redo the last undone scoring action */
    redo: scoringRedo,
    /** Get raw engine state (bypasses Svelte $derived caching) */
    getEngineState,
    /** Copy the full teamMatchUp JSON to clipboard */
    copyTeamMatchUp: async () => {
      const matchUp = getTeamMatchUpState().teamMatchUp;
      if (!matchUp) {
        console.warn('[dev] no teamMatchUp loaded');
        return;
      }
      const json = JSON.stringify(matchUp, null, 2);
      await navigator.clipboard.writeText(json);
      console.log(`[dev] teamMatchUp ${matchUp.matchUpId} copied to clipboard (${json.length} chars)`);
    },
    /** Copy point history for the active tieMatchUp to clipboard */
    copyPointHistory: async () => {
      const { teamMatchUp, activeTieMatchUpId } = getTeamMatchUpState();
      const engineState = getEngineState();
      if (!engineState) {
        console.warn('[dev] no scoring engine state');
        return;
      }
      const payload = {
        teamMatchUpId: teamMatchUp?.matchUpId,
        tieMatchUpId: activeTieMatchUpId,
        engineState,
      };
      const json = JSON.stringify(payload, null, 2);
      await navigator.clipboard.writeText(json);
      console.log(`[dev] point history copied to clipboard (${json.length} chars)`);
    },
    /** Clear all localStorage (full state reset) */
    clearLocalStorage: () => localStorage.clear(),

    /** Print a summary of all dev object capabilities */
    help: () => {
      const sections = [
        ['State Inspection', [
          ['dev.teamMatchUp',        'The team matchUp currently loaded in the store (getter)'],
          ['dev.activeTieMatchUpId',  'ID of the active tieMatchUp (getter)'],
          ['dev.activeTieMatchUp',    'The active tieMatchUp object (getter)'],
          ['dev.getTieMatchUp(id)',   'Look up any tieMatchUp by ID from the current team matchUp'],
          ['dev.getScoringState()',   'Snapshot of scoring engine state (score, sets, boltScores, canUndo, etc.)'],
          ['dev.getEngineState()',    'Raw engine state including history.points (bypasses Svelte caching)'],
          ['dev.getPlayerTimeState()', 'Player time tracking state (maxCourtTimeMs, version)'],
          ['dev.getScoreVersion()',   'Score version counter from the team matchUp store'],
          ['dev.getClockSnapshot(id)', 'Snapshot of a clock by ID'],
        ]],
        ['Scoring Controls', [
          ['dev.undo()',              'Undo the last scoring action'],
          ['dev.redo()',              'Redo the last undone scoring action'],
        ]],
        ['Clock Controls', [
          ['dev.pauseClock(id)',      'Pause a clock by ID'],
          ['dev.resumeClock(id)',     'Resume a paused clock by ID'],
          ['dev.setClockRemaining(id, ms)', 'Set remaining time on a paused clock (milliseconds)'],
          ['dev.setBoltDuration(ms)', 'Set bolt duration in milliseconds (for fast tests)'],
        ]],
        ['Export / Clipboard', [
          ['await dev.copyTeamMatchUp()',  'Copy the full teamMatchUp JSON to clipboard'],
          ['await dev.copyPointHistory()', 'Copy engine state + point history (with matchUp IDs) to clipboard'],
        ]],
        ['E2E / Testing', [
          ['dev.createDemo(config)',  'Create an INTENNSE demo matchUp ({ team1Name, team2Name, boltMinutes, assignParticipants })'],
          ['dev.setTeamMatchUp(obj)', 'Load a team matchUp directly into the store'],
          ['dev.resetTeamMatchUps()', 'Clear all persisted team matchUps from storage'],
          ['dev.clearLocalStorage()', 'Clear all localStorage (full state reset)'],
        ]],
        ['App / Auth', [
          ['dev.version',            'App version string'],
          ['dev.app',                'App state object'],
          ['dev.env',                'Environment / runtime config'],
          ['dev.router',             'Navigo router instance'],
          ['dev.engineLog',          'Engine event logging hooks (set boolean or { onPoint, onUndo, onRedo } handler)'],
          ['dev.submitCredentials(creds)', 'Submit auth credentials'],
          ['dev.logOut()',            'Log out the current user'],
        ]],
      ];

      const maxCmd = Math.max(...sections.flatMap(([, items]) => (items as string[][]).map(([cmd]) => cmd.length)));

      console.log('\n%c  dev — epixodic developer tools  ', 'background:#1e293b;color:#38bdf8;font-weight:bold;padding:4px 8px;border-radius:4px');
      for (const [heading, items] of sections) {
        console.log(`\n%c${heading}`, 'color:#94a3b8;font-weight:bold;text-transform:uppercase;font-size:11px');
        for (const [cmd, desc] of items as string[][]) {
          console.log(`  %c${cmd.padEnd(maxCmd + 2)}%c${desc}`, 'color:#38bdf8', 'color:#e2e8f0');
        }
      }
      console.log('');
    },
  };
}

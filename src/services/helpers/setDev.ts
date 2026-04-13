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
    /** Clear all localStorage (full state reset) */
    clearLocalStorage: () => localStorage.clear(),
  };
}

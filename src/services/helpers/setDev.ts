import { submitCredentials } from '../messaging/authApi';
import { app, env, engineLog } from '../../state/env';
import { version } from '../../config/version';
import { logOut } from '../auth/loginState';
import {
  resetAllTeamMatchUps,
  getTeamMatchUpState,
  getTieMatchUp,
} from '../../svelte/stores/teamMatchUp.svelte';

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
  };
}

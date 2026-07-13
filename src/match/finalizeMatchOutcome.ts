import { submitFinalOutcomeIfReady } from './submitFinalOutcome';
import { requestLogin } from '../services/auth/loginPrompt';
import { fetchEventMatchUps, getEventDataState } from '../svelte/stores/eventData.svelte';

/**
 * Finalize a standard tournament matchUp's outcome: submit it to CFS when
 * authorized, refresh the draw so it reflects the authoritative server result,
 * and — when the match is a tournament match but there is no session — prompt
 * the scorer to log in, then retry the submit on success.
 *
 * Shared by the desktop scoring-modal close and the mobile scoring route.
 * Best-effort and never throws; live relay scores are unaffected.
 */
export async function finalizeMatchOutcome(matchUpId: string): Promise<void> {
  try {
    const result = await submitFinalOutcomeIfReady(matchUpId);

    if (result.status === 'submitted') {
      const { tournamentId, eventId } = getEventDataState();
      if (tournamentId && eventId) await fetchEventMatchUps(tournamentId, eventId);
      globalThis.dispatchEvent(new CustomEvent('matcharchive:updated'));
      return;
    }

    if (result.status === 'skipped' && result.reason === 'unauthenticated') {
      // A completed tournament match with no session — offer to log in, then
      // finalize again (which will submit + refresh) once authenticated.
      requestLogin(() => void finalizeMatchOutcome(matchUpId));
    }
  } catch (err) {
    console.warn('[finalizeMatchOutcome] failed', err);
  }
}

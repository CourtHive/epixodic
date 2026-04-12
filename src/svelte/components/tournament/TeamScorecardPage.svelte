<script lang="ts">
  import TopNav from '../nav/TopNav.svelte';
  import TeamScorecard from './TeamScorecard.svelte';
  import LoadingSpinner from '../shared/LoadingSpinner.svelte';
  import ErrorMessage from '../shared/ErrorMessage.svelte';
  import {
    getTeamMatchUpState,
    setActiveTieMatchUp,
    restoreTeamMatchUp,
  } from '../../stores/teamMatchUp.svelte';
  import { onMount } from 'svelte';
  import type { HydratedMatchUp } from '../../types';

  let { matchUpId }: { matchUpId: string } = $props();

  const teamState = getTeamMatchUpState();
  let loaded = $state(false);
  let loadError = $state<string | undefined>(undefined);

  onMount(() => {
    if (!teamState.teamMatchUp) {
      const restored = restoreTeamMatchUp(matchUpId);
      if (!restored) {
        loadError = 'Team matchUp not found. Navigate from the event page to load.';
      }
    }
    loaded = true;
  });

  function isIntennseFormat(matchUp: HydratedMatchUp): boolean {
    const format = (matchUp as any).competitionFormat;
    if (format?.sport === 'INTENNSE') return true;
    if ((matchUp.matchUpFormat || '').includes('XA-S:T')) return true;
    // Team matchUps don't carry a matchUpFormat and the server doesn't inline
    // competitionFormat onto them. Detect an INTENNSE team by checking whether
    // any of its tieMatchUps uses an INTENNSE format — this lets doubles
    // tieMatchUps (whose own matchUpFormat is a normal doubles format) still
    // route to the bolt page via the parent fallback in handleTieMatchUpClick.
    if (matchUp.tieMatchUps?.length) {
      return matchUp.tieMatchUps.some((tm) => (tm.matchUpFormat || '').includes('XA-S:T'));
    }
    return false;
  }

  function handleTieMatchUpClick(tieMatchUp: HydratedMatchUp) {
    const parentMatchUp = teamState.teamMatchUp;
    setActiveTieMatchUp(tieMatchUp.matchUpId);

    console.log('[scorecard→bolt]', {
      matchUpId: tieMatchUp.matchUpId,
      hasEngineState: !!(tieMatchUp as any).engineState,
      sets: (tieMatchUp as any).engineState?.score?.sets ?? tieMatchUp.score?.sets ?? [],
      boltStarted: (tieMatchUp as any).boltStarted,
      boltComplete: (tieMatchUp as any).boltComplete,
    });

    const router = (window as any).appRouter;
    if (isIntennseFormat(tieMatchUp) || (parentMatchUp && isIntennseFormat(parentMatchUp))) {
      router?.navigate(`/bolt/${tieMatchUp.matchUpId}`);
    } else {
      router?.navigate(`/match/${tieMatchUp.matchUpId}/scoring`);
    }
  }

  function navigateBack() {
    const router = (window as any).appRouter;
    const matchUp = teamState.teamMatchUp;
    if (matchUp?.tournamentId && matchUp?.eventId) {
      router?.navigate(`/tournament/${matchUp.tournamentId}/event/${matchUp.eventId}`);
    } else {
      window.history.back();
    }
  }
</script>

<div class="team-scorecard-page">
  <TopNav />

  <div class="scorecard-content">
    <button class="back-button" onclick={navigateBack}>
      &larr; Back to matchUps
    </button>

    {#if !loaded}
      <LoadingSpinner />
    {:else if loadError}
      <ErrorMessage message={loadError} />
    {:else if teamState.teamMatchUp}
      <TeamScorecard
        matchUp={teamState.teamMatchUp}
        scoreVersion={teamState.scoreVersion}
        onTieMatchUpClick={handleTieMatchUpClick}
      />
    {:else}
      <ErrorMessage message="No team matchUp loaded" />
    {/if}
  </div>
</div>

<style>
  .team-scorecard-page {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow-y: auto;
  }
  .scorecard-content {
    flex: 1;
    padding: 0.5rem;
  }
  .back-button {
    background: none;
    border: none;
    color: var(--chc-text-primary, #333);
    font-size: 0.9rem;
    cursor: pointer;
    padding: 0.5rem 0;
    margin-bottom: 0.5rem;
  }
  .back-button:hover {
    text-decoration: underline;
  }
</style>

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
  import { browserStorage } from '../../../state/browserStorage';
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

  function handleTieMatchUpClick(tieMatchUp: HydratedMatchUp) {
    // Save tieMatchUp for the scoring interface to load
    const matchData = {
      matchUpId: tieMatchUp.matchUpId,
      matchUpFormat: tieMatchUp.matchUpFormat || 'SET3-S:6/TB7',
      matchUpType: tieMatchUp.matchUpType,
      sides: tieMatchUp.sides,
      score: tieMatchUp.score,
      match: {
        matchUpId: tieMatchUp.matchUpId,
        tournamentId: teamState.teamMatchUp?.tournamentId,
      },
      tournament: {
        tournamentId: teamState.teamMatchUp?.tournamentId,
      },
    };
    browserStorage.set(tieMatchUp.matchUpId, JSON.stringify(matchData));

    setActiveTieMatchUp(tieMatchUp.matchUpId);

    const router = (window as any).appRouter;
    router?.navigate(`/match/${tieMatchUp.matchUpId}/scoring`);
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

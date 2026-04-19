<script lang="ts">
  import TopNav from '../nav/TopNav.svelte';
  import TeamScorecard from './TeamScorecard.svelte';
  import LoadingSpinner from '../shared/LoadingSpinner.svelte';
  import ErrorMessage from '../shared/ErrorMessage.svelte';
  import {
    getTeamMatchUpState,
    setActiveTieMatchUp,
    restoreTeamMatchUp,
    recalculateTeamScore,
    setStartingGender,
  } from '../../stores/teamMatchUp.svelte';
  import { toggleSidesSwapped, getScoringPrefs } from '../../stores/scoringPrefs.svelte';
  import { getNavigationState, setArchiveContext } from '../../stores/navigation.svelte';
  import { onMount } from 'svelte';
  import type { HydratedMatchUp, NavAction } from '../../types';

  let { matchUpId }: { matchUpId: string } = $props();

  const teamState = getTeamMatchUpState();
  let loaded = $state(false);
  let loadError = $state<string | undefined>(undefined);

  const nav = getNavigationState();

  onMount(() => {
    if (!teamState.teamMatchUp) {
      const restored = restoreTeamMatchUp(matchUpId);
      if (!restored) {
        loadError = 'Team matchUp not found. Navigate from the event page to load.';
      }
    }
    // Ensure breadcrumbs are populated (lost on page refresh)
    if (!nav.breadcrumbs.length) {
      setArchiveContext();
    }
    // Ensure aggregate score is fresh on every mount
    recalculateTeamScore();
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

    // Set starting gender on first click (no-op if already set)
    const collectionDef = (parentMatchUp as any)?.tieFormat?.collectionDefinitions?.find(
      (cd: any) => cd.collectionId === (tieMatchUp as any).collectionId,
    );
    if (collectionDef?.gender === 'MALE' || collectionDef?.gender === 'FEMALE') {
      setStartingGender(collectionDef.gender);
    }

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

  const scoringPrefs = getScoringPrefs();
  const navActions = $derived<NavAction[]>([
    { label: scoringPrefs.sidesSwapped ? '⇄ Swapped' : '⇄ Sides', action: toggleSidesSwapped },
  ]);

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
  <TopNav backAction={navigateBack} actions={navActions} />

  <div class="scorecard-content">

    {#if !loaded}
      <LoadingSpinner />
    {:else if loadError}
      <ErrorMessage message={loadError} />
    {:else if teamState.teamMatchUp}
      <TeamScorecard
        matchUp={teamState.teamMatchUp}
        scoreVersion={teamState.scoreVersion}
        swapSides={scoringPrefs.sidesSwapped}
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
</style>

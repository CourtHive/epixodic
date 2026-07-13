<script lang="ts">
  import SectionHeader from '../shared/SectionHeader.svelte';
  import MatchUpCard from '../archive/MatchUpCard.svelte';
  import { setTeamMatchUp } from '../../stores/teamMatchUp.svelte';
  import { browserStorage } from '../../../state/browserStorage';
  import { device } from '../../../state/env';
  import { openScoringModal } from '../../../scoring/scoringModal';
  import type { HydratedMatchUp } from '../../types';

  let { title, matchUps, collapsed = false }: {
    title: string;
    matchUps: HydratedMatchUp[];
    collapsed?: boolean;
  } = $props();

  function saveMatchData(matchUp: HydratedMatchUp) {
    const matchData = {
      matchUpId: matchUp.matchUpId,
      matchUpFormat: matchUp.matchUpFormat || 'SET3-S:6/TB7',
      sides: matchUp.sides,
      score: matchUp.score,
      // drawId is required for the authorized CFS final-outcome submit
      // (POST /factory/score); carry it through the local round-trip.
      drawId: matchUp.drawId,
      match: {
        matchUpId: matchUp.matchUpId,
        tournamentId: matchUp.tournamentId,
        drawId: matchUp.drawId,
      },
      tournament: {
        tournamentId: matchUp.tournamentId,
      },
    };
    browserStorage.set(matchUp.matchUpId, JSON.stringify(matchData));
  }

  function openMatchUp(matchUp: HydratedMatchUp) {
    if (matchUp.matchUpType === 'TEAM' && matchUp.tieMatchUps?.length) {
      setTeamMatchUp(matchUp);
      const router = (window as any).appRouter;
      router?.navigate(`/team/${matchUp.matchUpId}`);
      return;
    }

    saveMatchData(matchUp);

    if (device.isMobile) {
      const router = (window as any).appRouter;
      router?.navigate(`/match/${matchUp.matchUpId}/scoring`);
    } else {
      openScoringModal(matchUp.matchUpId);
    }
  }
</script>

{#if matchUps.length > 0}
  <SectionHeader {title} count={matchUps.length} {collapsed}>
    {#each matchUps as matchUp (matchUp.matchUpId)}
      <MatchUpCard {matchUp} onclick={() => openMatchUp(matchUp)} />
    {/each}
  </SectionHeader>
{/if}

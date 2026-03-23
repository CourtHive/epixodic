<script lang="ts">
  import SectionHeader from '../shared/SectionHeader.svelte';
  import MatchUpCard from '../archive/MatchUpCard.svelte';
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
      match: {
        matchUpId: matchUp.matchUpId,
        tournamentId: matchUp.tournamentId,
      },
      tournament: {
        tournamentId: matchUp.tournamentId,
      },
    };
    browserStorage.set(matchUp.matchUpId, JSON.stringify(matchData));
  }

  function openMatchUp(matchUp: HydratedMatchUp) {
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

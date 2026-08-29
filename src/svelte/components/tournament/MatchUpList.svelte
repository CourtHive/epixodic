<script lang="ts">
  import SectionHeader from '../shared/SectionHeader.svelte';
  import MatchUpCard from '../archive/MatchUpCard.svelte';
  import { setTeamMatchUp } from '../../stores/teamMatchUp.svelte';
  import { browserStorage } from '../../../state/browserStorage';
  import { device } from '../../../state/env';
  import { openScoringModal } from '../../../scoring/scoringModal';
  import { showToast } from '../../stores/toast.svelte';
  import { buildMatchData } from '../../services/stageMatchUp';
  import type { HydratedMatchUp } from '../../types';

  let { title, matchUps, collapsed = false }: {
    title: string;
    matchUps: HydratedMatchUp[];
    collapsed?: boolean;
  } = $props();

  function saveMatchData(matchUp: HydratedMatchUp): boolean {
    const staged = buildMatchData(matchUp);
    if (!staged.ok) {
      console.error(`[MatchUpList] refusing to score ${matchUp.matchUpId} — ${staged.reason}.`);
      showToast('This match cannot be scored: its scoring format is missing.', 'error');
      return false;
    }
    browserStorage.set(matchUp.matchUpId, JSON.stringify(staged.matchData));
    return true;
  }

  function openMatchUp(matchUp: HydratedMatchUp) {
    if (matchUp.matchUpType === 'TEAM' && matchUp.tieMatchUps?.length) {
      setTeamMatchUp(matchUp);
      const router = (window as any).appRouter;
      router?.navigate(`/team/${matchUp.matchUpId}`);
      return;
    }

    if (!saveMatchData(matchUp)) return;

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

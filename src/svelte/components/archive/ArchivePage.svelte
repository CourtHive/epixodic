<script lang="ts">
  import TopNav from '../nav/TopNav.svelte';
  import BottomNav from '../nav/BottomNav.svelte';
  import Toast from '../shared/Toast.svelte';
  import MyMatchUps from './MyMatchUps.svelte';
  import TournamentList from './TournamentList.svelte';
  import IntennseConfigModal from './IntennseConfigModal.svelte';
  import { createIntennseDemoMatchUp } from '../../../fixtures/intennseDemo';
  import { setArchiveContext } from '../../stores/navigation.svelte';
  import { refreshLocalMatchUps } from '../../stores/localMatchUps.svelte';
  import { setTeamMatchUp } from '../../stores/teamMatchUp.svelte';
  import { newMatch } from '../../../match/displayMatchArchive';
  import { browserStorage } from '../../../state/browserStorage';
  import { onMount } from 'svelte';
  import type { NavAction } from '../../types';

  let activeTab = $state<'my' | 'tournaments'>('my');
  let showIntennseConfig = $state(false);

  function createIntennseDemo(config: { team1Name: string; team2Name: string; boltMinutes: number; assignParticipants: boolean }) {
    showIntennseConfig = false;
    const matchUp = createIntennseDemoMatchUp({
      team1Name: config.team1Name,
      team2Name: config.team2Name,
      boltDurationMinutes: config.boltMinutes,
      assignParticipants: config.assignParticipants,
    });
    setTeamMatchUp(matchUp as any);

    const archiveKey = `team-${matchUp.matchUpId}`;
    const archive: string[] = JSON.parse(browserStorage.get('match_archive') || '[]');
    if (!archive.includes(archiveKey)) {
      archive.push(archiveKey);
      browserStorage.set('match_archive', JSON.stringify(archive));
    }
    refreshLocalMatchUps();

    const router = (globalThis as any).appRouter;
    router?.navigate(`/team/${matchUp.matchUpId}`);
  }

  const bottomActions: NavAction[] = [
    { label: '+ New Match', action: () => newMatch() },
    { label: '+ INTENNSE Demo', action: () => { showIntennseConfig = true; } },
  ];

  onMount(() => {
    setArchiveContext();
    refreshLocalMatchUps();
  });
</script>

<div class="archive-page">
  <TopNav />

  <div class="tab-bar">
    <button
      class="tab"
      class:active={activeTab === 'my'}
      onclick={() => (activeTab = 'my')}
    >
      My MatchUps
    </button>
    <button
      class="tab"
      class:active={activeTab === 'tournaments'}
      onclick={() => (activeTab = 'tournaments')}
    >
      Tournaments
    </button>
  </div>

  <div class="archive-content">
    {#if activeTab === 'my'}
      <MyMatchUps />
    {:else}
      <TournamentList />
    {/if}
  </div>

  <BottomNav actions={bottomActions} />
  <Toast />

  {#if showIntennseConfig}
    <IntennseConfigModal
      onConfirm={createIntennseDemo}
      onClose={() => { showIntennseConfig = false; }}
    />
  {/if}
</div>

<style>
  .archive-page {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--ep-page-bg);
    color: var(--ep-page-text);
  }
  .tab-bar {
    display: flex;
    border-bottom: 1px solid var(--ep-page-border);
    flex-shrink: 0;
  }
  .tab {
    flex: 1;
    padding: 0.75rem;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--ep-page-text-muted);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
  }
  .tab:hover {
    color: var(--ep-page-text-hover);
  }
  .tab.active {
    color: var(--ep-accent);
    border-bottom-color: var(--ep-accent);
  }
  .archive-content {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }
</style>

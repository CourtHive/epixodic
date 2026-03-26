<script lang="ts">
  import TournamentCard from './TournamentCard.svelte';
  import LoadingSpinner from '../shared/LoadingSpinner.svelte';
  import EmptyState from '../shared/EmptyState.svelte';
  import { getTournamentsState, fetchTournamentInfo, refreshTournamentInfo, removeTournament, loadSavedTournaments } from '../../stores/tournaments.svelte';
  import { showToast } from '../../stores/toast.svelte';
  import { onMount } from 'svelte';

  const tournaments = getTournamentsState();

  let inputValue = $state('');

  onMount(() => {
    loadSavedTournaments();
  });

  async function handleLoad() {
    const tid = inputValue.trim();
    if (!tid) return;
    const result = await fetchTournamentInfo(tid);
    if (result) {
      inputValue = '';
    } else if (tournaments.error) {
      showToast(tournaments.error, 'error');
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') handleLoad();
  }

  function navigateToTournament(tournamentId: string) {
    const router = (window as any).appRouter;
    router?.navigate(`/tournament/${tournamentId}`);
  }
</script>

<div class="tournament-input-row">
  <input
    type="text"
    id="tournament-id-input"
    name="tournamentId"
    class="tournament-input"
    placeholder="Enter tournament ID"
    aria-label="Tournament ID"
    bind:value={inputValue}
    onkeydown={handleKeydown}
  />
  <button class="load-btn" onclick={handleLoad} disabled={!inputValue.trim()}>
    Load
  </button>
</div>

{#if tournaments.loading}
  <LoadingSpinner />
{/if}

{#if tournaments.list.length === 0 && !tournaments.loading}
  <EmptyState message="No tournaments loaded. Enter a tournament ID above." />
{:else}
  <div class="tournament-list">
    {#each tournaments.list.filter(t => t.tournamentId) as tournament (tournament.tournamentId)}
      <TournamentCard
        {tournament}
        onclick={() => navigateToTournament(tournament.tournamentId)}
        onrefresh={() => refreshTournamentInfo(tournament.tournamentId)}
        onremove={() => removeTournament(tournament.tournamentId)}
      />
    {/each}
  </div>
{/if}

<style>
  .tournament-input-row {
    display: flex;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }
  .tournament-input {
    flex: 1;
    padding: 0.5rem 0.75rem;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    color: #fff;
    font-size: 0.875rem;
    outline: none;
  }
  .tournament-input::placeholder {
    color: rgba(255, 255, 255, 0.35);
  }
  .tournament-input:focus {
    border-color: rgba(74, 158, 255, 0.5);
  }
  .load-btn {
    padding: 0.5rem 1rem;
    background: rgba(74, 158, 255, 0.2);
    border: 1px solid rgba(74, 158, 255, 0.4);
    border-radius: 6px;
    color: #4a9eff;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
  }
  .load-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .load-btn:not(:disabled):hover {
    background: rgba(74, 158, 255, 0.3);
  }
  .tournament-list {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }
</style>

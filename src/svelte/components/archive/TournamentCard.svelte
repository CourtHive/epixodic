<script lang="ts">
  import type { TournamentInfo } from '../../types';

  let { tournament, onclick, onrefresh, onremove }: {
    tournament: TournamentInfo;
    onclick?: () => void;
    onrefresh?: () => void;
    onremove?: () => void;
  } = $props();

  function formatDateRange(start?: string, end?: string): string {
    if (!start) return '';
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
    const s = new Date(start).toLocaleDateString(undefined, opts);
    if (!end || start === end) return s;
    const e = new Date(end).toLocaleDateString(undefined, opts);
    return `${s} - ${e}`;
  }

  function handleRefresh(e: MouseEvent) {
    e.stopPropagation();
    onrefresh?.();
  }

  function handleRemove(e: MouseEvent) {
    e.stopPropagation();
    onremove?.();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="tournament-card" onclick={onclick} onkeydown={(e) => e.key === 'Enter' && onclick?.()}>
  <div class="tournament-info">
    <span class="tournament-name">{tournament.tournamentName || tournament.tournamentId}</span>
    {#if tournament.startDate}
      <span class="tournament-dates">{formatDateRange(tournament.startDate, tournament.endDate)}</span>
    {/if}
  </div>
  <div class="tournament-meta">
    {#if tournament.eventInfo?.length}
      <span class="event-count">{tournament.eventInfo.length} event{tournament.eventInfo.length !== 1 ? 's' : ''}</span>
    {/if}
    <button class="icon-btn" onclick={handleRefresh} title="Refresh">&#x21bb;</button>
    <button class="icon-btn icon-btn--danger" onclick={handleRemove} title="Remove">&#x2715;</button>
    <span class="chevron">&#8250;</span>
  </div>
</div>

<style>
  .tournament-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0.875rem 1rem;
    background: var(--ep-page-surface);
    border-bottom: 1px solid var(--ep-page-surface-border);
    color: var(--ep-page-text);
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }
  .tournament-card:hover {
    background: var(--ep-page-surface-hover);
  }
  .tournament-info {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
  }
  .tournament-name {
    font-size: 0.925rem;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tournament-dates {
    font-size: 0.8rem;
    color: var(--ep-page-text-muted);
  }
  .tournament-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }
  .event-count {
    font-size: 0.8rem;
    color: var(--ep-page-text-dim);
  }
  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--ep-page-text-muted);
    font-size: 0.875rem;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  .icon-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--ep-page-text);
  }
  .icon-btn--danger:hover {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
  }
  .chevron {
    font-size: 1.25rem;
    color: var(--ep-page-text-subtle);
  }
</style>

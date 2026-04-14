<script lang="ts">
  import { formatTime } from '../../../clock/formatTime';
  import { getPlayerTimeState, getRemainingMs } from '../../stores/playerTime.svelte';

  let { sideRoster = {}, activeSide }: {
    sideRoster: Record<string, 1 | 2>;
    activeSide?: 1 | 2;
  } = $props();

  const playerTime = getPlayerTimeState();

  interface PlayerRow {
    participantId: string;
    participantName: string;
    jerseyNumber?: string;
    remainingMs: number;
    isOnCourt: boolean;
  }

  const side1Players = $derived.by(() => {
    void playerTime.version;
    return buildSidePlayers(1);
  });

  const side2Players = $derived.by(() => {
    void playerTime.version;
    return buildSidePlayers(2);
  });

  function buildSidePlayers(side: 1 | 2): PlayerRow[] {
    const rows: PlayerRow[] = [];
    for (const [id, entry] of Object.entries(playerTime.players)) {
      if (sideRoster[id] !== side) continue;
      rows.push({
        participantId: id,
        participantName: entry.participantName,
        jerseyNumber: entry.jerseyNumber,
        remainingMs: getRemainingMs(id),
        isOnCourt: entry.isOnCourt,
      });
    }
    rows.sort((a, b) => a.remainingMs - b.remainingMs);
    return rows;
  }

  function urgencyClass(remaining: number): string {
    if (remaining <= 0) return 'pti-exhausted';
    if (remaining <= 60_000) return 'pti-critical';
    if (remaining <= 120_000) return 'pti-warning';
    return '';
  }

  const showSide1 = $derived(!activeSide || activeSide === 1);
  const showSide2 = $derived(!activeSide || activeSide === 2);
</script>

<div class="pti-panel">
  {#if showSide1}
    <div class="pti-col">
      {#each side1Players as player (player.participantId)}
        <div class="pti-row {urgencyClass(player.remainingMs)}">
          <span class="pti-court-indicator" class:pti-on-court={player.isOnCourt}></span>
          {#if player.jerseyNumber}
            <span class="pti-jersey">{player.jerseyNumber}</span>
          {/if}
          <span class="pti-name">{player.participantName}</span>
          <span class="pti-time">{formatTime(player.remainingMs)}</span>
        </div>
      {/each}
    </div>
  {/if}
  {#if showSide1 && showSide2}
    <div class="pti-divider"></div>
  {/if}
  {#if showSide2}
    <div class="pti-col">
      {#each side2Players as player (player.participantId)}
        <div class="pti-row {urgencyClass(player.remainingMs)}">
          <span class="pti-court-indicator" class:pti-on-court={player.isOnCourt}></span>
          {#if player.jerseyNumber}
            <span class="pti-jersey">{player.jerseyNumber}</span>
          {/if}
          <span class="pti-name">{player.participantName}</span>
          <span class="pti-time">{formatTime(player.remainingMs)}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .pti-panel {
    display: flex;
    gap: 0.5rem;
    padding: 0.5rem;
    background: var(--intennse-surface, #16213e);
    border: 1px solid var(--intennse-accent, #0f3460);
    border-radius: 8px;
    font-size: 0.75rem;
    width: 100%;
  }

  .pti-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .pti-divider {
    width: 1px;
    background: var(--intennse-accent, #0f3460);
  }

  .pti-row {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.2rem 0.3rem;
    border-radius: 4px;
  }

  .pti-court-indicator {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    border: 1px solid var(--intennse-text-muted, #8892b0);
    flex-shrink: 0;
  }

  .pti-on-court {
    background: var(--intennse-serving, #00d4aa);
    border-color: var(--intennse-serving, #00d4aa);
  }

  .pti-jersey {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.4rem;
    height: 1.4rem;
    border-radius: 3px;
    background: var(--intennse-serving, #00d4aa);
    color: var(--intennse-surface, #16213e);
    font-weight: 800;
    font-size: 0.65rem;
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }

  .pti-name {
    flex: 1;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pti-time {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    white-space: nowrap;
  }

  .pti-warning { color: var(--intennse-urgent, #ff9800); }
  .pti-warning .pti-time { color: var(--intennse-urgent, #ff9800); }

  .pti-critical { color: var(--intennse-critical, #ef5350); }
  .pti-critical .pti-time { color: var(--intennse-critical, #ef5350); }

  .pti-exhausted { color: var(--intennse-expired, #b71c1c); }
  .pti-exhausted .pti-time {
    color: var(--intennse-expired, #b71c1c);
    animation: pti-pulse 1s infinite;
  }

  @keyframes pti-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
</style>

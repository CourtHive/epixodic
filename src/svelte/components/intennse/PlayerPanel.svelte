<script lang="ts">
  import { formatTime } from '../../../clock/formatTime';

  export type PlayerSlot = {
    participantId: string;
    participantName: string;
    lastName: string;
    jerseyNumber?: string;
    courtTimeRemainingMs: number;
    isOnCourt: boolean;
    isServer: boolean;
  };

  let {
    players = [],
    teamName = '',
    isServingTeam = false,
    serveSide = 'DEUCE',
    side,
    onSelect,
  }: {
    players: PlayerSlot[];
    teamName?: string;
    isServingTeam?: boolean;
    serveSide?: string;
    side: 1 | 2;
    onSelect?: () => void;
  } = $props();

  function timeClass(ms: number): string {
    if (ms <= 0) return 'player-time--exhausted';
    if (ms <= 60_000) return 'player-time--critical';
    if (ms <= 120_000) return 'player-time--warning';
    return '';
  }
</script>

<div
  class="intennse-player-panel intennse-player-panel--side{side}"
  class:intennse-player-panel--serving={isServingTeam}
  class:intennse-player-panel--solo={players.length === 1}
  class:intennse-player-panel--pair={players.length === 2}
  class:intennse-player-panel--empty={players.length === 0}
>
  {#if teamName}
    <div class="intennse-team-name">{teamName}</div>
  {/if}

  {#if players.length === 0}
    <button class="intennse-player-empty" onclick={() => onSelect?.()}>
      Tap to select {side === 1 ? 'side 1' : 'side 2'} players
    </button>
  {:else}
    <div class="intennse-player-row">
      {#each players as player (player.participantId)}
        <button
          class="intennse-player-slot"
          class:intennse-player-slot--server={player.isServer && players.length > 1}
          onclick={() => onSelect?.()}
          title={player.participantName}
        >
          <span class="intennse-player-name intennse-player-name--full">{player.participantName}</span>
          <span class="intennse-player-name intennse-player-name--short">{player.lastName}</span>
          <span class="intennse-player-timer-row">
            {#if player.jerseyNumber}<span class="intennse-player-jersey">{player.jerseyNumber}</span>{/if}
            <span class="intennse-player-time {timeClass(player.courtTimeRemainingMs)}">
              {#if player.courtTimeRemainingMs <= 0}
                TIME
              {:else}
                {formatTime(player.courtTimeRemainingMs)}
              {/if}
            </span>
          </span>
        </button>
      {/each}
    </div>
  {/if}

  <div class="intennse-serve-indicator" style:visibility={isServingTeam ? 'visible' : 'hidden'}>
    {serveSide === 'AD' ? 'AD' : 'DEUCE'}
  </div>
</div>

<style>
  .intennse-player-row {
    display: flex;
    align-items: stretch;
    justify-content: center;
    gap: 0.5rem;
    width: 100%;
  }

  .intennse-player-slot {
    flex: 1 1 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    padding: 0.3rem 0.4rem;
    background: transparent;
    border: 2px solid transparent;
    border-radius: 6px;
    color: inherit;
    cursor: pointer;
    min-width: 0; /* allow ellipsis */
  }

  .intennse-player-slot:active {
    opacity: 0.8;
  }

  .intennse-player-slot--server {
    border-color: var(--intennse-serving, #00d4aa);
    box-shadow: 0 0 6px rgba(0, 212, 170, 0.6);
  }

  /* Solo (singles) renders centered using the existing column layout */
  .intennse-player-panel--solo .intennse-player-row {
    justify-content: center;
  }
  .intennse-player-panel--solo .intennse-player-slot {
    flex: 0 1 auto;
  }

  /* Two-name (doubles) — adjacent on tablet, last names on small screens */
  .intennse-player-name--short {
    display: none;
  }

  /* Mobile / narrow viewports: collapse to last names so the pair fits */
  @media (max-width: 600px) {
    .intennse-player-panel--pair .intennse-player-name--full {
      display: none;
    }
    .intennse-player-panel--pair .intennse-player-name--short {
      display: inline;
    }
    .intennse-player-row {
      gap: 0.3rem;
    }
  }

  .intennse-player-timer-row {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .intennse-player-jersey {
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

  .intennse-player-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: 0.5rem;
    margin-top: 0.2rem;
    border: 1px dashed var(--intennse-text-muted, #8892b0);
    border-radius: 6px;
    background: transparent;
    color: var(--intennse-text-muted, #8892b0);
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .intennse-player-empty:active {
    opacity: 0.7;
  }
</style>

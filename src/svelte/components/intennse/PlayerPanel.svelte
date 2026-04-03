<script lang="ts">
  import { formatTime } from '../../../clock/formatTime';

  let { playerName = '', teamName = '', courtTimeRemainingMs = 0, isServing = false, side = 1 }: {
    playerName: string;
    teamName?: string;
    courtTimeRemainingMs?: number;
    isServing?: boolean;
    side: 1 | 2;
  } = $props();

  const timeDisplay = $derived(formatTime(courtTimeRemainingMs));
  const timeClass = $derived(
    courtTimeRemainingMs <= 0 ? 'player-time--exhausted'
    : courtTimeRemainingMs <= 60000 ? 'player-time--critical'
    : courtTimeRemainingMs <= 120000 ? 'player-time--warning'
    : '',
  );
</script>

<div class="intennse-player-panel intennse-player-panel--side{side}" class:intennse-player-panel--serving={isServing}>
  {#if teamName}
    <div class="intennse-team-name">{teamName}</div>
  {/if}
  <div class="intennse-player-name">{playerName}</div>
  <div class="intennse-player-time {timeClass}">
    {#if courtTimeRemainingMs <= 0}
      TIME
    {:else}
      {timeDisplay}
    {/if}
  </div>
  {#if isServing}
    <div class="intennse-serve-indicator">●</div>
  {/if}
</div>

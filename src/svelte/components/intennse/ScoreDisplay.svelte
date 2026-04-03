<script lang="ts">
  let { side1Score = 0, side2Score = 0, side1Name = '', side2Name = '', server = 0, statusMessage = '' }: {
    side1Score: number;
    side2Score: number;
    side1Name?: string;
    side2Name?: string;
    server: number;
    statusMessage?: string;
  } = $props();
</script>

<div class="intennse-score-display">
  <div class="intennse-score-side" class:intennse-score-side--serving={server === 0}>
    <span class="intennse-score-name">{side1Name}</span>
    <span class="intennse-score-value">{side1Score}</span>
  </div>
  <div class="intennse-score-divider">—</div>
  <div class="intennse-score-side" class:intennse-score-side--serving={server === 1}>
    <span class="intennse-score-value">{side2Score}</span>
    <span class="intennse-score-name">{side2Name}</span>
  </div>
  {#if statusMessage}
    <div class="intennse-status-message">{statusMessage}</div>
  {/if}
</div>

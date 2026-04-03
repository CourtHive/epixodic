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
  </div>

  <div class="intennse-score-row">
    <span class="intennse-score-value" class:intennse-score-value--serving={server === 0}>{side1Score}</span>
    <span class="intennse-score-divider">—</span>
    <span class="intennse-score-value" class:intennse-score-value--serving={server === 1}>{side2Score}</span>
  </div>

  <div class="intennse-score-side" class:intennse-score-side--serving={server === 1}>
    <span class="intennse-score-name">{side2Name}</span>
  </div>

  {#if statusMessage}
    <div class="intennse-status-message">{statusMessage}</div>
  {/if}
</div>

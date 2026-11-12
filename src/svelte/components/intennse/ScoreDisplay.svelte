<script lang="ts">
  import { teamRoleStyles, type TeamDisplayColors } from 'courthive-components/team-colors';
  let { side1Score = 0, side2Score = 0, side1Name = '', side2Name = '', server = 0, statusMessage = '', side1Colors, side2Colors }: {
    side1Colors?: TeamDisplayColors;
    side2Colors?: TeamDisplayColors;
    side1Score: number;
    side2Score: number;
    side1Name?: string;
    side2Name?: string;
    server: number;
    statusMessage?: string;
  } = $props();
</script>

<div class="intennse-score-display">
  {#if side1Name}
    <div class="intennse-score-side" class:intennse-score-side--serving={server === 0}>
      <span class="intennse-score-name">{side1Name}</span>
    </div>
  {/if}

  <div class="intennse-score-row">
    <span class="intennse-score-value" class:intennse-score-value--serving={server === 0} style={teamRoleStyles(side1Colors, { background: '#111827', text: '#FFFFFF' }, 'score')}>{side1Score}</span>
    <span class="intennse-score-divider">—</span>
    <span class="intennse-score-value" class:intennse-score-value--serving={server === 1} style={teamRoleStyles(side2Colors, { background: '#111827', text: '#FFFFFF' }, 'score')}>{side2Score}</span>
  </div>

  {#if side2Name}
    <div class="intennse-score-side" class:intennse-score-side--serving={server === 1}>
      <span class="intennse-score-name">{side2Name}</span>
    </div>
  {/if}

  {#if statusMessage}
    <div class="intennse-status-message">{statusMessage}</div>
  {/if}
</div>

<script lang="ts">
  import { buildHistoryStream, type PointHistoryEntry } from './historyStream';

  /**
   * Displays the scoring engine's history.points stream, most recent
   * first. Phase 2 of the penalty-history-derivation workstream —
   * Phase 3 will wire `onEntryTap` to a detail modal with edit /
   * remove actions.
   */
  let {
    points = [],
    side1Name = '',
    side2Name = '',
    maxRows,
    onEntryTap,
    emptyLabel = 'No points yet',
  }: {
    points?: any[];
    side1Name?: string;
    side2Name?: string;
    /** Cap rows displayed in the scroll area (viewer virtualises via DOM overflow). */
    maxRows?: number;
    onEntryTap?: (entry: PointHistoryEntry) => void;
    emptyLabel?: string;
  } = $props();

  const rows = $derived.by<PointHistoryEntry[]>(() => {
    const stream = buildHistoryStream(points, { side1Name, side2Name });
    return maxRows ? stream.slice(0, maxRows) : stream;
  });
</script>

<div class="phs" role="log" aria-label="Point history" aria-live="polite">
  {#if rows.length === 0}
    <div class="phs-empty">{emptyLabel}</div>
  {:else}
    <ol class="phs-list">
      {#each rows as entry (entry.pointIndex)}
        <li class="phs-row phs-row--side{entry.winningSide} phs-row--{entry.kind}">
          <button
            class="phs-row-btn"
            class:phs-row-btn--edited={entry.editReason}
            type="button"
            disabled={!onEntryTap}
            onclick={() => onEntryTap?.(entry)}
            title={entry.rawResult || ''}
          >
            {#if entry.timeLabel}
              <span class="phs-time">{entry.timeLabel}</span>
            {/if}
            <span class="phs-glyph" aria-label={entry.rawResult || entry.kind}>
              {entry.glyph}
            </span>
            <span class="phs-side">{entry.sideLabel}</span>
            {#if entry.scoreValue > 1}
              <span class="phs-score">+{entry.scoreValue}</span>
            {/if}
            {#if entry.kind === 'penalty' && entry.penaltyAgainstParticipantName}
              <span class="phs-against">vs {entry.penaltyAgainstParticipantName}</span>
            {/if}
            {#if entry.rallyLength !== undefined}
              <span class="phs-rally">R{entry.rallyLength}</span>
            {/if}
            {#if entry.wonOnServe && (entry.kind === 'winner' || entry.kind === 'ace')}
              <span class="phs-serve" title="Won on serve">↑</span>
            {/if}
            {#if entry.editReason === 'scorekeepingError'}
              <span
                class="phs-edit-badge phs-edit-badge--scorekeeping"
                title="Edited — scorekeeping error, serve order recalculated"
              >✎</span>
            {:else if entry.editReason === 'reviewCorrection'}
              <span
                class="phs-edit-badge phs-edit-badge--review"
                title="Post-review correction — serve order retained as played"
              >⚖</span>
            {/if}
          </button>
        </li>
      {/each}
    </ol>
  {/if}
</div>

<style>
  .phs {
    display: flex;
    flex-direction: column;
    min-height: 0;
    width: 100%;
    font-size: 0.7rem;
    color: var(--intennse-text, #e0e0e0);
    background: var(--intennse-surface, #16213e);
    border: 1px solid var(--intennse-accent, #0f3460);
    border-radius: 6px;
    overflow: hidden;
  }
  .phs-empty {
    padding: 0.75rem;
    color: var(--intennse-text-muted, #8892b0);
    text-align: center;
    font-style: italic;
  }
  .phs-list {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    max-height: 100%;
  }
  .phs-row {
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }
  .phs-row:last-child { border-bottom: none; }

  .phs-row-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.3rem 0.6rem;
    background: transparent;
    border: none;
    border-left: 3px solid transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
    text-align: left;
    touch-action: manipulation;
  }
  .phs-row-btn:disabled {
    cursor: default;
  }
  .phs-row-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.04);
  }
  .phs-row-btn:active:not(:disabled) { opacity: 0.7; }

  /* Side tint on the left edge */
  .phs-row--side1 .phs-row-btn { border-left-color: var(--intennse-touch, #4fc3f7); }
  .phs-row--side2 .phs-row-btn { border-left-color: var(--intennse-winner, #00d4aa); }

  .phs-time {
    font-variant-numeric: tabular-nums;
    color: var(--intennse-text-muted, #8892b0);
    font-size: 0.65rem;
    min-width: 3ch;
  }
  .phs-glyph {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.6rem;
    height: 1.3rem;
    padding: 0 0.3rem;
    border-radius: 3px;
    background: var(--intennse-accent, #0f3460);
    color: var(--intennse-text, #e0e0e0);
    font-weight: 700;
    font-size: 0.65rem;
  }
  .phs-row--winner .phs-glyph { background: var(--intennse-winner, #00d4aa); color: #000; }
  .phs-row--touch  .phs-glyph { background: var(--intennse-touch,  #4fc3f7); color: #000; }
  .phs-row--ace    .phs-glyph { background: var(--intennse-ace,    #ffd740); color: #000; }
  .phs-row--fault  .phs-glyph { background: var(--intennse-fault,  #ff9800); color: #000; }
  .phs-row--forcedError   .phs-glyph { background: var(--intennse-error, #ef5350); color: #fff; }
  .phs-row--unforcedError .phs-glyph { background: #c62828; color: #fff; }
  .phs-row--penalty       .phs-glyph { background: var(--intennse-urgent, #ff9800); color: #000; }
  .phs-row--adjustment    .phs-glyph {
    background: transparent;
    border: 1px dashed var(--intennse-text-muted, #8892b0);
    color: var(--intennse-text-muted, #8892b0);
  }

  .phs-side {
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-weight: 600;
  }
  .phs-score {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--intennse-urgent, #ff9800);
  }
  .phs-against {
    color: var(--intennse-text-muted, #8892b0);
    font-size: 0.6rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .phs-rally {
    font-variant-numeric: tabular-nums;
    color: var(--intennse-text-muted, #8892b0);
    font-size: 0.6rem;
  }
  .phs-serve {
    color: var(--intennse-serving, #00d4aa);
    font-size: 0.75rem;
  }

  /* Edit badge — small glyph next to the row indicating the point has
   * been corrected after the fact. Hover / long-press reveals the
   * scenario via the `title` attribute. */
  .phs-edit-badge {
    font-size: 0.7rem;
    line-height: 1;
    padding: 0.1rem 0.25rem;
    border-radius: 3px;
    font-weight: 700;
  }
  .phs-edit-badge--scorekeeping {
    background: var(--intennse-text-muted, #8892b0);
    color: var(--intennse-surface, #16213e);
  }
  .phs-edit-badge--review {
    background: var(--intennse-urgent, #ff9800);
    color: #000;
  }
  /* Subtle row tint so the edit is scannable without reading the badge. */
  .phs-row-btn--edited { background: rgba(255, 152, 0, 0.04); }
</style>

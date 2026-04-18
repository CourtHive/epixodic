<script lang="ts">
  import { tick } from 'svelte';
  import { buildHistoryStream, type PointHistoryEntry } from './historyStream';

  /**
   * Displays the scoring engine's history in chronological order
   * (oldest at top, latest at bottom). Auto-scrolls to the bottom
   * whenever new entries appear so the most recent event is always
   * visible. The user can scroll up to review older events.
   */
  let {
    points = [],
    entries,
    side1Name = '',
    side2Name = '',
    maxRows,
    onEntryTap,
    emptyLabel = 'No points yet',
  }: {
    points?: any[];
    /** Engine `history.entries` — when provided, substitution and
     *  bolt-boundary events are interleaved into the stream. */
    entries?: any[];
    side1Name?: string;
    side2Name?: string;
    /** Cap rows displayed in the scroll area. */
    maxRows?: number;
    onEntryTap?: (entry: PointHistoryEntry) => void;
    emptyLabel?: string;
  } = $props();

  const rows = $derived.by<PointHistoryEntry[]>(() => {
    const stream = buildHistoryStream(points, { side1Name, side2Name, entries });
    return maxRows ? stream.slice(0, maxRows) : stream;
  });

  /** Ref to the scrollable list — used for auto-scroll-to-bottom. */
  let listEl: HTMLOListElement | undefined = $state();

  // Auto-scroll to the bottom whenever the row count changes.
  $effect(() => {
    void rows.length;
    tick().then(() => {
      if (listEl) listEl.scrollTop = listEl.scrollHeight;
    });
  });
</script>

<div class="phs" role="log" aria-label="Point history" aria-live="polite">
  {#if rows.length === 0}
    <div class="phs-empty">{emptyLabel}</div>
  {:else}
    <ol class="phs-list" bind:this={listEl}>
      {#each rows as entry, idx (`${entry.entryType}-${entry.pointIndex}-${idx}`)}
        {#if entry.entryType === 'boltBoundary'}
          <li class="phs-row phs-row--boundary">
            <div class="phs-boundary">
              {#if entry.timeLabel}<span class="phs-time">{entry.timeLabel}</span>{/if}
              <span class="phs-boundary-label">{entry.boundaryLabel ?? 'Bolt ended'}</span>
            </div>
          </li>
        {:else if entry.entryType === 'substitution'}
          <li class="phs-row phs-row--substitution">
            <div class="phs-sub-row">
              {#if entry.timeLabel}<span class="phs-time">{entry.timeLabel}</span>{/if}
              <span class="phs-glyph phs-glyph--sub">↔</span>
              <span class="phs-sub-detail">
                {entry.subOutName ?? '?'} → {entry.subInName ?? '?'}
              </span>
            </div>
          </li>
        {:else}
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
        {/if}
      {/each}
    </ol>
  {/if}
</div>

<style>
  .phs {
    display: flex;
    flex-direction: column;
    /* Fill the parent slot (intennse-h-center-history or iv-history-drawer)
     * so the scroll area uses all available vertical space. */
    flex: 1 1 0;
    min-height: 0;
    height: 100%;
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
    flex: 1 1 0;
    min-height: 0;
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

  /* ── Bolt boundary divider ─────────────────────────────── */
  .phs-row--boundary {
    border-bottom: none;
  }
  .phs-boundary {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.6rem;
    color: var(--intennse-text-muted, #8892b0);
    font-size: 0.6rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }
  .phs-boundary::before,
  .phs-boundary::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--intennse-accent, #0f3460);
  }
  .phs-boundary-label { white-space: nowrap; }

  /* ── Substitution row ────────────────────────────────── */
  .phs-row--substitution {
    border-bottom-color: rgba(255, 255, 255, 0.02);
  }
  .phs-sub-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.6rem;
    font-size: 0.65rem;
    color: var(--intennse-touch, #4fc3f7);
  }
  .phs-glyph--sub {
    background: var(--intennse-touch, #4fc3f7) !important;
    color: #000 !important;
  }
  .phs-sub-detail {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
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

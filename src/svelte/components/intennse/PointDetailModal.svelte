<script lang="ts">
  import type { PointHistoryEntry } from './historyStream';
  import { formatTimeLabel, oppositeWinningSide, parseRallyLengthInput } from './historyStream';

  /**
   * Detail view for a single `PointHistoryEntry`. Phase 3 of the
   * penalty-history-derivation workstream — non-LIFO corrections for
   * points already written to history.points.
   *
   * Two actions:
   *   - Remove: deletes the point entirely (with a confirmation step).
   *   - Edit: flip winner or adjust rally length, recalculate the
   *     downstream score.
   *
   * The caller is responsible for wiring `onRemove` / `onEditWinner` /
   * `onEditRallyLength` to the appropriate engine calls (editPoint /
   * removePoint on the scoring engine) and re-hydrating the penalty
   * box projection afterwards.
   */

  let {
    entry,
    side1Name = '',
    side2Name = '',
    onClose,
    onRemove,
    onEditWinner,
    onEditRallyLength,
  }: {
    entry: PointHistoryEntry;
    side1Name?: string;
    side2Name?: string;
    onClose: () => void;
    onRemove: (entry: PointHistoryEntry) => void;
    /**
     * `mode` distinguishes the two correction scenarios:
     *   - 'recalculate'     — live scorekeeping error, play continued
     *                         with the actual (correct) winner; the full
     *                         history is recomputed from the flipped
     *                         winner onward.
     *   - 'preserveServers' — post-review award change; play already
     *                         continued based on the wrong call, so
     *                         subsequent points retain the servers they
     *                         were actually played with.
     */
    onEditWinner: (
      entry: PointHistoryEntry,
      nextWinningSide: 1 | 2,
      mode: 'recalculate' | 'preserveServers',
    ) => void;
    onEditRallyLength: (entry: PointHistoryEntry, nextRallyLength: number | undefined) => void;
  } = $props();

  let confirmingRemove = $state(false);
  let rallyDraft = $state<string>(entry.rallyLength != null ? String(entry.rallyLength) : '');
  const rallyParse = $derived(parseRallyLengthInput(rallyDraft, entry.rallyLength));

  function handleFlipWinner(mode: 'recalculate' | 'preserveServers') {
    onEditWinner(entry, oppositeWinningSide(entry.winningSide), mode);
  }

  function handleSaveRally() {
    if (!rallyParse.valid || !rallyParse.dirty) return;
    onEditRallyLength(entry, rallyParse.value);
  }

  function fullTime(): string {
    if (!entry.timestamp) return '';
    const d = new Date(entry.timestamp);
    if (Number.isNaN(d.getTime())) return '';
    const hhmm = formatTimeLabel(entry.timestamp);
    const ss = d.getSeconds().toString().padStart(2, '0');
    return `${hhmm}:${ss}`;
  }

  const sideLabel = $derived(entry.winningSide === 1 ? side1Name || 'Side 1' : side2Name || 'Side 2');
  const otherSideLabel = $derived(
    oppositeWinningSide(entry.winningSide) === 1 ? side1Name || 'Side 1' : side2Name || 'Side 2',
  );

  /** Is the entry a previously-edited point? */
  const hasEditAudit = $derived(Boolean(entry.editReason));
  const originalSideLabel = $derived(
    entry.originalWinningSide === 1 ? side1Name || 'Side 1' : side2Name || 'Side 2',
  );

  function formatEditedAt(): string {
    if (!entry.editedAt) return '';
    const d = new Date(entry.editedAt);
    if (Number.isNaN(d.getTime())) return '';
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    const ss = d.getSeconds().toString().padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="pdm-overlay" onclick={onClose}>
  <div class="pdm-modal" onclick={(e) => e.stopPropagation()}>
    <div class="pdm-header">
      <span>Point detail</span>
      <button class="pdm-close" onclick={onClose} aria-label="Close">✕</button>
    </div>

    <div class="pdm-summary pdm-summary--side{entry.winningSide} pdm-summary--{entry.kind}">
      <span class="pdm-summary-glyph">{entry.glyph}</span>
      <div class="pdm-summary-text">
        <div class="pdm-summary-top">
          <strong>{sideLabel}</strong>
          {#if entry.rawResult}<span class="pdm-summary-kind">{entry.rawResult}</span>{/if}
        </div>
        <div class="pdm-summary-meta">
          {#if fullTime()}<span>{fullTime()}</span>{/if}
          {#if entry.scoreValue > 1}<span class="pdm-summary-score">+{entry.scoreValue}</span>{/if}
          {#if entry.rallyLength !== undefined}<span>rally {entry.rallyLength}</span>{/if}
          {#if entry.wonOnServe}<span title="Won on serve">won on serve</span>{/if}
          {#if entry.kind === 'penalty' && entry.penaltyAgainstParticipantName}
            <span>against {entry.penaltyAgainstParticipantName}</span>
          {/if}
          <span class="pdm-summary-index">#{entry.pointIndex}</span>
        </div>
      </div>
    </div>

    {#if hasEditAudit}
      <div class="pdm-audit pdm-audit--{entry.editReason}">
        <div class="pdm-audit-title">
          {entry.editReason === 'reviewCorrection'
            ? 'Post-review correction'
            : 'Edited — scorekeeping error'}
        </div>
        <div class="pdm-audit-meta">
          {#if entry.originalWinningSide}
            Originally awarded to <strong>{originalSideLabel}</strong>.
          {/if}
          {#if entry.editedAt}
            <span class="pdm-audit-time">Edited at {formatEditedAt()}.</span>
          {/if}
          {#if entry.serverPinned}
            <span>Serve order retained as played.</span>
          {:else if entry.editReason === 'scorekeepingError'}
            <span>Serve order recalculated from the corrected chain.</span>
          {/if}
        </div>
      </div>
    {/if}

    <div class="pdm-section">
      <div class="pdm-section-label">Give point to {otherSideLabel}</div>
      <p class="pdm-winner-help">
        How should the rest of the bolt be handled?
      </p>
      <button class="pdm-winner-btn" onclick={() => handleFlipWinner('recalculate')}>
        <span class="pdm-winner-btn-title">Scorekeeping error — recalculate</span>
        <span class="pdm-winner-btn-help">
          Use when play continued with the actual winner but the scorekeeper
          recorded the wrong side. Downstream score and serve order rebuild.
        </span>
      </button>
      <button class="pdm-winner-btn" onclick={() => handleFlipWinner('preserveServers')}>
        <span class="pdm-winner-btn-title">Post-review correction — retain serve order</span>
        <span class="pdm-winner-btn-help">
          Use when play continued based on the original (now-flipped) call —
          e.g. a later video review reversed the award. Subsequent points
          keep the servers they were actually played with.
        </span>
      </button>
    </div>

    <div class="pdm-section">
      <div class="pdm-section-label">Rally length</div>
      <div class="pdm-rally-row">
        <input
          class="pdm-rally-input"
          type="number"
          min="0"
          bind:value={rallyDraft}
          placeholder="(none)"
          aria-label="Rally length"
        />
        <button class="pdm-action-btn pdm-action-btn--rally" onclick={handleSaveRally} disabled={!rallyParse.dirty || !rallyParse.valid}>
          Save
        </button>
      </div>
    </div>

    <div class="pdm-section">
      <div class="pdm-section-label">Remove</div>
      {#if !confirmingRemove}
        <button class="pdm-remove-btn" onclick={() => (confirmingRemove = true)}>
          Remove this point from history
        </button>
      {:else}
        <p class="pdm-warn">
          Downstream score and serve order will be recalculated from the remaining points.
        </p>
        <div class="pdm-confirm-row">
          <button class="pdm-action-btn" onclick={() => (confirmingRemove = false)}>
            Cancel
          </button>
          <button class="pdm-remove-btn pdm-remove-btn--confirm" onclick={() => onRemove(entry)}>
            Confirm remove
          </button>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .pdm-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 2100;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .pdm-modal {
    background: var(--intennse-surface, #16213e);
    color: var(--intennse-text, #e0e0e0);
    border: 1px solid var(--intennse-accent, #0f3460);
    border-radius: 12px;
    padding: 1rem;
    min-width: 280px;
    max-width: 420px;
    width: 92%;
    max-height: 90vh;
    overflow-y: auto;
  }
  .pdm-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 700;
    font-size: 0.9rem;
    margin-bottom: 0.75rem;
  }
  .pdm-close {
    background: none;
    border: none;
    color: inherit;
    font-size: 1.1rem;
    cursor: pointer;
    padding: 0.2rem;
  }

  .pdm-summary {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    padding: 0.6rem 0.75rem;
    border-radius: 8px;
    background: var(--intennse-bg, #1a1a2e);
    border-left: 4px solid transparent;
    margin-bottom: 0.75rem;
  }
  .pdm-summary--side1 { border-left-color: var(--intennse-touch, #4fc3f7); }
  .pdm-summary--side2 { border-left-color: var(--intennse-winner, #00d4aa); }
  .pdm-summary-glyph {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 2rem;
    height: 2rem;
    padding: 0 0.4rem;
    border-radius: 4px;
    background: var(--intennse-accent, #0f3460);
    font-weight: 800;
    font-size: 0.85rem;
  }
  .pdm-summary--winner       .pdm-summary-glyph { background: var(--intennse-winner, #00d4aa); color: #000; }
  .pdm-summary--touch        .pdm-summary-glyph { background: var(--intennse-touch,  #4fc3f7); color: #000; }
  .pdm-summary--ace          .pdm-summary-glyph { background: var(--intennse-winner, #00d4aa); color: #000; }
  .pdm-summary--fault        .pdm-summary-glyph { background: var(--intennse-fault,  #ff9800); color: #000; }
  .pdm-summary--forcedError  .pdm-summary-glyph { background: var(--intennse-error,  #ef5350); color: #fff; }
  .pdm-summary--unforcedError .pdm-summary-glyph { background: #c62828; color: #fff; }
  .pdm-summary--penalty      .pdm-summary-glyph { background: var(--intennse-urgent, #ff9800); color: #000; }
  .pdm-summary--adjustment   .pdm-summary-glyph {
    background: transparent;
    border: 1px dashed var(--intennse-text-muted, #8892b0);
    color: var(--intennse-text-muted, #8892b0);
  }
  .pdm-summary-text { flex: 1; min-width: 0; }
  .pdm-summary-top {
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
    font-size: 0.9rem;
  }
  .pdm-summary-kind {
    color: var(--intennse-text-muted, #8892b0);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .pdm-summary-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.2rem;
    font-size: 0.7rem;
    color: var(--intennse-text-muted, #8892b0);
  }
  .pdm-summary-score {
    color: var(--intennse-urgent, #ff9800);
    font-weight: 700;
  }
  .pdm-summary-index { font-variant-numeric: tabular-nums; opacity: 0.6; }

  .pdm-section { margin-bottom: 0.75rem; }
  .pdm-section-label {
    font-size: 0.65rem;
    text-transform: uppercase;
    color: var(--intennse-text-muted, #8892b0);
    margin-bottom: 0.35rem;
    font-weight: 600;
    letter-spacing: 0.05em;
  }

  .pdm-action-btn {
    display: block;
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: var(--intennse-bg, #1a1a2e);
    color: var(--intennse-text, #e0e0e0);
    border: 1px solid var(--intennse-accent, #0f3460);
    border-radius: 8px;
    font-size: 0.8rem;
    cursor: pointer;
    touch-action: manipulation;
    margin-bottom: 0.3rem;
  }
  .pdm-action-btn:disabled { opacity: 0.4; cursor: default; }
  .pdm-action-btn:active:not(:disabled) { opacity: 0.7; }

  .pdm-winner-help {
    margin: 0 0 0.4rem;
    font-size: 0.7rem;
    color: var(--intennse-text-muted, #8892b0);
    line-height: 1.3;
  }

  .pdm-audit {
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    margin-bottom: 0.75rem;
    border-left: 3px solid var(--intennse-urgent, #ff9800);
    background: rgba(255, 152, 0, 0.06);
  }
  .pdm-audit--scorekeepingError {
    border-left-color: var(--intennse-text-muted, #8892b0);
    background: rgba(136, 146, 176, 0.08);
  }
  .pdm-audit-title {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--intennse-text, #e0e0e0);
    margin-bottom: 0.2rem;
  }
  .pdm-audit-meta {
    font-size: 0.65rem;
    line-height: 1.4;
    color: var(--intennse-text-muted, #8892b0);
  }
  .pdm-audit-time { display: inline-block; margin-right: 0.25rem; }

  .pdm-winner-btn {
    display: block;
    width: 100%;
    padding: 0.55rem 0.75rem;
    margin-bottom: 0.4rem;
    background: var(--intennse-bg, #1a1a2e);
    color: var(--intennse-text, #e0e0e0);
    border: 1px solid var(--intennse-accent, #0f3460);
    border-radius: 8px;
    cursor: pointer;
    touch-action: manipulation;
    text-align: left;
  }
  .pdm-winner-btn:active { opacity: 0.7; }
  .pdm-winner-btn-title {
    display: block;
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--intennse-text, #e0e0e0);
  }
  .pdm-winner-btn-help {
    display: block;
    margin-top: 0.2rem;
    font-size: 0.65rem;
    font-weight: 400;
    color: var(--intennse-text-muted, #8892b0);
    line-height: 1.35;
  }

  .pdm-rally-row {
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }
  .pdm-rally-input {
    flex: 1;
    min-width: 0;
    padding: 0.4rem 0.5rem;
    border: 1px solid var(--intennse-accent, #0f3460);
    border-radius: 6px;
    background: var(--intennse-bg, #1a1a2e);
    color: inherit;
    font: inherit;
  }
  .pdm-action-btn--rally {
    flex: 0 0 auto;
    width: auto;
    margin-bottom: 0;
  }

  .pdm-remove-btn {
    display: block;
    width: 100%;
    padding: 0.55rem 0.75rem;
    background: transparent;
    color: var(--intennse-critical, #ef5350);
    border: 1px solid var(--intennse-critical, #ef5350);
    border-radius: 8px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    touch-action: manipulation;
  }
  .pdm-remove-btn:active { opacity: 0.7; }
  .pdm-remove-btn--confirm {
    background: var(--intennse-critical, #ef5350);
    color: #fff;
  }

  .pdm-warn {
    margin: 0.3rem 0;
    font-size: 0.7rem;
    color: var(--intennse-text-muted, #8892b0);
    line-height: 1.3;
  }
  .pdm-confirm-row {
    display: flex;
    gap: 0.4rem;
  }
  .pdm-confirm-row > * { flex: 1; margin-bottom: 0; }
</style>

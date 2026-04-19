<script lang="ts">
  /**
   * PlayerSelectModal — pick the active players for a side before the bolt
   * starts. Selection order matters: index 0 becomes the side's first server.
   *
   * For singles requiredCount = 1; for doubles = 2. The Confirm button is
   * enabled only when exactly `requiredCount` players are selected.
   */
  let {
    side,
    teamName,
    roster,
    currentIds = [],
    requiredCount,
    onConfirm,
    onClose,
  }: {
    side: 1 | 2;
    teamName: string;
    roster: { participantId: string; participantName: string }[];
    currentIds?: string[];
    requiredCount: 1 | 2;
    onConfirm: (selectedIds: string[]) => void;
    onClose: () => void;
  } = $props();

  // Local working copy — committed only on Confirm.
  // svelte-ignore state_referenced_locally — currentIds is captured once when
  // the modal opens; the user edits selectedIds directly via toggle/clear.
  let selectedIds = $state<string[]>([...currentIds]);

  function isSelected(id: string): boolean {
    return selectedIds.includes(id);
  }

  function selectionIndex(id: string): number {
    return selectedIds.indexOf(id);
  }

  function toggle(id: string) {
    const idx = selectedIds.indexOf(id);
    if (idx !== -1) {
      // Already selected → remove
      const next = selectedIds.slice();
      next.splice(idx, 1);
      selectedIds = next;
      return;
    }
    // Not selected → append, but never exceed requiredCount.
    // If at the cap, replace the oldest selection (first slot) so the user
    // can keep tapping without first having to deselect.
    if (selectedIds.length >= requiredCount) {
      const next = selectedIds.slice(1);
      next.push(id);
      selectedIds = next;
      return;
    }
    selectedIds = [...selectedIds, id];
  }

  function clearSelection() {
    selectedIds = [];
  }

  const canConfirm = $derived(selectedIds.length === requiredCount);

  function confirm() {
    if (!canConfirm) return;
    onConfirm(selectedIds.slice());
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="ps-overlay" onclick={onClose}>
  <div class="ps-modal" onclick={(e) => e.stopPropagation()}>
    <div class="ps-header">
      <span class="ps-title">
        {requiredCount === 1 ? 'Select Player' : 'Select Pair'}
        <span class="ps-side">— {teamName || `Side ${side}`}</span>
      </span>
      <button class="ps-close" onclick={onClose} aria-label="Close">✕</button>
    </div>

    <div class="ps-help">
      {#if requiredCount === 1}
        Tap a player to put them on court.
      {:else}
        Tap two players. The first tap will be the team's first server.
      {/if}
    </div>

    {#if roster.length === 0}
      <div class="ps-empty">No roster available for this side.</div>
    {:else}
      <div class="ps-roster">
        {#each roster as player (player.participantId)}
          {@const idx = selectionIndex(player.participantId)}
          <button
            class="ps-player"
            class:ps-player--selected={isSelected(player.participantId)}
            onclick={() => toggle(player.participantId)}
          >
            <span class="ps-player-name">{player.participantName}</span>
            {#if idx !== -1 && requiredCount > 1}
              <span class="ps-slot">{idx === 0 ? '1st serve' : '2nd'}</span>
            {:else if idx !== -1}
              <span class="ps-slot">on court</span>
            {/if}
          </button>
        {/each}
      </div>
    {/if}

    <div class="ps-footer">
      <button class="ps-btn ps-btn--ghost" onclick={clearSelection} disabled={selectedIds.length === 0}>
        Clear
      </button>
      <div class="ps-count">{selectedIds.length} / {requiredCount}</div>
      <button class="ps-btn ps-btn--primary" onclick={confirm} disabled={!canConfirm}>
        Confirm
      </button>
    </div>
  </div>
</div>

<style>
  .ps-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.65);
    z-index: 2200;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .ps-modal {
    background: var(--intennse-surface, #16213e);
    color: var(--intennse-text, #e0e0e0);
    border-radius: 12px;
    padding: 1rem;
    min-width: 280px;
    max-width: 420px;
    width: 92%;
    max-height: 86vh;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .ps-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .ps-title {
    font-weight: 700;
    font-size: 0.95rem;
  }

  .ps-side {
    font-weight: 500;
    color: var(--intennse-text-muted, #8892b0);
    margin-left: 0.25rem;
  }

  .ps-close {
    background: none;
    border: none;
    color: var(--intennse-text, #e0e0e0);
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0.2rem;
  }

  .ps-help {
    font-size: 0.7rem;
    color: var(--intennse-text-muted, #8892b0);
  }

  .ps-empty {
    text-align: center;
    font-size: 0.8rem;
    color: var(--intennse-text-muted, #8892b0);
    padding: 1rem;
  }

  .ps-roster {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    overflow-y: auto;
    padding-right: 0.2rem;
  }

  .ps-player {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0.6rem 0.7rem;
    border: 1px solid var(--intennse-accent, #0f3460);
    border-radius: 8px;
    background: var(--intennse-bg, #1a1a2e);
    color: var(--intennse-text, #e0e0e0);
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    touch-action: manipulation;
  }

  .ps-player:active {
    opacity: 0.7;
  }

  .ps-player--selected {
    border-color: var(--intennse-serving, #00d4aa);
    box-shadow: 0 0 0 1px var(--intennse-serving, #00d4aa);
    background: rgba(0, 212, 170, 0.1);
  }

  .ps-player-name {
    flex: 1;
    text-align: left;
  }

  .ps-slot {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--intennse-serving, #00d4aa);
    font-weight: 700;
  }

  .ps-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--intennse-accent, #0f3460);
  }

  .ps-count {
    font-size: 0.8rem;
    color: var(--intennse-text-muted, #8892b0);
    font-variant-numeric: tabular-nums;
  }

  .ps-btn {
    padding: 0.55rem 1rem;
    border-radius: 8px;
    border: 1px solid var(--intennse-accent, #0f3460);
    background: var(--intennse-bg, #1a1a2e);
    color: var(--intennse-text, #e0e0e0);
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
  }

  .ps-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .ps-btn--primary {
    background: var(--intennse-serving, #00d4aa);
    border-color: var(--intennse-serving, #00d4aa);
    color: #000;
  }

  .ps-btn--ghost {
    background: transparent;
  }
</style>

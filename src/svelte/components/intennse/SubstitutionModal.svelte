<script lang="ts">
  import { formatTime } from '../../../clock/formatTime';
  import { getRemainingMs, isTimeExhausted } from '../../stores/playerTime.svelte';

  let {
    side,
    activePlayers,
    benchPlayers,
    preSelectedOut,
    isMixedBolt = false,
    onSubstitute,
    onClose,
  }: {
    side: 1 | 2;
    activePlayers: { participantId: string; participantName: string; jerseyNumber?: string; gender?: string }[];
    benchPlayers: { participantId: string; participantName: string; gender?: string; jerseyNumber?: string }[];
    preSelectedOut?: string;
    /** True when the current bolt is Mixed Doubles — enables per-outgoing
     *  gender gating on the bench (male→male, female→female). For non-MIXED
     *  bolts the bench is already pre-filtered by BoltScoringPage. */
    isMixedBolt?: boolean;
    onSubstitute: (outId: string, inId: string) => void;
    onClose: () => void;
  } = $props();

  // svelte-ignore state_referenced_locally — mount-time seeding, same
  // as SubstitutionModal's existing pattern; the modal is keyed by the
  // parent and never survives across different activePlayers lists.
  let selectedOut = $state<string | null>(
    // svelte-ignore state_referenced_locally
    preSelectedOut ?? (activePlayers.length === 1 ? activePlayers[0].participantId : null),
  );

  /** Gender of the currently-selected outgoing player (for XD gating). */
  const selectedOutGender = $derived(
    activePlayers.find((p) => p.participantId === selectedOut)?.gender,
  );

  /** Eligible bench players given a specific outgoing player's gender. */
  function getEligibleBench(outGender?: string) {
    return benchPlayers.filter((p) => {
      if (isTimeExhausted(p.participantId)) return false;
      if (isMixedBolt && outGender && p.gender && p.gender !== outGender) return false;
      return true;
    });
  }

  /** Auto-complete the sub when exactly one eligible bench player exists. */
  function tryAutoComplete() {
    if (!selectedOut) return;
    const outGender = activePlayers.find((p) => p.participantId === selectedOut)?.gender;
    const eligible = getEligibleBench(outGender);
    if (eligible.length === 1) {
      onSubstitute(selectedOut, eligible[0].participantId);
      selectedOut = null;
    }
  }

  function selectOut(participantId: string) {
    if (participantId === preSelectedOut) return;
    if (activePlayers.length === 1) {
      selectedOut = participantId;
    } else {
      selectedOut = selectedOut === participantId ? null : participantId;
    }
    tryAutoComplete();
  }

  /** True when a bench player may NOT be tapped because their gender
   *  doesn't match the outgoing player (XD-only rule; for non-MIXED
   *  bolts the bench is already pre-filtered by BoltScoringPage). */
  function isBenchGenderBlocked(benchGender?: string): boolean {
    if (!isMixedBolt) return false;
    if (!selectedOut || !selectedOutGender) return false;
    if (!benchGender) return false;
    return benchGender !== selectedOutGender;
  }

  function selectIn(participantId: string) {
    if (!selectedOut) return;
    onSubstitute(selectedOut, participantId);
    selectedOut = null;
  }

  // If the out player is already selected (pre-assigned from penalty or
  // singles auto-select) and there's only one eligible bench player,
  // auto-complete immediately on mount — no extra tap needed.
  $effect(() => {
    tryAutoComplete();
  });

  /** CSS color for participant name based on gender. */
  function genderColor(gender?: string): string {
    const g = (gender ?? '').toUpperCase();
    if (g === 'MALE' || g === 'M') return 'var(--chc-gender-male, #2E86C1)';
    if (g === 'FEMALE' || g === 'F') return 'var(--chc-gender-female, #E07BAF)';
    return '';
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="sub-overlay" onclick={onClose}>
  <div class="sub-modal" onclick={(e) => e.stopPropagation()}>
    <div class="sub-header">
      <span>Substitution — Side {side}</span>
      <button class="sub-close" onclick={onClose}>✕</button>
    </div>

    <div class="sub-section">
      <div class="sub-section-label">On Court — tap player to remove</div>
      {#each activePlayers as player (player.participantId)}
        {@const remaining = getRemainingMs(player.participantId)}
        {@const exhausted = isTimeExhausted(player.participantId)}
        {@const locked = player.participantId === preSelectedOut}
        <button
          class="sub-player"
          class:sub-player--selected={selectedOut === player.participantId}
          class:sub-player--locked={locked}
          class:sub-player--exhausted={exhausted}
          onclick={() => selectOut(player.participantId)}
          disabled={locked}
        >
          <span class="sub-player-name" style:color={genderColor(player.gender)}>
            {#if player.jerseyNumber}<span class="sub-jersey">{player.jerseyNumber}</span>{/if}
            {player.participantName}{locked ? ' (penalized)' : ''}
          </span>
          <span class="sub-player-time" class:player-time--critical={remaining < 60000 && !exhausted}>
            {exhausted ? 'TIME' : formatTime(remaining)}
          </span>
        </button>
      {/each}
    </div>

    <div class="sub-section">
      <div class="sub-section-label">
        Bench — tap replacement{selectedOut ? '' : ' (select a player above first)'}
      </div>
      {#each benchPlayers as player (player.participantId)}
        {@const remaining = getRemainingMs(player.participantId)}
        {@const exhausted = isTimeExhausted(player.participantId)}
        {@const genderBlocked = isBenchGenderBlocked(player.gender)}
        <button
          class="sub-player sub-player--bench"
          class:sub-player--exhausted={exhausted}
          class:sub-player--gender-blocked={genderBlocked}
          onclick={() => selectIn(player.participantId)}
          disabled={exhausted || genderBlocked || !selectedOut}
        >
          <span class="sub-player-name" style:color={genderColor(player.gender)}>
            {#if player.jerseyNumber}<span class="sub-jersey">{player.jerseyNumber}</span>{/if}
            {player.participantName}
          </span>
          <span class="sub-player-time">
            {exhausted ? 'TIME' : formatTime(remaining)}
          </span>
        </button>
      {/each}
      {#if benchPlayers.length === 0}
        <div class="sub-empty">No eligible bench players</div>
      {/if}
    </div>
  </div>
</div>

<style>
  .sub-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 2000;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .sub-modal {
    background: var(--intennse-surface, #16213e);
    color: var(--intennse-text, #e0e0e0);
    border-radius: 12px;
    padding: 1rem;
    min-width: 260px;
    max-width: 360px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
  }

  .sub-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 700;
    font-size: 0.9rem;
    margin-bottom: 0.75rem;
  }

  .sub-close {
    background: none;
    border: none;
    color: var(--intennse-text, #e0e0e0);
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0.2rem;
  }

  .sub-section {
    margin-bottom: 0.75rem;
  }

  .sub-section-label {
    font-size: 0.65rem;
    text-transform: uppercase;
    color: var(--intennse-text-muted, #8892b0);
    margin-bottom: 0.3rem;
    font-weight: 600;
  }

  .sub-player {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 0.5rem 0.6rem;
    margin-bottom: 0.3rem;
    border: 1px solid var(--intennse-accent, #0f3460);
    border-radius: 8px;
    background: var(--intennse-bg, #1a1a2e);
    color: var(--intennse-text, #e0e0e0);
    cursor: pointer;
    font-size: 0.85rem;
    touch-action: manipulation;
  }

  .sub-player:active { opacity: 0.7; }
  .sub-player--selected { border-color: var(--intennse-serving, #00d4aa); box-shadow: 0 0 0 1px var(--intennse-serving); }
  .sub-player--locked { border-color: var(--intennse-critical, #ef5350); opacity: 0.5; cursor: default; }
  .sub-player--exhausted { opacity: 0.4; }
  .sub-player--exhausted .sub-player-time { color: var(--intennse-expired, #b71c1c); font-weight: 700; }
  .sub-player--gender-blocked { opacity: 0.3; cursor: default; }

  .sub-player--bench { background: var(--intennse-accent, #0f3460); }

  .sub-player-name { font-weight: 600; display: flex; align-items: center; gap: 0.4rem; }
  .sub-jersey {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.6rem;
    height: 1.6rem;
    border-radius: 4px;
    background: var(--intennse-serving, #00d4aa);
    color: var(--intennse-surface, #16213e);
    font-weight: 800;
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }
  .sub-player-time { font-variant-numeric: tabular-nums; font-size: 0.75rem; color: var(--intennse-text-muted); }

  .sub-empty {
    text-align: center;
    font-size: 0.75rem;
    color: var(--intennse-text-muted);
    padding: 0.5rem;
  }
</style>

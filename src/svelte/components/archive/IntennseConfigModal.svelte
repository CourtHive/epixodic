<script lang="ts">
  let {
    onConfirm,
    onClose,
  }: {
    onConfirm: (config: {
      team1Name: string;
      team2Name: string;
      boltMinutes: number;
      breakSeconds: number;
      assignParticipants: boolean;
    }) => void;
    onClose: () => void;
  } = $props();

  let team1Name = $state('The Authentics');
  let team2Name = $state('Cauldron');
  let boltMinutes = $state(10);
  let breakSeconds = $state(120);
  let assignParticipants = $state(true);

  function handleConfirm() {
    if (!team1Name.trim() || !team2Name.trim()) return;
    onConfirm({
      team1Name: team1Name.trim(),
      team2Name: team2Name.trim(),
      boltMinutes,
      breakSeconds,
      assignParticipants,
    });
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="icm-overlay" onclick={onClose}>
  <div class="icm-modal" onclick={(e) => e.stopPropagation()}>
    <div class="icm-header">
      <span>INTENNSE Demo Setup</span>
      <button class="icm-close" onclick={onClose}>✕</button>
    </div>

    <div class="icm-field">
      <label class="icm-label" for="icm-team1">Team 1</label>
      <input class="icm-input" id="icm-team1" bind:value={team1Name} placeholder="Team 1 name" />
    </div>

    <div class="icm-field">
      <label class="icm-label" for="icm-team2">Team 2</label>
      <input class="icm-input" id="icm-team2" bind:value={team2Name} placeholder="Team 2 name" />
    </div>

    <div class="icm-field">
      <label class="icm-label" for="icm-bolt">Bolt duration (minutes)</label>
      <select class="icm-input" id="icm-bolt" bind:value={boltMinutes}>
        <option value={1}>1 min (testing)</option>
        <option value={2}>2 min (testing)</option>
        <option value={3}>3 min (exhibition)</option>
        <option value={5}>5 min</option>
        <option value={10}>10 min (standard)</option>
      </select>
    </div>

    <div class="icm-field">
      <label class="icm-label" for="icm-break">Break duration</label>
      <select class="icm-input" id="icm-break" bind:value={breakSeconds}>
        <option value={30}>0:30 (testing)</option>
        <option value={60}>1:00 (testing)</option>
        <option value={120}>2:00 (official)</option>
      </select>
    </div>

    <div class="icm-field icm-field--row">
      <label class="icm-label" for="icm-assign">Pre-assign players to bolts</label>
      <input class="icm-checkbox" id="icm-assign" type="checkbox" bind:checked={assignParticipants} />
    </div>

    <button
      class="icm-confirm"
      onclick={handleConfirm}
      disabled={!team1Name.trim() || !team2Name.trim()}
    >
      Create Demo
    </button>
  </div>
</div>

<style>
  .icm-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 2000;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .icm-modal {
    background: var(--ep-page-bg, #fff);
    color: var(--ep-page-text, #333);
    border-radius: 12px;
    padding: 1.2rem;
    min-width: 280px;
    max-width: 360px;
    width: 90%;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  }

  .icm-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 700;
    font-size: 1rem;
    margin-bottom: 1rem;
  }

  .icm-close {
    background: none;
    border: none;
    color: var(--ep-page-text, #333);
    font-size: 1.2rem;
    cursor: pointer;
  }

  .icm-field {
    margin-bottom: 0.75rem;
  }

  .icm-field--row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .icm-label {
    display: block;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--ep-page-text-muted, #888);
    text-transform: uppercase;
    margin-bottom: 0.25rem;
  }

  .icm-field--row .icm-label {
    margin-bottom: 0;
  }

  .icm-input {
    width: 100%;
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--ep-page-border, #ddd);
    border-radius: 6px;
    font-size: 0.9rem;
    background: var(--ep-page-bg, #fff);
    color: var(--ep-page-text, #333);
  }

  .icm-checkbox {
    width: 1.2rem;
    height: 1.2rem;
    cursor: pointer;
    flex-shrink: 0;
  }

  .icm-confirm {
    width: 100%;
    padding: 0.7rem;
    border: none;
    border-radius: 8px;
    background: var(--ep-accent, #3b82f6);
    color: #fff;
    font-size: 0.9rem;
    font-weight: 700;
    cursor: pointer;
    margin-top: 0.5rem;
  }

  .icm-confirm:active { opacity: 0.7; }
  .icm-confirm:disabled { opacity: 0.4; cursor: default; }
</style>

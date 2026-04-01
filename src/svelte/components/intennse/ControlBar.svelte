<script lang="ts">
  let {
    canUndo = false,
    canRedo = false,
    onUndo,
    onRedo,
    onPointStart,
    onTimeout,
    onSubstitute,
    onPenalty,
    onBack,
    rallyInProgress = false,
  }: {
    canUndo?: boolean;
    canRedo?: boolean;
    onUndo: () => void;
    onRedo: () => void;
    onPointStart: () => void;
    onTimeout: (side: 1 | 2) => void;
    onSubstitute: (side: 1 | 2) => void;
    onPenalty: (side: 1 | 2) => void;
    onBack: () => void;
    rallyInProgress?: boolean;
  } = $props();
</script>

<div class="intennse-control-bar">
  <div class="intennse-controls-left">
    <button class="intennse-ctrl-btn" onclick={() => onTimeout(1)} title="Timeout Side 1">TO 1</button>
    <button class="intennse-ctrl-btn" onclick={() => onSubstitute(1)} title="Sub Side 1">SUB 1</button>
    <button class="intennse-ctrl-btn intennse-ctrl-btn--penalty" onclick={() => onPenalty(1)} title="Penalty Side 1">PEN 1</button>
  </div>

  <div class="intennse-controls-center">
    <button class="intennse-ctrl-btn" onclick={onUndo} disabled={!canUndo} title="Undo">↩</button>

    <button
      class="intennse-ctrl-btn intennse-ctrl-btn--point-start"
      class:intennse-ctrl-btn--active={rallyInProgress}
      onclick={onPointStart}
      title="Point Start"
    >
      {rallyInProgress ? '⏵ RALLY' : '▶ START'}
    </button>

    <button class="intennse-ctrl-btn" onclick={onRedo} disabled={!canRedo} title="Redo">↪</button>
  </div>

  <div class="intennse-controls-right">
    <button class="intennse-ctrl-btn intennse-ctrl-btn--penalty" onclick={() => onPenalty(2)} title="Penalty Side 2">PEN 2</button>
    <button class="intennse-ctrl-btn" onclick={() => onSubstitute(2)} title="Sub Side 2">SUB 2</button>
    <button class="intennse-ctrl-btn" onclick={() => onTimeout(2)} title="Timeout Side 2">TO 2</button>
  </div>

  <button class="intennse-ctrl-btn intennse-ctrl-btn--back" onclick={onBack} title="Back to Arc">← Arc</button>
</div>

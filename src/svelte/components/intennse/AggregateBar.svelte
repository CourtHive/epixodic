<script lang="ts">
  let { side1Total = 0, side2Total = 0, side1Name = '', side2Name = '' }: {
    side1Total: number;
    side2Total: number;
    side1Name?: string;
    side2Name?: string;
  } = $props();

  const side1Leading = $derived(side1Total > side2Total);
  const side2Leading = $derived(side2Total > side1Total);
</script>

<div class="intennse-aggregate-bar">
  <span class="intennse-aggregate-side" class:intennse-aggregate-side--leading={side1Leading}>
    {side1Name} <strong>{side1Total}</strong>
  </span>
  <span class="intennse-aggregate-label">ARC</span>
  <span class="intennse-aggregate-side" class:intennse-aggregate-side--leading={side2Leading}>
    <strong>{side2Total}</strong> {side2Name}
  </span>
</div>

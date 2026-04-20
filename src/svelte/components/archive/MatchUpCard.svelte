<script lang="ts">
  import { renderMatchUp } from 'courthive-components';
  import type { HydratedMatchUp } from '../../types';

  let { matchUp, onclick, oncontextmenu }: {
    matchUp: HydratedMatchUp;
    onclick?: () => void;
    oncontextmenu?: (e: MouseEvent) => void;
  } = $props();

  const hasGamePoints = $derived(!matchUp.winningSide || matchUp.matchUpStatus === 'RETIRED');

  const archiveComposition = $derived({
    theme: '',
    configuration: {
      scheduleInfo: true,
      ...(hasGamePoints && { gameScore: { position: 'trailing' as const } }),
    },
  });

  function mountRenderMatchUp(node: HTMLElement) {
    const element = renderMatchUp({
      matchUp: {
        ...matchUp,
        structureId: matchUp.structureId || '',
      },
      composition: archiveComposition,
      isAdHoc: true,
      eventHandlers: {
        matchUpClick: () => onclick?.(),
        scheduleClick: ({ pointerEvent }: { pointerEvent: MouseEvent }) => {
          pointerEvent.stopPropagation();
          oncontextmenu?.(pointerEvent);
        },
      },
    });
    node.appendChild(element);

    return {
      destroy() {
        node.innerHTML = '';
      },
    };
  }
</script>

{#key matchUp.matchUpStatus + '|' + (matchUp.winningSide ?? '')}
  <div class="matchup-card" use:mountRenderMatchUp></div>
{/key}

<style>
  .matchup-card {
    width: 100%;
  }
  .matchup-card :global(.matchUp) {
    cursor: pointer;
  }
</style>

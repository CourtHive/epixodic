<script lang="ts">
  import { renderMatchUp } from 'courthive-components';
  import type { HydratedMatchUp } from '../../types';

  let { matchUp, onclick, oncontextmenu }: {
    matchUp: HydratedMatchUp;
    onclick?: () => void;
    oncontextmenu?: (e: MouseEvent) => void;
  } = $props();

  const hasGamePoints = $derived(!matchUp.winningSide || matchUp.matchUpStatus === 'RETIRED');

  // Re-mount the vanilla render whenever the score itself changes — the status/
  // winningSide key alone misses in-progress point-by-point updates (e.g. local
  // scores overlaid onto the server-sourced draw).
  const scoreKey = $derived(
    (matchUp.score?.scoreStringSide1 ?? '') + '|' + JSON.stringify(matchUp.score?.sets ?? []),
  );

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

{#key matchUp.matchUpStatus + '|' + (matchUp.winningSide ?? '') + '|' + scoreKey}
  <div class="matchup-card" class:has-local-score={matchUp.hasLocalScore} use:mountRenderMatchUp></div>
{/key}

<style>
  .matchup-card {
    width: 100%;
  }
  .matchup-card :global(.matchUp) {
    cursor: pointer;
  }
  /* Local, not-yet-submitted score: subtle left accent so it reads as pending. */
  .matchup-card.has-local-score {
    position: relative;
  }
  .matchup-card.has-local-score::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    border-radius: 2px;
    background: var(--chc-accent, #e0a400);
  }
</style>

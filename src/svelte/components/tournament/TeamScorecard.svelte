<script lang="ts">
  import { renderScorecard } from 'courthive-components';
  import type { HydratedMatchUp } from '../../types';

  let { matchUp, scoreVersion = 0, swapSides = false, onTieMatchUpClick }: {
    matchUp: HydratedMatchUp;
    scoreVersion?: number;
    swapSides?: boolean;
    onTieMatchUpClick?: (tieMatchUp: HydratedMatchUp) => void;
  } = $props();

  const composition = {
    theme: '',
    configuration: {
      flags: true,
    },
  };

  function mountScorecard(node: HTMLElement) {
    const element = renderScorecard({
      matchUp: matchUp as any,
      composition,
      swapSides,
      eventHandlers: {
        matchUpClick: ({ matchUp: tieMatchUp }: { matchUp: any }) => {
          onTieMatchUpClick?.(tieMatchUp as HydratedMatchUp);
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

{#key `${scoreVersion}-${swapSides}`}
  <div class="team-scorecard" use:mountScorecard></div>
{/key}

<style>
  .team-scorecard {
    width: 100%;
    max-width: 720px;
    margin: 0 auto;
    padding: 0.5rem;
  }
</style>

import { showGameFish } from '../display/configureViz';
import { supportsGameVisualizations } from '@tennisvisuals/scoring-visualizations';
import { env, settings } from '../state/env';

export function checkMatchEnd(action?: any) {
  if (env.engine.isComplete()) {
    return true;
  } else if (action?.game?.complete && settings.display_gamefish && supportsGameVisualizations(env.engine.getFormat())) {
    showGameFish();
  }
}

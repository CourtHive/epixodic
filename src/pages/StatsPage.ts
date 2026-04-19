import { ViewPage } from './ViewPage';
import { updateStats } from '../match/updateStats';
import { touchManager } from '../events/touchManager';
import { supportsGameVisualizations } from '../display/vizSupport';
import { mountViewHeader, unmountViewHeader } from '../svelte/bridge/viewHeaderMount';
import { viewMomentum, viewGameTree, viewPointHistory, outcomeEntry } from '../events/clickActions';
import { env } from '../state/env';

export class StatsPage extends ViewPage {
  private headerInstance: Record<string, any> | null = null;

  protected activate(): void {
    touchManager.prevent_touch = false;
    this.show('statsscreen');

    const container = document.getElementById('statsscreen');
    if (container && !this.headerInstance) {
      const gameTreeSupported = supportsGameVisualizations(env.engine.getFormat());
      this.headerInstance = mountViewHeader(container, {
        title: 'Statistics',
        navItems: [
          { iconClass: 'iconmomentum', onclick: viewMomentum },
          { iconClass: 'icongametree', onclick: viewGameTree, visible: gameTreeSupported },
          { iconClass: 'iconhistory', onclick: viewPointHistory },
          { iconClass: 'iconexit', onclick: outcomeEntry },
        ],
      });
    }

    updateStats();
  }

  protected deactivate(): void {
    if (this.headerInstance) {
      const container = document.getElementById('statsscreen');
      if (container) unmountViewHeader(this.headerInstance, container);
      this.headerInstance = null;
    }
    this.hide('statsscreen');
  }

  updateVisualizations(): void {
    updateStats();
  }
}

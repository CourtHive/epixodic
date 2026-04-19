import { ViewPage } from './ViewPage';
import { displayPointHistory } from '../display/displayPointHistory';
import { touchManager } from '../events/touchManager';
import { supportsGameVisualizations } from '../display/vizSupport';
import { mountViewHeader, unmountViewHeader } from '../svelte/bridge/viewHeaderMount';
import { viewStats, viewGameTree, viewMomentum, outcomeEntry } from '../events/clickActions';
import { env } from '../state/env';

export class PointHistoryPage extends ViewPage {
  private headerInstance: Record<string, any> | null = null;

  protected activate(): void {
    touchManager.prevent_touch = false;
    displayPointHistory();
    this.show('pointhistory');

    const container = document.getElementById('pointhistory');
    if (container && !this.headerInstance) {
      const gameTreeSupported = supportsGameVisualizations(env.engine.getFormat());
      this.headerInstance = mountViewHeader(container, {
        title: 'Point History',
        navItems: [
          { iconClass: 'iconmomentum', onclick: viewMomentum },
          { iconClass: 'icongametree', onclick: viewGameTree, visible: gameTreeSupported },
          { iconClass: 'iconstats', onclick: viewStats },
          { iconClass: 'iconexit', onclick: outcomeEntry },
        ],
      });
    }
  }

  protected deactivate(): void {
    if (this.headerInstance) {
      const container = document.getElementById('pointhistory');
      if (container) unmountViewHeader(this.headerInstance, container);
      this.headerInstance = null;
    }
    this.hide('pointhistory');
  }

  updateVisualizations(): void {
    displayPointHistory();
  }
}

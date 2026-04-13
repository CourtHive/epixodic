import { ViewPage } from './ViewPage';
import { touchManager } from '../events/touchManager';
import { charts, env, getEpisodes, getNoAd, getParticipantNames } from '../state/env';
import { ensureGameTreeChart } from '../display/configureViz';
import { supportsGameVisualizations } from '../display/vizSupport';
import { mountViewHeader, unmountViewHeader } from '../svelte/bridge/viewHeaderMount';
import { viewStats, viewMomentum, viewPointHistory, outcomeEntry } from '../events/clickActions';

function gametreeOptions() {
  const [player, opponent] = getParticipantNames();
  const noAd = getNoAd();
  return {
    display: { noAd },
    labels: { Player: player, Opponent: opponent },
  };
}

export class GameTreePage extends ViewPage {
  private headerInstance: Record<string, any> | null = null;

  protected activate(): void {
    touchManager.prevent_touch = false;
    this.show('gametree');

    const page = document.getElementById('gametree');
    if (page && !this.headerInstance) {
      this.headerInstance = mountViewHeader(page, {
        title: 'Game Tree',
        navItems: [
          { iconClass: 'iconstats', onclick: viewStats },
          { iconClass: 'iconmomentum', onclick: viewMomentum },
          { iconClass: 'iconhistory', onclick: viewPointHistory },
          { iconClass: 'iconexit', onclick: outcomeEntry },
        ],
      });
    }

    const formatSupported = supportsGameVisualizations(env.engine.getFormat());
    const container = document.getElementById('gameTreeChart');
    const unsupportedMsg = document.getElementById('gametreeUnsupported');

    if (!formatSupported) {
      if (container) container.style.display = 'none';
      if (!unsupportedMsg) {
        const parent = document.getElementById('gametree');
        if (parent) {
          const msg = document.createElement('div');
          msg.id = 'gametreeUnsupported';
          msg.style.cssText = 'text-align: center; padding: 2rem; color: var(--ep-text-secondary);';
          msg.textContent = 'Game Tree is not available for this scoring format.';
          parent.appendChild(msg);
        }
      } else {
        unsupportedMsg.style.display = '';
      }
      return;
    }

    if (container) container.style.display = '';
    if (unsupportedMsg) unsupportedMsg.style.display = 'none';

    ensureGameTreeChart();

    // Defer chart update so browser completes layout after display change
    requestAnimationFrame(() => {
      if (!charts.gametree) return;
      charts.gametree.options(gametreeOptions());
      charts.gametree.data(getEpisodes()).update();
      charts.gametree.update({ sizeToFit: true });
    });
  }

  protected deactivate(): void {
    if (this.headerInstance) {
      const container = document.getElementById('gametree');
      if (container) unmountViewHeader(this.headerInstance, container);
      this.headerInstance = null;
    }
    this.hide('gametree');
  }

  updateVisualizations(): void {
    if (!supportsGameVisualizations(env.engine.getFormat())) return;
    if (!charts.gametree) return;
    charts.gametree.options(gametreeOptions());
    charts.gametree.data(getEpisodes()).update();
    charts.gametree.update({ sizeToFit: true });
  }
}

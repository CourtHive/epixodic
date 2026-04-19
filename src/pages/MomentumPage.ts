import { ViewPage } from './ViewPage';
import { touchManager } from '../events/touchManager';
import { env, charts, getEpisodes, getParticipantNames } from '../state/env';
import { supportsGameVisualizations, supportsPointsToVisualization } from '../display/vizSupport';
import { mountViewHeader, unmountViewHeader } from '../svelte/bridge/viewHeaderMount';
import { viewStats, viewGameTree, viewPointHistory, outcomeEntry } from '../events/clickActions';

export class MomentumPage extends ViewPage {
  private headerInstance: Record<string, any> | null = null;
  private activeContainerId: string | null = null;

  private getNavItems() {
    const gameTreeSupported = supportsGameVisualizations(env.engine.getFormat());
    return [
      { iconClass: 'iconstats', onclick: viewStats },
      { iconClass: 'icongametree', onclick: viewGameTree, visible: gameTreeSupported },
      { iconClass: 'iconhistory', onclick: viewPointHistory },
      { iconClass: 'iconexit', onclick: outcomeEntry },
    ];
  }

  protected activate(): void {
    touchManager.prevent_touch = false;

    const episodes = getEpisodes();
    const isLandscape = env.orientation === 'landscape';
    const ptsSupported = supportsPointsToVisualization(env.engine.getFormat());

    if (isLandscape && ptsSupported) {
      this.hide('momentum');
      this.show('pts');
      this.activeContainerId = 'pts';
      charts.pts_match.players(getParticipantNames());
      charts.pts_match.data(episodes);
      charts.pts_match.update({ sizeToFit: true });
    } else {
      this.show('momentum', 'inline');
      this.hide('pts');
      this.activeContainerId = 'momentum';
    }

    const container = document.getElementById(this.activeContainerId);
    if (container && !this.headerInstance) {
      const title = isLandscape && ptsSupported ? 'Points To Set' : 'Momentum';
      this.headerInstance = mountViewHeader(container, {
        title,
        navItems: this.getNavItems(),
      });
    }

    charts.mc.width(window.innerWidth).height(820);
    charts.mc.data(episodes).update();
  }

  protected deactivate(): void {
    if (this.headerInstance && this.activeContainerId) {
      const container = document.getElementById(this.activeContainerId);
      if (container) unmountViewHeader(this.headerInstance, container);
      this.headerInstance = null;
      this.activeContainerId = null;
    }
    this.hide('momentum');
    this.hide('pts');
  }

  updateVisualizations(): void {
    const episodes = getEpisodes();
    if (env.orientation === 'landscape' && supportsPointsToVisualization(env.engine.getFormat())) {
      charts.pts_match.players(getParticipantNames());
      charts.pts_match.data(episodes);
      charts.pts_match.update();
    }
    charts.mc.data(episodes).update();
    charts.mc.update();
  }
}

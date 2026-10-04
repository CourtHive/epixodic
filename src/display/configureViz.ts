import { supportsGameVisualizations, supportsPointsToVisualization } from './vizSupport';
import {
  gameTree,
  gameFish,
  momentumChart,
  ptsMatch,
} from '@courthive/scoring-visualizations';
import { charts, env, setOrientation, getEpisodes, getParticipantNames } from '../state/env';
import { groupGames } from '../engine/groupGames';
import { changeDisplay } from './viewManager';
import { cModal } from 'courthive-components';

import * as d3 from 'd3';

export function configureViz() {
  // set up momentum
  let pcolors: any = ['#a55194', '#6b6ecf'];
  charts.mc = momentumChart();
  charts.mc.options({
    display: {
      sizeToFit: false,
      continuous: false,
      orientation: 'vertical',
      transitionTime: 0,
      service: false,
      rally: true,
      player: false,
      grid: false,
      score: true,
    },
    colors: pcolors,
  });
  charts.mc.events({ score: { click: showGame } });
  d3.select('#momentumChart').call(charts.mc);

  // set up gameFish (D3 binding deferred to showGameFish — no DOM element at init time)
  pcolors = { players: ['#a55194', '#6b6ecf'] };
  charts.gamefish = gameFish();
  charts.gamefish.options({
    display: { sizeToFit: true },
    colors: pcolors,
  });

  // set up gametree
  charts.gametree = gameTree();
  const options = {
    display: { sizeToFit: true },
    lines: {
      points: { winners: 'green', errors: '#BA1212', unknown: '#2ed2db' },
      colors: { underlines: 'black' },
    },
    nodes: {
      colors: {
        0: pcolors.players[0],
        1: pcolors.players[1],
        neutral: '#ecf0f1',
      },
    },
    selectors: {
      enabled: true,
      selected: { 0: false, 1: false },
    },
  };
  charts.gametree.options(options);
  // Don't bind to DOM here — #gametree is hidden during init, causing negative dimensions.
  // Binding is deferred to first activation via ensureGameTreeChart().

  charts.pts_match = ptsMatch();
  charts.pts_match.options({
    margins: { top: 40, bottom: 20 },
    display: { sizeToFit: true },
  });
  const episodes = getEpisodes();
  charts.pts_match.data(episodes);
  d3.select('#PTSChart').call(charts.pts_match);
}

function showGame(d: any) {
  showGameFish(d.index);
}

export function showGameFish(index?: number) {
  if (!supportsGameVisualizations(env.engine.getFormat())) return;

  const games = groupGames();
  if (!games.length || !games[0].points?.length) return;

  let currentIndex = index ?? games.length - 1;
  if (currentIndex < 0) currentIndex = 0;
  if (currentIndex >= games.length) currentIndex = games.length - 1;

  let gameLabel: HTMLElement;

  const updateGameLabel = () => {
    if (gameLabel) gameLabel.textContent = `Game ${currentIndex + 1} of ${games.length}`;
  };

  const updateChart = (gameIndex: number) => {
    currentIndex = gameIndex;
    const game = games[gameIndex];
    if (!game?.points?.length) return;

    const gridcells = game.points[0].tiebreak ? ['0', '1', '2', '3', '4', '5', '6', '7'] : ['0', '15', '30', '40', 'G'];
    charts.gamefish.options({
      display: { reverse: env.swap_sides },
      fish: { gridcells, cellSize: 20 },
      score: game.score,
    });
    charts.gamefish.data(game.points).update();
    updateGameLabel();
  };

  const content = (elem: HTMLElement) => {
    const [p1, p2] = getParticipantNames();

    gameLabel = document.createElement('div');
    gameLabel.style.cssText = 'text-align: center; padding: 0.5rem; font-weight: bold; color: var(--chc-text-primary);';
    elem.appendChild(gameLabel);

    const players = document.createElement('div');
    players.className = 'gf_players flexrows';
    players.innerHTML =
      `<div class="gf_player flexcenter">${p1}</div>` + `<div class="gf_player flexcenter">${p2}</div>`;
    elem.appendChild(players);

    const chartWrap = document.createElement('div');
    chartWrap.className = 'gf_chart flexrows';
    chartWrap.style.minHeight = '300px';
    const chartDiv = document.createElement('div');
    chartDiv.id = 'gameFishChart';
    chartWrap.appendChild(chartDiv);
    elem.appendChild(chartWrap);

    // Defer D3 init until after cModal appends the modal to the document;
    // the content callback runs while the element tree is still detached,
    // so the chart container has no dimensions for sizeToFit.
    requestAnimationFrame(() => {
      d3.select(chartDiv).call(charts.gamefish);
      updateChart(currentIndex);
    });
  };

  const updateButtonStates = () => {
    if (prevBtn) prevBtn.disabled = currentIndex <= 0;
    if (nextBtn) nextBtn.disabled = currentIndex >= games.length - 1;
  };

  let prevBtn: HTMLButtonElement | undefined;
  let nextBtn: HTMLButtonElement | undefined;

  cModal.open({
    title: 'GameFish',
    content,
    config: { clickAway: false },
    buttons: [
      {
        label: 'Previous',
        id: 'gf-prev',
        intent: 'is-info',
        close: false,
        disabled: currentIndex <= 0,
        onClick: () => {
          if (currentIndex > 0) {
            updateChart(currentIndex - 1);
            updateButtonStates();
          }
        },
      },
      {
        label: 'Next',
        id: 'gf-next',
        intent: 'is-info',
        close: false,
        disabled: currentIndex >= games.length - 1,
        onClick: () => {
          if (currentIndex < games.length - 1) {
            updateChart(currentIndex + 1);
            updateButtonStates();
          }
        },
      },
      { label: 'Close', intent: 'is-info', close: true },
    ],
  });

  // Grab button references after modal renders
  requestAnimationFrame(() => {
    prevBtn = document.getElementById('gf-prev') as HTMLButtonElement;
    nextBtn = document.getElementById('gf-next') as HTMLButtonElement;
  });
}

let gametreeBound = false;

export function ensureGameTreeChart() {
  if (!gametreeBound && charts.gametree) {
    d3.select('#gameTreeChart').call(charts.gametree);
    gametreeBound = true;
  }
}

function isVisible(id: string): boolean {
  const el = document.getElementById(id);
  return !!el && el.offsetHeight > 0;
}

export function updateChartData() {
  if (env.loading_match) return;

  const episodes = getEpisodes();
  if (!episodes || episodes.length === 0) return;

  if (charts.gametree && gametreeBound && isVisible('gameTreeChart')) {
    charts.gametree.data(episodes);
    charts.gametree.update({});
  }

  if (charts.mc && isVisible('momentumChart')) {
    charts.mc.data(episodes);
    charts.mc.update({});
  }

  if (charts.pts_match && isVisible('PTSChart')) {
    charts.pts_match.data(episodes);
    charts.pts_match.update({});
  }
}

export function vizUpdate() {
  const direction = env.orientation == 'landscape' ? 'horizontal' : 'vertical';
  const ptsSupported = supportsPointsToVisualization(env.engine.getFormat());

  if (env.view == 'pts' && (direction == 'vertical' || !ptsSupported)) {
    changeDisplay('none', 'pts');
    changeDisplay('inline', 'momentum');
    charts.mc.width(window.innerWidth).height(820);
    charts.mc.update();
    env.view = 'momentum';
  } else if (env.view == 'momentum' && direction == 'horizontal' && ptsSupported) {
    changeDisplay('none', 'momentum');
    changeDisplay('flex', 'pts');
    const ptsEpisodes = getEpisodes();
    charts.pts_match.data(ptsEpisodes);
    charts.pts_match.update({ sizeToFit: true });
    env.view = 'pts';
  }

  if (charts.gamefish && document.getElementById('gameFishChart')) charts.gamefish.update();

  const [player, opponent] = getParticipantNames();

  if (charts.gametree && gametreeBound) {
    charts.gametree.options({
      labels: { Player: player, Opponent: opponent },
    });
    charts.gametree.update({ sizeToFit: true });
  }
}

export function orientationEvent() {
  setOrientation();
  vizUpdate();
  const router = (globalThis as any).appRouter;
  if (router) router.refreshCurrentView();
}

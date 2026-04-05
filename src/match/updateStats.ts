import { simpleChart, computeMatchStatsFromMatchUp } from '@tennisvisuals/scoring-visualizations';
import { getCurrentMatchUpId } from '../state/matchContext';
import { matchPath } from '../router/routes';
import { env, options } from '../state/env';
import { WINNER_RESULTS, FOREHAND, BACKHAND } from '../utils/constants';

// Convert StatObject[] from computeMatchStatsFromMatchUp to the legacy display format
function convertStatsToLegacyFormat(statObjects: any[]): any[] {
  return statObjects.map((stat: any) => {
    const [n0, n1] = stat.numerator;
    const hasDenom = stat.denominator && (stat.denominator[0] > 0 || stat.denominator[1] > 0);
    const hasPct = stat.pct && (stat.pct[0] > 0 || stat.pct[1] > 0);

    let display0: string, display1: string;
    let value0: number, value1: number;

    if (hasPct) {
      display0 = `${stat.pct[0]}% (${n0}/${stat.denominator[0]})`;
      display1 = `${stat.pct[1]}% (${n1}/${stat.denominator[1]})`;
      value0 = stat.pct[0];
      value1 = stat.pct[1];
    } else if (hasDenom) {
      display0 = `${n0}/${stat.denominator[0]}`;
      display1 = `${n1}/${stat.denominator[1]}`;
      value0 = n0;
      value1 = n1;
    } else {
      display0 = String(n0);
      display1 = String(n1);
      value0 = n0;
      value1 = n1;
    }

    return {
      category: stat.name,
      teams: [
        { display: display0, value: value0, numerators: hasDenom ? [stat.name] : undefined },
        { display: display1, value: value1, numerators: hasDenom ? [stat.name] : undefined },
      ],
    };
  });
}

// Derive hand/stroke counters from engine history points
function deriveCounters(setFilter?: number): { teams: any[] } {
  const points = env.engine.getState().history?.points || [];
  const teams: any[] = [{}, {}];

  points.forEach((point: any) => {
    if (setFilter !== undefined && point.set !== setFilter) return;
    if (!point.hand) return;

    const hand = point.hand; // 'Forehand' or 'Backhand'
    // Determine which team this finishing shot belongs to
    // For winners/aces, it's the winner; for errors, it's the loser (1 - winner)
    const isWinnerShot = WINNER_RESULTS.includes(point.result);
    const shotBy = isWinnerShot ? point.winner : 1 - point.winner;

    if (!teams[shotBy][hand]) teams[shotBy][hand] = [];
    teams[shotBy][hand].push({ point });
  });

  return { teams };
}

const stripModifiers = (text: string) => text.match(/\w/g)?.join('');

const ERROR_STATS: string[] = ['Double Faults', 'Unforced Errors', 'Forced Errors'];

function normalizeStatValue(side: any): { value: number; display: string } {
  let value = side.value;
  let display = side.display;
  if (Number.isNaN(value) || value === null || value === undefined) {
    return { value: 0, display: '0' };
  }
  if (typeof value === 'string') {
    value = Number.parseFloat(value) || 0;
  }
  return { value, display };
}

function highlightDisplay(leftVal: number, rightVal: number, leftDisplay: string, rightDisplay: string, statName: string) {
  if (!options.highlight_better_stats || leftVal === rightVal) return { leftDisplay, rightDisplay };

  const lowerIsBetter = ERROR_STATS.includes(statName);
  const leftBetter = lowerIsBetter ? leftVal < rightVal : leftVal > rightVal;
  const rightBetter = lowerIsBetter ? rightVal < leftVal : rightVal > leftVal;

  return {
    leftDisplay: leftBetter ? `<b class="toggleChart">${leftDisplay}</b>` : leftDisplay,
    rightDisplay: rightBetter ? `<b class="toggleChart">${rightDisplay}</b>` : rightDisplay,
  };
}

function buildStatRowHtml(stat: any, charts: any[]): string {
  const team_stats = stat.teams || stat.team_stats;
  if (!team_stats || team_stats.length < 2) return '';

  const [first, second] = env.swap_sides ? [team_stats[1], team_stats[0]] : team_stats;

  const value: number = [0]
    .concat(...[first, second].map((side: any) => (side.value ? side.value : [])))
    .reduce((a: number, b: number) => a + b, 0);

  const statName = stat.category || stat.name;
  const id = stripModifiers(statName.toLowerCase().split(' ').join('_'));

  const leftNorm = normalizeStatValue(first);
  const rightNorm = normalizeStatValue(second);
  first.value = leftNorm.value;
  second.value = rightNorm.value;

  const numerators = [first, second]
    .flatMap((v: any) => (v.numerators ? v.numerators : []))
    .filter((item, i, s) => s.lastIndexOf(item) == i)
    .join(',');
  const statclass = numerators && value && statName != 'Aggressive Margin' ? 'statname_chart' : 'statname';

  const highlighted = highlightDisplay(first.value, second.value, leftNorm.display, rightNorm.display, statName);

  let html =
    `<div class='statrow' id="${id}">` +
    `<div class='toggleChart statleft'>${highlighted.leftDisplay}</div>` +
    `<div class='toggleChart ${statclass}'>${statName}</div><div class='toggleChart statright'>${highlighted.rightDisplay}</div>` +
    `</div>`;

  if (numerators && value && statName != 'Aggressive Margin') {
    charts.push({ target: `${id}_chart`, numerators });
    html += `<div class='statrow' id="${id}_chart" style='display:none' onclick="showChartSource('${numerators}')"></div>`;
  }
  return html;
}

function getUniqueValues(counters: any[], hand: string, field: string): string[] {
  return Object.keys(counters)
    .flatMap((key) =>
      counters[key][hand]
        ? counters[key][hand].map((episode: any) => episode.point[field]).filter(Boolean)
        : [],
    )
    .filter((item, i, s) => s.lastIndexOf(item) == i);
}

function filterByResult(episodes: any[] | undefined, result: string, stroke?: string): any[] {
  if (!episodes) return [];
  if (stroke) return episodes.filter((f: any) => f.point.result == result && f.point.stroke == stroke);
  return episodes.filter((f: any) => f.point.result == result);
}

function buildFinishingShotsHtml(counters: any[]): string {
  const hasData =
    counters?.[0] && counters[1] &&
    (counters[0][BACKHAND] || counters[0][FOREHAND] || counters[1][BACKHAND] || counters[1][FOREHAND]);
  if (!hasData) return '';

  const left = env.swap_sides ? 1 : 0;
  const right = env.swap_sides ? 0 : 1;
  let html = `<div class='statsection flexcenter'>Finishing Shots - Strokes</div>`;

  for (const hand of [FOREHAND, BACKHAND]) {
    if (!counters[0][hand] && !counters[1][hand]) continue;

    const left_display = counters[left][hand] ? counters[left][hand].length : 0;
    const right_display = counters[right][hand] ? counters[right][hand].length : 0;
    html +=
      `<div class='statrow'><div class='statleft'><b>${left_display}</b></div>` +
      `<div class='statname'><b>Total ${hand} Shots</b></div><div class='statright'><b>${right_display}</b></div></div>`;

    const results = getUniqueValues(counters, hand, 'result');
    for (const result of results) {
      html += buildResultRow(counters, hand, result, left, right);
    }
  }
  return html;
}

function buildResultRow(counters: any[], hand: string, result: string, left: number, right: number): string {
  let html = '';
  const left_results = filterByResult(counters[left][hand], result);
  const right_results = filterByResult(counters[right][hand], result);
  if (left_results.length || right_results.length) {
    html +=
      `<div class='statrow'><div class='statleft'>${left_results.length}</div>` +
      `<div class='statname'>${hand} ${result}s</div><div class='statright'>${right_results.length}</div></div>`;
  }
  const strokes = getUniqueValues(counters, hand, 'stroke');
  for (const stroke of strokes) {
    const leftStroke = filterByResult(counters[left][hand], result, stroke);
    const rightStroke = filterByResult(counters[right][hand], result, stroke);
    if (leftStroke.length || rightStroke.length) {
      html +=
        `<div class='statrow'><div class='statleft'>${leftStroke.length}</div>` +
        `<div class='statname'><i>${hand} ${stroke} ${result}s</i></div><div class='statright'>${rightStroke.length}</div></div>`;
    }
  }
  return html;
}

export function updateStats(element?: Element) {
  const setNumber = element ? element.getAttribute('setNumber') : undefined;
  const set_filter = setNumber ? Number.parseInt(setNumber) : undefined;
  const charts: any[] = [];
  const sets = (env.engine.getState().score?.sets || []).length;
  const matchActive = set_filter === undefined ? ' s_set_active' : '';
  let statselectors = `<div class='updateStats s_set${matchActive}'>Match</div>`;

  const rawStats = computeMatchStatsFromMatchUp(env.engine.getState(), set_filter);
  const stats = convertStatsToLegacyFormat(rawStats);

  if (!stats?.length || !Array.isArray(stats)) {
    const router = (globalThis as any).appRouter;
    router?.navigate(matchPath(getCurrentMatchUpId(), 'scoring'));
    return;
  }

  if (sets > 1) {
    for (let s = 0; s < sets; s++) {
      const active = set_filter === s ? ' s_set_active' : '';
      statselectors += `<div class='updateStats s_set${active}' setNumber="${s}">Set ${s + 1}</div>`;
    }
  }
  const statView = document.querySelector('#statview');
  if (statView) statView.innerHTML = statselectors;

  let html = '';
  stats.forEach((stat: any) => {
    html += buildStatRowHtml(stat, charts);
  });

  html += buildFinishingShotsHtml(deriveCounters(set_filter).teams);

  const statLines = document.querySelector('#statlines');
  if (statLines) statLines.innerHTML = html;
  addCharts(charts);
}

function addCharts(charts: any[]) {
  const counters = deriveCounters();

  const stripModifiers = (text: string) => text.match(/[A-Za-z0-9]/g)?.join('');
  if (!counters) return;
  charts.forEach((chart) => {
    const player_points: any = [];
    Object.keys(counters.teams).forEach((key) => {
      const team = counters.teams[key];
      const numerators = chart.numerators.split(',').map((numerator: any) => stripModifiers(numerator));
      const episodes = numerators.flatMap((numerator: any) => team[numerator]);

      const points = episodes
        .map((episode: any) => {
          if (!episode) return undefined;
          return episode.point ? episode.point : episode;
        })
        .filter(Boolean)
        .sort((a, b) => a.index - b.index);
      player_points.push(points.map((point) => point.index));
    });
    simpleChart(chart.target, player_points);
  });
}

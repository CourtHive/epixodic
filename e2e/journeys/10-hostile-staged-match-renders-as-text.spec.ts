import { buildMatchData } from '../../src/svelte/services/stageMatchUp';
import type { HydratedMatchUp } from '../../src/svelte/types';
import { test, expect, type Page } from '@playwright/test';
import { waitForApp } from '../helpers/app-bridge';

/**
 * Hostile tournament data renders as text through the classic scorer
 * (Mentat/assessment/2026-10-17-epixodic-public-xss-assessment.md, E1 and E2).
 *
 * A tournament matchUp is staged exactly as MatchUpList stages it (buildMatchData, then
 * browserStorage.set(matchUpId, JSON), which is localStorage keyed by the matchUpId) with person
 * names and stored point decorations that each carry an <img onerror> payload tagged by field.
 * The scorer is then opened on its real route and driven through scoring, undo, swap sides,
 * point history, statistics and a reload.
 *
 * Two observations are taken after every step: the parsed `img[class^="xss-"]` elements and
 * the `globalThis.__xss` list the payload's onerror appends to. Both must be empty in every view.
 * A second check proves the run is not vacuous: every field reaches its sink, as literal text.
 * The edit-point dialog is a second test, pinned as a known failure (see its comment).
 */

const MATCHUP_ID = 'journey-10-hostile-staged';

const payload = (field: string) =>
  `<img src=x class="xss-${field}" onerror="globalThis.__xss=(globalThis.__xss||[]).concat('${field}')">`;

/** The fields each view renders, so the literal-text guard knows what it must find there. */
const NAME_FIELDS = ['givenName', 'familyName'];
const HISTORY_FIELDS = [...NAME_FIELDS, 'result', 'rallyLength'];
const STATS_FIELDS = ['result', 'stroke'];

const hostileMatchUp: HydratedMatchUp = {
  matchUpId: MATCHUP_ID,
  matchUpFormat: 'SET3-S:6/TB7',
  matchUpType: 'SINGLES',
  tournamentId: 'journey-10-tournament',
  drawId: 'journey-10-draw',
  sides: [
    {
      sideNumber: 1,
      participantId: 'journey-10-p1',
      participant: {
        participantId: 'journey-10-p1',
        participantName: payload('participantName'),
        participantType: 'INDIVIDUAL',
        person: { standardGivenName: payload('givenName'), standardFamilyName: payload('familyName') },
      },
    },
    {
      sideNumber: 2,
      participantId: 'journey-10-p2',
      participant: {
        participantId: 'journey-10-p2',
        participantName: 'Ada Lovelace',
        participantType: 'INDIVIDUAL',
        person: { standardGivenName: 'Ada', standardFamilyName: 'Lovelace' },
      },
    },
  ],
  // Stored points, read back by loadMatch (loadTODSData → loadPoints), whose decorations are
  // carried into the engine unfiltered. A Forehand point puts its result and stroke into the
  // finishing-shot statistics. The second point carries a hostile hand: the engine keeps it, but
  // the history is built from episodes, which do not carry `hand`, so it is observed for leaks and
  // not required as literal text.
  score: {
    points: [
      {
        winner: 0,
        result: payload('result'),
        hand: 'Forehand',
        stroke: payload('stroke'),
        rallyLength: payload('rallyLength'),
      },
      { winner: 1, result: 'Unforced Error', hand: payload('hand') },
    ],
  },
};

type Observation = { parsed: string[]; executed: string[] };

/** Parsed payload elements in the document, and the onerror markers fired since the last read. */
async function observe(page: Page): Promise<Observation> {
  // An <img src=x> fires onerror once its load fails; wait for every parsed one to settle so a
  // marker that is about to fire is not missed.
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll<HTMLImageElement>('img[class^="xss-"]')).every((img) => img.complete),
  );
  return page.evaluate(() => {
    const parsed = Array.from(document.querySelectorAll('img[class^="xss-"]')).map((img) => img.className);
    const executed: string[] = (globalThis as any).__xss ?? [];
    (globalThis as any).__xss = [];
    return { parsed, executed };
  });
}

/** The text of the visible elements matching a selector, joined. */
async function visibleText(page: Page, selector: string): Promise<string> {
  const texts = await page.locator(`${selector}:visible`).allTextContents();
  return texts.join('\n');
}

async function openRoute(page: Page, view: string) {
  await page.goto(`/#/match/${MATCHUP_ID}/${view}`);
  await waitForApp(page);
}

/** Stage the matchUp the way MatchUpList.saveMatchData does, then open the classic scorer. */
async function stageAndOpenScorer(page: Page) {
  await page.goto('/#/archive');
  await waitForApp(page);
  const staged = buildMatchData(hostileMatchUp);
  expect(staged.ok).toBe(true);
  const matchData = staged.ok ? staged.matchData : undefined;
  await page.evaluate(
    ({ id, json }) => {
      localStorage.clear();
      localStorage.setItem(id, json);
    },
    { id: MATCHUP_ID, json: JSON.stringify(matchData) },
  );

  // The classic scorer, opened on the route MatchUpList navigates to on a phone.
  await openRoute(page, 'scoring');
  await expect(page.locator('.display_player_0:visible').first()).toBeVisible();
}

/** Records, per view, what leaked and what text was shown. */
function recorder(page: Page) {
  const leaks: Record<string, Observation> = {};
  const literals: Record<string, string> = {};
  const record = async (view: string, textSelector: string) => {
    const observation = await observe(page);
    if (observation.parsed.length || observation.executed.length) leaks[view] = observation;
    literals[view] = await visibleText(page, textSelector);
  };
  return { leaks, literals, record };
}

/** The fields of each view that are not shown as literal text. */
function missingLiterals(literals: Record<string, string>, expected: Record<string, string[]>) {
  return Object.fromEntries(
    Object.entries(expected)
      .map(([view, fields]) => [view, fields.filter((field) => !literals[view]?.includes(`class="xss-${field}"`))])
      .filter(([, fields]) => fields.length),
  );
}

test.describe('Journey 10 — hostile staged tournament data renders as text', () => {
  test('names and stored point decorations are text in scoring, history, stats and after reload', async ({ page }) => {
    const { leaks, literals, record } = recorder(page);

    await stageAndOpenScorer(page);
    await record('scoring (opened)', '.display_player_0, .display_player_1');

    // Score through the UI, undo one, score again.
    const pointLeft = page.locator('.display_points_0:visible').first();
    const pointRight = page.locator('.display_points_1:visible').first();
    await pointLeft.click();
    await pointRight.click();
    await page.locator('.undoAction:visible').first().click();
    await pointLeft.click();
    await record('scoring (points + undo)', '.display_player_0, .display_player_1');

    // Swap sides: the names are rewritten into the opposite elements.
    await page.locator('.swapAction:visible').first().click();
    await record('scoring (swapped)', '.display_player_0, .display_player_1');

    // Point history, through its control in the scorer.
    await page.locator('.viewPointHistory:visible').first().click();
    await expect(page.locator('#ph_frame .ph_episode').first()).toBeVisible();
    await record('history', '#ph_frame');

    // Statistics, through its control in the history header.
    await page.locator('#pointhistory .iconstats:visible').first().click();
    await expect(page.locator('#statlines .statrow').first()).toBeVisible();
    await record('stats', '#statlines, #playerone, #playertwo');

    // Reload on the statistics route: the match is rebuilt from what the scorer saved.
    await page.reload();
    await waitForApp(page);
    await expect(page.locator('#statlines .statrow').first()).toBeVisible();
    await record('stats (reloaded)', '#statlines, #playerone, #playertwo');

    await openRoute(page, 'history');
    await expect(page.locator('#ph_frame .ph_episode').first()).toBeVisible();
    await record('history (reloaded)', '#ph_frame');

    await openRoute(page, 'scoring');
    await expect(page.locator('.display_player_0:visible').first()).toBeVisible();
    await record('scoring (reloaded)', '.display_player_0, .display_player_1');

    // 1. Nothing was parsed and nothing executed, in any view. A failure names view and field.
    expect(leaks, 'hostile fields parsed as HTML or executed, by view').toEqual({});

    // 2. Not vacuous: every field reached its view, shown literally.
    const missing = missingLiterals(literals, {
      'scoring (opened)': NAME_FIELDS,
      'scoring (points + undo)': NAME_FIELDS,
      'scoring (swapped)': NAME_FIELDS,
      history: HISTORY_FIELDS,
      stats: STATS_FIELDS,
      'stats (reloaded)': STATS_FIELDS,
      'history (reloaded)': HISTORY_FIELDS,
      'scoring (reloaded)': NAME_FIELDS,
    });
    expect(missing, 'fields not shown literally, by view').toEqual({});
  });

  // The edit-point dialog (src/match/editPoint.ts, playerOptions) labels its Winner and Player <select>
  // options with participant names, and courthive-components' renderOptions writes option labels with
  // innerHTML (labels are HTML by contract there). Found by this journey after #405: both hostile names
  // were parsed and ran. editPoint escapes them now.
  test('the edit-point dialog shows names as text', async ({ page }) => {
    const { leaks, literals, record } = recorder(page);

    await stageAndOpenScorer(page);
    await openRoute(page, 'history');
    await expect(page.locator('#ph_frame .ph_episode').first()).toBeVisible();
    await observe(page);

    // Correction: open the edit-point dialog for a stored point.
    await page.locator('#ph_frame .ph_episode .viewEditPoint.ph_result').first().click();
    const dialog = page.locator('.chc-modal-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('select option').first()).toBeAttached();
    await record('edit point', '.chc-modal-dialog select');

    expect(leaks, 'hostile fields parsed as HTML or executed, by view').toEqual({});
    expect(missingLiterals(literals, { 'edit point': NAME_FIELDS }), 'fields not shown literally').toEqual({});
  });
});

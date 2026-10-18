// @vitest-environment happy-dom
import { expectRenderedAsText, resetXssProbe, XSS_PAYLOAD } from '../../__tests__/helpers/xssProbe';
import { env, resetEngine, updateParticipant, updatePositions } from '../env';
import { beforeEach, describe, expect, it } from 'vitest';
import { firstAndLast } from '../../utils/utilities';

// E1 of Mentat/assessment/2026-10-17-epixodic-public-xss-assessment.md: the classic scorer wrote
// player names (built from stored person given/family names) into the page with innerHTML.
describe('updatePositions renders player names as text', () => {
  beforeEach(() => {
    resetXssProbe();
    globalThis.localStorage?.clear();
    resetEngine('SET3-S:6/TB7');
    env.swap_sides = false;
    document.body.innerHTML = `
      <div id="playerone"></div><div id="playertwo"></div>
      <div class="display_player_0"></div><div class="display_player_0"></div>
      <div class="display_player_1"></div>`;
    updateParticipant({ sideNumber: 1, person: { standardGivenName: XSS_PAYLOAD, standardFamilyName: 'Smith' } });
    updateParticipant({ sideNumber: 2, person: { standardGivenName: 'Ann', standardFamilyName: XSS_PAYLOAD } });
  });

  it('shows hostile given and family names literally in every name element', () => {
    updatePositions();
    const side1 = `${XSS_PAYLOAD} Smith`;
    const side2 = `Ann ${XSS_PAYLOAD}`;
    expectRenderedAsText(document.getElementById('playerone'), firstAndLast(side1));
    expectRenderedAsText(document.getElementById('playertwo'), firstAndLast(side2));
    for (const el of Array.from(document.querySelectorAll('.display_player_0'))) expectRenderedAsText(el, side1);
    expectRenderedAsText(document.querySelector('.display_player_1'), side2);
    expectRenderedAsText(document.body, XSS_PAYLOAD);
  });

  it('keeps the names safe after the sides swap', () => {
    env.swap_sides = true;
    updatePositions();
    expectRenderedAsText(document.querySelector('.display_player_0'), `Ann ${XSS_PAYLOAD}`);
    expectRenderedAsText(document.querySelector('.display_player_1'), `${XSS_PAYLOAD} Smith`);
  });

  it('stores names raw, not pre-escaped', () => {
    updatePositions();
    expect(env.metadata.players[0].participantName).toBe(`${XSS_PAYLOAD} Smith`);
    expect(env.metadata.players[0].person.standardGivenName).toBe(XSS_PAYLOAD);
  });
});

// @vitest-environment happy-dom
import { expectRenderedAsText, resetXssProbe, XSS_PAYLOAD } from '../../__tests__/helpers/xssProbe';
import { env, resetEngine, updateParticipant } from '../../state/env';
import { beforeEach, describe, expect, it } from 'vitest';
import { updateStats } from '../updateStats';

// E2 of Mentat/assessment/2026-10-17-epixodic-public-xss-assessment.md: the finishing-shot section
// interpolated result and stroke labels taken from point history into an HTML string.
function playGame(decoration: Record<string, string>) {
  for (let i = 0; i < 4; i++) env.engine.addPoint({ winner: 0, ...decoration });
}

describe('updateStats renders finishing-shot labels as text', () => {
  beforeEach(() => {
    resetXssProbe();
    resetEngine('SET3-S:6/TB7');
    document.body.innerHTML = '<div id="statview"></div><div id="statlines"></div>';
    updateParticipant({ sideNumber: 1, person: { standardGivenName: 'Ann', standardFamilyName: 'Lee' } });
    updateParticipant({ sideNumber: 2, person: { standardGivenName: 'Bo', standardFamilyName: 'Ray' } });
  });

  it('shows a hostile result literally', () => {
    playGame({ result: XSS_PAYLOAD, hand: 'Forehand' });
    updateStats();
    expectRenderedAsText(document.getElementById('statlines'));
  });

  it('shows a hostile stroke literally', () => {
    playGame({ result: 'Winner', hand: 'Forehand', stroke: XSS_PAYLOAD });
    updateStats();
    expectRenderedAsText(document.getElementById('statlines'));
  });

  it('keeps the finishing-shot section markup for ordinary labels', () => {
    playGame({ result: 'Winner', hand: 'Backhand', stroke: 'Volley' });
    updateStats();
    const lines = document.getElementById('statlines');
    expect(lines?.textContent).toContain('Finishing Shots - Strokes');
    expect(lines?.textContent).toContain('Backhand Volley Winners');
    expect(lines?.querySelector('.statname i')).toBeTruthy();
  });
});

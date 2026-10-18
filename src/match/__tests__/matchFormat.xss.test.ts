// @vitest-environment happy-dom
import { expectRenderedAsText, resetXssProbe, XSS_PAYLOAD } from '../../__tests__/helpers/xssProbe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { openMock } = vi.hoisted(() => ({ openMock: vi.fn() }));

// The real renderForm is kept: its contract is that a text item is assigned as HTML.
vi.mock('courthive-components', async (importOriginal) => ({
  ...(await importOriginal<any>()),
  cModal: { open: openMock, close: vi.fn() },
}));

import { editMatchDetails } from '../../display/displayUpdate';
import { browserStorage } from '../../state/browserStorage';
import { env, resetEngine } from '../../state/env';
import { loadMatch } from '../loadMatch';

// E4 of Mentat/assessment/2026-10-17-epixodic-public-xss-assessment.md: a legacy format name and a
// raw format code reached the page as HTML.
describe('match format text is rendered as text', () => {
  beforeEach(() => {
    resetXssProbe();
    openMock.mockReset();
    globalThis.localStorage?.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loadMatch shows a hostile legacy format name literally in md_format', () => {
    document.body.innerHTML = '<div id="md_format"></div>';
    const matchId = 'legacy-xss';
    browserStorage.set(
      matchId,
      JSON.stringify({
        muid: matchId,
        format: { code: 'SET3-S:6/TB7', name: XSS_PAYLOAD },
        players: [{ name: 'Ann Lee' }, { name: 'Bo Ray' }],
      }),
    );
    expect(loadMatch(matchId)).toBe(true);
    expectRenderedAsText(document.getElementById('md_format'));
  });

  it('editMatchDetails shows an unrecognised format code literally', () => {
    resetEngine('SET3-S:6/TB7');
    vi.spyOn(env.engine, 'getFormat').mockReturnValue(XSS_PAYLOAD);
    editMatchDetails();
    expect(openMock).toHaveBeenCalledTimes(1);
    const elem = document.createElement('div');
    openMock.mock.calls[0][0].content(elem);
    expectRenderedAsText(elem);
  });
});

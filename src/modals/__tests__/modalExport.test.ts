// @vitest-environment happy-dom
import { expectRenderedAsText, resetXssProbe, XSS_PAYLOAD } from '../../__tests__/helpers/xssProbe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { openMock } = vi.hoisted(() => ({ openMock: vi.fn() }));

vi.mock('courthive-components', async (importOriginal) => ({
  ...(await importOriginal<any>()),
  cModal: { open: openMock, close: vi.fn() },
}));

import { browserStorage } from '../../state/browserStorage';
import { modalExport } from '../modalExport';

// E4 of Mentat/assessment/2026-10-17-epixodic-public-xss-assessment.md: the match id and the stored
// JSON were interpolated into quoted attributes, so ordinary JSON truncated the clipboard text to "{".
describe('modalExport sets its data attributes through the DOM', () => {
  beforeEach(() => {
    resetXssProbe();
    openMock.mockReset();
    globalThis.localStorage?.clear();
  });

  it('carries the whole stored JSON and a hostile match id as attribute values', () => {
    const matchId = `m1" ${XSS_PAYLOAD}`;
    const json = JSON.stringify({ matchUpId: 'm1', note: `"quoted" ${XSS_PAYLOAD}` });
    browserStorage.set(matchId, json);
    modalExport(matchId);
    expect(openMock).toHaveBeenCalledTimes(1);
    const elem = document.createElement('div');
    openMock.mock.calls[0][0].content(elem);

    const button = elem.querySelector<HTMLElement>('#copy2clipboard');
    expect(button?.dataset.clipboardText).toBe(json);
    const exportTargets = elem.querySelectorAll('.exportMatch');
    expect(exportTargets).toHaveLength(2);
    for (const target of Array.from(exportTargets)) expect(target.getAttribute('matchId')).toBe(matchId);
    expect(elem.querySelectorAll('img')).toHaveLength(0);
    expect(elem.textContent).toContain('Export Options');
  });

  it('renders no stored value as markup', () => {
    browserStorage.set('m2', XSS_PAYLOAD);
    modalExport('m2');
    const elem = document.createElement('div');
    openMock.mock.calls[0][0].content(elem);
    expect(elem.querySelector<HTMLElement>('#copy2clipboard')?.dataset.clipboardText).toBe(XSS_PAYLOAD);
    expectRenderedAsText(elem, 'Supported by your device');
  });
});

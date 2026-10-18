import { expect } from 'vitest';

// A record value that is markup. Rendered as text it is visible literally; parsed as HTML it becomes
// an <img> element whose onerror would run. The probe class lets a test find a parsed element.
export const XSS_PAYLOAD = '<img src=x onerror="globalThis.__xss=(globalThis.__xss||0)+1" class="xss-probe">';

export function resetXssProbe() {
  delete (globalThis as any).__xss;
}

/** The payload is shown as literal text and no element was parsed from it. */
export function expectRenderedAsText(container: Element | null, text = XSS_PAYLOAD) {
  expect(container).toBeTruthy();
  expect(container?.querySelectorAll('img')).toHaveLength(0);
  expect(container?.querySelectorAll('.xss-probe')).toHaveLength(0);
  expect(container?.textContent).toContain(text);
  expect((globalThis as any).__xss).toBeUndefined();
}

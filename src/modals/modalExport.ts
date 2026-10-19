import { browserStorage } from '../state/browserStorage';
import { cModal } from 'courthive-components';
import { device } from '../state/env';

// The match id and the stored match JSON are data: they are set as attributes through the DOM, never
// interpolated into an HTML string, where a quote in the JSON would end the attribute.
export function buildExportContent(elem: HTMLElement, match_id: string, match_data: string) {
  const spacer = document.createElement('p');
  spacer.textContent = ' ';
  const heading = document.createElement('h1');
  heading.textContent = 'Export Options';
  const supported = document.createElement('p');
  supported.textContent = 'Supported by your device';

  const row = document.createElement('div');
  row.className = 'flexrows flexcenter';

  if (!device.isIDevice) {
    const exportWrap = document.createElement('div');
    exportWrap.className = 'exportMatch flexcenter';
    exportWrap.setAttribute('matchId', match_id);
    const exportIcon = document.createElement('div');
    exportIcon.className = 'exportMatch export_action action_icon iconsave';
    exportIcon.setAttribute('matchId', match_id);
    exportWrap.appendChild(exportIcon);
    row.appendChild(exportWrap);
  }

  const clipWrap = document.createElement('div');
  clipWrap.className = 'flexcenter';
  const button = document.createElement('button');
  button.id = 'copy2clipboard';
  button.className = 'flexcenter c2c';
  button.dataset.clipboardText = match_data;
  const clipIcon = document.createElement('div');
  clipIcon.className = 'export_action action_icon iconclipboard';
  button.appendChild(clipIcon);
  clipWrap.appendChild(button);
  row.appendChild(clipWrap);

  elem.replaceChildren(spacer, heading, supported, row);
}

export function modalExport(matchId?: string) {
  const match_id = matchId || browserStorage.get('current_match') || '';
  Array.from(document.querySelectorAll('.mh_export')).forEach((selector: any) => (selector.style.display = 'none'));
  const match_data = browserStorage.get(match_id) || '';

  cModal.open({
    title: 'Export',
    content: (elem: HTMLElement) => buildExportContent(elem, match_id, match_data),
    config: { clickAway: false },
    buttons: [{ label: 'Close', intent: 'is-info', close: true }],
  });
}

/**
 * Opens the vertical scoring interface inside a modal for desktop use.
 * Uses an iframe to create a contained viewport so the skin's vh/vw CSS
 * resolves correctly at mobile dimensions.
 */
import { cModal } from 'courthive-components';
import { loadMatch } from '../match/loadMatch';

const MODAL_W = 375;
const MODAL_H = 667;

function refreshArchive() {
  globalThis.dispatchEvent(new CustomEvent('matcharchive:updated'));
}

export function openScoringModal(matchUpId: string): void {
  const success = loadMatch(matchUpId);
  if (!success) {
    console.error('[scoringModal] failed to load match:', matchUpId);
    return;
  }

  function onIframeMessage(event: MessageEvent) {
    if (event.data?.type === 'scoring-modal:close') {
      cModal.close();
    }
  }

  globalThis.addEventListener('message', onIframeMessage);

  const content = (elem: HTMLElement) => {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = `width: ${MODAL_W}px; height: ${MODAL_H}px; border: none; border-radius: 8px;`;
    iframe.src = `${globalThis.location.origin}${globalThis.location.pathname}#/match/${matchUpId}/scoring?forcePortrait=1`;
    elem.appendChild(iframe);
  };

  cModal.open({
    title: '',
    content,
    config: { clickAway: true, maxWidth: MODAL_W + 48 },
    buttons: [],
    onClose: () => {
      globalThis.removeEventListener('message', onIframeMessage);
      refreshArchive();
    },
  });
}

import { stateChangeEvent } from '../display/displayUpdate';
import { checkMatchEnd } from '../engine/checkMatchEnd';
import { clearDismissCallback, strokeSlider } from './strokeSlider';
import { env, getEpisodes } from '../state/env';

/**
 * Handles taps on fault type buttons in the fault drawer.
 * Buttons have either a `faultType` attribute (2nd fault / direct double fault)
 * or a `firstFaultType` attribute (1st fault section in combined drawer).
 * Tapping a 1st fault button highlights it and waits; tapping a 2nd fault
 * button (or the same section again) closes the drawer and saves.
 */
export function faultAction(element: any) {
  const faultType: string = element.getAttribute('faultType');
  const firstFaultType: string = element.getAttribute('firstFaultType');

  if (!faultType && !firstFaultType) return;

  const points = env.engine.getState().history?.points || [];
  const lastPoint = points.length > 0 ? points[points.length - 1] : undefined;

  if (firstFaultType) {
    // 1st fault section tap — store on env, highlight selection, stay open
    env.firstFaultType = firstFaultType;
    highlightSelection(element);
    return;
  }

  // 2nd fault / direct fault tap — decorate point and close
  if (lastPoint && faultType) {
    lastPoint.faultType = faultType;
    if (env.firstFaultType) {
      lastPoint.first_serve = lastPoint.first_serve || {};
      lastPoint.first_serve.faultType = env.firstFaultType;
      env.firstFaultType = undefined;
    }
  }

  clearDismissCallback();
  strokeSlider();
  stateChangeEvent();

  const episodes = getEpisodes();
  const lastAction = episodes[episodes.length - 1];
  checkMatchEnd(lastAction);
}

function highlightSelection(selected: HTMLElement) {
  const parent = selected.parentElement;
  if (!parent) return;
  // Clear siblings with same attribute, highlight selected
  const attr = selected.hasAttribute('firstFaultType') ? 'firstFaultType' : 'faultType';
  parent.querySelectorAll(`[${attr}]`).forEach((el: Element) => {
    (el as HTMLElement).classList.remove('fault-option--selected');
  });
  selected.classList.add('fault-option--selected');
}

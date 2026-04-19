import { getProfile, resultToContext } from '../decorations';
import type { StrokeContext } from '../decorations';
import { env, settings } from '../state/env';
import { FOREHAND, BACKHAND, FAULT_TYPES } from '../utils/constants';

let lastContext: StrokeContext | undefined;
let lastProfileId: string | undefined;
let lastWasFault = false;
let overlay: HTMLElement | null = null;
let onDismissCallback: (() => void) | undefined;

function showOverlay(): void {
  if (overlay) return;
  const createdAt = Date.now();
  overlay = document.createElement('div');
  overlay.id = 'stroke_slider_overlay';
  overlay.addEventListener('click', (evt: MouseEvent) => {
    // Don't dismiss when clicking inside the stroke slider
    const slider = document.getElementById('stroke_slider');
    if (slider && slider.contains(evt.target as Node)) return;
    // Ignore the ghost click synthesized ~300ms after the touchstart that opened the slider
    if (Date.now() - createdAt < 400) return;
    const cb = onDismissCallback;
    onDismissCallback = undefined;
    strokeSlider();
    cb?.();
  });
  document.body.appendChild(overlay);
}

function removeOverlay(): void {
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
}

function buildSliderContent(context?: StrokeContext): void {
  const container = document.querySelector('#stroke_slider .strokes');
  if (!container) return;

  const profileId = settings.decoration_profile || 'standard';
  const profile = getProfile(profileId);
  if (!profile) return;

  // Skip rebuild if context and profile haven't changed
  if (context === lastContext && profileId === lastProfileId && !lastWasFault) return;
  lastContext = context;
  lastProfileId = profileId;
  lastWasFault = false;

  container.innerHTML = '';

  // Column headers
  const header = document.createElement('div');
  header.className = 'stroke-header';
  header.innerHTML = '<span class="stroke-header-label">FH</span><span class="stroke-header-label">BH</span>';
  container.appendChild(header);

  const visibleStrokes = profile.strokes.filter(
    (s) => !s.context || !context || s.context === context,
  );

  for (const stroke of visibleStrokes) {
    const row = document.createElement('div');
    row.className = 'stroke';
    row.innerHTML =
      `<div class="strokeAction stroke-left" hand="${FOREHAND}" stroke="${stroke.name}"></div>` +
      `<div class="stroke-name">${stroke.name}</div>` +
      `<div class="strokeAction stroke-right" hand="${BACKHAND}" stroke="${stroke.name}"></div>`;
    container.appendChild(row);
  }
}

function buildFaultContent(): void {
  const container = document.querySelector('#stroke_slider .strokes');
  if (!container) return;

  lastWasFault = true;
  lastContext = undefined;
  lastProfileId = undefined;

  container.innerHTML = '';

  // For double faults (second serve), show both 1st and 2nd fault sections
  const isDoubleFault = env.serve2nd;

  if (isDoubleFault) {
    appendFaultSection(container, '1st Fault', 'firstFaultType');
  }
  appendFaultSection(container, isDoubleFault ? '2nd Fault' : 'Fault Type', 'faultType');
}

function appendFaultSection(container: Element, label: string, attribute: string) {
  const header = document.createElement('div');
  header.className = 'fault-header';
  header.textContent = label;
  container.appendChild(header);

  for (const faultType of FAULT_TYPES) {
    const option = document.createElement('div');
    option.className = 'fault-option faultAction';
    option.setAttribute(attribute, faultType);
    option.textContent = faultType;
    container.appendChild(option);
  }
}

export function clearDismissCallback(): void {
  onDismissCallback = undefined;
}

export function rebuildStrokeSlider(): void {
  lastContext = undefined;
  lastProfileId = undefined;
}

function populateDrawer(mode: 'stroke' | 'fault', result?: string) {
  if (mode === 'fault') {
    buildFaultContent();
  } else {
    const context = result ? resultToContext(result) : undefined;
    buildSliderContent(context);
  }
}

function positionSlider(show: string) {
  const width = window.innerWidth;
  const stroke_slider = document.getElementById('stroke_slider');
  const slideRight = document.getElementById('slideright');
  const slideLeft = document.getElementById('slideleft');

  const isLandscape = width > window.innerHeight;
  const maxWidth = isLandscape ? 280 : 200;
  const sliderWidth = Math.min(width * 0.5, maxWidth);
  if (stroke_slider) {
    stroke_slider.style.display = 'flex';
    stroke_slider.style.left = show === 'left' ? '0px' : (width - sliderWidth) + 'px';
    stroke_slider.style.animation = show === 'left' ? 'slideInLeft 0.7s' : 'slideInRight 0.7s';
  }
  if (slideLeft) slideLeft.style.display = show === 'right' ? 'flex' : 'none';
  if (slideRight) slideRight.style.display = show === 'left' ? 'flex' : 'none';
}

function showSlider(show: string, result?: string, onDismiss?: () => void, mode: 'stroke' | 'fault' = 'stroke') {
  onDismissCallback = onDismiss;
  populateDrawer(mode, result);
  showOverlay();
  positionSlider(show);
}

function hideSlider() {
  const stroke_slider = document.getElementById('stroke_slider');
  if (stroke_slider) stroke_slider.style.display = 'none';
  removeOverlay();
}



export function strokeSlider(show?: string, result?: string, onDismiss?: () => void, mode: 'stroke' | 'fault' = 'stroke') {
  if (show) {
    showSlider(show, result, onDismiss, mode);
  } else {
    setTimeout(() => hideSlider(), 100);
  }
}

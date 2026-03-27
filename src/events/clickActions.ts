import { resetButtons, setCourtSide, stateChangeEvent, swapServer, visibleButtons } from '../display/displayUpdate';
import { editMatchDetails } from '../display/displayUpdate';
import { formatChangePossible } from '../engine/formatChangePossible';
import { getCurrentMatchUpId } from '../state/matchContext';
import { newMatch } from '../match/displayMatchArchive';
import { browserStorage } from '../state/browserStorage';
import { env, options, settings as appSettings, updateAppState, updateMatchArchive } from '../state/env';
import { openFormatEditor } from '../match/openFormatEditor';
import { getRegisteredSkins } from '../scoring';
import { getProfiles } from '../decorations';
import { rebuildStrokeSlider } from './strokeSlider';
import { matchPath } from '../router/routes';
import { showGameFish } from '../display/configureViz';
import { findUpClass } from '../utils/utilities';
import { editPoint } from '../match/editPoint';
import { cModal, renderForm } from 'courthive-components';

export function viewGameFish(element: any) {
  const gameIndex: number = parseInt(element.getAttribute('gameIndex') ?? 0);
  showGameFish(gameIndex);
}
export function viewEditPoint(element: any) {
  const parent = findUpClass(element, 'ph_episode');
  const pointIndex = parseInt(parent?.getAttribute('pointIndex') ?? 0);
  editPoint(pointIndex);
}
const getRouter = () => (window as any).appRouter;

export function viewStats() {
  getRouter()?.navigate(matchPath(getCurrentMatchUpId(), 'stats'));
}
export function viewMatchFormat() {
  // Navigate to scoring first (in case we're on another view)
  const router = getRouter();
  router?.navigate(matchPath(getCurrentMatchUpId(), 'scoring'));
  setTimeout(() => openFormatEditor(), 50);
}
export function viewGameTree() {
  getRouter()?.navigate(matchPath(getCurrentMatchUpId(), 'tree'));
}
export function viewMomentum() {
  getRouter()?.navigate(matchPath(getCurrentMatchUpId(), 'momentum'));
}
export function viewPointHistory() {
  getRouter()?.navigate(matchPath(getCurrentMatchUpId(), 'history'));
}
export function settings() {
  let inputs: any;
  let profileSelect: HTMLSelectElement;
  let darkModeCheckbox: HTMLInputElement;

  const color = 'var(--chc-text-primary)';
  const content = (elem: HTMLElement) => {
    inputs = renderForm(elem, [
      { label: 'Audible Clicks', field: 'audible_clicks', id: 'audible_clicks', checkbox: true, checked: appSettings.audible_clicks, color },
      { label: 'Track Shot Types', field: 'track_shot_types', id: 'track_shot_types', checkbox: true, checked: appSettings.track_shot_types, color },
      { label: 'GameFish Display', field: 'display_gamefish', id: 'display_gamefish', checkbox: true, checked: appSettings.display_gamefish, color },
      { label: 'Auto-swap Server Side', field: 'auto_swap_sides', id: 'auto_swap_sides', checkbox: true, checked: appSettings.auto_swap_sides, color },
    ]);

    // Dark Mode toggle
    const darkModeRow = document.createElement('div');
    darkModeRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-top: 0.5rem; margin-bottom: 0.5rem;';
    const darkModeLabel = document.createElement('label');
    darkModeLabel.textContent = 'Dark Mode';
    darkModeLabel.htmlFor = 'ep-dark-mode';
    darkModeLabel.style.cssText = 'font-weight: bold; color: var(--chc-text-primary);';
    darkModeCheckbox = document.createElement('input');
    darkModeCheckbox.type = 'checkbox';
    darkModeCheckbox.id = 'ep-dark-mode';
    darkModeCheckbox.name = 'darkMode';
    darkModeCheckbox.checked = document.documentElement.dataset.theme === 'dark';
    darkModeCheckbox.addEventListener('change', () => {
      const theme = darkModeCheckbox.checked ? 'dark' : 'light';
      document.documentElement.dataset.theme = theme;
      browserStorage.set('theme', theme);
    });
    darkModeRow.appendChild(darkModeLabel);
    darkModeRow.appendChild(darkModeCheckbox);
    elem.appendChild(darkModeRow);

    const profileLabel = document.createElement('label');
    profileLabel.textContent = 'Shot Decorations';
    profileLabel.htmlFor = 'ep-decoration-profile';
    profileLabel.style.cssText = 'font-weight: bold; margin-top: 1rem; margin-bottom: 0.25rem; display: block; color: var(--chc-text-primary);';
    elem.appendChild(profileLabel);

    profileSelect = document.createElement('select');
    profileSelect.id = 'ep-decoration-profile';
    profileSelect.name = 'decorationProfile';
    profileSelect.style.cssText = 'width: 100%; padding: 0.4rem; font-size: 1rem; border: 1px solid var(--chc-border-primary); border-radius: 4px; background-color: var(--chc-bg-secondary); color: var(--chc-text-primary);';
    for (const profile of getProfiles()) {
      const opt = document.createElement('option');
      opt.value = profile.id;
      opt.textContent = profile.label;
      opt.selected = profile.id === (appSettings.decoration_profile || 'standard');
      profileSelect.appendChild(opt);
    }
    elem.appendChild(profileSelect);
  };

  const saveSettings = () => {
    if (inputs) {
      appSettings.audible_clicks = inputs.audible_clicks?.checked ?? appSettings.audible_clicks;
      appSettings.track_shot_types = inputs.track_shot_types?.checked ?? appSettings.track_shot_types;
      appSettings.display_gamefish = inputs.display_gamefish?.checked ?? appSettings.display_gamefish;
      appSettings.auto_swap_sides = inputs.auto_swap_sides?.checked ?? appSettings.auto_swap_sides;
    }
    if (profileSelect) {
      const newProfile = profileSelect.value;
      if (newProfile !== appSettings.decoration_profile) {
        appSettings.decoration_profile = newProfile;
        rebuildStrokeSlider();
      }
    }
    updateAppState();
  };

  cModal.open({
    title: 'Settings',
    content,
    config: { clickAway: false },
    buttons: [{ label: 'Done', intent: 'is-info', onClick: saveSettings, close: true }],
    onClose: saveSettings,
  });
}

export function selectInterfaces() {
  const verticalSkins = getRegisteredSkins('vertical');
  const horizontalSkins = getRegisteredSkins('horizontal');
  let vSelect: HTMLSelectElement;
  let hSelect: HTMLSelectElement;

  const content = (elem: HTMLElement) => {
    const vLabel = document.createElement('label');
    vLabel.textContent = 'Vertical Interface';
    vLabel.htmlFor = 'ep-vertical-interface';
    vLabel.style.cssText = 'font-weight: bold; margin-bottom: 0.25rem; display: block; color: var(--chc-text-primary);';
    elem.appendChild(vLabel);

    vSelect = document.createElement('select');
    vSelect.id = 'ep-vertical-interface';
    vSelect.name = 'verticalInterface';
    vSelect.style.cssText = 'width: 100%; padding: 0.4rem; margin-bottom: 1rem; font-size: 1rem; border: 1px solid var(--chc-border-primary); border-radius: 4px; background-color: var(--chc-bg-secondary); color: var(--chc-text-primary);';
    for (const skin of verticalSkins) {
      const opt = document.createElement('option');
      opt.value = skin.id;
      opt.textContent = skin.label;
      opt.selected = skin.id === options.vertical_view;
      vSelect.appendChild(opt);
    }
    elem.appendChild(vSelect);

    const hLabel = document.createElement('label');
    hLabel.textContent = 'Horizontal Interface';
    hLabel.htmlFor = 'ep-horizontal-interface';
    hLabel.style.cssText = 'font-weight: bold; margin-bottom: 0.25rem; display: block; color: var(--chc-text-primary);';
    elem.appendChild(hLabel);

    hSelect = document.createElement('select');
    hSelect.id = 'ep-horizontal-interface';
    hSelect.name = 'horizontalInterface';
    hSelect.style.cssText = 'width: 100%; padding: 0.4rem; font-size: 1rem; border: 1px solid var(--chc-border-primary); border-radius: 4px; background-color: var(--chc-bg-secondary); color: var(--chc-text-primary);';
    for (const skin of horizontalSkins) {
      const opt = document.createElement('option');
      opt.value = skin.id;
      opt.textContent = skin.label;
      opt.selected = skin.id === options.horizontal_view;
      hSelect.appendChild(opt);
    }
    elem.appendChild(hSelect);
  };

  const save = () => {
    let changed = false;
    if (vSelect && vSelect.value !== options.vertical_view) {
      options.vertical_view = vSelect.value;
      browserStorage.set('vertical_view', vSelect.value);
      changed = true;
    }
    if (hSelect && hSelect.value !== options.horizontal_view) {
      options.horizontal_view = hSelect.value;
      browserStorage.set('horizontal_view', hSelect.value);
      changed = true;
    }
    if (changed) {
      const router = (window as any).appRouter;
      if (router) router.refreshCurrentView();
    }
  };

  cModal.open({
    title: 'Scoring Interfaces',
    content,
    config: { clickAway: false },
    buttons: [{ label: 'Done', intent: 'is-info', onClick: save, close: true }],
    onClose: save,
  });
}
export function matchArchive() {
  getRouter()?.navigate('/archive');
}
export function outcomeEntry() {
  getRouter()?.navigate(matchPath(getCurrentMatchUpId(), 'scoring'));
}
export function mainMenu() {
  const router = getRouter();
  const points = env.engine.getState().history?.points || [];
  const hasArchive = JSON.parse(browserStorage.get('match_archive') || '[]').length > 0;
  const canChangeFormat = formatChangePossible();
  const canChangeServer = points.length === 0;

  const menuItem = (label: string, action: () => void) => {
    const div = document.createElement('div');
    div.textContent = label;
    div.style.cssText = 'padding: 0.75rem 1rem; cursor: pointer; font-size: 1.1rem; color: var(--chc-text-primary); border-bottom: 1px solid var(--chc-border-secondary);';
    div.addEventListener('mouseenter', () => (div.style.backgroundColor = 'var(--chc-hover-bg)'));
    div.addEventListener('mouseleave', () => (div.style.backgroundColor = ''));
    div.addEventListener('click', () => {
      cModal.close();
      action();
    });
    return div;
  };

  const content = (elem: HTMLElement) => {
    if (canChangeServer) elem.appendChild(menuItem('Change Server', changeServer));
    elem.appendChild(menuItem('New Match', newMatch));
    if (canChangeFormat) elem.appendChild(menuItem('Match Format', () => openFormatEditor()));
    elem.appendChild(menuItem('Match Details', editMatchDetails));
    if (hasArchive) elem.appendChild(menuItem('Match Archive', () => router?.navigate('/archive')));
    elem.appendChild(menuItem('Scoring Interfaces', selectInterfaces));
    elem.appendChild(menuItem('Settings', settings));
  };

  cModal.open({ title: 'Menu', content, config: { clickAway: false }, buttons: [{ label: 'Close', intent: 'is-info', close: true }] });
}
export function undoAction() {
  if (env.serve2nd || env.rally_mode) {
    env.serve2nd = false;
    env.rally_mode = false;
    env.rally = 0;
    env.lets = 0;
    resetButtons();
  } else {
    const pointsBefore = env.engine.getPointCount();
    const success = env.engine.undo();
    if (success) {
      const pointsAfter = env.engine.getPointCount();
      // If point count didn't change, a direct game/set was undone
      if (pointsBefore === pointsAfter && env.directActions.length) {
        env.directActions.pop();
      }
      updateMatchArchive(true);
      stateChangeEvent();
    }
  }
  visibleButtons();
}
export function redoAction() {
  if (!env.engine.canRedo()) return;
  const success = env.engine.redo();
  if (success) {
    updateMatchArchive(true);
    stateChangeEvent();
  }
  visibleButtons();
}
export function changeServer() {
  const points = env.engine.getState().history?.points || [];
  if (!points.length) {
    env.serving = 1 - env.serving;
    env.receiving = 1 - env.serving;
    swapServer();
    resetButtons();
    visibleButtons();
  }
}
export function swapAction() {
  options.user_swap = !options.user_swap;
  setCourtSide();
  swapServer();
  stateChangeEvent();
}

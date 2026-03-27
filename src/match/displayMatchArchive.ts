import { loadDetails, stateChangeEvent, updateScore } from '../display/displayUpdate';
import { setCurrentMatchUpId } from '../state/matchContext';
import { browserStorage } from '../state/browserStorage';
import { renderMatchUp, cModal } from 'courthive-components';
import { matchPath } from '../router/routes';
import { tools } from 'tods-competition-factory';
import { env, resetEngine, definePlayer } from '../state/env';

function getArchiveComposition(matchData?: any) {
  const hasGamePoints = !matchData?.winningSide || matchData?.matchUpStatus === 'RETIRED';
  return {
    theme: '',
    configuration: {
      scheduleInfo: true,
      winnerChevron: true,
      ...(hasGamePoints && { gameScore: { position: 'trailing' as const } }),
    },
  };
}

let activePopup: HTMLElement | null = null;
let dismissListener: ((e: MouseEvent) => void) | null = null;

function dismissPopup() {
  if (activePopup) {
    activePopup.remove();
    activePopup = null;
  }
  if (dismissListener) {
    document.removeEventListener('click', dismissListener, true);
    dismissListener = null;
  }
}

function makePopupItem(label: string, onClick: () => void, className?: string) {
  const item = document.createElement('div');
  item.className = className ? `archive-popup-item ${className}` : 'archive-popup-item';
  item.textContent = label;
  item.onclick = (e) => {
    e.stopPropagation();
    dismissPopup();
    onClick();
  };
  return item;
}

function completeMatch(matchId: string, winningSide: 1 | 2, matchUpStatus: 'RETIRED' | 'WALKOVER') {
  const raw = browserStorage.get(matchId);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    data.winningSide = winningSide;
    data.matchUpStatus = matchUpStatus;
    const sets = data.score?.sets;
    if (sets?.length) {
      delete sets[sets.length - 1].side1PointScore;
      delete sets[sets.length - 1].side2PointScore;
    }
    browserStorage.set(matchId, JSON.stringify(data));
    window.dispatchEvent(new CustomEvent('matcharchive:updated'));
  } catch { /* skip corrupt */ }
}

function showCompleteModal(matchId: string, status: 'RETIRED' | 'WALKOVER') {
  const raw = browserStorage.get(matchId);
  if (!raw) return;
  const data = JSON.parse(raw);
  const side1Name = data.sides?.[0]?.participant?.participantName || 'Player 1';
  const side2Name = data.sides?.[1]?.participant?.participantName || 'Player 2';
  const label = status === 'RETIRED' ? 'Retirement' : 'Walkover';

  const content = (elem: HTMLElement) => {
    elem.style.cssText = 'display: flex; flex-direction: column; gap: 0.5rem;';
    const prompt = document.createElement('div');
    prompt.textContent = `Select winner by ${label.toLowerCase()}:`;
    prompt.style.cssText = 'color: var(--chc-text-primary); margin-bottom: 0.25rem;';
    elem.appendChild(prompt);

    for (const [sideNumber, name] of [[1, side1Name], [2, side2Name]] as [1|2, string][]) {
      const btn = document.createElement('div');
      btn.textContent = name;
      btn.style.cssText = 'padding: 0.75rem 1rem; cursor: pointer; font-size: 1.1rem; color: var(--chc-text-primary); border: 1px solid var(--chc-border-secondary); border-radius: 4px; text-align: center;';
      btn.addEventListener('mouseenter', () => (btn.style.backgroundColor = 'var(--chc-hover-bg)'));
      btn.addEventListener('mouseleave', () => (btn.style.backgroundColor = ''));
      btn.addEventListener('click', () => {
        cModal.close();
        completeMatch(matchId, sideNumber, status);
      });
      elem.appendChild(btn);
    }
  };

  cModal.open({
    title: label,
    content,
    config: { clickAway: true },
    buttons: [{ label: 'Cancel', intent: 'is-info', close: true }],
  });
}

function showPopupMenu(anchor: MouseEvent, matchId: string, cardElement: HTMLElement) {
  dismissPopup();

  const raw = browserStorage.get(matchId);
  const matchData = raw ? JSON.parse(raw) : {};
  const isComplete = matchData.winningSide || matchData.matchUpStatus === 'COMPLETED';

  const menu = document.createElement('div');
  menu.className = 'archive-popup';

  menu.appendChild(makePopupItem('Edit Details', () => {
    const router = (window as any).appRouter;
    router?.navigate(matchPath(matchId, 'details'));
  }));

  if (!isComplete) {
    menu.appendChild(makePopupItem('Retirement', () => showCompleteModal(matchId, 'RETIRED')));
    menu.appendChild(makePopupItem('Walkover', () => showCompleteModal(matchId, 'WALKOVER')));
  }

  menu.appendChild(makePopupItem('Delete', () => {
    deleteMatch(matchId);
    cardElement.remove();
  }, 'archive-popup-delete'));

  // Position near the click
  menu.style.position = 'fixed';
  menu.style.left = `${anchor.clientX}px`;
  menu.style.top = `${anchor.clientY}px`;
  document.body.appendChild(menu);

  // Adjust if menu overflows viewport
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = `${window.innerWidth - rect.width - 8}px`;
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = `${anchor.clientY - rect.height}px`;
  }

  activePopup = menu;

  // Dismiss on next click anywhere
  dismissListener = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node)) {
      dismissPopup();
    }
  };
  // Use setTimeout so the current click event doesn't immediately dismiss
  setTimeout(() => {
    if (dismissListener) {
      document.addEventListener('click', dismissListener, true);
    }
  }, 0);
}

function deleteMatch(match_id: string) {
  browserStorage.remove(match_id);
  const current_match_id = browserStorage.get('current_match');
  let match_archive = JSON.parse(browserStorage.get('match_archive') || '[]');
  match_archive = match_archive.filter((id: string) => id !== match_id);
  browserStorage.set('match_archive', JSON.stringify(match_archive));
  if (match_id === current_match_id) {
    resetMatch();
  }
}

export function displayMatchArchive(params?: any) {
  const active = params?.active;
  const match_archive: string[] = JSON.parse(browserStorage.get('match_archive') || '[]')
    .filter((item: any, i: number, s: any) => s.lastIndexOf(item) == i)
    .reverse();
  if (active) return;

  dismissPopup();

  const container = document.getElementById('matcharchiveList');
  if (!container) return;
  container.innerHTML = '';

  match_archive.forEach((match_id: string) => {
    const raw = browserStorage.get(match_id);
    if (!raw) {
      browserStorage.remove(match_id);
      return;
    }

    const match_data = JSON.parse(raw);
    if (!match_data) return;

    const matchUp = toRenderMatchUp(match_id, match_data);

    const element = renderMatchUp({
      matchUp,
      composition: getArchiveComposition(match_data),
      eventHandlers: {
        matchUpClick: () => {
          dismissPopup();
          const router = (window as any).appRouter;
          router?.navigate(matchPath(match_id, 'scoring'));
        },
        scheduleClick: ({ pointerEvent }: { pointerEvent: MouseEvent }) => {
          pointerEvent.stopPropagation();
          showPopupMenu(pointerEvent, match_id, element);
        },
      },
    });

    container.appendChild(element);
  });

  return match_archive;
}

/**
 * Convert stored match data (TODS or legacy) into the shape renderMatchUp expects.
 */
function toRenderMatchUp(match_id: string, data: any): any {
  const isTODS = data.matchUpId && !data.muid;

  // Build schedule from stored date
  let schedule = data.schedule;
  if (!schedule?.scheduledDate && data.match?.date) {
    const d = new Date(data.match.date);
    schedule = { scheduledDate: d.toISOString().split('T')[0] };
  }

  if (isTODS) {
    return {
      ...data,
      schedule,
      structureId: data.structureId || '',
    };
  }

  // Legacy format: convert players array to sides
  const sides = [
    {
      sideNumber: 1,
      participant: {
        participantName: data.players?.[0]?.participantName || data.players?.[0]?.name || 'Player 1',
        participantType: 'INDIVIDUAL',
      },
    },
    {
      sideNumber: 2,
      participant: {
        participantName: data.players?.[1]?.participantName || data.players?.[1]?.name || 'Player 2',
        participantType: 'INDIVIDUAL',
      },
    },
  ];

  const scoreString = data._appData?.scoreboard || data.scoreboard || '';

  return {
    matchUpId: match_id,
    matchUpFormat: data.matchUpFormat || '',
    matchUpType: 'SINGLES',
    sides,
    score: {
      scoreStringSide1: scoreString,
      scoreStringSide2: scoreString,
    },
    schedule,
    structureId: '',
  };
}

export function resetMatch(matchUpId?: string) {
  resetEngine('SET3-S:6/TB7');
  definePlayer({ index: 0, firstName: 'Player', lastName: 'One' });
  definePlayer({ index: 1, firstName: 'Player', lastName: 'Two' });

  loadDetails();
  updateScore();
  const date = Date.now();
  matchUpId = matchUpId || tools.UUID();
  Object.assign(env.metadata.match, { matchUpId, date });
  setCurrentMatchUpId(matchUpId);
  stateChangeEvent();
}

export function newMatch() {
  resetMatch();

  const matchUpId = env.metadata.match?.matchUpId;
  const router = (window as any).appRouter;
  router?.navigate(matchPath(matchUpId, 'scoring'));
}

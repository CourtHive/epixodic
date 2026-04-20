<script lang="ts">
  import MatchUpCard from './MatchUpCard.svelte';
  import EmptyState from '../shared/EmptyState.svelte';
  import { getLocalMatchUpsState, deleteLocalMatchUp, completeLocalMatchUp } from '../../stores/localMatchUps.svelte';
  import { openScoringModal } from '../../../scoring/scoringModal';
  import { matchPath } from '../../../router/routes';
  import { device } from '../../../state/env';
  import { cModal } from 'courthive-components';

  const local = getLocalMatchUpsState();

  interface DateGroup {
    label: string;
    sortKey: string;
    matchUps: typeof local.myMatchUps;
  }

  function formatDateLabel(dateStr: string): string {
    const today = new Date();
    const date = new Date(dateStr + 'T00:00:00');
    const todayStr = today.toISOString().split('T')[0];

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (dateStr === todayStr) return 'Today';
    if (dateStr === yesterdayStr) return 'Yesterday';
    return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  const dateGroups = $derived.by(() => {
    const groups = new Map<string, typeof local.myMatchUps>();
    for (const matchUp of local.myMatchUps) {
      const dateKey = matchUp.schedule?.scheduledDate || '_undated';
      const existing = groups.get(dateKey);
      if (existing) {
        existing.push(matchUp);
      } else {
        groups.set(dateKey, [matchUp]);
      }
    }

    const result: DateGroup[] = [];
    for (const [key, matchUps] of groups) {
      result.push({
        label: key === '_undated' ? 'Undated' : formatDateLabel(key),
        sortKey: key === '_undated' ? '0000-00-00' : key,
        matchUps,
      });
    }
    return result.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  });

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

  function makePopupItem(label: string, onClick: (e: MouseEvent) => void, className?: string) {
    const item = document.createElement('div');
    item.className = className ? `archive-popup-item ${className}` : 'archive-popup-item';
    item.textContent = label;
    item.onclick = (e) => {
      e.stopPropagation();
      dismissPopup();
      onClick(e);
    };
    return item;
  }

  function showPopupMenu(event: MouseEvent, matchUpId: string) {
    dismissPopup();

    const matchUp = local.myMatchUps.find((m) => m.matchUpId === matchUpId);
    const isComplete = matchUp?.winningSide || matchUp?.matchUpStatus === 'COMPLETED';

    const menu = document.createElement('div');
    menu.className = 'archive-popup';

    menu.appendChild(makePopupItem('Edit Details', () => {
      const router = (window as any).appRouter;
      router?.navigate(matchPath(matchUpId, 'details'));
    }));

    if (!isComplete) {
      menu.appendChild(makePopupItem('Retirement', () => showCompleteModal(matchUpId, 'RETIRED')));
      menu.appendChild(makePopupItem('Walkover', () => showCompleteModal(matchUpId, 'WALKOVER')));
    }

    menu.appendChild(makePopupItem('Delete', () => deleteLocalMatchUp(matchUpId), 'archive-popup-delete'));

    menu.style.position = 'fixed';
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
    document.body.appendChild(menu);

    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${window.innerWidth - rect.width - 8}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${event.clientY - rect.height}px`;
    }

    activePopup = menu;
    dismissListener = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        dismissPopup();
      }
    };
    setTimeout(() => {
      if (dismissListener) {
        document.addEventListener('click', dismissListener, true);
      }
    }, 0);
  }

  function showCompleteModal(matchUpId: string, status: 'RETIRED' | 'WALKOVER') {
    const matchUp = local.myMatchUps.find((m) => m.matchUpId === matchUpId);
    if (!matchUp) return;

    const side1Name = matchUp.sides?.[0]?.participant?.participantName || 'Player 1';
    const side2Name = matchUp.sides?.[1]?.participant?.participantName || 'Player 2';
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
          completeLocalMatchUp(matchUpId, sideNumber, status);
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

  function navigateToScoring(matchUpId: string) {
    dismissPopup();
    const matchUp = local.myMatchUps.find((m) => m.matchUpId === matchUpId);
    if (matchUp?.matchUpType === 'TEAM') {
      const router = (globalThis as any).appRouter;
      router?.navigate(`/team/${matchUpId}`);
      return;
    }
    if (device.isMobile) {
      const router = (globalThis as any).appRouter;
      router?.navigate(matchPath(matchUpId, 'scoring'));
    } else {
      openScoringModal(matchUpId);
    }
  }
</script>

{#if local.myMatchUps.length === 0}
  <EmptyState message="No matchUps yet. Tap + to create one." />
{:else}
  <div class="matchup-list">
    {#each dateGroups as group (group.sortKey)}
      {#if dateGroups.length > 1 || group.sortKey !== '_undated'}
        <div class="date-header">{group.label}</div>
      {/if}
      <div class="matchup-grid">
        {#each group.matchUps as matchUp (matchUp.matchUpId)}
          <MatchUpCard
            {matchUp}
            onclick={() => navigateToScoring(matchUp.matchUpId)}
            oncontextmenu={(e) => showPopupMenu(e, matchUp.matchUpId)}
          />
        {/each}
      </div>
    {/each}
  </div>
{/if}

<style>
  .matchup-list {
    overflow-y: auto;
    padding: 0.5rem;
  }
  .date-header {
    padding: 0.5rem 0.25rem;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ep-page-text-muted, #888);
    border-bottom: 1px solid var(--ep-page-border, #333);
    margin-bottom: 0.5rem;
  }
  .matchup-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  @media (max-width: 700px) {
    .matchup-grid {
      grid-template-columns: 1fr;
    }
  }
</style>

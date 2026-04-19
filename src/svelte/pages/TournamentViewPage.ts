import { SvelteViewPage } from '../bridge/SvelteViewPage';
import TournamentPage from '../components/tournament/TournamentPage.svelte';
import type { Component } from 'svelte';

export class TournamentViewPage extends SvelteViewPage {
  protected hasTopNav = true;
  private tournamentId: string = '';
  private eventId: string | undefined = undefined;

  setParams(tournamentId: string, eventId?: string) {
    this.tournamentId = tournamentId;
    this.eventId = eventId;
  }

  protected getComponent(): Component<any> {
    return TournamentPage;
  }

  protected getContainerId(): string {
    return 'svelte-tournament';
  }

  protected getProps(): Record<string, any> {
    return {
      tournamentId: this.tournamentId,
      eventId: this.eventId,
    };
  }
}

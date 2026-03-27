import { SvelteViewPage } from '../bridge/SvelteViewPage';
import TeamScorecardPage from '../components/tournament/TeamScorecardPage.svelte';
import type { Component } from 'svelte';

export class TeamScorecardViewPage extends SvelteViewPage {
  private matchUpId: string = '';

  setParams(matchUpId: string) {
    this.matchUpId = matchUpId;
  }

  protected getComponent(): Component<any> {
    return TeamScorecardPage;
  }

  protected getContainerId(): string {
    return 'svelte-team-scorecard';
  }

  protected getProps(): Record<string, any> {
    return {
      matchUpId: this.matchUpId,
    };
  }
}

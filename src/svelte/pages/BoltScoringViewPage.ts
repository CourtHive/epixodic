import BoltScoringPage from '../components/intennse/BoltScoringPage.svelte';
import { SvelteViewPage } from '../bridge/SvelteViewPage';
import type { Component } from 'svelte';

export class BoltScoringViewPage extends SvelteViewPage {
  private matchUpId: string = '';
  private boltLabel: string = '';
  private side1Name: string = '';
  private side2Name: string = '';

  setParams(matchUpId: string, boltLabel?: string, side1Name?: string, side2Name?: string) {
    this.matchUpId = matchUpId;
    this.boltLabel = boltLabel || '';
    this.side1Name = side1Name || '';
    this.side2Name = side2Name || '';
  }

  protected getComponent(): Component<any> {
    return BoltScoringPage;
  }

  protected getContainerId(): string {
    return 'svelte-bolt-scoring';
  }

  protected getProps(): Record<string, any> {
    return {
      matchUpId: this.matchUpId,
      boltLabel: this.boltLabel,
      side1Name: this.side1Name,
      side2Name: this.side2Name,
    };
  }
}

import { SvelteViewPage } from '../bridge/SvelteViewPage';
import ArchivePage from '../components/archive/ArchivePage.svelte';
import type { Component } from 'svelte';

export class ArchiveViewPage extends SvelteViewPage {
  protected hasTopNav = true;

  protected getComponent(): Component<any> {
    return ArchivePage;
  }

  protected getContainerId(): string {
    return 'svelte-archive';
  }
}

import { mount, unmount } from 'svelte';
import { ViewPage } from '../../pages/ViewPage';
import type { Component } from 'svelte';

/**
 * Bridge between the existing ViewPage lifecycle and Svelte 5 components.
 *
 * Container divs are created dynamically (no index.html changes).
 * The Svelte component is created fresh on each activate() and destroyed on deactivate().
 */
export abstract class SvelteViewPage extends ViewPage {
  private svelteInstance: Record<string, any> | null = null;

  // Svelte components handle their own reactivity on resize; don't remount
  refreshOnOrientationChange = false;

  protected abstract getComponent(): Component<any>;
  protected abstract getContainerId(): string;
  protected getProps(): Record<string, any> {
    return {};
  }

  private getOrCreateContainer(): HTMLElement {
    const id = this.getContainerId();
    let container = document.getElementById(id);
    if (!container) {
      container = document.createElement('div');
      container.id = id;
      container.style.display = 'none';
      document.body.appendChild(container);
    }
    return container;
  }

  protected activate(): void {
    const container = this.getOrCreateContainer();
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.height = '100%';
    container.style.width = '100%';
    container.style.position = 'absolute';
    container.style.top = '0';
    container.style.left = '0';

    this.svelteInstance = mount(this.getComponent(), {
      target: container,
      props: this.getProps(),
    });
  }

  protected deactivate(): void {
    if (this.svelteInstance) {
      unmount(this.svelteInstance);
      this.svelteInstance = null;
    }

    const container = document.getElementById(this.getContainerId());
    if (container) {
      container.style.display = 'none';
      container.innerHTML = '';
    }
  }
}

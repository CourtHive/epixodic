/**
 * ViewPage — lightweight base for legacy-DOM view wrappers.
 *
 * Unlike BasePage (which owns its container HTML), ViewPage wraps
 * pre-existing DOM elements.  Subclasses override activate() / deactivate()
 * to show/hide the correct elements and run initialization logic.
 */

export abstract class ViewPage {
  protected mounted = false;

  /**
   * Whether this page should be re-mounted when the window is resized
   * (e.g. orientation change). Legacy DOM views need this to re-layout;
   * reactive Svelte views should opt out to preserve their internal state.
   */
  refreshOnOrientationChange = true;

  async mount(): Promise<void> {
    if (this.mounted) return;
    this.activate();
    this.mounted = true;
  }

  async unmount(): Promise<void> {
    if (!this.mounted) return;
    this.deactivate();
    this.mounted = false;
  }

  /** Show/hide and initialize the view. */
  protected abstract activate(): void;

  /** Hide the view and clean up. */
  protected abstract deactivate(): void;

  /** Called by stateChangeEvent to refresh view-specific data. */
  updateVisualizations(): void {}

  /** Helper: set element display style by ID. */
  protected show(id: string, display = 'flex'): void {
    const el = document.getElementById(id);
    if (el) el.style.display = display;
  }

  protected hide(id: string): void {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
}

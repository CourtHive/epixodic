/**
 * Base Component
 * 
 * Abstract base class for all UI components.
 * Provides lifecycle hooks and common utilities.
 */

export interface ComponentOptions {
  className?: string;
  id?: string;
  [key: string]: any;
}

export abstract class BaseComponent<TProps extends ComponentOptions = ComponentOptions> {
  protected container: HTMLElement;
  protected props: TProps;
  protected mounted: boolean = false;

  constructor(container: HTMLElement, props: TProps) {
    this.container = container;
    this.props = props;
  }

  /**
   * Mount the component (called when component is added to DOM)
   */
  async mount(): Promise<void> {
    if (this.mounted) {
      console.warn('Component already mounted');
      return;
    }

    await this.onBeforeMount();
    await this.render();
    await this.onMounted();
    
    this.mounted = true;
  }

  /**
   * Unmount the component (cleanup)
   */
  async unmount(): Promise<void> {
    if (!this.mounted) return;

    await this.onBeforeUnmount();
    this.cleanup();
    await this.onUnmounted();
    
    this.mounted = false;
  }

  /**
   * Update component props and re-render
   */
  async update(props: Partial<TProps>): Promise<void> {
    const oldProps = { ...this.props };
    this.props = { ...this.props, ...props };
    
    await this.onBeforeUpdate(oldProps);
    await this.render();
    await this.onUpdated(oldProps);
  }

  /**
   * Abstract render method - must be implemented by subclasses
   */
  protected abstract render(): Promise<void> | void;

  /**
   * Lifecycle hooks - can be overridden by subclasses
   */
  protected async onBeforeMount(): Promise<void> {}
  protected async onMounted(): Promise<void> {}
  protected async onBeforeUpdate(_oldProps: TProps): Promise<void> {}
  protected async onUpdated(_oldProps: TProps): Promise<void> {}
  protected async onBeforeUnmount(): Promise<void> {}
  protected async onUnmounted(): Promise<void> {}

  /**
   * Cleanup resources (event listeners, timers, etc.)
   */
  protected cleanup(): void {
    // Clear container
    if (this.container) {
      this.container.innerHTML = '';
    }
  }

  /**
   * Utility: Create element with attributes
   */
  protected createElement<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    attrs: Record<string, any> = {},
    children: (HTMLElement | string)[] = []
  ): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);
    
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === 'className') {
        element.className = value;
      } else if (key === 'style' && typeof value === 'object') {
        Object.assign(element.style, value);
      } else if (key.startsWith('on') && typeof value === 'function') {
        const event = key.slice(2).toLowerCase();
        element.addEventListener(event, value);
      } else {
        element.setAttribute(key, value);
      }
    });
    
    children.forEach(child => {
      if (typeof child === 'string') {
        element.appendChild(document.createTextNode(child));
      } else {
        element.appendChild(child);
      }
    });
    
    return element;
  }

  /**
   * Utility: Query selector within component container
   */
  protected $(selector: string): HTMLElement | null {
    return this.container.querySelector(selector);
  }

  /**
   * Utility: Query all within component container
   */
  protected $$(selector: string): NodeListOf<HTMLElement> {
    return this.container.querySelectorAll(selector);
  }

  /**
   * Check if component is mounted
   */
  isMounted(): boolean {
    return this.mounted;
  }

  /**
   * Get container element
   */
  getContainer(): HTMLElement {
    return this.container;
  }
}

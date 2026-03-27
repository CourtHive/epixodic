import { ViewPage } from './ViewPage';
import { touchManager } from '../events/touchManager';
import { stateChangeEvent, swapServer } from '../display/displayUpdate';
import { getSkin, getRegisteredSkins } from '../scoring';
import { env, options } from '../state/env';

export class EntryPage extends ViewPage {
  protected activate(): void {
    touchManager.prevent_touch = true;

    const container = document.getElementById('scoring-container');
    if (!container) return;

    this.renderSkins(container);
    this.showActiveSkins();

    swapServer();
    stateChangeEvent();
  }

  private renderSkins(container: HTMLElement): void {
    const vSkin = getSkin(options.vertical_view);
    const hSkin = getSkin(options.horizontal_view);

    if (vSkin && !vSkin.rendered) vSkin.render(container);
    if (hSkin && !hSkin.rendered) hSkin.render(container);

    for (const skin of getRegisteredSkins()) {
      if (skin.rendered) skin.hide();
    }
  }

  private showActiveSkins(): void {
    const vSkin = getSkin(options.vertical_view);
    const hSkin = getSkin(options.horizontal_view);
    const isLandscape = env.orientation === 'landscape';

    if (vSkin) isLandscape ? vSkin.hide() : vSkin.show();
    if (hSkin) isLandscape ? hSkin.show() : hSkin.hide();
  }

  protected deactivate(): void {
    const vSkin = getSkin(options.vertical_view);
    if (vSkin) vSkin.hide();
    const hSkin = getSkin(options.horizontal_view);
    if (hSkin) hSkin.hide();
  }
}

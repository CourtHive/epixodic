/**
 * Enhanced Router
 *
 * Wraps Navigo with additional features:
 * - Match-context routes: /match/:matchUpId/:view
 * - Page components (ViewPage subclasses) for all views
 * - Navigation guards
 * - Route parameter handling
 * - History management
 */

import Navigo from 'navigo';
import { routes, VIEW_MAP, GUARDED_VIEWS, matchPath, getPathForView } from './routes';
import { executeGuard } from './guards';
import { isMatchLoaded } from '../state/matchContext';
import { loadMatch } from '../match/loadMatch';
import { resetButtons, swapServer, visibleButtons } from '../display/displayUpdate';
import { strokeSlider } from '../events/strokeSlider';
import { env } from '../state/env';

import { GameTreePage } from '../pages/GameTreePage';
import { StatsPage } from '../pages/StatsPage';
import { MomentumPage } from '../pages/MomentumPage';
import { PointHistoryPage } from '../pages/PointHistoryPage';
import { MatchArchivePage } from '../pages/MatchArchivePage';
import { DetailsPage } from '../pages/DetailsPage';
import { EntryPage } from '../pages/EntryPage';
import { WelcomePage } from '../pages/WelcomePage';
import { ArchiveViewPage } from '../svelte/pages/ArchiveViewPage';
import { TeamScorecardViewPage } from '../svelte/pages/TeamScorecardViewPage';
import { TournamentViewPage } from '../svelte/pages/TournamentViewPage';
import type { ViewPage } from '../pages/ViewPage';

const VIEW_SVELTE_ARCHIVE = 'svelte-archive';
const VIEW_SVELTE_TOURNAMENT = 'svelte-tournament';
const VIEW_SVELTE_TEAM_SCORECARD = 'svelte-team-scorecard';

export class EnhancedRouter {
  private navigo: Navigo;
  private currentRoute: string = '/';
  private isNavigating: boolean = false;
  private currentPage: ViewPage | null = null;
  private pageComponents: Map<string, new () => ViewPage> = new Map();

  /**
   * Get current page instance (for updates from external events)
   */
  getCurrentPage(): ViewPage | null {
    return this.currentPage;
  }

  constructor() {
    this.navigo = new Navigo('/', { hash: true });

    this.registerPageComponents();
    this.setupRoutes();
  }

  /**
   * Register all page components by their internal view names
   */
  private registerPageComponents() {
    this.pageComponents.set('gametree', GameTreePage);
    this.pageComponents.set('stats', StatsPage);
    this.pageComponents.set('momentum', MomentumPage);
    this.pageComponents.set('pointhistory', PointHistoryPage);
    this.pageComponents.set('matcharchive', MatchArchivePage);
    this.pageComponents.set('matchdetails', DetailsPage);
    this.pageComponents.set('entry', EntryPage);
    this.pageComponents.set('welcome', WelcomePage);
    this.pageComponents.set(VIEW_SVELTE_ARCHIVE, ArchiveViewPage);
    this.pageComponents.set(VIEW_SVELTE_TOURNAMENT, TournamentViewPage);
    this.pageComponents.set(VIEW_SVELTE_TEAM_SCORECARD, TeamScorecardViewPage);
  }

  /**
   * Setup all routes
   */
  private setupRoutes() {
    // Match-context routes: /match/:matchUpId/:view and /match/:matchUpId
    this.navigo.on('/match/:matchUpId/:view', (match) => {
      this.handleMatchRoute(match);
    });

    this.navigo.on('/match/:matchUpId', (match) => {
      this.handleMatchRoute(match);
    });

    // Tournament routes (must be registered before generic non-match routes)
    this.navigo.on('/tournament/:tournamentId/event/:eventId', (match) => {
      this.handleTournamentRoute(match?.data?.tournamentId, match?.data?.eventId);
    });

    this.navigo.on('/tournament/:tournamentId', (match) => {
      this.handleTournamentRoute(match?.data?.tournamentId);
    });

    // Team scorecard route
    this.navigo.on('/team/:matchUpId', (match) => {
      this.handleTeamScorecardRoute(match?.data?.matchUpId);
    });

    // Non-match routes
    routes.forEach((route) => {
      // Skip tournament routes already registered above
      if (route.path.startsWith('/tournament/:')) return;

      this.navigo.on(route.path, (params) => {
        this.handleNavigation(route.path, route.view, route.guard, params);
      });
    });

    // 404 handler
    this.navigo.notFound(() => {
      this.navigate('/welcome');
    });
  }

  /**
   * Handle match-context route: /match/:matchUpId/:view?
   */
  private async handleMatchRoute(match: any) {
    if (this.isNavigating) return;

    const matchUpId = match?.data?.matchUpId;
    const viewSegment = match?.data?.view || 'scoring';
    const internalView = VIEW_MAP[viewSegment] || 'entry';

    if (!matchUpId) {
      this.navigate('/archive');
      return;
    }

    // Load match if not already loaded
    if (!isMatchLoaded(matchUpId)) {
      const success = loadMatch(matchUpId);
      if (!success) {
        this.navigate('/archive');
        return;
      }
      swapServer();
      resetButtons();
      visibleButtons();
    }

    // Check guard
    const guardName = GUARDED_VIEWS[viewSegment];
    if (guardName) {
      const guardResult = executeGuard(guardName, { path: match.url, view: internalView }, { path: this.currentRoute });
      if (!guardResult.allow) {
        if (guardResult.message) {
          console.warn(guardResult.message);
        }
        this.navigate(matchPath(matchUpId, 'scoring'));
        return;
      }
    }

    this.currentRoute = `/match/${matchUpId}/${viewSegment}`;
    await this.mountPageComponent(internalView);
  }

  /**
   * Handle tournament route: /tournament/:tournamentId(/event/:eventId)?
   */
  private async handleTournamentRoute(tournamentId?: string, eventId?: string) {
    if (this.isNavigating || !tournamentId) return;

    const path = eventId
      ? `/tournament/${tournamentId}/event/${eventId}`
      : `/tournament/${tournamentId}`;

    this.currentRoute = path;
    this.isNavigating = true;

    try {
      strokeSlider();

      if (this.currentPage) {
        await this.currentPage.unmount();
        this.currentPage = null;
      }

      this.hideAllViews();

      const page = new TournamentViewPage();
      page.setParams(tournamentId, eventId);
      await page.mount();

      this.currentPage = page;
      env.view = VIEW_SVELTE_TOURNAMENT;
    } finally {
      this.isNavigating = false;
    }
  }

  /**
   * Handle team scorecard route: /team/:matchUpId
   */
  private async handleTeamScorecardRoute(matchUpId?: string) {
    if (this.isNavigating || !matchUpId) return;

    this.currentRoute = `/team/${matchUpId}`;
    this.isNavigating = true;

    try {
      strokeSlider();

      if (this.currentPage) {
        await this.currentPage.unmount();
        this.currentPage = null;
      }

      this.hideAllViews();

      const page = new TeamScorecardViewPage();
      page.setParams(matchUpId);
      await page.mount();

      this.currentPage = page;
      env.view = VIEW_SVELTE_TEAM_SCORECARD;
    } finally {
      this.isNavigating = false;
    }
  }

  /**
   * Handle non-match navigation with guards
   */
  private async handleNavigation(path: string, view: string, guardName?: string, params?: any) {
    if (this.isNavigating) return;

    if (guardName) {
      const guardResult = executeGuard(guardName, { path, view, params }, { path: this.currentRoute });

      if (!guardResult.allow) {
        if (guardResult.message) {
          console.warn(guardResult.message);
        }
        if (guardResult.redirect) {
          this.navigate(guardResult.redirect);
        }
        return;
      }
    }

    this.currentRoute = path;
    await this.mountPageComponent(view);
  }

  /**
   * Hide all known view containers as a clean slate before showing a new view
   */
  private hideAllViews() {
    const containerIds = [
      'pointhistory',
      'matcharchive',
      'welcome',
      'matchdetails',
      'statsscreen',
      'momentum',
      'pts',
      'gametree',
      VIEW_SVELTE_ARCHIVE,
      VIEW_SVELTE_TOURNAMENT,
      VIEW_SVELTE_TEAM_SCORECARD,
    ];

    for (const id of containerIds) {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    }

    // Hide all scoring skins inside the scoring container
    const scoringContainer = document.getElementById('scoring-container');
    if (scoringContainer) {
      for (const child of Array.from(scoringContainer.children) as HTMLElement[]) {
        child.style.display = 'none';
      }
    }
  }

  /**
   * Mount a page component for the given view
   */
  private async mountPageComponent(view: string) {
    this.isNavigating = true;

    try {
      // Hide stroke slider on every view change
      strokeSlider();

      // Unmount current page
      if (this.currentPage) {
        await this.currentPage.unmount();
        this.currentPage = null;
      }

      // Hide all views for a clean slate
      this.hideAllViews();

      // Get the page component constructor
      const PageComponent = this.pageComponents.get(view);
      if (!PageComponent) {
        console.warn(`No page component registered for view: ${view}`);
        return;
      }

      // Create and mount the new page
      const page = new PageComponent();
      await page.mount();

      this.currentPage = page;
      env.view = view;
    } finally {
      this.isNavigating = false;
    }
  }

  /**
   * Navigate to a path
   */
  navigate(path: string, _options?: any) {
    this.navigo.navigate(path);
  }

  /**
   * Navigate by view name (backward compatibility)
   */
  navigateToView(view: string, _params?: any) {
    const path = getPathForView(view);
    this.navigate(path);
  }

  /**
   * Go back in history
   */
  back() {
    window.history.back();
  }

  /**
   * Start the router and restore state from URL
   */
  start() {
    const hash = window.location.hash || '';

    // Explicit route (e.g. #/match/123/scoring, #/archive, #/settings)
    if (/^#\/.+/.test(hash)) {
      this.navigo.resolve();
      return;
    }

    // Root URL (no hash, #, or #/) — always show the landing page
    this.navigate('/welcome');
  }

  /**
   * Update URL without triggering navigation
   */
  updateURL(path: string) {
    const fullPath = path.startsWith('#') ? path : `#${path}`;
    window.history.replaceState(null, '', fullPath);
  }

  /**
   * Sync URL with current view (called externally if needed)
   */
  syncUrl(view: string) {
    if (this.isNavigating) return;

    const path = getPathForView(view);
    if (path && path !== this.currentRoute) {
      this.currentRoute = path;
      window.history.pushState({}, '', `#${path}`);
    }
  }

  /**
   * Get current route path
   */
  getCurrentPath(): string {
    return this.currentRoute;
  }

  /**
   * Check if a page component exists for a view
   */
  hasPageComponent(view: string): boolean {
    return this.pageComponents.has(view);
  }

  /**
   * Re-activate the current page (e.g. after orientation change)
   */
  async refreshCurrentView() {
    if (this.currentPage) {
      await this.currentPage.unmount();
      await this.currentPage.mount();
    }
  }
}

// Export singleton instance
export const router = new EnhancedRouter();

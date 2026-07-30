import { Injectable } from '@angular/core';
import { signal } from '@angular/core';
import { logger } from '../shared/logger';

/**
 * Auth readiness for the Strava heatmap.
 *
 * - `unknown`: startup state, before the first validation has run.
 * - `not-ready`: cookies are missing/expired (403 on the test tile), or the
 *   `chrome.cookies`/`declarativeNetRequest` APIs are unavailable (e.g. running
 *   outside the extension). The user must log in to Strava.
 * - `ready`: cookies are present and the DNR rule is installed; tiles can load.
 */
export type StravaHeatmapAuthState = 'ready' | 'not-ready' | 'unknown';

/**
 * The four CloudFront signing cookies Strava issues for the heatmap tile host.
 * Read from `https://content-a.strava.com` (the host the tiles are served from),
 * not from `strava.com`, because CloudFront scopes these cookies to the CDN host.
 */
const HEATMAP_COOKIE_NAMES = [
  'CloudFront-Key-Pair-Id',
  'CloudFront-Policy',
  'CloudFront-Signature',
  '_strava_idcf',
] as const;

/** A known fixed tile used only to probe auth (cheap, low zoom, never displayed). */
const TEST_TILE_URL =
  'https://content-a.strava.com/identified/globalheat/all/hot/8/198/114.png?v=19';

/** Identifies the dynamic DNR rule this service installs/removes. */
const DNR_RULE_ID = 1;

/** Structural shape of a `chrome.cookies.Cookie` (avoids a `@types/chrome` dep). */
interface ChromeCookie {
  value: string;
}

/**
 * Strava's global heatmap tiles are served from `content-a.strava.com` and are
 * gated behind CloudFront signing cookies. This service is the single owner of the
 * chrome-API surface (cookies + declarativeNetRequest) for that feature:
 *
 * 1. {@link ensureAuth} reads the four signing cookies, validates them with a
 *    HEAD against a fixed test tile, and — if valid — installs a dynamic DNR rule
 *    that attaches the `Cookie` header to tile requests and a CORS header to the
 *    responses so MapLibre can load them cross-origin.
 * 2. {@link openStravaLogin} sends the user to strava.com to (re)establish the
 *    session; cookies are re-read lazily on the next dropdown open.
 *
 * The service exposes auth readiness as a readonly signal ({@link authState})
 * that the map UI binds to. Everything degrades to `not-ready` outside the
 * extension context, so it is safe to construct in tests.
 */
@Injectable({
  providedIn: 'root',
})
export class StravaHeatmapAuthService {
  private readonly authStateSignal = signal<StravaHeatmapAuthState>('unknown');
  readonly authState = this.authStateSignal.asReadonly();

  constructor() {
    this.initVisibilityCheck();
  }

  /**
   * Listens for the tab becoming visible again (e.g. the user returns from the
   * Strava login page) and re-checks auth when the current state is `not-ready`.
   */
  private initVisibilityCheck(): void {
    if (typeof document === 'undefined') {
      return;
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.authStateSignal() === 'not-ready') {
        void this.ensureAuth();
      }
    });
  }

  /**
   * Reads + validates the heatmap cookies and installs the DNR rule when valid.
   * Sets {@link authState} accordingly. Safe to call repeatedly; it re-reads
   * cookies each time so it recovers after the user logs in via {@link openStravaLogin}.
   */
  async ensureAuth(): Promise<StravaHeatmapAuthState> {
    console.log('[StravaHeatmapAuth] ensureAuth() called');

    if (!this.isExtensionContext()) {
      console.log(
        '[StravaHeatmapAuth] NOT extension context — chrome.cookies or declarativeNetRequest missing',
      );
      this.authStateSignal.set('not-ready');
      return 'not-ready';
    }
    console.log('[StravaHeatmapAuth] Extension context OK');

    const cookieHeader = await this.readCookieHeader();
    if (!cookieHeader) {
      console.log(
        '[StravaHeatmapAuth] Cookie header empty — one or more CloudFront cookies missing from content-a.strava.com',
      );
      this.authStateSignal.set('not-ready');
      await this.removeDnrRule();
      return 'not-ready';
    }
    console.log(
      '[StravaHeatmapAuth] Cookie header assembled successfully:',
      cookieHeader.slice(0, 80) + '...',
    );

    const valid = await this.validateCookies();
    if (!valid) {
      console.log(
        '[StravaHeatmapAuth] Cookie validation FAILED — test tile fetch did not return 200/redirect',
      );
      this.authStateSignal.set('not-ready');
      await this.removeDnrRule();
      return 'not-ready';
    }
    console.log('[StravaHeatmapAuth] Cookie validation PASSED — test tile fetch was successful');

    await this.installDnrRule(cookieHeader);
    console.log('[StravaHeatmapAuth] DNR rule installed, auth is READY');
    this.authStateSignal.set('ready');
    return 'ready';
  }

  /**
   * Opens the Strava global heatmap page so the user can (re)establish a
   * session and the CloudFront signing cookies for the heatmap tile host get
   * set. Simply logging in at strava.com/login does NOT issue the
   * CloudFront-Key-Pair-Id / CloudFront-Policy / CloudFront-Signature cookies
   * on content-a.strava.com — those are only set when you visit the heatmap
   * page. After logging in (or if already logged in), the heatmap page sets
   * these cookies and {@link ensureAuth} will succeed on the next attempt.
   */
  openStravaLogin(): void {
    const chrome = this.chrome();
    if (chrome?.tabs?.create) {
      chrome.tabs.create({ url: 'https://www.strava.com/heatmap' });
      return;
    }
    window.open('https://www.strava.com/heatmap', '_blank', 'noopener');
  }

  /**
   * Forces auth state to `not-ready` and removes the DNR rule. Called when a
   * Strava tile request fails at runtime (e.g. CloudFront cookies expired
   * mid-session), so the map component can surface the login view instead of a
   * misleading "basemap failed" error. The next dropdown open re-validates via
   * {@link ensureAuth}.
   */
  async markNotReady(): Promise<void> {
    this.authStateSignal.set('not-ready');
    await this.removeDnrRule();
  }

  private isExtensionContext(): boolean {
    const c = this.chrome();
    return Boolean(c?.cookies?.get && c?.declarativeNetRequest?.updateDynamicRules);
  }

  private chrome() {
    return (globalThis as any).chrome as
      | {
          cookies?: {
            get: (details: { url: string; name: string }) => Promise<ChromeCookie | null>;
          };
          declarativeNetRequest?: {
            updateDynamicRules: (rules: {
              removeRuleIds?: number[];
              addRules?: unknown[];
            }) => Promise<void>;
          };
          tabs?: { create?: (p: { url: string }) => void };
        }
      | undefined;
  }

  /**
   * Reads the four signing cookies and joins them into an HTTP `Cookie` header
   * value. Returns an empty string if any cookie is missing.
   */
  private async readCookieHeader(): Promise<string> {
    const chrome = this.chrome();
    if (!chrome?.cookies?.get) {
      console.log('[StravaHeatmapAuth] readCookieHeader: chrome.cookies.get not available');
      return '';
    }
    const parts: string[] = [];
    for (const name of HEATMAP_COOKIE_NAMES) {
      const cookie = await chrome.cookies.get({ url: 'https://content-a.strava.com', name });
      console.log(
        `[StravaHeatmapAuth] readCookieHeader: ${name} =`,
        cookie ? cookie.value.slice(0, 20) + '...' : 'null (MISSING!)',
      );
      if (!cookie) {
        console.log(`[StravaHeatmapAuth] readCookieHeader: MISSING cookie "${name}" — aborting`);
        return '';
      }
      parts.push(`${name}=${cookie.value}`);
    }
    console.log('[StravaHeatmapAuth] readCookieHeader: ALL 4 cookies found');
    return parts.join('; ');
  }

  /**
   * Validates the current cookies by fetching a known tile without credentials
   * (the DNR rule, once installed, attaches the Cookie header). A 403 means the
   * cookies are absent or expired; a 200 (or redirect to a valid tile) means auth
   * is live.
   *
   * Note: this probe runs *before* the DNR rule is (re)installed, so on the first
   * call after login it relies on the browser's cookie jar + `credentials:
   * 'include'`. CloudFront cookies set for `*.strava.com` are sent here because
   * the extension has host permission for `content-a.strava.com`.
   */
  private async validateCookies(): Promise<boolean> {
    try {
      console.log('[StravaHeatmapAuth] validateCookies: fetching test tile...');
      const res = await fetch(TEST_TILE_URL, { method: 'GET', credentials: 'include' });
      console.log(
        `[StravaHeatmapAuth] validateCookies: response status=${res.status}, type=${res.type}, ok=${res.ok}`,
      );
      const result = res.ok || res.type === 'opaqueredirect' || res.status === 0;
      console.log(`[StravaHeatmapAuth] validateCookies: returning ${result}`);
      return result;
    } catch (err) {
      console.error('[StravaHeatmapAuth] validateCookies: fetch threw:', err);
      logger.error('Strava heatmap auth probe failed:', err);
      return false;
    }
  }

  /**
   * Installs a dynamic DNR rule that, for Strava heatmap tile requests:
   *  - sets the `Cookie` request header to the joined signing cookies (overriding
   *    whatever the browser would send), and
   *  - adds `Access-Control-Allow-Origin: *` to the response so MapLibre's
   *    cross-origin tile loads are not blocked.
   *
   * Dynamic rules persist across service-worker restarts and are removed by
   * {@link removeDnrRule} when auth fails, so expired cookies never stay injected.
   */
  private async installDnrRule(cookieHeader: string): Promise<void> {
    const chrome = this.chrome();
    if (!chrome?.declarativeNetRequest?.updateDynamicRules) {
      return;
    }
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [DNR_RULE_ID],
      addRules: [
        {
          id: DNR_RULE_ID,
          priority: 1,
          action: {
            type: 'modifyHeaders',
            requestHeaders: [{ header: 'Cookie', operation: 'set', value: cookieHeader }],
            responseHeaders: [
              { header: 'Access-Control-Allow-Origin', operation: 'set', value: '*' },
            ],
          },
          condition: {
            urlFilter: '||content-a.strava.com/identified/globalheat',
            resourceTypes: ['image', 'xmlhttprequest'],
          },
        },
      ],
    });
  }

  private async removeDnrRule(): Promise<void> {
    const chrome = this.chrome();
    if (!chrome?.declarativeNetRequest?.updateDynamicRules) {
      return;
    }
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [DNR_RULE_ID],
    });
  }
}

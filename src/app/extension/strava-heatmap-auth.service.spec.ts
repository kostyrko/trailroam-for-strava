import { TestBed } from '@angular/core/testing';
import { StravaHeatmapAuthService } from './strava-heatmap-auth.service';

/**
 * Mocked `chrome.*` surface for the heatmap auth service. Modeled on the
 * extension-bridge spec's `(globalThis as any).chrome` swap pattern. Each cookie
 * is stored in `cookieJar`; `cookies.get` returns the matching one (or null).
 */
interface MockChrome {
  cookies: {
    get: ReturnType<typeof vi.fn>;
  };
  declarativeNetRequest: {
    updateDynamicRules: ReturnType<typeof vi.fn>;
  };
  tabs?: { create: ReturnType<typeof vi.fn> };
}

interface InstalledMockChrome extends MockChrome {
  restore: () => void;
  __setCookie: (name: string, value: string | null) => void;
}

function installMockChrome(overrides: Partial<MockChrome> = {}): InstalledMockChrome {
  const cookieJar = new globalThis.Map<string, string>([
    ['CloudFront-Key-Pair-Id', 'K1'],
    ['CloudFront-Policy', 'P1'],
    ['CloudFront-Signature', 'S1'],
    ['_strava_idcf', 'I1'],
  ]);
  const mock: MockChrome = {
    cookies: {
      get:
        overrides.cookies?.get ??
        vi.fn(async ({ name }: { url: string; name: string }) =>
          cookieJar.has(name) ? { value: cookieJar.get(name) } : null,
        ),
    },
    declarativeNetRequest: {
      updateDynamicRules:
        overrides.declarativeNetRequest?.updateDynamicRules ?? vi.fn(async () => {}),
    },
    tabs: overrides.tabs ?? { create: vi.fn() },
  };
  const original = (globalThis as { chrome?: unknown }).chrome;
  (globalThis as { chrome?: unknown }).chrome = mock;
  return Object.assign(mock, {
    restore: () => {
      (globalThis as { chrome?: unknown }).chrome = original;
    },
    __setCookie: (name: string, value: string | null) => {
      if (value === null) cookieJar.delete(name);
      else cookieJar.set(name, value);
    },
  }) as InstalledMockChrome;
}

describe('StravaHeatmapAuthService', () => {
  let service: StravaHeatmapAuthService;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(StravaHeatmapAuthService);
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    // Ensure any chrome mock left over by a test is cleared (defensive; tests
    // call restore() themselves, but a throw before restore would leak).
    delete (globalThis as { chrome?: unknown }).chrome;
  });

  it('reports not-ready outside the extension context (no chrome API)', async () => {
    delete (globalThis as { chrome?: unknown }).chrome;
    await expect(service.ensureAuth()).resolves.toBe('not-ready');
    expect(service.authState()).toBe('not-ready');
  });

  it('reports not-ready when a CloudFront cookie is missing', async () => {
    const mock = installMockChrome();
    mock.__setCookie('CloudFront-Signature', null); // one signing cookie absent

    await expect(service.ensureAuth()).resolves.toBe('not-ready');
    expect(service.authState()).toBe('not-ready');
    // On the failure path the service removes any stale rule; it must NOT add one.
    expect(mock.declarativeNetRequest.updateDynamicRules).toHaveBeenCalledWith({
      removeRuleIds: [1],
    });
    const call = mock.declarativeNetRequest.updateDynamicRules.mock.calls[0][0];
    expect(call.addRules).toBeUndefined();
    mock.restore();
  });

  it('reports ready and installs the DNR rule when cookies are present and the probe succeeds', async () => {
    const mock = installMockChrome();
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, type: 'basic' }) as unknown as typeof fetch;

    await expect(service.ensureAuth()).resolves.toBe('ready');
    expect(service.authState()).toBe('ready');

    expect(mock.declarativeNetRequest.updateDynamicRules).toHaveBeenCalledTimes(1);
    const arg = mock.declarativeNetRequest.updateDynamicRules.mock.calls[0][0];
    expect(arg.removeRuleIds).toEqual([1]);
    const rule = arg.addRules[0];
    expect(rule.id).toBe(1);
    expect(rule.action.type).toBe('modifyHeaders');
    // Cookie header carries all four signing cookies.
    const cookieHeader = rule.action.requestHeaders.find(
      (h: { header: string }) => h.header === 'Cookie',
    );
    expect(cookieHeader.value).toContain('CloudFront-Key-Pair-Id=K1');
    expect(cookieHeader.value).toContain('CloudFront-Policy=P1');
    expect(cookieHeader.value).toContain('CloudFront-Signature=S1');
    expect(cookieHeader.value).toContain('_strava_idcf=I1');
    // CORS header set on the response.
    const corsHeader = rule.action.responseHeaders.find(
      (h: { header: string }) => h.header === 'Access-Control-Allow-Origin',
    );
    expect(corsHeader.value).toBe('*');
    mock.restore();
  });

  it('reports not-ready and removes the rule when the probe 403s (expired cookies)', async () => {
    const mock = installMockChrome();
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 403, type: 'basic' }) as unknown as typeof fetch;

    await expect(service.ensureAuth()).resolves.toBe('not-ready');
    expect(service.authState()).toBe('not-ready');
    // On failure the service removes any prior rule rather than installing one.
    expect(mock.declarativeNetRequest.updateDynamicRules).toHaveBeenCalledWith({
      removeRuleIds: [1],
    });
    mock.restore();
  });

  it('openStravaLogin opens the heatmap page via chrome.tabs when available', () => {
    const mock = installMockChrome();
    service.openStravaLogin();
    expect(mock.tabs!.create).toHaveBeenCalledWith({ url: 'https://www.strava.com/heatmap' });
    mock.restore();
  });

  it('openStravaLogin falls back to window.open outside the extension', () => {
    delete (globalThis as { chrome?: unknown }).chrome;
    const openSpy = vi.spyOn(globalThis, 'open').mockImplementation(() => null);
    service.openStravaLogin();
    expect(openSpy).toHaveBeenCalledWith('https://www.strava.com/heatmap', '_blank', 'noopener');
    openSpy.mockRestore();
  });

  it('markNotReady flips auth state to not-ready and removes the DNR rule', async () => {
    const mock = installMockChrome();
    // Start from a ready state so the flip is observable.
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, type: 'basic' }) as unknown as typeof fetch;
    await service.ensureAuth();
    expect(service.authState()).toBe('ready');

    await service.markNotReady();

    expect(service.authState()).toBe('not-ready');
    // The last updateDynamicRules call removed the rule (no addRules).
    const lastCall = mock.declarativeNetRequest.updateDynamicRules.mock.calls.at(-1)![0];
    expect(lastCall.removeRuleIds).toEqual([1]);
    expect(lastCall.addRules).toBeUndefined();
    mock.restore();
  });
});

import { TestBed } from '@angular/core/testing';
import { StravaSessionService, type ActivityListParams } from './strava-session.service';

function createMockResponse(init?: ResponseInit): Response {
  return new Response(null, init);
}

function createTextResponse(body: string, init?: ResponseInit): Response {
  return new Response(body, init);
}

function mockChromeRuntime(mockSendMessage: ReturnType<typeof vi.fn>) {
  const originalGlobal = (globalThis as any).chrome;
  (globalThis as any).chrome = {
    runtime: {
      id: 'test-extension-id',
      sendMessage: mockSendMessage,
    },
  };
  return () => {
    (globalThis as any).chrome = originalGlobal;
  };
}

describe('StravaSessionService', () => {
  let service: StravaSessionService;
  let restoreChrome: (() => void) | null = null;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(StravaSessionService);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    restoreChrome?.();
    restoreChrome = null;
  });

  describe('checkSession', () => {
    it('should return logged_in when background returns logged_in', async () => {
      const sendMessage = vi.fn().mockResolvedValue('logged_in');
      restoreChrome = mockChromeRuntime(sendMessage);

      await expect(service.checkSession()).resolves.toBe('logged_in');
    });

    it('should return login_required when background returns login_required', async () => {
      const sendMessage = vi.fn().mockResolvedValue('login_required');
      restoreChrome = mockChromeRuntime(sendMessage);

      await expect(service.checkSession()).resolves.toBe('login_required');
    });

    it('should return unknown_error when background returns unknown_error', async () => {
      const sendMessage = vi.fn().mockResolvedValue('unknown_error');
      restoreChrome = mockChromeRuntime(sendMessage);

      await expect(service.checkSession()).resolves.toBe('unknown_error');
    });

    it('should return unknown_error when chrome.runtime is unavailable', async () => {
      await expect(service.checkSession()).resolves.toBe('unknown_error');
    });

    it('should retry on sendMessage failure', async () => {
      const sendMessage = vi.fn()
        .mockRejectedValueOnce(new Error('first fail'))
        .mockRejectedValueOnce(new Error('second fail'))
        .mockResolvedValueOnce('logged_in');
      restoreChrome = mockChromeRuntime(sendMessage);

      await expect(service.checkSession()).resolves.toBe('logged_in');
      expect(sendMessage).toHaveBeenCalledTimes(3);
    });

    it('should return unknown_error after all retries fail', async () => {
      const sendMessage = vi.fn().mockRejectedValue(new Error('always fails'));
      restoreChrome = mockChromeRuntime(sendMessage);

      await expect(service.checkSession()).resolves.toBe('unknown_error');
      expect(sendMessage).toHaveBeenCalledTimes(3);
    });
  });

  describe('fetchActivityList', () => {
    const defaultParams: ActivityListParams = { page: 1, perPage: 30 };

    it('should return activities when fetch succeeds with valid JSON array', async () => {
      const activities = [
        { id: 100, name: 'Morning Ride', sport_type: 'Ride', start_date: '2025-01-01T00:00:00Z', start_date_local: '2025-01-01T01:00:00Z', distance: 42000, moving_time: 7200, elapsed_time: 7500 },
      ];

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        createTextResponse(JSON.stringify(activities), { status: 200 }),
      );

      const result = await service.fetchActivityList(defaultParams);

      expect(result).toEqual({ success: true, activities, status: 'logged_in' });
    });

    it('should return activities when response has a data wrapper', async () => {
      const activities = [
        { id: 200, name: 'Evening Walk', sport_type: 'Walk', start_date: '2025-06-01T18:00:00Z', start_date_local: '2025-06-01T20:00:00Z', distance: 5000, moving_time: 3600, elapsed_time: 3800 },
      ];

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        createTextResponse(JSON.stringify({ data: activities }), { status: 200 }),
      );

      const result = await service.fetchActivityList(defaultParams);

      expect(result).toEqual({ success: true, activities, status: 'logged_in' });
    });

    it('should set URL params correctly', async () => {
      let requestedUrl = '';
      vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
        requestedUrl = input as string;
        return Promise.resolve(createTextResponse('[]', { status: 200 }));
      });

      const params: ActivityListParams = { page: 2, perPage: 10, before: 1700000000, after: 1600000000 };
      await service.fetchActivityList(params);

      const qIndex = requestedUrl.indexOf('?');
      const qs = qIndex >= 0 ? requestedUrl.slice(qIndex + 1) : '';
      const searchParams = new URLSearchParams(qs);
      expect(searchParams.get('page')).toBe('2');
      expect(searchParams.get('per_page')).toBe('10');
      expect(searchParams.get('before')).toBe('1700000000');
      expect(searchParams.get('after')).toBe('1600000000');
    });

    it('should return STRAVA_LOGIN_REQUIRED when session is not active', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(createMockResponse({ status: 401 }));

      const result = await service.fetchActivityList(defaultParams);

      expect(result).toEqual({
        success: false,
        errorCode: 'STRAVA_LOGIN_REQUIRED',
        status: 'login_required',
      });
    });

    it('should return ACTIVITY_LIST_FETCH_FAILED when response is not valid JSON', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        createTextResponse('<html>Not JSON</html>', { status: 200 }),
      );

      const result = await service.fetchActivityList(defaultParams);

      expect(result).toEqual({
        success: false,
        errorCode: 'ACTIVITY_LIST_FETCH_FAILED',
        status: 'logged_in',
      });
    });

    it('should return STRAVA_REQUEST_FAILED when fetch throws', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Network error'));

      const result = await service.fetchActivityList(defaultParams);

      expect(result).toEqual({
        success: false,
        errorCode: 'STRAVA_REQUEST_FAILED',
        status: 'unknown_error',
      });
    });

    it('should include credentials: include in request', async () => {
      let requestInit: RequestInit | undefined;
      vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
        requestInit = init;
        return Promise.resolve(createTextResponse('[]', { status: 200 }));
      });

      await service.fetchActivityList(defaultParams);

      expect(requestInit?.credentials).toBe('include');
    });
  });

  describe('fetchActivityRoute', () => {
    it('should convert latlng stream to [lng, lat] coordinates on success', async () => {
      const streamData = { latlng: { type: 'latlng', data: [[50.06, 19.94], [50.07, 19.95], [50.08, 19.96]] } };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        createTextResponse(JSON.stringify(streamData), { status: 200 }),
      );

      const result = await service.fetchActivityRoute(100);

      expect(result).toEqual({
        success: true,
        latlng: [[19.94, 50.06], [19.95, 50.07], [19.96, 50.08]],
      });
    });

    it('should return NO_GPS_ROUTE when the API returns 404', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(createMockResponse({ status: 404 }));

      const result = await service.fetchActivityRoute(100);

      expect(result).toEqual({ success: false, errorCode: 'NO_GPS_ROUTE' });
    });

    it('should return STRAVA_LOGIN_REQUIRED when the API returns 401', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(createMockResponse({ status: 401 }));

      const result = await service.fetchActivityRoute(100);

      expect(result).toEqual({ success: false, errorCode: 'STRAVA_LOGIN_REQUIRED' });
    });

    it('should return STRAVA_RATE_LIMITED with retryAfterSeconds when API returns 429 with Retry-After header', async () => {
      const headers = new Headers({ 'Retry-After': '120' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 429, headers }));

      const result = await service.fetchActivityRoute(100);

      expect(result).toEqual({ success: false, errorCode: 'STRAVA_RATE_LIMITED', retryAfterSeconds: 120 });
    });

    it('should return STRAVA_RATE_LIMITED with default 60s when 429 has no Retry-After header', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(createMockResponse({ status: 429 }));

      const result = await service.fetchActivityRoute(100);

      expect(result).toEqual({ success: false, errorCode: 'STRAVA_RATE_LIMITED', retryAfterSeconds: 60 });
    });

    it('should return NO_GPS_ROUTE when latlng data is empty', async () => {
      const streamData = { latlng: { type: 'latlng', data: [] } };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        createTextResponse(JSON.stringify(streamData), { status: 200 }),
      );

      const result = await service.fetchActivityRoute(100);

      expect(result).toEqual({ success: false, errorCode: 'NO_GPS_ROUTE' });
    });

    it('should return NO_GPS_ROUTE when latlng key is missing from response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        createTextResponse(JSON.stringify({ alt: { data: [] } }), { status: 200 }),
      );

      const result = await service.fetchActivityRoute(100);

      expect(result).toEqual({ success: false, errorCode: 'NO_GPS_ROUTE' });
    });

    it('should return ACTIVITY_ROUTE_FETCH_FAILED when fetch fails', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Network error'));

      const result = await service.fetchActivityRoute(100);

      expect(result).toEqual({ success: false, errorCode: 'ACTIVITY_ROUTE_FETCH_FAILED' });
    });

    it('should include credentials: include in the route request', async () => {
      let requestInit: RequestInit | undefined;
      vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
        requestInit = init;
        return Promise.resolve(createTextResponse('{"latlng":{"data":[]}}', { status: 200 }));
      });

      await service.fetchActivityRoute(100);

      expect(requestInit?.credentials).toBe('include');
    });
  });

  describe('normalizeSessionError', () => {
    it('should return STRAVA_REQUEST_FAILED for TypeError', () => {
      expect(service.normalizeSessionError(new TypeError('Failed to fetch'))).toBe('STRAVA_REQUEST_FAILED');
    });

    it('should return STRAVA_REQUEST_FAILED for DOMException', () => {
      expect(service.normalizeSessionError(new DOMException('Aborted'))).toBe('STRAVA_REQUEST_FAILED');
    });

    it('should return STRAVA_REQUEST_FAILED for generic errors', () => {
      expect(service.normalizeSessionError(new Error('Something went wrong'))).toBe('STRAVA_REQUEST_FAILED');
    });

    it('should return STRAVA_REQUEST_FAILED for non-Error values', () => {
      expect(service.normalizeSessionError('string error')).toBe('STRAVA_REQUEST_FAILED');
      expect(service.normalizeSessionError(null)).toBe('STRAVA_REQUEST_FAILED');
    });
  });
});

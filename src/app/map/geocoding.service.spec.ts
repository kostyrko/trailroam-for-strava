import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GeocodingService } from './geocoding.service';

const KRAKOW_RESPONSE = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        name: 'Kraków',
        state: 'województwo małopolskie',
        country: 'Polska',
        extent: [19.79, 50.12, 20.21, 49.96],
      },
      geometry: { type: 'Point', coordinates: [19.997, 50.046] },
    },
    {
      type: 'Feature',
      properties: { name: 'Kraków', country: 'Polska' },
      geometry: { type: 'Point', coordinates: [19.998, 50.047] },
    },
  ],
};

describe('GeocodingService', () => {
  let service: GeocodingService;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    service = new GeocodingService();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns empty for queries shorter than minimum length', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    expect(await service.search('K')).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('maps Photon features to GeocodeResult with [lng, lat] center', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => KRAKOW_RESPONSE,
    }) as unknown as typeof fetch;

    const results = await service.search('Krakow');
    expect(results).toHaveLength(2);
    expect(results[0].center).toEqual([19.997, 50.046]);
    expect(results[0].label).toBe('Kraków, województwo małopolskie, Polska');
  });

  it('normalizes Photon extent [w,n,e,s] to bbox [w,s,e,n]', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => KRAKOW_RESPONSE,
    }) as unknown as typeof fetch;

    const [first] = await service.search('Krakow');
    expect(first.bbox).toEqual([19.79, 49.96, 20.21, 50.12]);
  });

  it('resolve() returns the first result or null', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => KRAKOW_RESPONSE,
    }) as unknown as typeof fetch;
    expect((await service.resolve('Krakow'))!.label).toContain('Kraków');

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ type: 'FeatureCollection', features: [] }),
    }) as unknown as typeof fetch;
    expect(await service.resolve('nowhere')).toBeNull();
  });

  it('returns empty array on network failure instead of throwing', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    expect(await service.search('Krakow')).toEqual([]);
  });

  it('returns empty array on non-ok HTTP status', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    expect(await service.search('Krakow')).toEqual([]);
  });

  it('skips features without usable coordinates or label', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        type: 'FeatureCollection',
        features: [
          { properties: { name: 'NoGeom' }, geometry: { coordinates: [] } },
          { properties: {}, geometry: { coordinates: [1, 2] } },
          { properties: { name: 'Valid' }, geometry: { coordinates: [3, 4] } },
        ],
      }),
    }) as unknown as typeof fetch;

    const results = await service.search('xyz');
    expect(results.map((r) => r.label)).toEqual(['Valid']);
  });
});

import { TestBed } from '@angular/core/testing';
import { type Map } from 'maplibre-gl';
import {
  STRAVA_HEATMAP_LAYER_ID,
  STRAVA_HEATMAP_SOURCE_ID,
  StravaHeatmapService,
} from './strava-heatmap.service';

/**
 * Minimal MapLibre map stub. Only the surface this service touches is mocked:
 * source/layer add+lookup, paint/layout property setters, and the raster
 * source's `setTiles`. `getSource` returns undefined until `addSource` is called
 * so the idempotency guard behaves like the real map.
 */
function makeMapStub() {
  const sources = new globalThis.Map<string, { setTiles: ReturnType<typeof vi.fn> }>();
  const layers = new globalThis.Map<string, { type: string }>();
  const stub = {
    getSource: vi.fn((id: string) => sources.get(id)),
    addSource: vi.fn((id: string, _spec: unknown) => {
      sources.set(id, { setTiles: vi.fn() });
    }),
    addLayer: vi.fn((layer: { id: string; type: string }) => {
      layers.set(layer.id, { type: layer.type });
    }),
    getLayer: vi.fn((id: string) => layers.get(id)),
    setPaintProperty: vi.fn(),
    setLayoutProperty: vi.fn(),
  };
  return Object.assign(stub as unknown as Map, {
    /** Test accessor for the backing source object (bypasses the vi.fn wrapper). */
    __source: (id: string) => sources.get(id),
  }) as Map & { __source: (id: string) => { setTiles: ReturnType<typeof vi.fn> } | undefined };
}

describe('StravaHeatmapService', () => {
  let service: StravaHeatmapService;
  let map: ReturnType<typeof makeMapStub>;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(StravaHeatmapService);
    map = makeMapStub();
    service.init(map);
  });

  it('creates the raster source and layer with the expected ids, hidden by default', () => {
    service.ensureOverlay();
    expect(map.addSource).toHaveBeenCalledWith(
      STRAVA_HEATMAP_SOURCE_ID,
      expect.objectContaining({ type: 'raster', tileSize: 256 }),
    );
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: STRAVA_HEATMAP_LAYER_ID,
        type: 'raster',
        source: STRAVA_HEATMAP_SOURCE_ID,
        layout: { visibility: 'none' },
      }),
    );
  });

  it('is idempotent: a second ensureOverlay does not re-add the source/layer', () => {
    service.ensureOverlay();
    service.ensureOverlay();
    expect(map.addSource).toHaveBeenCalledTimes(1);
    expect(map.addLayer).toHaveBeenCalledTimes(1);
  });

  it('switching sport re-binds the raster source tile URL', () => {
    service.ensureOverlay();
    const source = map.__source(STRAVA_HEATMAP_SOURCE_ID)!;

    service.setSport('ride');

    expect(source.setTiles).toHaveBeenCalledTimes(1);
    const url = source.setTiles.mock.calls[0][0][0] as string;
    expect(url).toContain('/ride/');
    expect(url).not.toContain('/all/');
  });

  it('changing opacity sets raster-opacity on the layer', () => {
    service.ensureOverlay();
    service.setOpacity(0.25);
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      STRAVA_HEATMAP_LAYER_ID,
      'raster-opacity',
      0.25,
    );
  });

  it('making the layer visible flips the layout visibility', () => {
    service.ensureOverlay();
    service.setVisible(true);
    expect(map.setLayoutProperty).toHaveBeenCalledWith(
      STRAVA_HEATMAP_LAYER_ID,
      'visibility',
      'visible',
    );
  });

  it('restores the current sport/opacity/visibility when re-created after a style switch', () => {
    // First activation: pick a sport, opacity, and turn on.
    service.ensureOverlay();
    service.setSport('run');
    service.setOpacity(0.4);
    service.setVisible(true);

    // Simulate a basemap switch: the source is gone, so ensureOverlay re-creates it.
    (map.getSource as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    service.ensureOverlay();

    // Source re-created (addSource called a second time), with the current sport
    // baked into the initial tiles URL — there is no setTiles call on the fresh path.
    expect(map.addSource).toHaveBeenCalledTimes(2);
    const recreatedTiles = (
      map.addSource as ReturnType<typeof vi.fn>
    ).mock.calls[1][1] as { tiles: string[] };
    expect(recreatedTiles.tiles[0]).toContain('/run/');
    // Opacity + visibility re-applied to the re-created layer.
    expect(map.setPaintProperty).toHaveBeenLastCalledWith(
      STRAVA_HEATMAP_LAYER_ID,
      'raster-opacity',
      0.4,
    );
    expect(map.setLayoutProperty).toHaveBeenLastCalledWith(
      STRAVA_HEATMAP_LAYER_ID,
      'visibility',
      'visible',
    );
  });
});

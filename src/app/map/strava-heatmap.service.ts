import { Injectable } from '@angular/core';
import {
  type Map as MapLibreMap,
  type RasterLayerSpecification,
  type RasterSourceSpecification,
  type RasterTileSource,
} from 'maplibre-gl';

/**
 * Strava global heatmap sport tokens. These are placed into the tile URL path
 * segment `{activity}` (see {@link buildStravaHeatmapTileUrl}). Kept here as the
 * single source of truth for the map layer; the Phase 2 dropdown will reuse it.
 */
export const STRAVA_HEATMAP_SPORTS = [
  'all',
  'ride',
  'run',
  'water',
  'winter',
] as const;
export type StravaHeatmapSport = (typeof STRAVA_HEATMAP_SPORTS)[number];

/**
 * Selectable sports for the dropdown, each pairing the URL token with a display
 * label. The UI iterates this; `all` is first so it reads as the default choice.
 */
export const STRAVA_HEATMAP_SPORT_OPTIONS: readonly { token: StravaHeatmapSport; label: string }[] = [
  { token: 'all', label: 'All' },
  { token: 'ride', label: 'Ride' },
  { token: 'run', label: 'Run' },
  { token: 'water', label: 'Water' },
  { token: 'winter', label: 'Winter' },
];

/** Fixed color scheme for the heatmap (PRD decision: constant, not user-facing). */
const STRAVA_HEATMAP_COLOR = 'hot';

/**
 * Template parameter baked into the cache-busting query. Strava bumps this value
 * occasionally; it must match the one expected by `content-a.strava.com` or tiles
 * resolve to a stale/empty response. `v=19` is current as of 2026-07.
 */
const STRAVA_HEATMAP_TILE_VERSION = 'v=19';

/** Highest zoom level Strava serves heatmap tiles for. */
const STRAVA_HEATMAP_MAX_ZOOM = 15;

export const STRAVA_HEATMAP_SOURCE_ID = 'trailroam-strava-heatmap';
export const STRAVA_HEATMAP_LAYER_ID = 'trailroam-strava-heatmap-layer';

/** Default raster opacity (PRD decision: 50%). */
export const STRAVA_HEATMAP_DEFAULT_OPACITY = 0.5;

function buildStravaHeatmapTileUrl(sport: StravaHeatmapSport): string {
  return (
    `https://content-a.strava.com/identified/globalheat/${sport}/${STRAVA_HEATMAP_COLOR}` +
    `/{z}/{x}/{y}.png?${STRAVA_HEATMAP_TILE_VERSION}`
  );
}

/**
 * Owns the Strava global heatmap raster overlay. This is a *population-wide*
 * tile layer sourced from Strava's CDN — distinct from {@link RouteRendererService}'s
 * geojson line "heatmap" (`trailroam-heatmap`), which renders the user's own activities.
 *
 * Like the route renderer, it holds the MapLibre map via {@link init} and registers
 * its source/layer idempotently (guarded by `map.getSource(id)`). Because a basemap
 * switch (`map.setStyle`) wipes all sources/layers, the owning component must call
 * {@link ensureOverlay} again inside its `style.load` handler to re-create the overlay
 * and restore the previously selected sport/opacity/visibility.
 *
 * Auth: Strava tiles are gated behind CloudFront signing cookies injected by a
 * `declarativeNetRequest` rule (Phase 3). Until that lands the overlay remains
 * hidden and no tile requests are issued, so there is no auth surface yet.
 */
@Injectable({
  providedIn: 'root',
})
export class StravaHeatmapService {
  private map: MapLibreMap | null = null;
  private sport: StravaHeatmapSport = 'all';
  private opacity = STRAVA_HEATMAP_DEFAULT_OPACITY;
  private visible = false;

  init(map: MapLibreMap): void {
    this.map = map;
  }

  /**
   * Creates the raster source + layer if absent, then restores the current
   * sport/opacity/visibility. Safe to call repeatedly (idempotent) and after a
   * basemap switch.
   */
  ensureOverlay(): void {
    const map = this.map;
    if (!map) {
      return;
    }
    if (!map.getSource(STRAVA_HEATMAP_SOURCE_ID)) {
      const source: RasterSourceSpecification = {
        type: 'raster',
        tiles: [buildStravaHeatmapTileUrl(this.sport)],
        tileSize: 256,
        maxzoom: STRAVA_HEATMAP_MAX_ZOOM,
        attribution: '&copy; Strava Heatmap',
      };
      map.addSource(STRAVA_HEATMAP_SOURCE_ID, source);

      const layer: RasterLayerSpecification = {
        id: STRAVA_HEATMAP_LAYER_ID,
        type: 'raster',
        source: STRAVA_HEATMAP_SOURCE_ID,
        layout: { visibility: 'none' },
        paint: { 'raster-opacity': this.opacity },
      };
      map.addLayer(layer);
      // The layer was added hidden (`visibility: 'none'`). Restore the current
      // sport/opacity/visibility so a basemap switch (`setStyle`) re-creates the
      // overlay in the same on/off state the user had before the switch. Without
      // this the heatmap vanishes when switching base layers even when it was on.
      this.syncTiles();
      this.applyOpacity();
      this.applyVisibility();
      return;
    }

    // Source already existed (e.g. re-entry after a partial style load). Re-sync
    // state so a basemap switch restores sport/opacity/visibility correctly.
    this.syncTiles();
    this.applyOpacity();
    this.applyVisibility();
  }

  /** Switches the displayed sport by re-binding the raster source's tile URL. */
  setSport(sport: StravaHeatmapSport): void {
    if (sport === this.sport) {
      return;
    }
    this.sport = sport;
    this.syncTiles();
  }

  /** Sets raster opacity in the range 0..1. */
  setOpacity(opacity: number): void {
    const clamped = Math.max(0, Math.min(1, opacity));
    if (clamped === this.opacity) {
      return;
    }
    this.opacity = clamped;
    this.applyOpacity();
  }

  setVisible(visible: boolean): void {
    if (visible === this.visible) {
      return;
    }
    this.visible = visible;
    this.applyVisibility();
  }

  private syncTiles(): void {
    const map = this.map;
    if (!map) {
      return;
    }
    const source = map.getSource(STRAVA_HEATMAP_SOURCE_ID) as RasterTileSource | undefined;
    if (!source) {
      return;
    }
    source.setTiles([buildStravaHeatmapTileUrl(this.sport)]);
  }

  private applyOpacity(): void {
    const map = this.map;
    if (!map || !map.getLayer(STRAVA_HEATMAP_LAYER_ID)) {
      return;
    }
    map.setPaintProperty(STRAVA_HEATMAP_LAYER_ID, 'raster-opacity', this.opacity);
  }

  private applyVisibility(): void {
    const map = this.map;
    if (!map || !map.getLayer(STRAVA_HEATMAP_LAYER_ID)) {
      return;
    }
    map.setLayoutProperty(
      STRAVA_HEATMAP_LAYER_ID,
      'visibility',
      this.visible ? 'visible' : 'none',
    );
  }
}

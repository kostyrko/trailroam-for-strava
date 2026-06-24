import { Injectable } from '@angular/core';
import { type Map as MapLibreMap, type MapLayerMouseEvent, type GeoJSONSource } from 'maplibre-gl';
import { type MapRouteFeature } from './mock-routes';
import type { RouteBounds } from '../storage/storage.models';

export const ROUTES_SOURCE_ID = 'trailroam-routes';
export const ROUTES_POINTS_SOURCE_ID = 'trailroam-route-points';
export const ROUTES_LAYER_ID = 'trailroam-route-lines';
export const ROUTES_SELECTED_LAYER_ID = 'trailroam-route-selected';
export const CLUSTER_LAYER_ID = 'trailroam-route-clusters';
export const CLUSTER_COUNT_LAYER_ID = 'trailroam-route-cluster-count';
export const UNCLUSTERED_POINT_LAYER_ID = 'trailroam-route-point';
export const HOVER_POINT_SOURCE_ID = 'trailroam-hover-point';
export const HOVER_POINT_LAYER_ID = 'trailroam-hover-point-layer';
export const HEATMAP_SOURCE_ID = 'trailroam-heatmap-lines';
export const ROUTES_HEATMAP_LAYER_ID = 'trailroam-heatmap';

export const LINE_MIN_ZOOM = 9;

const CLUSTER_MAX_ZOOM = 12;

export type RouteSelectedHandler = (route: MapRouteFeature) => void;

@Injectable({
  providedIn: 'root',
})
export class RouteRendererService {
  private map: MapLibreMap | null = null;
  private initialized = false;
  private routes: MapRouteFeature[] = [];
  private onRouteSelected: RouteSelectedHandler | null = null;
  private routesLookup: Map<string, MapRouteFeature> = new Map();
  private mapEventListeners: (() => void)[] = [];
  private emphasisActive = false;
  private emphasisMatchingIds: Set<string> | null = null;
  private emphasisSelectedId: string | null = null;
  private heatmapMode = false;
  private opacityOverride: number | null = null;
  private readonly categoryColorExpr = [
    'match', ['get', 'category'],
    'ride', '#1f6f50',
    'run', '#2d7fb8',
    'walk', '#b87a2d',
    'hike', '#8b5e3c',
    'water', '#3c9bb8',
    'paddling', '#3ca8a8',
    'winter', '#8ba8c8',
    '#63746a',
  ] as unknown as string;

  init(map: MapLibreMap): void {
    this.map = map;
  }

  renderRoutes(routes: MapRouteFeature[], routeSelected: RouteSelectedHandler): void {
    this.routes = routes;
    this.onRouteSelected = routeSelected;
    this.routesLookup = new Map(routes.map((r) => [r.activityId, r]));

    const map = this.map;
    if (!map) { return; }

    const existingSource = map.getSource(ROUTES_SOURCE_ID);
    if (existingSource) {
      this.syncRouteSource();
      this.syncFinal();
      return;
    }

    this.initialized = true;

    map.addSource(ROUTES_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    this.syncRouteSource();

    map.addSource(ROUTES_POINTS_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      cluster: true,
      clusterMaxZoom: CLUSTER_MAX_ZOOM,
      clusterRadius: 60,
    });

    this.syncCentroidSource();

    map.addLayer({
      id: `${ROUTES_LAYER_ID}-casing`,
      type: 'line',
      source: ROUTES_SOURCE_ID,
      minzoom: LINE_MIN_ZOOM,
      paint: {
        'line-color': '#ffffff',
        'line-opacity': [ 'case', [ '==', [ 'get', 'emphasis' ], 0 ], 0.15, 0.9 ],
        'line-width': 7,
      },
    });

    map.addLayer({
      id: ROUTES_LAYER_ID,
      type: 'line',
      source: ROUTES_SOURCE_ID,
      minzoom: LINE_MIN_ZOOM,
      paint: {
        'line-color': this.categoryColorExpr,
        'line-opacity': [ 'case', [ '==', [ 'get', 'emphasis' ], 0 ], 0.15, 0.85 ],
        'line-width': [ 'case', [ '==', [ 'get', 'emphasis' ], 0 ], 2, [ 'case', [ '==', [ 'get', 'emphasis' ], 3 ], 7, 4 ] ],
      },
    });

    map.addLayer({
      id: ROUTES_SELECTED_LAYER_ID,
      type: 'line',
      source: ROUTES_SOURCE_ID,
      minzoom: LINE_MIN_ZOOM,
      filter: ['==', ['get', 'activityId'], ''],
      paint: {
        'line-color': this.categoryColorExpr,
        'line-opacity': 1,
        'line-width': 5,
      },
    });

    map.addLayer({
      id: CLUSTER_LAYER_ID,
      type: 'circle',
      source: ROUTES_POINTS_SOURCE_ID,
      filter: ['has', 'point_count'],
      maxzoom: LINE_MIN_ZOOM,
      paint: {
        'circle-color': '#1f6f50',
        'circle-opacity': 0.85,
        'circle-radius': ['step', ['get', 'point_count'], 17, 10, 20, 50, 24, 100, 29],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 3,
      },
    });

    map.addLayer({
      id: CLUSTER_COUNT_LAYER_ID,
      type: 'symbol',
      source: ROUTES_POINTS_SOURCE_ID,
      filter: ['has', 'point_count'],
      maxzoom: LINE_MIN_ZOOM,
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 13,
      },
      paint: {
        'text-color': '#ffffff',
      },
    });

    map.addLayer({
      id: UNCLUSTERED_POINT_LAYER_ID,
      type: 'circle',
      source: ROUTES_POINTS_SOURCE_ID,
      filter: ['!', ['has', 'point_count']],
      maxzoom: LINE_MIN_ZOOM,
      paint: {
        'circle-color': '#1f6f50',
        'circle-opacity': 0.85,
        'circle-radius': 17,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 3,
      },
    });

    map.addLayer({
      id: 'trailroam-route-single-label',
      type: 'symbol',
      source: ROUTES_POINTS_SOURCE_ID,
      filter: ['!', ['has', 'point_count']],
      maxzoom: LINE_MIN_ZOOM,
      layout: {
        'text-field': '1',
        'text-font': ['Noto Sans Regular'],
        'text-size': 11,
      },
      paint: {
        'text-color': '#ffffff',
      },
    });

    const heatmapLineFeatures = routes.map((route) => ({
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'LineString' as const, coordinates: route.coordinates },
    }));

    map.addSource(HEATMAP_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: heatmapLineFeatures },
    });

    map.addLayer({
      id: ROUTES_HEATMAP_LAYER_ID,
      type: 'line',
      source: HEATMAP_SOURCE_ID,
      layout: { visibility: 'none' },
      paint: {
        'line-color': '#ff3b30',
        'line-opacity': 0.071,
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, 6, 9, 10, 14, 16],
        'line-blur': ['interpolate', ['linear'], ['zoom'], 5, 4, 9, 3, 14, 2],
      },
    });

    map.addSource(HOVER_POINT_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    map.addLayer({
      id: HOVER_POINT_LAYER_ID,
      type: 'circle',
      source: HOVER_POINT_SOURCE_ID,
      paint: {
        'circle-color': '#d15b2f',
        'circle-radius': 5,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    });

    this.addEventListeners();
    this.syncFinal();
  }

  showHoverPoint(lng: number, lat: number): void {
    const map = this.map;
    if (!map) { return; }
    const source = map.getSource(HOVER_POINT_SOURCE_ID) as GeoJSONSource;
    if (!source) { return; }
    source.setData({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: {} }],
    });
  }

  clearHoverPoint(): void {
    const map = this.map;
    if (!map) { return; }
    const source = map.getSource(HOVER_POINT_SOURCE_ID) as GeoJSONSource;
    if (!source) { return; }
    source.setData({ type: 'FeatureCollection', features: [] });
  }

  updateRoutes(routes: MapRouteFeature[]): void {
    this.routes = routes;
    this.routesLookup = new Map(routes.map((r) => [r.activityId, r]));
    const map = this.map;
    if (!map) { return; }
    this.syncRouteSource();
    this.syncCentroidSource();
    this.updateHeatmapSource();
    this.syncFinal();
  }

  selectRoute(activityId: string): void {
    const map = this.map;
    if (!map) { return; }
    map.setFilter(ROUTES_SELECTED_LAYER_ID, ['==', ['get', 'activityId'], activityId]);
  }

  deselectRoute(): void {
    const map = this.map;
    if (!map) { return; }
    map.setFilter(ROUTES_SELECTED_LAYER_ID, ['==', ['get', 'activityId'], '']);
  }

  fitToRoute(coordinates: [number, number][], bounds?: RouteBounds): void {
    const map = this.map;
    if (!map || coordinates.length === 0) { return; }

    const fit = () => {
      if (bounds) {
        map.fitBounds([bounds.west, bounds.south, bounds.east, bounds.north], { padding: 80, maxZoom: 15 });
      } else {
        const lngs = coordinates.map((c) => c[0]);
        const lats = coordinates.map((c) => c[1]);
        map.fitBounds(
          [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)],
          { padding: 80, maxZoom: 15 },
        );
      }
    };

    if (map.isStyleLoaded()) {
      fit();
    } else {
      map.once('style.load', fit);
      setTimeout(fit, 500);
    }
  }

  private readonly opacityTargets = [
    `${ROUTES_LAYER_ID}-casing`,
    ROUTES_LAYER_ID,
    ROUTES_SELECTED_LAYER_ID,
    ROUTES_HEATMAP_LAYER_ID,
  ];

  setLayerOpacity(value: number): void {
    this.opacityOverride = value;
    const map = this.map;
    if (!map) { return; }
    for (const id of this.opacityTargets) {
      const layer = map.getLayer(id);
      if (layer && layer.type === 'line') {
        map.setPaintProperty(id, 'line-opacity', value);
      }
    }
  }

  resetLayerOpacity(): void {
    this.opacityOverride = null;
    const map = this.map;
    if (!map) { return; }
    if (map.getLayer(`${ROUTES_LAYER_ID}-casing`)) {
      map.setPaintProperty(`${ROUTES_LAYER_ID}-casing`, 'line-opacity', [ 'case', [ '==', [ 'get', 'emphasis' ], 0 ], 0.15, 0.9 ]);
    }
    if (map.getLayer(ROUTES_LAYER_ID)) {
      map.setPaintProperty(ROUTES_LAYER_ID, 'line-opacity', [ 'case', [ '==', [ 'get', 'emphasis' ], 0 ], 0.15, 0.85 ]);
    }
    if (map.getLayer(ROUTES_SELECTED_LAYER_ID)) {
      map.setPaintProperty(ROUTES_SELECTED_LAYER_ID, 'line-opacity', 1);
    }
    if (map.getLayer(ROUTES_HEATMAP_LAYER_ID)) {
      map.setPaintProperty(ROUTES_HEATMAP_LAYER_ID, 'line-opacity', 0.071);
    }
  }

  toggleHeatmap(): void {
    this.heatmapMode = !this.heatmapMode;
    const map = this.map;
    if (!map) { return; }
    const routeLayers = [
      `${ROUTES_LAYER_ID}-casing`,
      ROUTES_LAYER_ID,
      ROUTES_SELECTED_LAYER_ID,
      CLUSTER_LAYER_ID,
      CLUSTER_COUNT_LAYER_ID,
      UNCLUSTERED_POINT_LAYER_ID,
      'trailroam-route-single-label',
    ];
    const heatmapLayers = [ROUTES_HEATMAP_LAYER_ID];
    const routeVisible = this.heatmapMode ? 'none' : 'visible';
    const heatmapVisible = this.heatmapMode ? 'visible' : 'none';
    for (const id of routeLayers) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', routeVisible);
      }
    }
    for (const id of heatmapLayers) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', heatmapVisible);
      }
    }
  }

  isHeatmapActive(): boolean {
    return this.heatmapMode;
  }

  setEmphasis(matchingIds: Set<string> | null, selectedId: string | null): void {
    this.emphasisActive = true;
    this.emphasisMatchingIds = matchingIds;
    this.emphasisSelectedId = selectedId;
    this.syncRouteSource();
  }

  clearEmphasis(): void {
    this.emphasisActive = false;
    this.emphasisMatchingIds = null;
    this.emphasisSelectedId = null;
    this.syncRouteSource();
  }

  private syncRouteSource(): void {
    const source = this.map?.getSource(ROUTES_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) { return; }

    const matchingIds = this.emphasisMatchingIds;
    const selId = this.emphasisSelectedId;
    const hasMatching = matchingIds != null && matchingIds.size > 0;
    const hasFilter = matchingIds != null;

    if (hasFilter && !hasMatching && !selId) {
      source.setData({ type: 'FeatureCollection', features: [] });
      this.syncCentroidSource();
      this.syncFinal();
      return;
    }

    const features = this.routes
      .filter((route) => {
        if (!hasMatching) { return true; }
        if (matchingIds!.has(route.activityId)) { return true; }
        if (route.activityId === selId) { return true; }
        return false;
      })
      .map((route) => {
        const isSelected = route.activityId === selId;
        let emphasis = 2;
        if (isSelected) { emphasis = 3; }
        else if (selId) { emphasis = 0; }
        return {
          type: 'Feature' as const,
          properties: { activityId: route.activityId, name: route.name, category: route.activity.activityCategory, emphasis },
          geometry: { type: 'LineString' as const, coordinates: route.coordinates },
        };
      });

    source.setData({ type: 'FeatureCollection', features });
    this.syncCentroidSource();
    this.syncFinal();
  }

  private syncCentroidSource(): void {
    const source = this.map?.getSource(ROUTES_POINTS_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) { return; }
    const matchingIds = this.emphasisMatchingIds;
    const selId = this.emphasisSelectedId;
    const hasMatching = matchingIds != null && matchingIds.size > 0;
    const hasFilter = matchingIds != null;
    const filtered = (hasFilter && !hasMatching)
      ? []
      : hasMatching
        ? this.routes.filter((r) => matchingIds!.has(r.activityId) || r.activityId === selId)
        : this.routes;
    const features = filtered.map((route) => {
      const centroid = this.computeCentroid(route.coordinates);
      return {
        type: 'Feature' as const,
        properties: { activityId: route.activityId, name: route.name, category: route.activity.activityCategory },
        geometry: { type: 'Point' as const, coordinates: centroid },
      };
    });
    source.setData({ type: 'FeatureCollection', features });
  }

  private syncFinal(): void {
    const map = this.map;
    if (!map) { return; }

    const selId = this.emphasisSelectedId;
    if (selId) {
      map.setFilter(ROUTES_SELECTED_LAYER_ID, ['==', ['get', 'activityId'], selId]);
    } else {
      map.setFilter(ROUTES_SELECTED_LAYER_ID, ['==', ['get', 'activityId'], '']);
    }

    this.updateHeatmapSource();
  }

  private updateHeatmapSource(): void {
    const map = this.map;
    if (!map) { return; }
    const source = map.getSource(HEATMAP_SOURCE_ID) as GeoJSONSource;
    if (!source) { return; }
    const matchingIds = this.emphasisMatchingIds;
    const selId = this.emphasisSelectedId;
    const hasMatching = matchingIds != null && matchingIds.size > 0;
    const hasFilter = matchingIds != null;

    if (hasFilter && !hasMatching && !selId) {
      source.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    const lineFeatures = this.routes
      .filter((route) => {
        if (!hasMatching) { return true; }
        if (matchingIds!.has(route.activityId)) { return true; }
        if (route.activityId === selId) { return true; }
        return false;
      })
      .map((route) => ({
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'LineString' as const, coordinates: route.coordinates },
      }));
    source.setData({ type: 'FeatureCollection', features: lineFeatures });
  }

  private addEventListeners(): void {
    const map = this.map;
    if (!map) { return; }

    this.removeEventListeners();

    const onClusterClick = (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature) { return; }
      const clusterId = feature.properties?.['cluster_id'];
      const source = map.getSource(ROUTES_POINTS_SOURCE_ID) as GeoJSONSource;
      source.getClusterExpansionZoom(clusterId).then((zoom) => {
        const coords = (feature.geometry as unknown as { coordinates: [number, number] }).coordinates;
        map.flyTo({ center: coords, zoom });
      }).catch(() => {});
    };

    const onSingleClick = (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature) { return; }
      const activityId = feature.properties?.['activityId'];
      if (typeof activityId !== 'string') { return; }
      const selectedRoute = this.routesLookup.get(activityId);
      if (!selectedRoute) { return; }
      this.fitToRoute(selectedRoute.coordinates, selectedRoute.route.bounds);
      this.selectRoute(selectedRoute.activityId);
      this.onRouteSelected?.(selectedRoute);
    };

    const onLineClick = (event: MapLayerMouseEvent) => {
      const activityId = event.features?.[0]?.properties?.['activityId'];
      if (typeof activityId !== 'string') { return; }
      const selectedRoute = this.routesLookup.get(activityId);
      if (!selectedRoute) { return; }
      this.selectRoute(selectedRoute.activityId);
      this.onRouteSelected?.(selectedRoute);
    };

    const onPointerEnter = () => { map.getCanvas().style.cursor = 'pointer'; };
    const onPointerLeave = () => { map.getCanvas().style.cursor = ''; };

    map.on('click', CLUSTER_LAYER_ID, onClusterClick);
    map.on('click', UNCLUSTERED_POINT_LAYER_ID, onSingleClick);
    map.on('click', ROUTES_LAYER_ID, onLineClick);
    map.on('mouseenter', CLUSTER_LAYER_ID, onPointerEnter);
    map.on('mouseleave', CLUSTER_LAYER_ID, onPointerLeave);
    map.on('mouseenter', UNCLUSTERED_POINT_LAYER_ID, onPointerEnter);
    map.on('mouseleave', UNCLUSTERED_POINT_LAYER_ID, onPointerLeave);
    map.on('mouseenter', ROUTES_LAYER_ID, onPointerEnter);
    map.on('mouseleave', ROUTES_LAYER_ID, onPointerLeave);

    this.mapEventListeners = [
      () => map.off('click', CLUSTER_LAYER_ID, onClusterClick),
      () => map.off('click', UNCLUSTERED_POINT_LAYER_ID, onSingleClick),
      () => map.off('click', ROUTES_LAYER_ID, onLineClick),
      () => map.off('mouseenter', CLUSTER_LAYER_ID, onPointerEnter),
      () => map.off('mouseleave', CLUSTER_LAYER_ID, onPointerLeave),
      () => map.off('mouseenter', UNCLUSTERED_POINT_LAYER_ID, onPointerEnter),
      () => map.off('mouseleave', UNCLUSTERED_POINT_LAYER_ID, onPointerLeave),
      () => map.off('mouseenter', ROUTES_LAYER_ID, onPointerEnter),
      () => map.off('mouseleave', ROUTES_LAYER_ID, onPointerLeave),
    ];
  }

  private removeEventListeners(): void {
    for (const remove of this.mapEventListeners) {
      remove();
    }
    this.mapEventListeners = [];
  }

  private computeCentroid(coordinates: [number, number][]): [number, number] {
    if (coordinates.length === 0) { return [0, 0]; }
    let sumLng = 0;
    let sumLat = 0;
    for (const c of coordinates) {
      sumLng += c[0];
      sumLat += c[1];
    }
    return [sumLng / coordinates.length, sumLat / coordinates.length];
  }
}

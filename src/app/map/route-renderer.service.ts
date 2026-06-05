import { Injectable } from '@angular/core';
import { type FilterSpecification, type Map as MapLibreMap, type MapLayerMouseEvent, type GeoJSONSource } from 'maplibre-gl';
import { type MapRouteFeature } from './mock-routes';

export const ROUTES_SOURCE_ID = 'trailroam-routes';
export const ROUTES_POINTS_SOURCE_ID = 'trailroam-route-points';
export const ROUTES_LAYER_ID = 'trailroam-route-lines';
export const ROUTES_SELECTED_LAYER_ID = 'trailroam-route-selected';
export const CLUSTER_LAYER_ID = 'trailroam-route-clusters';
export const CLUSTER_COUNT_LAYER_ID = 'trailroam-route-cluster-count';
export const UNCLUSTERED_POINT_LAYER_ID = 'trailroam-route-point';

const CLUSTER_MAX_ZOOM = 12;
const LINE_MIN_ZOOM = 9;

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

  init(map: MapLibreMap): void {
    this.map = map;
  }

  renderRoutes(routes: MapRouteFeature[], routeSelected: RouteSelectedHandler): void {
    this.routes = routes;
    this.onRouteSelected = routeSelected;
    this.routesLookup = new Map(routes.map((r) => [r.activityId, r]));

    const map = this.map;
    if (!map) { return; }

    const lineFeatures = routes.map((route) => ({
      type: 'Feature' as const,
      properties: { activityId: route.activityId, name: route.name, category: route.activity.activityCategory },
      geometry: { type: 'LineString' as const, coordinates: route.coordinates },
    }));

    const centroidFeatures = routes.map((route) => {
      const centroid = this.computeCentroid(route.coordinates);
      return {
        type: 'Feature' as const,
        properties: { activityId: route.activityId, name: route.name, category: route.activity.activityCategory },
        geometry: { type: 'Point' as const, coordinates: centroid },
      };
    });

    const existingSource = map.getSource(ROUTES_SOURCE_ID);
    if (existingSource) {
      (existingSource as GeoJSONSource).setData({ type: 'FeatureCollection', features: lineFeatures });
      (map.getSource(ROUTES_POINTS_SOURCE_ID) as GeoJSONSource).setData({ type: 'FeatureCollection', features: centroidFeatures });
      return;
    }

    this.initialized = true;

    map.addSource(ROUTES_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: lineFeatures },
    });

    map.addSource(ROUTES_POINTS_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: centroidFeatures },
      cluster: true,
      clusterMaxZoom: CLUSTER_MAX_ZOOM,
      clusterRadius: 60,
    });

    map.addLayer({
      id: `${ROUTES_LAYER_ID}-casing`,
      type: 'line',
      source: ROUTES_SOURCE_ID,
      minzoom: LINE_MIN_ZOOM,
      paint: {
        'line-color': '#ffffff',
        'line-opacity': 0.9,
        'line-width': 7,
      },
    });

    map.addLayer({
      id: ROUTES_LAYER_ID,
      type: 'line',
      source: ROUTES_SOURCE_ID,
      minzoom: LINE_MIN_ZOOM,
      paint: {
        'line-color': [
          'match', ['get', 'category'],
          'ride', '#1f6f50',
          'run', '#2d7fb8',
          'walk', '#b87a2d',
          'hike', '#8b5e3c',
          'water', '#3c9bb8',
          'paddling', '#3ca8a8',
          'winter', '#8ba8c8',
          '#63746a',
        ],
        'line-opacity': 0.85,
        'line-width': 4,
      },
    });

    map.addLayer({
      id: ROUTES_SELECTED_LAYER_ID,
      type: 'line',
      source: ROUTES_SOURCE_ID,
      minzoom: LINE_MIN_ZOOM,
      filter: this.buildSelectedRouteFilter(''),
      paint: {
        'line-color': '#d15b2f',
        'line-opacity': 1,
        'line-width': 7,
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
      maxzoom: CLUSTER_MAX_ZOOM,
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

    this.addEventListeners();
  }

  updateRoutes(routes: MapRouteFeature[]): void {
    this.routes = routes;
    this.routesLookup = new Map(routes.map((r) => [r.activityId, r]));
    const map = this.map;
    if (!map) { return; }

    const lineFeatures = routes.map((route) => ({
      type: 'Feature' as const,
      properties: { activityId: route.activityId, name: route.name, category: route.activity.activityCategory },
      geometry: { type: 'LineString' as const, coordinates: route.coordinates },
    }));

    const centroidFeatures = routes.map((route) => {
      const centroid = this.computeCentroid(route.coordinates);
      return {
        type: 'Feature' as const,
        properties: { activityId: route.activityId, name: route.name, category: route.activity.activityCategory },
        geometry: { type: 'Point' as const, coordinates: centroid },
      };
    });

    (map.getSource(ROUTES_SOURCE_ID) as GeoJSONSource)?.setData({ type: 'FeatureCollection', features: lineFeatures });
    (map.getSource(ROUTES_POINTS_SOURCE_ID) as GeoJSONSource)?.setData({ type: 'FeatureCollection', features: centroidFeatures });
  }

  selectRoute(activityId: string): void {
    const map = this.map;
    if (!map) { return; }
    map.setFilter(ROUTES_SELECTED_LAYER_ID, this.buildSelectedRouteFilter(activityId));
  }

  deselectRoute(): void {
    const map = this.map;
    if (!map) { return; }
    map.setFilter(ROUTES_SELECTED_LAYER_ID, ['==', ['get', 'activityId'], '']);
  }

  fitToRoute(coordinates: [number, number][]): void {
    const map = this.map;
    if (!map || coordinates.length === 0) { return; }

    const lngs = coordinates.map((c) => c[0]);
    const lats = coordinates.map((c) => c[1]);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);

    const fit = () => {
      map.fitBounds(
        [minLng, minLat, maxLng, maxLat],
        { padding: 80, maxZoom: 15 },
      );
    };

    if (map.isStyleLoaded()) {
      fit();
    } else {
      map.once('style.load', fit);
      setTimeout(fit, 500);
    }
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
      this.fitToRoute(selectedRoute.coordinates);
      map.setFilter(ROUTES_SELECTED_LAYER_ID, this.buildSelectedRouteFilter(selectedRoute.activityId));
      this.onRouteSelected?.(selectedRoute);
    };

    const onLineClick = (event: MapLayerMouseEvent) => {
      const activityId = event.features?.[0]?.properties?.['activityId'];
      if (typeof activityId !== 'string') { return; }
      const selectedRoute = this.routesLookup.get(activityId);
      if (!selectedRoute) { return; }
      map.setFilter(ROUTES_SELECTED_LAYER_ID, this.buildSelectedRouteFilter(selectedRoute.activityId));
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

  private buildSelectedRouteFilter(activityId: string): FilterSpecification {
    return ['==', ['get', 'activityId'], activityId];
  }
}

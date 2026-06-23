import { Injectable } from '@angular/core';
import type { Map } from 'maplibre-gl';
import { type ResolvedBasemapProvider } from './basemap-provider';

/** Hosts the extension is allowed to fetch tiles from. */
const ALLOWED_TILE_HOSTS = [
  'tiles.openfreemap.org',
  'tile.opentopomap.org',
  'server.arcgisonline.com',
  'tiles.versatiles.org',
];

const DEFAULT_CENTER: [number, number] = [0, 20];
const DEFAULT_ZOOM = 2;

@Injectable({
  providedIn: 'root',
})
export class MapLibreService {
  async createMap(container: HTMLElement, basemapProvider: ResolvedBasemapProvider): Promise<Map> {
    const { default: maplibregl } = await import('maplibre-gl');

    const { center, zoom } = await this.getBrowserLocation();

    const map = new maplibregl.Map({
      container,
      style: basemapProvider.style,
      center,
      zoom,
      transformRequest: (url, resourceType) => {
        if (resourceType === 'Style' || resourceType === 'Source' || resourceType === 'Tile') {
          const host = new URL(url).hostname;
          if (ALLOWED_TILE_HOSTS.some((allowed) => host === allowed || host.endsWith('.' + allowed))) {
            return { url, credentials: 'same-origin' };
          }
        }
        return undefined;
      },
    });

    return map;
  }

  private async getBrowserLocation(): Promise<{ center: [number, number]; zoom: number }> {
    const gps = await this.tryGeolocation();
    if (gps) { return { center: gps, zoom: 12 }; }

    const tz = this.tzEstimateCenter();
    if (tz) { return { center: tz, zoom: 5 }; }

    return { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM };
  }

  private async tryGeolocation(): Promise<[number, number] | null> {
    if (!navigator.geolocation) { return null; }
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 3000,
          maximumAge: 300000,
        });
      });
      return [pos.coords.longitude, pos.coords.latitude];
    } catch {
      return null;
    }
  }

  private tzEstimateCenter(): [number, number] | null {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!tz || tz === 'UTC') { return null; }

      const offset = -new Date().getTimezoneOffset() / 60;

      let lng: number;
      if (offset >= 0) {
        lng = offset * 15 - 7.5;
      } else {
        lng = offset * 15 + 7.5;
      }
      lng = Math.max(-180, Math.min(180, lng));

      let lat = 40;
      const northern = ['Europe', 'Asia', 'North America', 'Africa'];
      if (northern.some((r) => tz.startsWith(r))) {
        lat = 50;
      } else if (tz.startsWith('Australia') || tz.startsWith('Pacific')) {
        lat = -30;
      } else if (tz.startsWith('America/Argentina') || tz.startsWith('Chile')) {
        lat = -35;
      }

      return [lng, lat];
    } catch {
      return null;
    }
  }
}

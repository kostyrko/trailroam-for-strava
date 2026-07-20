import { Injectable } from '@angular/core';
import { logger } from '../shared/logger';

/** A single resolved geocoding result. `center` is [lng, lat] (MapLibre convention). */
export interface GeocodeResult {
  label: string;
  center: [number, number];
  /** [west, south, east, north] if the provider returned a bounding box. */
  bbox?: [number, number, number, number];
  /**
   * Stable provider-specific id (e.g. Photon `osm_type` + `osm_id`). Used by the saved-places
   * flow to detect that a search result is already saved. Absent for coordinate-only results.
   */
  providerId?: string;
  /** The provider's primary place name. Used as the default in the save-place name dialog. */
  providerName?: string;
  /** Secondary location text (region/country) shown under the name in lists and popups. */
  secondaryLabel?: string;
}

/**
 * Provider-agnostic geocoding interface. The default implementation is Photon (Komoot),
 * which requires no API key. A future provider (MapTiler/Geoapify/Stadia with a
 * user-provided key) can replace it without touching the UI.
 */
export interface GeocodingProvider {
  search(query: string): Promise<GeocodeResult[]>;
  resolve(query: string): Promise<GeocodeResult | null>;
  /** Reverse geocode from coordinates. Returns the best result or null. */
  reverse(lat: number, lng: number): Promise<GeocodeResult | null>;
}

const PHOTON_ENDPOINT = 'https://photon.komoot.io/api/';
const RESULT_LIMIT = 5;
const MIN_QUERY_LENGTH = 2;

/**
 * Geocoding service backed by Photon (Komoot). No API key required.
 *
 * Place search necessarily sends the user's query to a third party (Photon); this is
 * disclosed in the Settings → Privacy & Data card. Coordinate searches never reach this
 * service — they are resolved locally before any geocoder call.
 */
@Injectable({ providedIn: 'root' })
export class GeocodingService implements GeocodingProvider {
  async search(query: string): Promise<GeocodeResult[]> {
    const q = query.trim();
    if (q.length < MIN_QUERY_LENGTH) {
      return [];
    }
    try {
      const features = await this.fetchPhoton(q);
      return features.map(featureToResult).filter((r): r is GeocodeResult => r !== null);
    } catch (err) {
      logger.error('Geocoding search failed:', err);
      return [];
    }
  }

  async resolve(query: string): Promise<GeocodeResult | null> {
    const results = await this.search(query);
    return results[0] ?? null;
  }

  /**
   * Reverse geocode from coordinates using Photon's /reverse endpoint.
   * Returns the nearest named feature (place, street, locality) or null.
   */
  async reverse(lat: number, lng: number): Promise<GeocodeResult | null> {
    try {
      const url = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&limit=1`;
      const res = await fetch(url, { credentials: 'omit' });
      if (!res.ok) {
        logger.warn(`Photon reverse responded with ${res.status}`);
        return null;
      }
      const data = (await res.json()) as PhotonResponse;
      const features = data.features ?? [];
      if (features.length === 0) {
        return null;
      }
      return featureToResult(features[0]);
    } catch (err) {
      logger.warn('Reverse geocoding failed:', err);
      return null;
    }
  }

  private async fetchPhoton(query: string): Promise<PhotonFeature[]> {
    const url = `${PHOTON_ENDPOINT}?q=${encodeURIComponent(query)}&limit=${RESULT_LIMIT}`;
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) {
      throw new Error(`Photon responded with ${res.status}`);
    }
    const data = (await res.json()) as PhotonResponse;
    return data.features ?? [];
  }
}

interface PhotonResponse {
  features?: PhotonFeature[];
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    city?: string;
    state?: string;
    country?: string;
    osm_id?: number;
    osm_type?: string;
    extent?: [number, number, number, number];
  };
}

function featureToResult(feature: PhotonFeature): GeocodeResult | null {
  const coords = feature.geometry?.coordinates;
  if (!coords || coords.length < 2) {
    return null;
  }
  const lng = coords[0];
  const lat = coords[1];
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return null;
  }

  const props = feature.properties ?? {};
  const label = buildLabel(props);
  if (!label) {
    return null;
  }

  const result: GeocodeResult = {
    label,
    center: [lng, lat],
  };

  // Photon extent is [west, north, east, south]; normalize to [west, south, east, north].
  const extent = props.extent;
  if (extent && extent.length === 4) {
    const [west, north, east, south] = extent;
    if ([west, north, east, south].every(Number.isFinite)) {
      result.bbox = [west, south, east, north];
    }
  }

  const providerName = primaryName(props);
  if (providerName) {
    result.providerName = providerName;
    const secondary = secondaryLabel(props, providerName);
    if (secondary) {
      result.secondaryLabel = secondary;
    }
  }
  const providerId = deriveProviderId(props);
  if (providerId) {
    result.providerId = providerId;
  }
  return result;
}

/** Composite "Name, State, Country" label. The primary name is the OSM `name`, falling back to `city`. */
function buildLabel(props: PhotonPlaceProperties): string {
  const primary = primaryName(props);
  if (!primary) {
    return '';
  }
  const parts = [primary];
  if (props.state && props.state !== primary) {
    parts.push(props.state);
  }
  if (props.country) {
    parts.push(props.country);
  }
  return parts.join(', ');
}

type PhotonPlaceProperties = {
  name?: string;
  city?: string;
  state?: string;
  country?: string;
};

function primaryName(props: PhotonPlaceProperties): string | undefined {
  return props.name ?? props.city;
}

/** Secondary location text: the label parts other than the primary name (state, country). */
function secondaryLabel(props: PhotonPlaceProperties, primary: string): string | undefined {
  const parts: string[] = [];
  if (props.state && props.state !== primary) {
    parts.push(props.state);
  }
  if (props.country) {
    parts.push(props.country);
  }
  return parts.length > 0 ? parts.join(', ') : undefined;
}

/** Stable id from OSM element type + id, e.g. "N12345". Absent if Photon omitted OSM metadata. */
function deriveProviderId(props: { osm_id?: number; osm_type?: string }): string | undefined {
  if (typeof props.osm_id !== 'number' || !Number.isFinite(props.osm_id)) {
    return undefined;
  }
  const type =
    typeof props.osm_type === 'string' && props.osm_type.length > 0 ? props.osm_type : 'X';
  return `${type}${props.osm_id}`;
}

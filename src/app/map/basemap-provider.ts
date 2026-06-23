import { type StyleSpecification } from 'maplibre-gl';

export type BasemapProviderKind =
  | 'openfreemap'
  | 'maplibre_style_url'
  | 'raster_xyz'
  | 'provider_preset'
  | 'pmtiles';

export type BasemapProviderPreset = 'maptiler' | 'geoapify' | 'stadia';

export interface BasemapProviderConfig {
  id: string;
  label: string;
  kind: BasemapProviderKind;
  providerPreset?: BasemapProviderPreset;
  styleUrl?: string;
  rasterTileUrl?: string;
  apiKey?: string;
  attribution?: string;
  requiresApiKey: boolean;
  enabled: boolean;
}

export type BasemapStyle = string | StyleSpecification;

export interface ResolvedBasemapProvider {
  config: BasemapProviderConfig;
  style: BasemapStyle;
}

export const OPENFREEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

const OPENTOPOMAP_STYLE = {
  version: 8,
  sources: {
    opentopomap: {
      type: 'raster',
      tiles: ['https://tile.opentopomap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
    },
  },
  layers: [
    { id: 'opentopomap', type: 'raster', source: 'opentopomap' },
  ],
};

export const OPENTOPOMAP_STYLE_URL = `data:application/json,${encodeURIComponent(JSON.stringify(OPENTOPOMAP_STYLE))}`;

export const OPENFREEMAP_BASEMAP_PROVIDER: BasemapProviderConfig = {
  id: 'openfreemap',
  label: 'OpenFreeMap',
  kind: 'openfreemap',
  styleUrl: OPENFREEMAP_STYLE_URL,
  attribution: 'OpenFreeMap | OpenMapTiles | OpenStreetMap',
  requiresApiKey: false,
  enabled: true,
};

export const OPENTOPOMAP_BASEMAP_PROVIDER: BasemapProviderConfig = {
  id: 'opentopomap',
  label: 'Outdoor (OpenTopoMap)',
  kind: 'openfreemap',
  styleUrl: OPENTOPOMAP_STYLE_URL,
  attribution: 'openstreetmap.org/copyright | opentopomap.org',
  requiresApiKey: false,
  enabled: true,
};

const VERSATILES_AERIAL_STYLE = {
  version: 8,
  sources: {
    versatiles_aerial: {
      type: 'raster',
      tiles: ['https://tiles.versatiles.org/tiles/satellite/{z}/{x}/{y}'],
      tileSize: 256,
      minzoom: 0,
      maxzoom: 19,
      attribution: '<a href="https://versatiles.org/sources/">VersaTiles sources</a>',
    },
  },
  layers: [
    { id: 'versatiles-aerial', type: 'raster', source: 'versatiles_aerial' },
  ],
};

const VERSATILES_AERIAL_STYLE_URL = `data:application/json,${encodeURIComponent(JSON.stringify(VERSATILES_AERIAL_STYLE))}`;

export const VERSATILES_AERIAL_BASEMAP_PROVIDER: BasemapProviderConfig = {
  id: 'versatiles-aerial',
  label: 'Aerial (VersaTiles)',
  kind: 'openfreemap',
  styleUrl: VERSATILES_AERIAL_STYLE_URL,
  attribution: '<a href="https://versatiles.org/sources/">VersaTiles sources</a>',
  requiresApiKey: false,
  enabled: true,
};

const ESRI_SATELLITE_STYLE = {
  version: 8,
  sources: {
    esri_satellite: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      minzoom: 0,
      maxzoom: 19,
      attribution: 'Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    },
  },
  layers: [
    { id: 'esri-satellite', type: 'raster', source: 'esri_satellite' },
  ],
};

const ESRI_SATELLITE_STYLE_URL = `data:application/json,${encodeURIComponent(JSON.stringify(ESRI_SATELLITE_STYLE))}`;

export const ESRI_SATELLITE_BASEMAP_PROVIDER: BasemapProviderConfig = {
  id: 'esri-satellite',
  label: 'Satellite (Esri)',
  kind: 'openfreemap',
  styleUrl: ESRI_SATELLITE_STYLE_URL,
  attribution: 'Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  requiresApiKey: false,
  enabled: true,
};


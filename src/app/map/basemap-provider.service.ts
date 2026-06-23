import { Injectable, signal } from '@angular/core';
import {
  ESRI_SATELLITE_BASEMAP_PROVIDER,
  OPENFREEMAP_BASEMAP_PROVIDER,
  OPENTOPOMAP_BASEMAP_PROVIDER,
  VERSATILES_AERIAL_BASEMAP_PROVIDER,
  type BasemapProviderConfig,
  type ResolvedBasemapProvider,
} from './basemap-provider';

export const AVAILABLE_PROVIDERS: BasemapProviderConfig[] = [
  OPENFREEMAP_BASEMAP_PROVIDER,
  OPENTOPOMAP_BASEMAP_PROVIDER,
  ESRI_SATELLITE_BASEMAP_PROVIDER,
  VERSATILES_AERIAL_BASEMAP_PROVIDER,
];

@Injectable({
  providedIn: 'root',
})
export class BasemapProviderService {
  readonly currentProvider = signal<ResolvedBasemapProvider>(
    this.resolveProvider(OPENFREEMAP_BASEMAP_PROVIDER),
  );

  getDefaultProvider(): ResolvedBasemapProvider {
    return this.resolveProvider(OPENFREEMAP_BASEMAP_PROVIDER);
  }

  getSelectedProvider(): ResolvedBasemapProvider {
    return this.currentProvider();
  }

  setProvider(config: BasemapProviderConfig): void {
    this.currentProvider.set(this.resolveProvider(config));
  }

  resolveProvider(config: BasemapProviderConfig): ResolvedBasemapProvider {
    if (!config.enabled) {
      throw new Error(`Basemap provider is disabled: ${config.id}`);
    }

    if (!config.styleUrl) {
      throw new Error(`Basemap provider is missing a MapLibre style URL: ${config.id}`);
    }

    return {
      config,
      style: config.styleUrl,
    };
  }
}

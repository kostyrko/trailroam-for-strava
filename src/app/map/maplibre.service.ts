import { Injectable } from '@angular/core';
import { type Map, type StyleSpecification } from 'maplibre-gl';

const INITIAL_MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: 'trailroam-background',
      type: 'background',
      paint: {
        'background-color': '#eef5f0',
      },
    },
  ],
};

@Injectable({
  providedIn: 'root',
})
export class MapLibreService {
  async createMap(container: HTMLElement): Promise<Map> {
    const maplibregl = await import('maplibre-gl');

    return new maplibregl.Map({
      container,
      style: INITIAL_MAP_STYLE,
      center: [19.94498, 50.06465],
      zoom: 10,
    });
  }
}

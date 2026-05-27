import type { RouteBounds } from '../storage/storage.models';

export type NormalizedCoordinate = [number, number];

export type NormalizeRouteResult =
  | { valid: true; coordinates: NormalizedCoordinate[]; bounds: RouteBounds }
  | { valid: false; reason: 'no_route' | 'empty_route' | 'invalid_coordinates' };

export function isValidCoordinate(lng: number, lat: number): boolean {
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lng >= -180 &&
    lng <= 180 &&
    lat >= -90 &&
    lat <= 90
  );
}

export function calculateBounds(coordinates: NormalizedCoordinate[]): RouteBounds | undefined {
  if (coordinates.length < 2) {
    return undefined;
  }

  let west = coordinates[0][0];
  let east = coordinates[0][0];
  let south = coordinates[0][1];
  let north = coordinates[0][1];

  for (let i = 1; i < coordinates.length; i++) {
    const [lng, lat] = coordinates[i];
    if (lng < west) west = lng;
    if (lng > east) east = lng;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }

  return { west, south, east, north };
}

export function normalizeRouteCoordinates(
  rawCoordinates: [number, number][],
): NormalizeRouteResult {
  if (rawCoordinates.length === 0) {
    return { valid: false, reason: 'empty_route' };
  }

  const validCoords: NormalizedCoordinate[] = [];

  for (const coord of rawCoordinates) {
    const [lng, lat] = coord;
    if (isValidCoordinate(lng, lat)) {
      validCoords.push([lng, lat]);
    }
  }

  if (validCoords.length < 2) {
    return { valid: false, reason: 'invalid_coordinates' };
  }

  const bounds = calculateBounds(validCoords)!;

  return { valid: true, coordinates: validCoords, bounds };
}

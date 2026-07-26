/**
 * Parsed decimal coordinate. `center` follows MapLibre's [lng, lat] convention so it can
 * be passed directly to map navigation methods. `label` is a normalized, display-ready
 * `lat, lng` string used for history entries.
 */
export interface ParsedCoordinate {
  lat: number;
  lng: number;
  center: [number, number];
  label: string;
}

/**
 * Parses a user-entered string into decimal coordinates.
 *
 * Accepts:
 *  - `lat, lng` and `lat lng` (comma- or whitespace-separated)
 *  - optional cardinal suffixes: `N`/`S` for latitude, `E`/`W` for longitude (any case)
 *  - optional degrees symbol (e.g. `50.06°, 19.94°`)
 *
 * Requires exactly two numeric tokens; extra tokens are rejected so that ordinary place
 * names never accidentally parse as coordinates. Returns `null` for anything malformed
 * or out of range (lat outside [-90, 90], lng outside [-180, 180]).
 */
export function tryParseCoordinate(input: string): ParsedCoordinate | null {
  if (!input) { return null; }

  const normalized = input
    .trim()
    .replace(/\u00b0/g, ''); // degree symbol

  // Match exactly two "number + optional cardinal" tokens, separated by a comma and/or
  // whitespace. This binds a trailing N/S/E/W to its number (e.g. "50 N, 19 E") while
  // still rejecting ordinary place names that have extra word tokens.
  const match = normalized.match(
    /^(-?\d+(?:\.\d+)?)\s*([NSns])?\s*[,]?\s+(-?\d+(?:\.\d+)?)\s*([EWew])?$/,
  );
  if (!match) { return null; }

  const first = parseNumberWithCardinal(match[1], match[2], ['N', 'S']);
  const second = parseNumberWithCardinal(match[3], match[4], ['E', 'W']);
  if (first === null || second === null) { return null; }

  const lat = first.value;
  const lng = second.value;

  // A signed value combined with a cardinal direction is ambiguous/contradictory
  // (e.g. `-50 N`); reject it rather than guessing the intent.
  if (first.contradictory || second.contradictory) { return null; }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) { return null; }
  if (lat < -90 || lat > 90) { return null; }
  if (lng < -180 || lng > 180) { return null; }

  return {
    lat,
    lng,
    center: [lng, lat],
    label: `${trimZeros(lat.toFixed(6))}, ${trimZeros(lng.toFixed(6))}`,
  };
}

function parseNumberWithCardinal(
  numericPart: string,
  cardinal: string | undefined,
  allowed: string[],
): { value: number; contradictory: boolean } | null {
  const num = Number(numericPart);
  if (!Number.isFinite(num)) { return null; }
  if (!cardinal) { return { value: num, contradictory: false }; }

  const dir = cardinal.toUpperCase();
  if (!allowed.includes(dir)) { return null; }
  // A signed value combined with any cardinal direction is ambiguous (e.g. "-50 N" or
  // "-50 S"): the cardinal should determine the sign on its own. Reject it rather than
  // guessing the intent.
  if (num < 0) { return { value: num, contradictory: true }; }
  const negative = dir === 'S' || dir === 'W';
  return { value: negative ? -num : num, contradictory: false };
}

function trimZeros(s: string): string {
  if (s.indexOf('.') === -1) { return s; }
  return s.replace(/0+$/, '').replace(/\.$/, '');
}

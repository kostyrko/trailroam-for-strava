/**
 * Speed-colour helpers and haversine distance calculator, extracted from
 * activity-detail-panel and trail-detail-panel to eliminate duplication.
 */

export const SPAN_SECONDS = 120;

export const SPEED_COLORS = [
  { at: 0, color: '#3b82c4' },
  { at: 0.5, color: '#5fb8a0' },
  { at: 0.8, color: '#78c679' },
  { at: 1.0, color: '#1f6f50' },
  { at: 1.2, color: '#d9a23d' },
  { at: 1.5, color: '#d9732b' },
  { at: 2.0, color: '#b8433a' },
];

export function haversineDistance(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Builds speed-coloured line segments from a coordinate array.
 *
 * @param coords           The full coordinate array.
 * @param avgSpeedMs       Average speed in metres/second for the entire route.
 * @param cumulativeDistances  Optional per-index cumulative distance (avoids
 *                             haversine recomputation when already available).
 */
export function buildSpeedSegments(
  coords: [number, number][],
  avgSpeedMs: number,
  cumulativeDistances?: number[],
): GeoJSON.Feature<GeoJSON.LineString>[] {
  if (coords.length < 2 || !avgSpeedMs || avgSpeedMs <= 0) {
    return [];
  }

  const spanMeters = Math.max(50, avgSpeedMs * SPAN_SECONDS);

  const spans: { startIdx: number; endIdx: number; dist: number }[] = [];
  let spanStart = 0;
  let spanDist = 0;
  for (let i = 1; i < coords.length; i++) {
    const segDist = cumulativeDistances
      ? (cumulativeDistances[i] ?? 0) - (cumulativeDistances[i - 1] ?? 0)
      : haversineDistance(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
    spanDist += segDist;
    if (spanDist >= spanMeters || i === coords.length - 1) {
      spans.push({ startIdx: spanStart, endIdx: i, dist: spanDist });
      spanStart = i;
      spanDist = 0;
    }
  }

  if (spans.length < 2) {
    return [];
  }

  const pointCounts = spans.map((s) => s.endIdx - s.startIdx + 1);
  const avgPoints = pointCounts.reduce((s, c) => s + c, 0) / pointCounts.length;

  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  for (const span of spans) {
    const coordsInSpan = coords.slice(span.startIdx, span.endIdx + 1);
    if (coordsInSpan.length < 2) {
      continue;
    }

    const pointDensity = span.dist > 0 ? coordsInSpan.length / span.dist : 0;
    const normDensity = avgPoints > 0 ? pointDensity / (avgPoints / spanMeters) : 1;
    const speedRatio = normDensity > 0 ? 1 / normDensity : 2;

    features.push({
      type: 'Feature',
      properties: { speedRatio: Math.max(0.1, Math.min(3, speedRatio)) },
      geometry: {
        type: 'LineString',
        coordinates: coordsInSpan,
      },
    });
  }

  return features;
}

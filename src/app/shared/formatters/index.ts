export function formatDistance(meters: number | undefined): string {
  if (meters === undefined || meters === 0) { return '\u2014'; }
  return `${(meters / 1000).toFixed(2)} km`;
}

export function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined || seconds === 0) { return '\u2014'; }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) { return `${h}h ${m}m`; }
  return `${m}m`;
}

export function formatDurationHours(seconds: number | undefined): string {
  return formatDuration(seconds);
}

export function formatSpeed(metersPerSecond: number | undefined): string {
  if (metersPerSecond === undefined || metersPerSecond === 0) { return '\u2014'; }
  return `${(metersPerSecond * 3.6).toFixed(1)} km/h`;
}

export function formatSpeedKmh(speedMs: number | undefined): string {
  return formatSpeed(speedMs);
}

export function formatElevation(meters: number | undefined): string {
  if (meters === undefined || meters === 0) { return '\u2014'; }
  return `${meters.toFixed(0)} m`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateShort(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isThisYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(isThisYear ? {} : { year: 'numeric' }),
  });
}

export function formatDateWithTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' at ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function formatDateInput(iso: string | null): string {
  if (!iso) { return ''; }
  const d = new Date(iso);
  if (isNaN(d.getTime())) { return ''; }
  return d.toISOString().slice(0, 10);
}

export function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function computeSpeed(
  metersPerSecond: number | undefined,
  distanceMeters: number | undefined,
  movingTimeSeconds: number | undefined,
): number | undefined {
  if (metersPerSecond !== undefined && metersPerSecond !== 0) { return metersPerSecond; }
  if (distanceMeters && movingTimeSeconds) { return distanceMeters / movingTimeSeconds; }
  return undefined;
}

export function formatHeartrate(bpm: number | undefined): string {
  if (bpm === undefined || bpm === 0) { return '\u2014'; }
  return `${bpm.toFixed(0)} bpm`;
}

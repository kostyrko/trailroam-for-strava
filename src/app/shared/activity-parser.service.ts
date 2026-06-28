import { Injectable } from '@angular/core';
import { mapSportTypeToCategory, formatSportType } from './activity-category';
import type { ActivityCategory } from '../storage/storage.models';

export interface ParsedTrackPoint {
  lat: number;
  lng: number;
  elevation?: number;
  time?: string;
  heartRate?: number;
  cadence?: number;
  power?: number;
}

export interface ParsedLap {
  startTime?: string;
  totalTimeSeconds?: number;
  distanceMeters?: number;
  maxSpeed?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  totalElevationGain?: number;
}

export interface ParsedActivity {
  coordinates: [number, number][];
  elevations: number[];
  timestamps: string[];
  cumulativeDistances: number[];
  totalDistanceMeters: number;
  movingTimeSeconds: number;
  elapsedTimeSeconds: number;
  averageSpeedMetersPerSecond: number;
  totalElevationGainMeters: number;
  totalElevationLossMeters: number;
  minElevationMeters?: number;
  maxElevationMeters?: number;
  averageHeartRateBpm?: number;
  maxHeartRateBpm?: number;
  averageCadenceRpm?: number;
  averageTemperatureCelsius?: number;
  maxTemperatureCelsius?: number;
  startTime: string;
  endTime: string;
  bounds: [[number, number], [number, number]];
  heartRateValues: number[];
  cadenceValues: number[];
  powerValues: number[];
  temperatureValues: number[];
  suggestedName: string;
  suggestedSportType: string;
  suggestedCategory: ActivityCategory;
  laps: ParsedLap[];
}

function haversineDistance(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeDerivedStats(
  coordinates: [number, number][],
  elevations: number[],
  timestamps: string[],
): {
  cumulativeDistances: number[];
  totalDistanceMeters: number;
  movingTimeSeconds: number;
  elapsedTimeSeconds: number;
  averageSpeedMetersPerSecond: number;
  totalElevationGainMeters: number;
  totalElevationLossMeters: number;
  startTime: string;
  endTime: string;
  bounds: [[number, number], [number, number]];
} {
  const cumulativeDistances: number[] = [];
  let totalDist = 0;
  for (let i = 0; i < coordinates.length; i++) {
    if (i === 0) {
      cumulativeDistances.push(0);
    } else {
      const d = haversineDistance(
        coordinates[i - 1][0], coordinates[i - 1][1],
        coordinates[i][0], coordinates[i][1],
      );
      totalDist += d;
      cumulativeDistances.push(totalDist);
    }
  }

  let elevGain = 0;
  let elevLoss = 0;
  if (elevations.length > 3) {
    const size = elevations.length;
    const smoothed = elevations.map((e, i) => {
      if (i === 0 || i === size - 1) return e;
      return elevations[i - 1] * 0.25 + e * 0.5 + elevations[i + 1] * 0.25;
    });
    const simplified: number[] = [smoothed[0]];
    const tolerance = 2;
    for (let i = 1; i < smoothed.length; i++) {
      if (Math.abs(smoothed[i] - simplified[simplified.length - 1]) >= tolerance) {
        simplified.push(smoothed[i]);
      }
    }
    if (simplified.length < 2) simplified.push(smoothed[smoothed.length - 1]);
    for (let i = 1; i < simplified.length; i++) {
      const d = simplified[i] - simplified[i - 1];
      if (d > 0) elevGain += d;
      else elevLoss -= d;
    }
  }
  elevGain = Math.round(elevGain);
  elevLoss = Math.round(elevLoss);

  let movingTime = 0;
  let hasSpanningTimestamps = false;
  let hasValidSingleTimestamp = false;
  if (timestamps.length >= 2) {
    let min = Infinity, max = -Infinity;
    let parsedAny = false;
    for (const t of timestamps) {
      try { const d = new Date(t).getTime(); if (!isNaN(d)) { min = Math.min(min, d); max = Math.max(max, d); parsedAny = true; } }
      catch {}
    }
    if (parsedAny) {
      hasValidSingleTimestamp = isFinite(min);
      hasSpanningTimestamps = (max - min) > 5000;
    }
  }

  if (timestamps.length >= 2 && hasSpanningTimestamps) {
    for (let i = 1; i < timestamps.length; i++) {
      try {
        const diff = (new Date(timestamps[i]).getTime() - new Date(timestamps[i - 1]).getTime()) / 1000;
        if (diff > 0 && diff < 300) movingTime += diff;
      } catch {}
    }
  }

  let startTime = new Date().toISOString();
  if (hasValidSingleTimestamp) {
    try {
      const d = new Date(timestamps[0]);
      if (!isNaN(d.getTime()) && d.getTime() > 0) startTime = d.toISOString();
    } catch {}
  }
  const endTime = startTime;
  const elapsedTime = movingTime;
  const avgSpeed = totalDist > 0 && movingTime > 0 ? totalDist / movingTime : 0;

  const lngs = coordinates.map((c) => c[0]);
  const lats = coordinates.map((c) => c[1]);
  const bounds: [[number, number], [number, number]] = [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];

  return {
    cumulativeDistances,
    totalDistanceMeters: totalDist,
    movingTimeSeconds: movingTime,
    elapsedTimeSeconds: elapsedTime,
    averageSpeedMetersPerSecond: avgSpeed,
    totalElevationGainMeters: elevGain,
    totalElevationLossMeters: elevLoss,
    startTime,
    endTime,
    bounds,
  };
}

function suggestSportType(
  avgSpeedMs: number,
  totalDistanceMeters: number,
  totalElevationGainMeters: number,
): { sportType: string; category: ActivityCategory } {
  const speedKmh = avgSpeedMs * 3.6;

  if (speedKmh < 2) {
    return { sportType: 'Walk', category: 'walk' };
  }
  if (speedKmh < 6) {
    if (totalDistanceMeters > 10000 || totalElevationGainMeters > 300) {
      return { sportType: 'Hike', category: 'hike' };
    }
    return { sportType: 'Walk', category: 'walk' };
  }
  if (speedKmh < 15) {
    if (totalDistanceMeters > 5000 && totalElevationGainMeters > 200) {
      return { sportType: 'TrailRun', category: 'run' };
    }
    return { sportType: 'Run', category: 'run' };
  }
  if (speedKmh >= 15) {
    if (totalElevationGainMeters > 500) {
      return { sportType: 'GravelRide', category: 'ride' };
    }
    return { sportType: 'Ride', category: 'ride' };
  }
  return { sportType: 'Other', category: 'other' };
}

@Injectable({ providedIn: 'root' })
export class ActivityParserService {

  async parseFile(file: File): Promise<ParsedActivity> {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['gpx', 'fit', 'tcx'].includes(ext)) {
      throw new Error('Unsupported file type.');
    }

    const buffer = await file.arrayBuffer();

    if (ext === 'gpx') return this.parseGpx(buffer, file.name);
    if (ext === 'fit') return this.parseFit(buffer, file.name);
    return this.parseTcx(buffer, file.name);
  }

  async parseGpx(buffer: ArrayBuffer, fileName: string): Promise<ParsedActivity> {
    const text = new TextDecoder().decode(buffer);

    const trkptRe = /<trkpt\s+lat="([^"]*)"\s+lon="([^"]*)"[^>]*>([\s\S]*?)<\/trkpt>/gi;
    const eleRe = /<ele[^>]*>([^<]*)<\/ele>/i;
    const timeRe = /<time[^>]*>([^<]*)<\/time>/i;

    const coordinates: [number, number][] = [];
    const elevations: number[] = [];
    const timestamps: string[] = [];
    const heartRateValues: number[] = [];
    const cadenceValues: number[] = [];
    const powerValues: number[] = [];
    const temperatureValues: number[] = [];

    let hasTimeInTrkpt = false;
    let prevCoord: string | null = null;
    let match: RegExpExecArray | null;
    while ((match = trkptRe.exec(text)) !== null) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (isNaN(lat) || isNaN(lng)) continue;

      const coordKey = `${lat.toFixed(6)},${lng.toFixed(6)}`;
      if (coordKey === prevCoord) continue;
      prevCoord = coordKey;

      const content = match[3];
      coordinates.push([lng, lat]);

      const eleM = eleRe.exec(content);
      elevations.push(eleM ? parseFloat(eleM[1]) : 0);

      const timeM = timeRe.exec(content);
      if (timeM) hasTimeInTrkpt = true;
      timestamps.push(timeM ? timeM[1] : new Date().toISOString());

      const hrM = /<hr[^>]*>([^<]*)<\/hr>/i.exec(content) || /<gpxtpx:hr[^>]*>([^<]*)<\/gpxtpx:hr>/i.exec(content);
      if (hrM) heartRateValues.push(parseFloat(hrM[1]));

      const cadM = /<cad[^>]*>([^<]*)<\/cad>/i.exec(content) || /<gpxtpx:cad[^>]*>([^<]*)<\/gpxtpx:cad>/i.exec(content);
      if (cadM) cadenceValues.push(parseFloat(cadM[1]));

      const extM = /<extensions[^>]*>([\s\S]*?)<\/extensions>/i.exec(content);
      if (extM) {
        const powM = /<power[^>]*>([^<]*)<\/power>/i.exec(extM[1]) || /<gpxtpx:Power[^>]*>([^<]*)<\/gpxtpx:Power>/i.exec(extM[1]);
        if (powM) powerValues.push(parseFloat(powM[1]));
        const tempM = /<temp[^>]*>([^<]*)<\/temp>/i.exec(extM[1]) || /<gpxtpx:Temperature[^>]*>([^<]*)<\/gpxtpx:Temperature>/i.exec(extM[1]);
        if (tempM) temperatureValues.push(parseFloat(tempM[1]));
      }
    }

    if (coordinates.length === 0) {
      throw new Error('This file contains no usable GPS track.');
    }

    let suggestedName = fileName.replace(/\.gpx$/i, '') || 'Imported Activity';
    const nameM = /<name[^>]*>([^<]*)<\/name>/i.exec(text);
    if (nameM) suggestedName = nameM[1];

    if (!hasTimeInTrkpt) {
      const trkTimeM = /<time[^>]*>([^<]*)<\/time>/i.exec(text);
      if (trkTimeM && timestamps.length > 0) {
        const t = trkTimeM[1];
        timestamps.fill(t);
      }
    }

    console.log('[GPX] coords:', coordinates.length, 'hasTimeInTrkpt:', hasTimeInTrkpt);
    console.log('[GPX] first timestamp:', timestamps[0], 'last:', timestamps[timestamps.length - 1]);
    console.log('[GPX] first elevation:', elevations[0], 'has any elevation:', elevations.some(e => e > 0));
    const eleInText = /<ele[^>]*>/i.test(text);
    const timeInText = /<time[^>]*>/i.test(text);
    console.log('[GPX] <ele> in text:', eleInText, '<time> in text:', timeInText);

    const stats = computeDerivedStats(coordinates, elevations, timestamps);
    console.log('[GPX] stats movingTimeSeconds:', stats.movingTimeSeconds, 'startTime:', stats.startTime, 'elevGain:', stats.totalElevationGainMeters, 'elevLoss:', stats.totalElevationLossMeters);
    console.log('[GPX] HR values:', heartRateValues.length, 'cadence:', cadenceValues.length, 'temp:', temperatureValues.length, 'power:', powerValues.length);

    const heuristics = suggestSportType(stats.averageSpeedMetersPerSecond, stats.totalDistanceMeters, stats.totalElevationGainMeters);

    const avgHr = heartRateValues.length > 0 ? heartRateValues.reduce((a, b) => a + b, 0) / heartRateValues.length : undefined;
    const avgCad = cadenceValues.length > 0 ? cadenceValues.reduce((a, b) => a + b, 0) / cadenceValues.length : undefined;
    const avgTemp = temperatureValues.length > 0 ? temperatureValues.reduce((a, b) => a + b, 0) / temperatureValues.length : undefined;
    const maxTemp = temperatureValues.length > 0 ? Math.max(...temperatureValues) : undefined;
    const validElevs = elevations.filter(e => e > 0);
    const minEle = validElevs.length > 0 ? Math.min(...validElevs) : undefined;
    const maxEle = validElevs.length > 0 ? Math.max(...validElevs) : undefined;

    return {
      coordinates,
      elevations,
      timestamps,
      cumulativeDistances: stats.cumulativeDistances,
      totalDistanceMeters: stats.totalDistanceMeters,
      movingTimeSeconds: stats.movingTimeSeconds,
      elapsedTimeSeconds: stats.elapsedTimeSeconds,
      averageSpeedMetersPerSecond: stats.averageSpeedMetersPerSecond,
      totalElevationGainMeters: stats.totalElevationGainMeters,
      totalElevationLossMeters: stats.totalElevationLossMeters,
      minElevationMeters: minEle,
      maxElevationMeters: maxEle,
      averageHeartRateBpm: avgHr,
      maxHeartRateBpm: heartRateValues.length > 0 ? Math.max(...heartRateValues) : undefined,
      averageCadenceRpm: avgCad,
      averageTemperatureCelsius: avgTemp,
      maxTemperatureCelsius: maxTemp,
      startTime: stats.startTime,
      endTime: stats.endTime,
      bounds: stats.bounds,
      heartRateValues,
      cadenceValues,
      powerValues,
      temperatureValues,
      suggestedName,
      suggestedSportType: heuristics.sportType,
      suggestedCategory: heuristics.category,
      laps: [],
    };
  }

  async parseFit(buffer: ArrayBuffer, fileName: string): Promise<ParsedActivity> {
    const { default: FitParser } = await import('fit-file-parser');
    const parser = new FitParser({ force: true, mode: 'list' });
    const data: any = await parser.parseAsync(buffer);

    const records = data?.records ?? [];
    if (records.length === 0) {
      throw new Error('This file contains no usable GPS track.');
    }

    const coordinates: [number, number][] = [];
    const elevations: number[] = [];
    const timestamps: string[] = [];
    const heartRateValues: number[] = [];
    const cadenceValues: number[] = [];
    const powerValues: number[] = [];

    const sportSessions = data?.sessions ?? [];
    let sportFromMeta: string | undefined;

    if (sportSessions.length > 0) {
      const session = sportSessions[0];
      sportFromMeta = session?.sport;
    }

    for (const rec of records) {
      if (rec.position_lat === undefined || rec.position_long === undefined) continue;
      const lat = rec.position_lat * (180 / Math.pow(2, 31));
      const lng = rec.position_long * (180 / Math.pow(2, 31));
      coordinates.push([lng, lat]);

      if (rec.altitude !== undefined) elevations.push(rec.altitude);
      else elevations.push(0);

      if (rec.timestamp) timestamps.push(rec.timestamp);
      else timestamps.push(new Date().toISOString());

      if (rec.heart_rate !== undefined) heartRateValues.push(rec.heart_rate);
      if (rec.cadence !== undefined) cadenceValues.push(rec.cadence);
      if (rec.power !== undefined) powerValues.push(rec.power);
    }

    const stats = computeDerivedStats(coordinates, elevations, timestamps);

    const heuristics = suggestSportType(stats.averageSpeedMetersPerSecond, stats.totalDistanceMeters, stats.totalElevationGainMeters);
    const finalSportType = sportFromMeta ? this.mapFitSport(sportFromMeta) : heuristics.sportType;
    const finalCategory = mapSportTypeToCategory(finalSportType);
    const suggestedName = fileName.replace(/\.fit$/i, '') || 'Imported Activity';
    const avgHr = heartRateValues.length > 0 ? heartRateValues.reduce((a, b) => a + b, 0) / heartRateValues.length : undefined;
    const avgCad = cadenceValues.length > 0 ? cadenceValues.reduce((a, b) => a + b, 0) / cadenceValues.length : undefined;
    const validElevs = elevations.filter(e => e > 0);

    return {
      coordinates,
      elevations,
      timestamps,
      cumulativeDistances: stats.cumulativeDistances,
      totalDistanceMeters: stats.totalDistanceMeters,
      movingTimeSeconds: stats.movingTimeSeconds,
      elapsedTimeSeconds: stats.elapsedTimeSeconds,
      averageSpeedMetersPerSecond: stats.averageSpeedMetersPerSecond,
      totalElevationGainMeters: stats.totalElevationGainMeters,
      totalElevationLossMeters: stats.totalElevationLossMeters,
      minElevationMeters: validElevs.length > 0 ? Math.min(...validElevs) : undefined,
      maxElevationMeters: validElevs.length > 0 ? Math.max(...validElevs) : undefined,
      averageHeartRateBpm: avgHr,
      maxHeartRateBpm: heartRateValues.length > 0 ? Math.max(...heartRateValues) : undefined,
      averageCadenceRpm: avgCad,
      averageTemperatureCelsius: undefined,
      maxTemperatureCelsius: undefined,
      startTime: stats.startTime,
      endTime: stats.endTime,
      bounds: stats.bounds,
      heartRateValues,
      cadenceValues,
      powerValues,
      temperatureValues: [],
      suggestedName,
      suggestedSportType: finalSportType,
      suggestedCategory: finalCategory,
      laps: sportSessions.map((s: any) => ({
        startTime: s.start_time,
        totalTimeSeconds: s.total_timer_time ?? s.total_elapsed_time,
        distanceMeters: s.total_distance,
        maxSpeed: s.max_speed,
        avgHeartRate: s.avg_heart_rate,
        maxHeartRate: s.max_heart_rate,
        totalElevationGain: s.total_elevation_gain,
      })),
    };
  }

  private mapFitSport(sport: string): string {
    const map: Record<string, string> = {
      running: 'Run',
      cycling: 'Ride',
      hiking: 'Hike',
      walking: 'Walk',
      swimming: 'Swim',
      mountain_biking: 'MountainBikeRide',
      gravel_cycling: 'GravelRide',
      trail_running: 'TrailRun',
      kayaking: 'Kayaking',
      canoeing: 'Canoeing',
      stand_up_paddleboarding: 'StandUpPaddling',
      alpine_skiing: 'AlpineSki',
      backcountry_skiing: 'BackcountrySki',
      nordic_skiing: 'NordicSki',
      snowboarding: 'Snowboard',
      snowshoeing: 'Snowshoe',
      rock_climbing: 'RockClimbing',
      golf: 'Golf',
      yoga: 'Workout',
      strength_training: 'Workout',
      cardio: 'Workout',
    };
    return map[sport.toLowerCase().replace(/\s+/g, '_')] ?? 'Other';
  }

  async parseTcx(buffer: ArrayBuffer, fileName: string): Promise<ParsedActivity> {
    const text = new TextDecoder().decode(buffer);
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'text/xml');

    const trackpoints = xml.querySelectorAll('Trackpoint');
    if (trackpoints.length === 0) {
      throw new Error('This file contains no usable GPS track.');
    }

    const coordinates: [number, number][] = [];
    const elevations: number[] = [];
    const timestamps: string[] = [];
    const heartRateValues: number[] = [];
    const cadenceValues: number[] = [];

    for (const tp of trackpoints) {
      const pos = tp.querySelector('Position');
      if (!pos) continue;
      const lat = parseFloat(pos.querySelector('LatitudeDegrees')?.textContent ?? '');
      const lng = parseFloat(pos.querySelector('LongitudeDegrees')?.textContent ?? '');
      if (isNaN(lat) || isNaN(lng)) continue;

      coordinates.push([lng, lat]);

      const alt = tp.querySelector('AltitudeMeters');
      elevations.push(alt ? parseFloat(alt.textContent!) : 0);

      const time = tp.querySelector('Time');
      timestamps.push(time?.textContent ?? new Date().toISOString());

      const hr = tp.querySelector('HeartRateBpm > Value');
      if (hr) heartRateValues.push(parseFloat(hr.textContent!));

      const cad = tp.querySelector('Cadence');
      if (cad) cadenceValues.push(parseFloat(cad.textContent!));
    }

    if (coordinates.length === 0) {
      throw new Error('This file contains no usable GPS track.');
    }

    const stats = computeDerivedStats(coordinates, elevations, timestamps);

    const root = xml.querySelector('Activities > Activity');
    let sportFromMeta: string | undefined;
    if (root) {
      sportFromMeta = root.getAttribute('Sport') ?? undefined;
    }

    const heuristics = suggestSportType(stats.averageSpeedMetersPerSecond, stats.totalDistanceMeters, stats.totalElevationGainMeters);
    const finalSportType = sportFromMeta ? this.mapTcxSport(sportFromMeta) : heuristics.sportType;
    const finalCategory = mapSportTypeToCategory(finalSportType);
    const suggestedName = fileName.replace(/\.tcx$/i, '') || 'Imported Activity';
    const avgHr = heartRateValues.length > 0 ? heartRateValues.reduce((a, b) => a + b, 0) / heartRateValues.length : undefined;
    const avgCad = cadenceValues.length > 0 ? cadenceValues.reduce((a, b) => a + b, 0) / cadenceValues.length : undefined;
    const validElevs = elevations.filter(e => e > 0);

    return {
      coordinates,
      elevations,
      timestamps,
      cumulativeDistances: stats.cumulativeDistances,
      totalDistanceMeters: stats.totalDistanceMeters,
      movingTimeSeconds: stats.movingTimeSeconds,
      elapsedTimeSeconds: stats.elapsedTimeSeconds,
      averageSpeedMetersPerSecond: stats.averageSpeedMetersPerSecond,
      totalElevationGainMeters: stats.totalElevationGainMeters,
      totalElevationLossMeters: stats.totalElevationLossMeters,
      minElevationMeters: validElevs.length > 0 ? Math.min(...validElevs) : undefined,
      maxElevationMeters: validElevs.length > 0 ? Math.max(...validElevs) : undefined,
      averageHeartRateBpm: avgHr,
      maxHeartRateBpm: heartRateValues.length > 0 ? Math.max(...heartRateValues) : undefined,
      averageCadenceRpm: avgCad,
      averageTemperatureCelsius: undefined,
      maxTemperatureCelsius: undefined,
      startTime: stats.startTime,
      endTime: stats.endTime,
      bounds: stats.bounds,
      heartRateValues,
      cadenceValues,
      powerValues: [],
      temperatureValues: [],
      suggestedName,
      suggestedSportType: finalSportType,
      suggestedCategory: finalCategory,
      laps: [],
    };
  }

  private mapTcxSport(sport: string): string {
    const map: Record<string, string> = {
      running: 'Run',
      cycling: 'Ride',
      hiking: 'Hike',
      walking: 'Walk',
      swimming: 'Swim',
      mountain_biking: 'MountainBikeRide',
      other: 'Other',
    };
    return map[sport.toLowerCase().replace(/\s+/g, '_')] ?? 'Other';
  }

  computeDuplicates(
    parsed: ParsedActivity,
    existing: { startDate: string; distanceMeters?: number; coordinates?: [number, number][] }[],
  ): boolean {
    const parsedStart = new Date(parsed.startTime).getTime();
    const fiveMin = 5 * 60 * 1000;

    return existing.some((e) => {
      const eStart = new Date(e.startDate).getTime();
      if (Math.abs(parsedStart - eStart) > fiveMin) return false;

      const eDist = e.distanceMeters ?? 0;
      const pDist = parsed.totalDistanceMeters;
      if (eDist > 0 && pDist > 0) {
        const ratio = Math.abs(eDist - pDist) / Math.max(eDist, pDist);
        if (ratio > 0.02) return false;
      }

      return true;
    });
  }
}

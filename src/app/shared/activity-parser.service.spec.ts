import { TestBed } from '@angular/core/testing';
import {
  ActivityParserService,
  computeDerivedStats,
  suggestSportType,
  estimateMovingTime,
  typicalSpeedMs,
} from './activity-parser.service';

describe('ActivityParserService', () => {
  let service: ActivityParserService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ActivityParserService] });
    service = TestBed.inject(ActivityParserService);
  });

  it('should reject unsupported file type', async () => {
    const file = new File([''], 'test.txt');
    await expect(service.parseFile(file)).rejects.toThrow('Unsupported file type.');
  });

  it('should parse a minimal GPX file', async () => {
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx><trk><trkseg>
<trkpt lat="50.06" lon="19.94"><ele>200</ele><time>2024-01-01T10:00:00Z</time></trkpt>
<trkpt lat="50.07" lon="19.95"><ele>210</ele><time>2024-01-01T10:01:00Z</time></trkpt>
</trkseg></trk></gpx>`;
    const file = new File([gpx], 'test.gpx', { type: 'application/gpx+xml' });
    const result = await service.parseFile(file);

    expect(result.coordinates).toHaveLength(2);
    expect(result.coordinates[0]).toEqual([19.94, 50.06]);
    expect(result.coordinates[1]).toEqual([19.95, 50.07]);
    expect(result.elevations).toEqual([200, 210]);
    expect(result.totalDistanceMeters).toBeGreaterThan(0);
    expect(result.suggestedName).toContain('test');
    expect(result.suggestedSportType).toBeTruthy();
  });

  // Real-world exports (e.g. Strava) emit `<trkpt lon="..." lat="...">` (lon before lat).
  it('should parse a GPX file with lon before lat (Strava export order)', async () => {
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx><trk><trkseg>
<trkpt lon="19.94" lat="50.06"><ele>200</ele><time>2024-01-01T10:00:00Z</time></trkpt>
<trkpt lon="19.95" lat="50.07"><ele>210</ele><time>2024-01-01T10:01:00Z</time></trkpt>
</trkseg></trk></gpx>`;
    const file = new File([gpx], 'strava-export.gpx');
    const result = await service.parseFile(file);

    expect(result.coordinates).toHaveLength(2);
    expect(result.coordinates[0]).toEqual([19.94, 50.06]);
    expect(result.coordinates[1]).toEqual([19.95, 50.07]);
    expect(result.elevations).toEqual([200, 210]);
    expect(result.totalDistanceMeters).toBeGreaterThan(0);
  });

  it('should parse GPX with self-closing trkpt tags', async () => {
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx><trk><trkseg>
<trkpt lon="19.94" lat="50.06"/>
<trkpt lat="50.07" lon="19.95"/>
</trkseg></trk></gpx>`;
    const file = new File([gpx], 'self-closing.gpx');
    const result = await service.parseFile(file);

    expect(result.coordinates).toHaveLength(2);
    expect(result.coordinates[0]).toEqual([19.94, 50.06]);
    expect(result.coordinates[1]).toEqual([19.95, 50.07]);
  });

  // Regression guard: a full Strava-style export (lon-before-lat order, XML namespaces,
  // <metadata><time>, <name>, and gpxtpx extension blocks with HR/cadence). This is the format
  // that broke when the parser only accepted lat-before-lon. It must yield coordinates, the
  // derived stats the Activity Details panel shows, and the extension values together.
  it('should parse a full Strava-style GPX export with namespaces and extensions', async () => {
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="StravaGPX"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <metadata><time>2024-06-01T08:00:00Z</time></metadata>
  <trk>
    <name>Morning Ride</name>
    <trkseg>
      <trkpt lon="19.94000" lat="50.06000">
        <ele>200.0</ele>
        <time>2024-06-01T08:00:00Z</time>
        <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>145</gpxtpx:hr><gpxtpx:cad>85</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions>
      </trkpt>
      <trkpt lon="19.94200" lat="50.06200">
        <ele>210.0</ele>
        <time>2024-06-01T08:00:30Z</time>
        <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>148</gpxtpx:hr><gpxtpx:cad>86</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions>
      </trkpt>
      <trkpt lon="19.94500" lat="50.06500">
        <ele>230.0</ele>
        <time>2024-06-01T08:01:00Z</time>
        <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>150</gpxtpx:hr><gpxtpx:cad>88</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions>
      </trkpt>
      <trkpt lon="19.94800" lat="50.06800">
        <ele>250.0</ele>
        <time>2024-06-01T08:01:30Z</time>
        <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>152</gpxtpx:hr><gpxtpx:cad>87</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions>
      </trkpt>
      <trkpt lon="19.95000" lat="50.07000">
        <ele>260.0</ele>
        <time>2024-06-01T08:02:00Z</time>
        <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>155</gpxtpx:hr><gpxtpx:cad>88</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions>
      </trkpt>
    </trkseg>
  </trk>
</gpx>`;
    const file = new File([gpx], 'morning-ride.gpx');
    const result = await service.parseFile(file);

    // Coordinates parsed from lon-first tags, stored as [lng, lat].
    expect(result.coordinates).toHaveLength(5);
    expect(result.coordinates[0]).toEqual([19.94, 50.06]);
    expect(result.coordinates[4]).toEqual([19.95, 50.07]);
    expect(result.elevations).toEqual([200, 210, 230, 250, 260]);

    // Derived stats that feed the Activity Details panel (distance/time/elevation/speed).
    expect(result.totalDistanceMeters).toBeGreaterThan(0);
    expect(result.movingTimeSeconds).toBeGreaterThan(0);
    expect(result.totalElevationGainMeters).toBeGreaterThan(0);
    expect(result.averageSpeedMetersPerSecond).toBeGreaterThan(0);
    expect(result.cumulativeDistances).toHaveLength(5);
    expect(result.startTime).toBe('2024-06-01T08:00:00.000Z');

    // Extension values parsed through the gpxtpx namespace.
    expect(result.heartRateValues).toEqual([145, 148, 150, 152, 155]);
    expect(result.cadenceValues).toEqual([85, 86, 88, 87, 88]);

    // Name taken from <name>, not the filename.
    expect(result.suggestedName).toBe('Morning Ride');
    expect(result.suggestedSportType).toBeTruthy();
  });

  it('should reject GPX with no trackpoints', async () => {
    const gpx = '<?xml version="1.0"?><gpx></gpx>';
    const file = new File([gpx], 'empty.gpx');
    await expect(service.parseFile(file)).rejects.toThrow('This file contains no usable GPS track.');
  });

  it('should parse GPX with heart rate and cadence extensions', async () => {
    const gpx = `<?xml version="1.0"?><gpx><trk><trkseg>
<trkpt lat="50.0" lon="19.0"><ele>100</ele><time>2024-01-01T10:00:00Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>145</gpxtpx:hr><gpxtpx:cad>85</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions></trkpt>
<trkpt lat="50.1" lon="19.1"><ele>110</ele><time>2024-01-01T10:01:00Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>150</gpxtpx:hr><gpxtpx:cad>88</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions></trkpt>
</trkseg></trk></gpx>`;
    const file = new File([gpx], 'hr-test.gpx');
    const result = await service.parseFile(file);

    expect(result.heartRateValues).toEqual([145, 150]);
    expect(result.cadenceValues).toEqual([85, 88]);
  });

  it('should reject TCX file with no trackpoints', async () => {
    const tcx = '<?xml version="1.0"?><TrainingCenterDatabase></TrainingCenterDatabase>';
    const file = new File([tcx], 'empty.tcx');
    await expect(service.parseFile(file)).rejects.toThrow('This file contains no usable GPS track.');
  });

  it('should reject FIT file with missing track', async () => {
    const file = new File([new ArrayBuffer(100)], 'nonsense.fit');
    await expect(service.parseFile(file)).rejects.toThrow();
  });
});

describe('computeDerivedStats', () => {
  it('should compute distance via haversine', () => {
    const coords: [number, number][] = [[19.94, 50.06], [19.95, 50.07]];
    const { totalDistanceMeters, bounds } = computeDerivedStats(
      coords, [200, 210], ['2024-01-01T10:00:00Z', '2024-01-01T10:01:00Z'],
    );
    expect(totalDistanceMeters).toBeGreaterThan(0);
    expect(bounds[0][0]).toBe(19.94);
    expect(bounds[1][0]).toBe(19.95);
  });

  it('should handle single coordinate', () => {
    const coords: [number, number][] = [[19.94, 50.06]];
    const result = computeDerivedStats(
      coords, [200], ['2024-01-01T10:00:00Z'],
    );
    expect(result.totalDistanceMeters).toBe(0);
  });
});

describe('suggestSportType', () => {
  const suggest = (speedKmh: number, distM = 5000, elevGain = 100) =>
    suggestSportType(speedKmh / 3.6, distM, elevGain);

  it('should suggest Walk for slow speed', () => {
    expect(suggest(1).sportType).toBe('Walk');
  });

  it('should suggest Walk for moderate short flat', () => {
    expect(suggest(4, 5000, 50).sportType).toBe('Walk');
  });

  it('should suggest Hike for moderate long or steep', () => {
    expect(suggest(4, 15000, 400).sportType).toBe('Hike');
  });

  it('should suggest Run for running speed', () => {
    expect(suggest(10, 5000, 100).sportType).toBe('Run');
  });

  it('should suggest TrailRun for running speed with elevation', () => {
    expect(suggest(10, 10000, 400).sportType).toBe('TrailRun');
  });

  it('should suggest Ride for fast speed', () => {
    expect(suggest(25).sportType).toBe('Ride');
  });

  it('should suggest GravelRide for fast with high elevation', () => {
    expect(suggest(25, 30000, 600).sportType).toBe('GravelRide');
  });
});

describe('moving time fallback for tracks without usable timestamps', () => {
  let service: ActivityParserService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ActivityParserService] });
    service = TestBed.inject(ActivityParserService);
  });

  // GPX files exported without per-point <time> are common; the parser cannot compute a real
  // moving time (returns 0). This is the precondition the import flow relies on to estimate the
  // duration from the chosen sport type's typical speed.
  it('should yield zero moving time for a GPX without timestamps', async () => {
    const gpx = `<?xml version="1.0"?><gpx><trk><trkseg>
<trkpt lon="19.94" lat="50.06"><ele>200</ele></trkpt>
<trkpt lon="19.95" lat="50.07"><ele>260</ele></trkpt>
</trkseg></trk></gpx>`;
    const result = await service.parseFile(new File([gpx], 'no-time.gpx'));
    expect(result.totalDistanceMeters).toBeGreaterThan(0);
    expect(result.movingTimeSeconds).toBe(0);
    expect(result.averageSpeedMetersPerSecond).toBe(0);
  });
});

describe('estimateMovingTime / typicalSpeedMs', () => {
  it('should estimate moving time from distance and sport typical speed', () => {
    // 10 km Run at ~3.0 m/s -> ~3333 s (~55 min)
    const t = estimateMovingTime(10000, 'Run');
    expect(t).toBeCloseTo(10000 / 3.0, 1);
  });

  it('should change the estimate with the chosen sport type', () => {
    const distance = 10000;
    const walk = estimateMovingTime(distance, 'Walk');
    const ride = estimateMovingTime(distance, 'Ride');
    expect(ride).toBeLessThan(walk);
    expect(ride).toBeGreaterThan(0);
  });

  it('should return 0 for zero distance', () => {
    expect(estimateMovingTime(0, 'Run')).toBe(0);
  });

  it('should fall back to a generic speed for unknown sport types', () => {
    expect(typicalSpeedMs('NonexistentSport')).toBeGreaterThan(0);
    expect(estimateMovingTime(5000, 'NonexistentSport')).toBeGreaterThan(0);
  });

  it('should have a typical speed for every sport offered in the import dialog', () => {
    const importSports = [
      'Walk', 'Hike', 'TrailRun', 'Run', 'Ride', 'GravelRide',
      'MountainBikeRide', 'EBikeRide', 'Swim', 'Kayaking', 'Canoeing',
      'StandUpPaddling', 'AlpineSki', 'BackcountrySki', 'NordicSki',
      'Snowboard', 'Snowshoe', 'RockClimbing', 'Golf', 'Workout', 'Other',
    ];
    for (const sport of importSports) {
      expect(typicalSpeedMs(sport)).toBeGreaterThan(0);
    }
  });
});

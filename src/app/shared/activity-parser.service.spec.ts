import { TestBed } from '@angular/core/testing';
import { ActivityParserService, computeDerivedStats, suggestSportType } from './activity-parser.service';

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

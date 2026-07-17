import { describe, it, expect } from 'vitest';
import { tryParseCoordinate } from './coordinate.parse';

describe('tryParseCoordinate', () => {
  it('parses comma-separated decimals', () => {
    const r = tryParseCoordinate('50.0647, 19.9450');
    expect(r).not.toBeNull();
    expect(r!.lat).toBeCloseTo(50.0647, 4);
    expect(r!.lng).toBeCloseTo(19.945, 4);
    expect(r!.center).toEqual([19.945, 50.0647]);
    expect(r!.label).toBe('50.0647, 19.945');
  });

  it('parses space-separated decimals', () => {
    const r = tryParseCoordinate('50.0647 19.9450');
    expect(r).not.toBeNull();
    expect(r!.lat).toBeCloseTo(50.0647, 4);
  });

  it('parses negative values (southern/western hemisphere)', () => {
    const r = tryParseCoordinate('-33.8688, -151.2093');
    expect(r!.lat).toBeCloseTo(-33.8688, 4);
    expect(r!.lng).toBeCloseTo(-151.2093, 4);
  });

  it('parses cardinal suffixes N/E', () => {
    const r = tryParseCoordinate('50.0647 N, 19.9450 E');
    expect(r!.lat).toBeCloseTo(50.0647, 4);
    expect(r!.lng).toBeCloseTo(19.945, 4);
  });

  it('parses cardinal suffixes S/W and makes them negative', () => {
    const r = tryParseCoordinate('33.8688 S, 151.2093 W');
    expect(r!.lat).toBeCloseTo(-33.8688, 4);
    expect(r!.lng).toBeCloseTo(-151.2093, 4);
  });

  it('parses lowercase cardinal suffixes', () => {
    const r = tryParseCoordinate('50.0647 n 19.9450 e');
    expect(r!.lat).toBeCloseTo(50.0647, 4);
  });

  it('parses values with degree symbols', () => {
    const r = tryParseCoordinate('50.06°, 19.94°');
    expect(r!.lat).toBeCloseTo(50.06, 2);
  });

  it('trims trailing zeros in label', () => {
    expect(tryParseCoordinate('50, 19')!.label).toBe('50, 19');
    expect(tryParseCoordinate('50.10, 19.0')!.label).toBe('50.1, 19');
  });

  it('rejects empty input', () => {
    expect(tryParseCoordinate('')).toBeNull();
    expect(tryParseCoordinate('   ')).toBeNull();
  });

  it('rejects extra tokens (ordinary place names do not parse)', () => {
    expect(tryParseCoordinate('Krakow Poland')).toBeNull();
    expect(tryParseCoordinate('50, 19, 30')).toBeNull();
    expect(tryParseCoordinate('Tatra National Park')).toBeNull();
  });

  it('rejects non-numeric tokens', () => {
    expect(tryParseCoordinate('abc, def')).toBeNull();
  });

  it('rejects latitude out of range', () => {
    expect(tryParseCoordinate('95, 19')).toBeNull();
    expect(tryParseCoordinate('-91, 19')).toBeNull();
  });

  it('rejects longitude out of range', () => {
    expect(tryParseCoordinate('50, 200')).toBeNull();
    expect(tryParseCoordinate('50, -181')).toBeNull();
  });

  it('rejects contradictory signed + cardinal (e.g. -50 N)', () => {
    expect(tryParseCoordinate('-50 N, 19 E')).toBeNull();
  });

  it('accepts boundary values', () => {
    expect(tryParseCoordinate('90, 180')).not.toBeNull();
    expect(tryParseCoordinate('-90, -180')).not.toBeNull();
  });
});

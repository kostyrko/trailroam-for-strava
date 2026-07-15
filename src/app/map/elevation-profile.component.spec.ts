import { smoothElevations, niceRound, niceScale, binarySearch } from './elevation-profile.component';

describe('smoothElevations', () => {
  it('should return input for fewer than 4 points', () => {
    expect(smoothElevations([100, 200], [0, 1000])).toEqual([100, 200]);
  });

  it('should smooth with moving average', () => {
    const elevations = [100, 200, 100, 200];
    const distances = [0, 500, 1000, 1500];
    const result = smoothElevations(elevations, distances);
    expect(result).toHaveLength(4);
    expect(result[0]).toBeGreaterThanOrEqual(100);
    expect(result[result.length - 1]).toBeGreaterThanOrEqual(100);
  });

  it('should handle equal elevations', () => {
    const elevations = [100, 100, 100, 100, 100];
    const distances = [0, 1000, 2000, 3000, 4000];
    const result = smoothElevations(elevations, distances);
    expect(result.every((v: number) => v === 100)).toBe(true);
  });
});

describe('niceRound', () => {
  it('should return 0 for 0', () => expect(niceRound(0)).toBe(0));
  it('should round up small values', () => expect(niceRound(1)).toBe(1));
  it('should round to nice numbers', () => {
    expect(niceRound(2)).toBe(2);
    expect(niceRound(7)).toBe(5);
    expect(niceRound(15)).toBe(10);
    expect(niceRound(150)).toBe(100);
    expect(niceRound(9)).toBe(10);
  });
});

describe('niceScale', () => {
  it('should return min for zero range', () => {
    expect(niceScale(100, 100, 5)).toEqual([100]);
  });
  it('should generate increasing scale', () => {
    const result = niceScale(0, 500, 5);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0]).toBeLessThanOrEqual(0);
    expect(result[result.length - 1]).toBeGreaterThanOrEqual(500);
  });
});

describe('binarySearch', () => {
  it('should find the leftmost index for target', () => {
    expect(binarySearch([0, 100, 200, 300, 400], 50)).toBe(0);
    expect(binarySearch([0, 100, 200, 300, 400], 150)).toBe(1);
    expect(binarySearch([0, 100, 200, 300, 400], 350)).toBe(3);
  });

  it('should return 0 for value below start', () => {
    expect(binarySearch([0, 100, 200], -10)).toBe(0);
  });

  it('should return last-1 for value above end', () => {
    expect(binarySearch([0, 100, 200], 500)).toBe(1);
  });
});

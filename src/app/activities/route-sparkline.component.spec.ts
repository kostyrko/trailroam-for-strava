import { downsample } from './route-sparkline.component';

describe('downsample', () => {
  it('should return input when fewer points than max', () => {
    const pts: [number, number][] = [[0, 0], [1, 1]];
    expect(downsample(pts, 30)).toBe(pts);
  });

  it('should downsample to max points', () => {
    const pts: [number, number][] = Array.from({ length: 100 }, (_, i) => [i, i * 2] as [number, number]);
    const result = downsample(pts, 10);
    expect(result).toHaveLength(10);
    expect(result[0]).toEqual([0, 0]);
    expect(result[result.length - 1]).toEqual([99, 198]);
  });

  it('should handle single point', () => {
    const pts: [number, number][] = [[5, 10]];
    expect(downsample(pts, 30)).toEqual([[5, 10]]);
  });
});

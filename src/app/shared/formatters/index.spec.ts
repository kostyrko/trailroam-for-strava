import { describe, it, expect } from 'vitest';
import {
  formatDistance,
  formatDuration,
  formatDurationHours,
  formatSpeed,
  formatSpeedKmh,
  formatElevation,
  formatDate,
  formatDateShort,
  formatDateWithTime,
  formatDateInput,
  fmtDate,
  computeSpeed,
  formatHeartrate,
  formatTemperature,
} from './index';

describe('formatDistance', () => {
  it('should return em-dash for undefined', () => {
    expect(formatDistance(undefined)).toBe('\u2014');
  });
  it('should return em-dash for 0', () => {
    expect(formatDistance(0)).toBe('\u2014');
  });
  it('should format meters to kilometers with 2 decimals', () => {
    expect(formatDistance(12345)).toBe('12.35 km');
  });
  it('should handle exact km', () => {
    expect(formatDistance(10000)).toBe('10.00 km');
  });
});

describe('formatDuration', () => {
  it('should return em-dash for undefined', () => {
    expect(formatDuration(undefined)).toBe('\u2014');
  });
  it('should return em-dash for 0', () => {
    expect(formatDuration(0)).toBe('\u2014');
  });
  it('should format hours and minutes', () => {
    expect(formatDuration(7260)).toBe('2h 1m');
  });
  it('should format only minutes when less than an hour', () => {
    expect(formatDuration(3660)).toBe('1h 1m');
  });
  it('should format only minutes when under 1h', () => {
    expect(formatDuration(750)).toBe('12m');
  });
});

describe('formatDurationHours', () => {
  it('should delegate to formatDuration', () => {
    expect(formatDurationHours(3600)).toBe('1h 0m');
    expect(formatDurationHours(undefined)).toBe('\u2014');
  });
});

describe('formatSpeed', () => {
  it('should return em-dash for undefined', () => {
    expect(formatSpeed(undefined)).toBe('\u2014');
  });
  it('should return em-dash for 0', () => {
    expect(formatSpeed(0)).toBe('\u2014');
  });
  it('should convert m/s to km/h', () => {
    expect(formatSpeed(8.3)).toBe('29.9 km/h');
  });
  it('should handle small values', () => {
    expect(formatSpeed(1.2)).toBe('4.3 km/h');
  });
});

describe('formatSpeedKmh', () => {
  it('should delegate to formatSpeed', () => {
    expect(formatSpeedKmh(10)).toBe('36.0 km/h');
    expect(formatSpeedKmh(undefined)).toBe('\u2014');
  });
});

describe('formatElevation', () => {
  it('should return em-dash for undefined', () => {
    expect(formatElevation(undefined)).toBe('\u2014');
  });
  it('should return em-dash for 0', () => {
    expect(formatElevation(0)).toBe('\u2014');
  });
  it('should format meters without decimals', () => {
    expect(formatElevation(1248)).toBe('1248 m');
  });
  it('should handle small values', () => {
    expect(formatElevation(50)).toBe('50 m');
  });
});

describe('formatDate', () => {
  it('should format ISO date string', () => {
    const result = formatDate('2026-06-21T10:00:00Z');
    expect(result).toContain('Jun');
    expect(result).toContain('21');
    expect(result).toContain('2026');
  });
});

describe('formatDateShort', () => {
  it('should omit year for current year', () => {
    thisYear().forEach((d) => {
      const result = formatDateShort(d.toISOString());
      expect(result).not.toContain(String(d.getFullYear()));
    });
    function thisYear() {
      const now = new Date();
      return [new Date(now.getFullYear(), 0, 15), new Date(now.getFullYear(), 6, 15)];
    }
  });
});

describe('formatDateWithTime', () => {
  it('should include time component', () => {
    const result = formatDateWithTime('2026-06-21T10:30:00Z');
    expect(result).toContain('at');
    expect(result).toContain(':');
  });
});

describe('formatDateInput', () => {
  it('should return empty string for null', () => {
    expect(formatDateInput(null)).toBe('');
  });
  it('should return empty string for empty string', () => {
    expect(formatDateInput('')).toBe('');
  });
  it('should format ISO to YYYY-MM-DD', () => {
    expect(formatDateInput('2026-06-21T10:00:00Z')).toBe('2026-06-21');
  });
});

describe('fmtDate', () => {
  it('should format Date to YYYY-MM-DD', () => {
    expect(fmtDate(new Date('2026-06-21'))).toBe('2026-06-21');
  });
  it('should zero-pad month and day', () => {
    expect(fmtDate(new Date('2026-01-05'))).toBe('2026-01-05');
  });
});

describe('computeSpeed', () => {
  it('should return m/s when available', () => {
    expect(computeSpeed(5, 10000, 1800)).toBe(5);
  });
  it('should compute from distance and time when m/s is undefined', () => {
    expect(computeSpeed(undefined, 10000, 2000)).toBe(5);
  });
  it('should return undefined when no data available', () => {
    expect(computeSpeed(undefined, undefined, undefined)).toBeUndefined();
  });
  it('should return undefined when speed is 0 and no fallback', () => {
    expect(computeSpeed(0, undefined, undefined)).toBeUndefined();
  });
});

describe('formatHeartrate', () => {
  it('should return em-dash for undefined', () => {
    expect(formatHeartrate(undefined)).toBe('\u2014');
  });
  it('should return em-dash for 0', () => {
    expect(formatHeartrate(0)).toBe('\u2014');
  });
  it('should format bpm', () => {
    expect(formatHeartrate(145)).toBe('145 bpm');
  });
});

describe('formatTemperature', () => {
  it('should return em-dash for undefined', () => {
    expect(formatTemperature(undefined)).toBe('\u2014');
  });
  it('should round to integer degrees', () => {
    expect(formatTemperature(18.4)).toBe('18\u00B0C');
  });
  it('should format negative degrees', () => {
    expect(formatTemperature(-3.6)).toBe('-4\u00B0C');
  });
  it('should format zero degrees (0 is a valid temperature)', () => {
    expect(formatTemperature(0)).toBe('0\u00B0C');
  });
});

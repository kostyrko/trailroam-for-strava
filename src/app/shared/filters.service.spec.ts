import { isAfterOrEqual, isBeforeOrEqual, matchesDateFilter, FiltersService } from './filters.service';

describe('filters helpers', () => {
  describe('isAfterOrEqual', () => {
    it('should return true for same date', () => {
      expect(isAfterOrEqual('2024-01-01', '2024-01-01')).toBe(true);
    });
    it('should return true for later date', () => {
      expect(isAfterOrEqual('2024-01-02', '2024-01-01')).toBe(true);
    });
    it('should return false for earlier date', () => {
      expect(isAfterOrEqual('2024-01-01', '2024-01-02')).toBe(false);
    });
    it('should compare date portion only ignoring time', () => {
      expect(isAfterOrEqual('2024-01-01T23:00:00Z', '2024-01-01T00:00:00Z')).toBe(true);
    });
  });

  describe('isBeforeOrEqual', () => {
    it('should return true for same date', () => {
      expect(isBeforeOrEqual('2024-01-01', '2024-01-01')).toBe(true);
    });
    it('should return true for earlier date', () => {
      expect(isBeforeOrEqual('2024-01-01', '2024-01-02')).toBe(true);
    });
    it('should return false for later date', () => {
      expect(isBeforeOrEqual('2024-01-02', '2024-01-01')).toBe(false);
    });
  });
});

describe('matchesDateFilter', () => {
  it('should match any date when both bounds are null', () => {
    expect(matchesDateFilter('2024-06-15T10:00:00Z', null, null)).toBe(true);
  });

  it('should match any date when bounds are empty', () => {
    expect(matchesDateFilter('2024-06-15T10:00:00Z', '', '')).toBe(true);
  });

  it('should match a date inside the range', () => {
    expect(matchesDateFilter('2024-06-15T10:00:00Z', '2024-06-01', '2024-06-30')).toBe(true);
  });

  it('should not match a date before the from bound', () => {
    expect(matchesDateFilter('2024-05-15T10:00:00Z', '2024-06-01', null)).toBe(false);
  });

  it('should not match a date after the to bound', () => {
    expect(matchesDateFilter('2024-07-15T10:00:00Z', null, '2024-06-30')).toBe(false);
  });

  it('should treat the bounds as inclusive on both ends', () => {
    expect(matchesDateFilter('2024-06-01T00:00:00Z', '2024-06-01', '2024-06-30')).toBe(true);
    expect(matchesDateFilter('2024-06-30T23:59:59Z', '2024-06-01', '2024-06-30')).toBe(true);
  });

  it('should compare date portion only, ignoring time', () => {
    expect(matchesDateFilter('2024-06-01T23:00:00Z', '2024-06-01', '2024-06-01')).toBe(true);
  });

  it('should not exclude an activity with a missing start date', () => {
    expect(matchesDateFilter(undefined, '2024-06-01', '2024-06-30')).toBe(true);
    expect(matchesDateFilter(null, '2024-06-01', '2024-06-30')).toBe(true);
    expect(matchesDateFilter('', '2024-06-01', '2024-06-30')).toBe(true);
  });
});

describe('FiltersService', () => {
  let service: FiltersService;

  beforeEach(() => {
    service = new FiltersService();
  });

  it('should start with all defaults', () => {
    expect(service.categoryFilter()).toBeNull();
    expect(service.sportTypeFilter()).toBeNull();
    expect(service.datePreset()).toBe('all');
    expect(service.nameSearch()).toBe('');
    expect(service.userInteracted).toBe(false);
  });

  it('should set date preset label', () => {
    expect(service.datePresetLabel()).toBe('All time');
    service.setDatePreset('today');
    expect(service.datePresetLabel()).toBe('Today');
    service.setDatePreset('7d');
    expect(service.datePresetLabel()).toBe('Last 7 days');
    service.setDatePreset('custom');
    expect(service.datePresetLabel()).toBe('Custom range');
  });

  it('should set name search and mark interaction', () => {
    service.setNameSearch('test');
    expect(service.nameSearch()).toBe('test');
    expect(service.userInteracted).toBe(true);
  });

  it('should clear all filters', () => {
    service.setNameSearch('test');
    service.setDatePreset('today');
    service.setSportTypeFilter('Ride');
    service.clearAll();
    expect(service.nameSearch()).toBe('');
    expect(service.datePreset()).toBe('all');
    expect(service.sportTypeFilter()).toBeNull();
  });
});

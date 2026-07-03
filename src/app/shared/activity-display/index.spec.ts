import { describe, it, expect } from 'vitest';
import { sportTypeEmojiFromString, sportTypeEmoji, SPORT_TYPE_EMOJI } from './index';

describe('SPORT_TYPE_EMOJI', () => {
  it('should have emoji for Ride', () => {
    expect(SPORT_TYPE_EMOJI['Ride']).toBeTruthy();
  });
  it('should have emoji for Hike', () => {
    expect(SPORT_TYPE_EMOJI['Hike']).toBeTruthy();
  });
  it('should have fallback for Other', () => {
    expect(SPORT_TYPE_EMOJI['Other']).toBeTruthy();
  });
});

describe('sportTypeEmojiFromString', () => {
  it('should return correct emoji for known sport type', () => {
    expect(sportTypeEmojiFromString('Ride')).toBe(SPORT_TYPE_EMOJI['Ride']);
  });
  it('should return fallback for unknown sport type', () => {
    expect(sportTypeEmojiFromString('UnknownSport')).toBe(SPORT_TYPE_EMOJI['Other']);
  });
});

describe('sportTypeEmoji (object version)', () => {
  it('should extract sportType from object', () => {
    expect(sportTypeEmoji({ sportType: 'Hike' })).toBe(SPORT_TYPE_EMOJI['Hike']);
  });
  it('should return fallback for unknown type', () => {
    expect(sportTypeEmoji({ sportType: 'Nonsense' })).toBe(SPORT_TYPE_EMOJI['Other']);
  });
});

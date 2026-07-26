import { describe, it, expect } from 'vitest';
import {
  MAX_PLACE_NAME_LENGTH,
  MAX_PLACE_NOTES_LENGTH,
  isValidPlaceName,
  isValidPlaceNotes,
  sanitizePlaceName,
  sanitizePlaceNotes,
} from './place-name';

describe('place-name helpers', () => {
  describe('isValidPlaceName', () => {
    it('accepts a normal name', () => {
      expect(isValidPlaceName('Kraków')).toBe(true);
    });

    it('rejects empty and whitespace-only names', () => {
      expect(isValidPlaceName('')).toBe(false);
      expect(isValidPlaceName('   ')).toBe(false);
      expect(isValidPlaceName('\t\n')).toBe(false);
    });

    it('rejects names longer than the maximum length', () => {
      expect(isValidPlaceName('a'.repeat(MAX_PLACE_NAME_LENGTH + 1))).toBe(false);
      expect(isValidPlaceName('a'.repeat(MAX_PLACE_NAME_LENGTH))).toBe(true);
    });

    it('trims before checking length', () => {
      const padded = '   ' + 'a'.repeat(MAX_PLACE_NAME_LENGTH) + '   ';
      expect(isValidPlaceName(padded)).toBe(true);
    });
  });

  describe('sanitizePlaceName', () => {
    it('trims surrounding whitespace', () => {
      expect(sanitizePlaceName('  Kraków  ')).toBe('Kraków');
    });

    it('preserves internal whitespace', () => {
      expect(sanitizePlaceName('  Tatra National Park  ')).toBe('Tatra National Park');
    });
  });

  it('exposes the documented maximum length of 100', () => {
    expect(MAX_PLACE_NAME_LENGTH).toBe(100);
  });

  describe('isValidPlaceNotes', () => {
    it('accepts empty notes (notes are optional)', () => {
      expect(isValidPlaceNotes('')).toBe(true);
    });

    it('accepts notes within the maximum length', () => {
      expect(isValidPlaceNotes('Meet here before dawn')).toBe(true);
    });

    it('rejects notes longer than the maximum length', () => {
      expect(isValidPlaceNotes('x'.repeat(MAX_PLACE_NOTES_LENGTH))).toBe(true);
      expect(isValidPlaceNotes('x'.repeat(MAX_PLACE_NOTES_LENGTH + 1))).toBe(false);
    });
  });

  describe('sanitizePlaceNotes', () => {
    it('trims surrounding whitespace', () => {
      expect(sanitizePlaceNotes('  steep climb  ')).toBe('steep climb');
    });
  });

  it('exposes the documented notes maximum length of 500', () => {
    expect(MAX_PLACE_NOTES_LENGTH).toBe(500);
  });
});

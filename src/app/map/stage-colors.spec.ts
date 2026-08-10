import { STAGE_COLOR_PALETTE, stageColor } from './stage-colors';

describe('stage-colors', () => {
  describe('STAGE_COLOR_PALETTE', () => {
    it('is the Tableau 10 categorical palette', () => {
      expect(STAGE_COLOR_PALETTE).toEqual([
        '#4e79a7',
        '#f28e2b',
        '#e15759',
        '#76b7b2',
        '#59a14f',
        '#edc948',
        '#b07aa1',
        '#ff9da7',
        '#9c755f',
        '#bab0ac',
      ]);
    });

    it('contains only lowercase 6-digit hex colors', () => {
      for (const c of STAGE_COLOR_PALETTE) {
        expect(c).toMatch(/^#[0-9a-f]{6}$/);
      }
    });

    it('has no duplicate entries (maximally distinguishable)', () => {
      expect(new Set(STAGE_COLOR_PALETTE).size).toBe(STAGE_COLOR_PALETTE.length);
    });
  });

  describe('stageColor', () => {
    it('returns the palette entry at the given index', () => {
      expect(stageColor(0)).toBe(STAGE_COLOR_PALETTE[0]);
      expect(stageColor(3)).toBe(STAGE_COLOR_PALETTE[3]);
    });

    it('cycles through the palette for indices past the end', () => {
      const len = STAGE_COLOR_PALETTE.length;
      expect(stageColor(len)).toBe(STAGE_COLOR_PALETTE[0]);
      expect(stageColor(len + 2)).toBe(STAGE_COLOR_PALETTE[2]);
    });

    it('treats negative indices as 0', () => {
      expect(stageColor(-1)).toBe(STAGE_COLOR_PALETTE[0]);
    });

    it('returns distinct colors for consecutive stages', () => {
      // The whole point of T-139: adjacent stages must differ.
      for (let i = 0; i < STAGE_COLOR_PALETTE.length - 1; i++) {
        expect(stageColor(i)).not.toBe(stageColor(i + 1));
      }
    });
  });
});

/**
 * Per-stage color palette for trail rendering on the Map Explorer map.
 *
 * When a multi-activity trail is selected, each member activity ("stage") is
 * assigned a distinct color so consecutive stages remain visually
 * distinguishable even when they share an activity category. Colors are picked
 * from a categorical palette (Tableau 10) indexed by the stage's position in
 * {@link TrailRecord.activityIds} (chronological order), so the assignment is
 * deterministic and stable across reloads within a trail.
 *
 * This is a map-rendering concern (not a shared display formatter like
 * distance/duration), so it lives under `src/app/map/`.
 */

/**
 * Tableau 10 categorical palette. Maximally distinguishable for adjacent
 * categories, which is exactly what consecutive trail stages need.
 */
export const STAGE_COLOR_PALETTE: readonly string[] = [
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
];

/**
 * Returns the stage color for the given 0-based stage index. Cycles through
 * {@link STAGE_COLOR_PALETTE} for trails longer than the palette. Negative
 * indices are treated as 0.
 */
export function stageColor(index: number): string {
  const safe = index < 0 ? 0 : index;
  return STAGE_COLOR_PALETTE[safe % STAGE_COLOR_PALETTE.length]!;
}

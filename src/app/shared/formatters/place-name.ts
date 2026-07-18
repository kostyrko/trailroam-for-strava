/**
 * Maximum allowed length for a saved-place display name (PRD §5.3: 100 characters).
 */
export const MAX_PLACE_NAME_LENGTH = 100;

/**
 * Maximum allowed length for saved-place notes.
 */
export const MAX_PLACE_NOTES_LENGTH = 500;

/**
 * Returns true when `raw` contains a usable place name after trimming: non-empty and within the
 * maximum length. Used to gate the Save button in the name-confirmation dialog.
 */
export function isValidPlaceName(raw: string): boolean {
  const trimmed = raw.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_PLACE_NAME_LENGTH;
}

/**
 * Returns true when `raw` is an acceptable notes value: at most {@link MAX_PLACE_NOTES_LENGTH}
 * characters. Notes are optional, so an empty string is valid.
 */
export function isValidPlaceNotes(raw: string): boolean {
  return raw.length <= MAX_PLACE_NOTES_LENGTH;
}

/**
 * Trims leading/trailing whitespace from a place name. The caller should validate with
 * {@link isValidPlaceName} before using the result (this helper does not reject empty input).
 */
export function sanitizePlaceName(raw: string): string {
  return raw.trim();
}

/**
 * Normalizes notes by trimming surrounding whitespace. Empty/whitespace-only notes become an
 * empty string so they can be stored as `undefined` by the caller if desired.
 */
export function sanitizePlaceNotes(raw: string): string {
  return raw.trim();
}

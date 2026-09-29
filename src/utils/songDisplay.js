// Song page display helpers: chord layout preference and transpose offset.
// Chord parsing and transposition itself stays in songChords.js.

export const CHORD_LAYOUTS = Object.freeze(['above', 'right']);
export const DEFAULT_CHORD_LAYOUT = 'above';
export const TRANSPOSE_LIMIT = 12;
// Minimum width of the song text (in em of its own font size) for chords on the right.
// Measured in em so large reader text falls back to "above" earlier.
export const RIGHT_LAYOUT_MIN_EM = 28;

// Stored values from older versions: "left" became "right".
export function normalizeChordLayout(value) {
  if (value === 'left' || value === 'right') return 'right';
  return DEFAULT_CHORD_LAYOUT;
}

// The preference is never overwritten by a narrow screen; only the rendered layout falls back.
export function resolveChordLayout(preferred, rightFits = true) {
  const layout = normalizeChordLayout(preferred);
  return layout === 'right' && !rightFits ? 'above' : layout;
}

export function rightLayoutFits(widthPx, fontSizePx) {
  if (!(widthPx > 0) || !(fontSizePx > 0)) return true;
  return widthPx / fontSizePx >= RIGHT_LAYOUT_MIN_EM;
}

export function clampTranspose(value) {
  const number = Math.trunc(Number(value) || 0);
  return Math.max(-TRANSPOSE_LIMIT, Math.min(TRANSPOSE_LIMIT, number));
}

// Typographic minus keeps "−5" and "+5" the same width with tabular figures.
export function formatTranspose(value) {
  const number = clampTranspose(value);
  if (number > 0) return `+${number}`;
  if (number < 0) return `−${Math.abs(number)}`;
  return '0';
}

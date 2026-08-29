export const SYSTEM_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export const DEFAULT_READER_FONT = "'Literata', 'PT Serif', Georgia, serif";

export const READER_FONT_OPTIONS = Object.freeze([
  { title: 'Literata', value: DEFAULT_READER_FONT },
  { title: 'Source Serif 4', value: "'Source Serif 4', 'PT Serif', Georgia, serif" },
  { title: 'Old Standard TT', value: "'Old Standard TT', 'PT Serif', Georgia, serif" },
  { title: 'Kurale', value: "'Kurale', 'PT Serif', Georgia, serif" },
  { title: 'Сістэмны', value: SYSTEM_FONT },
]);

const READER_FONT_VALUES = new Set(READER_FONT_OPTIONS.map(({ value }) => value));

export function normalizeReaderFont(value) {
  return READER_FONT_VALUES.has(value) ? value : DEFAULT_READER_FONT;
}


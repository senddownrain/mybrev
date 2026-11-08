import { BIBLE_HIGHLIGHT_COLORS } from '../constants/bible.js';

export const READING_HIGHLIGHTS_KEY = 'readingSentenceHighlightsV1';
const colors = new Set(BIBLE_HIGHLIGHT_COLORS.map(color => color.id));

export function readingHighlightDocumentKey(reading) {
  return reading?.id ? JSON.stringify([reading.id, reading._setId || '', reading.year || '']) : '';
}

export function loadReadingHighlights(storage = localStorage) {
  try {
    const data = JSON.parse(storage.getItem(READING_HIGHLIGHTS_KEY) || '{}');
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    return Object.fromEntries(Object.entries(data).filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value))
      .map(([key, value]) => [key, Object.fromEntries(Object.entries(value).filter(([, color]) => colors.has(color)))]));
  } catch { return {}; }
}

export function saveReadingHighlights(documentKey, highlights, storage = localStorage) {
  if (!documentKey) return;
  // Merge with storage so another card/document's saved colours are retained.
  const all = loadReadingHighlights(storage);
  all[documentKey] = Object.fromEntries(Object.entries(highlights).filter(([, color]) => colors.has(color)));
  try { storage.setItem(READING_HIGHLIGHTS_KEY, JSON.stringify(all)); } catch { /* Reading remains usable if storage is unavailable. */ }
}

export function sentenceRanges(text) {
  if (typeof Intl.Segmenter === 'function') {
    return [...new Intl.Segmenter('be', { granularity: 'sentence' }).segment(text)]
      .filter(item => item.segment.trim()).map(item => ({ start: item.index, end: item.index + item.segment.length }));
  }
  return [...text.matchAll(/[^.!?…]+(?:[.!?…]+[»”"']*|$)\s*/gu)]
    .filter(item => item[0].trim()).map(item => ({ start: item.index, end: item.index + item[0].length }));
}

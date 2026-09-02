const HIGHLIGHTS_STORAGE_KEY = 'bibleHighlights.v1';
const LAST_LOCATION_STORAGE_KEY = 'bibleLastLocation.v1';
const LANGUAGE_STORAGE_KEY = 'bibleLanguage';

export function normalizeBibleVerse(verse, index) {
  if (typeof verse === 'string') return { num: index + 1, text: verse };
  return {
    num: verse?.num ?? verse?.verse ?? index + 1,
    text: String(verse?.text ?? ''),
  };
}

export function bibleVerseKey(language, bookId, chapter, verseNumber) {
  return `${language}:${bookId}:${chapter}:${verseNumber}`;
}

function readJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function loadBibleHighlights() {
  return readJson(HIGHLIGHTS_STORAGE_KEY, {});
}

export function saveBibleHighlights(highlights) {
  localStorage.setItem(HIGHLIGHTS_STORAGE_KEY, JSON.stringify(highlights));
}

export function loadBibleLocation(language) {
  return readJson(LAST_LOCATION_STORAGE_KEY, {})[language] || null;
}

export function saveBibleLocation(language, location) {
  const locations = readJson(LAST_LOCATION_STORAGE_KEY, {});
  locations[language] = location;
  localStorage.setItem(LAST_LOCATION_STORAGE_KEY, JSON.stringify(locations));
}

export function loadBibleLanguage() {
  return localStorage.getItem(LANGUAGE_STORAGE_KEY) === 'ru' ? 'ru' : 'bel';
}

export function saveBibleLanguage(language) {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, language === 'ru' ? 'ru' : 'bel');
}

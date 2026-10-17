/**
 * Maps a vue-router route to the contract's (section, content_id) pair, or null
 * when the screen must not be measured (lists, admin, login, personal prayers,
 * unknown routes). Pure; the collector still checks content_id against the
 * public inventory (fail closed).
 */
import { HOUR_IDS } from './contract.js';

const SECTION_BY_NAME = Object.freeze({
  Today: 'today',
  SelectedDay: 'today',
  Ordo: 'ordo',
  OrdoByDate: 'ordo',
  LiturgicalPicker: 'picker',
  Settings: 'settings',
  About: 'about',
});

const CATALOG_BY_NAME = Object.freeze({
  oras: 'hours_list',
  Prayers: 'prayers_home',
  PrayersList: 'prayers_all',
  FavoritePrayers: 'favorites',
  Songs: 'songs',
  Compendium: 'compendium_home',
});

/** @param {{name?: unknown, params?: Record<string, unknown>}} route @param {{massOrderPrayerId: string}} options */
export function mapRoute(route, { massOrderPrayerId }) {
  const name = typeof route?.name === 'string' ? route.name : '';
  const params = route?.params || {};
  if (SECTION_BY_NAME[name]) return { section: SECTION_BY_NAME[name] };
  // The daily readings screen is one generic material (no date, no day id).
  if (name === 'Readings' || name === 'ReadingsByDate') return { section: 'readings', contentId: 'reading:day' };
  if (CATALOG_BY_NAME[name]) return { catalogId: CATALOG_BY_NAME[name] };
  if (name === 'Bible' && !params.bookId) return { catalogId: 'bible_books' };
  if (HOUR_IDS.includes(name)) return { section: 'hours', contentId: `hour:${name}` };
  if (name === 'PrayerView' && typeof params.id === 'string') {
    return params.id === massOrderPrayerId
      ? { section: 'mass', contentId: 'mass:order' }
      : { section: 'prayers', contentId: `prayer:${params.id}` };
  }
  if (name === 'SongView' && typeof params.id === 'string') return { section: 'songs', contentId: `song:${params.id}` };
  // The reading unit of the compendium is a whole part (p1..p4); chapters are anchors inside it.
  if (name === 'CompendiumPart' && typeof params.partId === 'string') return { section: 'compendium', contentId: `comp:${params.partId}` };
  if (name === 'CompendiumNode' && typeof params.nodeId === 'string') return { section: 'compendium', contentId: `comp:${params.nodeId}` };
  if (name === 'Bible' && (params.language === 'bel' || params.language === 'ru') && typeof params.bookId === 'string') {
    return { section: 'bible', contentId: `bible:${params.language}:${params.bookId}` };
  }
  return null;
}

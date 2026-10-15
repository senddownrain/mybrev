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
  Readings: 'readings',
  ReadingsByDate: 'readings',
  Ordo: 'ordo',
  OrdoByDate: 'ordo',
  LiturgicalPicker: 'picker',
  Settings: 'settings',
  About: 'about',
});

/** @param {{name?: unknown, params?: Record<string, unknown>}} route @param {{massOrderPrayerId: string}} options */
export function mapRoute(route, { massOrderPrayerId }) {
  const name = typeof route?.name === 'string' ? route.name : '';
  const params = route?.params || {};
  if (SECTION_BY_NAME[name]) return { section: SECTION_BY_NAME[name] };
  if (HOUR_IDS.includes(name)) return { section: 'hours', contentId: `hour:${name}` };
  if (name === 'PrayerView' && typeof params.id === 'string') {
    return params.id === massOrderPrayerId
      ? { section: 'mass', contentId: 'mass:order' }
      : { section: 'prayers', contentId: `prayer:${params.id}` };
  }
  if (name === 'SongView' && typeof params.id === 'string') return { section: 'songs', contentId: `song:${params.id}` };
  if (name === 'CompendiumNode' && typeof params.nodeId === 'string') return { section: 'compendium', contentId: `comp:${params.nodeId}` };
  if (name === 'Bible' && (params.language === 'bel' || params.language === 'ru') && typeof params.bookId === 'string') {
    return { section: 'bible', contentId: `bible:${params.language}:${params.bookId}` };
  }
  return null;
}

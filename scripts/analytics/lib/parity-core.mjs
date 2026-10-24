/**
 * WEB <-> Flutter analytics v2 parity: builds the platform-neutral golden
 * `tests/fixtures/analytics-parity-v2.json` from the WEB reference sources.
 *
 * The golden is copied byte-for-byte into the Flutter repository
 * (`test/fixtures/analytics/analytics-parity-v2.json`); Flutter's
 * `analytics_parity_test.dart` replays it through the Dart contract, route
 * mapper and collector. Drift on either side fails a test. Pure and offline:
 * no Firestore, no network, no content text.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as contract from '../../../src/utils/analytics/contract.js';
import { createCollector } from '../../../src/utils/analytics/collector.js';
import { mapRoute } from '../../../src/utils/analytics/routeMapper.js';

export const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const GOLDEN_PATH = path.join(root, 'tests/fixtures/analytics-parity-v2.json');
export const MASS_ORDER_ID = 'eMmCtxwyJ75ogmL5rwye';

const readJson = (file) => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
export const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
export const inventory = () => readJson('src/utils/analytics/public-inventory.json');

const PRAYER = 'prayer:0AAlyUXOjOtzbPdt3Gql';
const SONG = 'song:holysongs-0027665fbaf1422fd4dc';

/** Everything a client must agree on, as plain data. */
export function contractSurface() {
  return {
    schema_version: contract.SCHEMA_VERSION,
    platforms: contract.PLATFORMS,
    regions: contract.REGIONS,
    sections: contract.SECTIONS,
    section_content_kind: contract.SECTION_CONTENT_KIND,
    hour_ids: contract.HOUR_IDS,
    feature_ids: contract.FEATURE_IDS,
    error_ids: contract.ERROR_IDS,
    catalog_ids: contract.CATALOG_IDS,
    events: contract.EVENTS,
    text_metrics: contract.TEXT_METRICS,
    time_buckets: contract.TIME_BUCKETS,
    scroll_buckets: contract.SCROLL_BUCKETS,
    limits: { ...contract.LIMITS },
    constants: {
      max_visit_seconds: contract.MAX_VISIT_SECONDS,
      min_counted_visit_seconds: contract.MIN_COUNTED_VISIT_SECONDS,
      short_open_seconds: contract.SHORT_OPEN_SECONDS,
      reading_words_per_minute: contract.READING_WORDS_PER_MINUTE,
      chars_per_word: contract.CHARS_PER_WORD,
    },
  };
}

/** [section, content_id, valid under the public inventory] */
export const CONTENT_ID_PROBES = [
  ['prayers', PRAYER, true],
  ['prayers', 'prayer:ZZZZZZZZZZZZZZZZZZZZ', false], // well-formed but not published
  ['prayers', 'prayer:a b', false],
  ['prayers', 'song:holysongs-0027665fbaf1422fd4dc', false], // wrong kind
  ['songs', SONG, true],
  ['songs', 'song:holysongs-XYZ', false],
  ['compendium', 'comp:p1-s1-ch1', true],
  ['compendium', 'comp:P1', false],
  ['hours', 'hour:laudes', true],
  ['hours', 'hour:vespers', false],
  ['readings', 'reading:day', true],
  ['readings', 'reading:2026-10-15', false],
  ['mass', 'mass:order', true],
  ['bible', 'bible:bel:1ch', true],
  ['bible', 'bible:en:gn', false],
  ['today', 'anything', false], // sections without a content kind carry none
];

/** web: vue-router route (null = no WEB equivalent); flutter: go_router location (null = no Flutter equivalent). */
export const ROUTE_CASES = [
  { id: 'today', web: { name: 'Today' }, flutter: '/hours', expect: { section: 'today' } },
  { id: 'ordo', web: { name: 'OrdoByDate', params: { date: '2026-10-15' } }, flutter: '/hours/ordo?date=2026-10-15', expect: { section: 'ordo' } },
  { id: 'picker', web: { name: 'LiturgicalPicker' }, flutter: '/hours/picker', expect: { section: 'picker' } },
  { id: 'readings', web: { name: 'Readings' }, flutter: '/readings', expect: { section: 'readings', contentId: 'reading:day' } },
  { id: 'readings-by-date', web: { name: 'ReadingsByDate', params: { date: '2026-10-16' } }, flutter: '/readings/reading/abc', expect: { section: 'readings', contentId: 'reading:day' } },
  { id: 'hour-laudes', web: { name: 'laudes' }, flutter: '/hours/ora/2026-10-15/some-day/laudes', expect: { section: 'hours', contentId: 'hour:laudes' } },
  { id: 'hour-vesper', web: { name: 'vesper' }, flutter: '/hours/ora/2026-10-15/some-day/vespers', expect: { section: 'hours', contentId: 'hour:vesper' } },
  { id: 'hour-unknown', web: { name: 'matins' }, flutter: '/hours/ora/2026-10-15/some-day/matins', expect: null },
  { id: 'hours-list', web: { name: 'oras' }, flutter: '/hours/hora/2026-10-15/some-day', expect: { catalogId: 'hours_list' } },
  { id: 'prayers-home', web: { name: 'Prayers' }, flutter: '/prayers', expect: { catalogId: 'prayers_home' } },
  { id: 'prayers-all', web: { name: 'PrayersList' }, flutter: '/prayers/all', expect: { catalogId: 'prayers_all' } },
  { id: 'favorites', web: { name: 'FavoritePrayers' }, flutter: '/prayers/favorites', expect: { catalogId: 'favorites' } },
  { id: 'songs-list', web: { name: 'Songs' }, flutter: '/prayers/songs', expect: { catalogId: 'songs' } },
  { id: 'compendium-home', web: { name: 'Compendium' }, flutter: '/prayers/compendium', expect: { catalogId: 'compendium_home' } },
  { id: 'prayer', web: { name: 'PrayerView', params: { id: PRAYER.slice(7) } }, flutter: `/prayers/prayer/${PRAYER.slice(7)}`, expect: { section: 'prayers', contentId: PRAYER } },
  { id: 'mass-order', web: { name: 'PrayerView', params: { id: MASS_ORDER_ID } }, flutter: `/prayers/prayer/${MASS_ORDER_ID}?lang=la`, expect: { section: 'mass', contentId: 'mass:order' } },
  { id: 'song', web: { name: 'SongView', params: { id: SONG.slice(5) } }, flutter: `/prayers/songs/${SONG.slice(5)}`, expect: { section: 'songs', contentId: SONG } },
  { id: 'compendium-part', web: { name: 'CompendiumPart', params: { partId: 'p1' } }, flutter: '/prayers/compendium/part/p1', expect: { section: 'compendium', contentId: 'comp:p1' } },
  { id: 'compendium-node', web: { name: 'CompendiumNode', params: { nodeId: 'p1-s1-ch1' } }, flutter: '/prayers/compendium/node/p1-s1-ch1', expect: { section: 'compendium', contentId: 'comp:p1-s1-ch1' } },
  { id: 'bible-books', web: { name: 'Bible', params: {} }, flutter: '/bible', expect: { catalogId: 'bible_books' } },
  { id: 'bible-book', web: { name: 'Bible', params: { language: 'bel', bookId: 'gn', chapter: '3' } }, flutter: '/bible?version=bel&book=gn&chapter=3', expect: { section: 'bible', contentId: 'bible:bel:gn' } },
  { id: 'bible-bad-language', web: { name: 'Bible', params: { language: 'xx', bookId: 'gn' } }, flutter: '/bible?version=xx&book=gn&chapter=1', expect: null },
  { id: 'settings', web: { name: 'Settings' }, flutter: '/settings', expect: { section: 'settings' } },
  { id: 'about', web: { name: 'About' }, flutter: '/about', expect: { section: 'about' } },
  { id: 'prayer-add-personal', web: { name: 'PrayerAdd' }, flutter: '/prayers/prayer/add', expect: null },
  { id: 'unknown', web: { name: 'Nonexistent' }, flutter: '/nonexistent', expect: null },
  { id: 'login', web: { name: 'Login' }, flutter: null, expect: null },
  { id: 'admin', web: { name: 'Admin' }, flutter: null, expect: null },
];

/** Synthetic visit scenarios replayed by both collectors on a fake clock (2026-10-15T10:00:00Z). */
export const VISIT_SCENARIOS = [
  { id: 'read-with-scroll', steps: [
    { op: 'enter', section: 'prayers', contentId: PRAYER, totalChars: 1200 }, { op: 'tick', seconds: 30 },
    { op: 'scroll', fraction: 0.6 }, { op: 'scroll', fraction: 0.4 }, { op: 'leave' }] },
  { id: 'short-text-fits', steps: [
    { op: 'enter', section: 'prayers', contentId: PRAYER, totalChars: 300, fits: true }, { op: 'tick', seconds: 20 }, { op: 'leave' }] },
  { id: 'fits-grows-after-load', steps: [
    { op: 'enter', section: 'songs', contentId: SONG, totalChars: 900, fits: true }, { op: 'fits', value: false },
    { op: 'tick', seconds: 40 }, { op: 'scroll', fraction: 0.8 }, { op: 'leave' }] },
  { id: 'read-to-end', steps: [
    { op: 'enter', section: 'compendium', contentId: 'comp:p1', totalChars: 20000 }, { op: 'tick', seconds: 700 },
    { op: 'scroll', fraction: 0.99 }, { op: 'leave' }] },
  { id: 'short-open-no-er-sd', steps: [
    { op: 'enter', section: 'hours', contentId: 'hour:laudes', totalChars: 5000 }, { op: 'tick', seconds: 3 }, { op: 'leave' }] },
  { id: 'visit-under-one-second-dropped', steps: [
    { op: 'enter', section: 'prayers', contentId: PRAYER }, { op: 'tick', seconds: 0.5 }, { op: 'leave' }] },
  { id: 'scroll-unmeasurable', steps: [
    { op: 'enter', section: 'readings', contentId: 'reading:day' }, { op: 'tick', seconds: 10 }, { op: 'leave' }] },
  { id: 'catalog-open', steps: [
    { op: 'enter', catalogId: 'songs' }, { op: 'tick', seconds: 8 }, { op: 'leave' }] },
  { id: 'section-without-content-id', steps: [
    { op: 'enter', section: 'today' }, { op: 'tick', seconds: 10 }, { op: 'leave' }] },
  { id: 'closed-material-not-measured', steps: [
    { op: 'enter', section: 'prayers', contentId: 'prayer:ZZZZZZZZZZZZZZZZZZZZ', totalChars: 500 }, { op: 'tick', seconds: 30 }, { op: 'leave' }] },
  { id: 'same-material-twice-is-one-visit', steps: [
    { op: 'enter', section: 'mass', contentId: 'mass:order', totalChars: 8000 }, { op: 'tick', seconds: 20 },
    { op: 'enter', section: 'mass', contentId: 'mass:order', totalChars: 8000 }, { op: 'tick', seconds: 20 },
    { op: 'scroll', fraction: 0.3 }, { op: 'leave' }] },
  { id: 'quick-detour-then-back', steps: [
    { op: 'enter', section: 'prayers', contentId: PRAYER, totalChars: 1000 }, { op: 'tick', seconds: 10 }, { op: 'scroll', fraction: 0.5 },
    { op: 'enter', section: 'songs', contentId: SONG }, { op: 'tick', seconds: 0.5 },
    { op: 'enter', section: 'prayers', contentId: PRAYER, totalChars: 1000 }, { op: 'tick', seconds: 10 }, { op: 'leave' }] },
  { id: 'background-time-not-counted', steps: [
    { op: 'enter', section: 'prayers', contentId: PRAYER, totalChars: 4000 }, { op: 'tick', seconds: 20 }, { op: 'scroll', fraction: 0.5 },
    { op: 'hide' }, { op: 'tick', seconds: 120 }, { op: 'show' }, { op: 'tick', seconds: 10 }, { op: 'leave' }] },
  { id: 'background-over-five-minutes-new-visit', steps: [
    { op: 'enter', section: 'prayers', contentId: PRAYER, totalChars: 4000 }, { op: 'tick', seconds: 20 }, { op: 'scroll', fraction: 0.5 },
    { op: 'hide' }, { op: 'tick', seconds: 400 }, { op: 'show' }, { op: 'tick', seconds: 10 }, { op: 'leave' }] },
  { id: 'discarded-view-not-recorded', steps: [
    { op: 'enter', section: 'prayers', contentId: PRAYER, totalChars: 500 }, { op: 'tick', seconds: 30 }, { op: 'discard' }] },
  { id: 'feature-use-and-errors', steps: [
    { op: 'feature', id: 'theme_change', section: 'settings' }, { op: 'feature', id: 'theme_change', section: 'settings' },
    { op: 'feature', id: 'back_to_top', section: 'prayers' }, { op: 'feature', id: 'not_a_feature', section: 'prayers' },
    { op: 'feature', id: 'date_pick', section: 'nowhere' }, { op: 'error', id: 'storage_unavailable' }, { op: 'error', id: 'made_up_error' }] },
];

const cellKey = (cell) => JSON.stringify(Object.keys(cell).sort().map((k) => [k, cell[k]]));

/** Replays the steps on the WEB collector and returns the normalized, sorted cells. */
export function replayWeb(steps, { publicIds, platform = 'web' }) {
  let t = Date.parse('2026-10-15T10:00:00Z');
  const collector = createCollector({ platform, appVersion: '4.5.2', enabled: true, region: 'UNKNOWN', publicIds, now: () => t });
  for (const s of steps) {
    if (s.op === 'enter') collector.enterView({ section: s.section, contentId: s.contentId, catalogId: s.catalogId, totalChars: s.totalChars, fits: s.fits ?? false });
    else if (s.op === 'tick') t += Math.round(s.seconds * 1000);
    else if (s.op === 'scroll') collector.reportScroll(s.fraction);
    else if (s.op === 'fits') collector.reportFits(s.value);
    else if (s.op === 'leave') collector.leaveView();
    else if (s.op === 'discard') collector.discardView();
    else if (s.op === 'hide') collector.setVisible(false);
    else if (s.op === 'show') collector.setVisible(true);
    else if (s.op === 'feature') collector.featureUse(s.id, s.section);
    else if (s.op === 'error') collector.reportError(s.id);
    else throw new Error(`unknown op ${s.op}`);
  }
  collector.flush();
  const packets = collector.snapshot();
  for (const p of packets) {
    const problems = contract.validatePacket(p, { publicIds });
    if (problems.length) throw new Error(`invalid packet: ${problems.join('; ')}`);
  }
  return packets.flatMap((p) => p.cells).sort((a, b) => cellKey(a).localeCompare(cellKey(b)));
}

export function buildGolden() {
  const inv = inventory();
  const publicIds = new Set(inv.ids);
  const fixture = readFileSync(path.join(root, 'tests/fixtures/analytics-contract-v2.json'));
  return {
    schema_version: 2,
    note: 'GENERATED by scripts/analytics/parity.mjs --write from the WEB reference. Byte-identical copy lives in the Flutter repo. Do not edit by hand.',
    contract: contractSurface(),
    sources: {
      contract_fixture_sha256: sha256(fixture),
      inventory_sha256: inv.sha256,
      inventory_count: inv.ids.length,
    },
    massOrderPrayerId: MASS_ORDER_ID,
    contentIdProbes: CONTENT_ID_PROBES.map(([section, contentId, valid]) => ({
      section, content_id: contentId, valid,
      // the answer WEB gives, so a bad probe cannot hide a drift
      web_ok: contract.validateContentId(section, contentId, { publicIds }).length === 0,
    })),
    routes: ROUTE_CASES.map((c) => ({
      id: c.id, web: c.web, flutter: c.flutter,
      expect: c.expect,
      web_actual: c.web === null ? 'NOT_APPLICABLE' : (mapRoute(c.web, { massOrderPrayerId: MASS_ORDER_ID }) ?? null),
    })),
    visits: VISIT_SCENARIOS.map((s) => ({ id: s.id, steps: s.steps, cells: replayWeb(s.steps, { publicIds }) })),
  };
}

/** Static scan: feature ids WEB actually reports through trackFeature('...'). */
export function webFeatureHooks() {
  const found = new Map();
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(vue|js)$/.test(name)) {
        const text = readFileSync(full, 'utf8');
        for (const m of text.matchAll(/trackFeature\(\s*'([a-z_]+)'/g)) {
          if (!found.has(m[1])) found.set(m[1], new Set());
          found.get(m[1]).add(path.relative(root, full));
        }
      }
    }
  };
  walk(path.join(root, 'src'));
  return Object.fromEntries([...found].sort().map(([k, v]) => [k, [...v].sort()]));
}

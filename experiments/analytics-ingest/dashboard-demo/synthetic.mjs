/**
 * P08: deterministic SYNTHETIC packet generator for the offline dashboard demo. No people, no devices, no network.
 * A "packet" here is only a batch of counters in the v2 contract shape; the generator draws visits from fixed
 * distributions with a seeded PRNG, so the same seed always produces the same bytes.
 * Every packet goes through the real P06 core (`handleIngest`) via the P07 in-memory backend.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LIMITS, SCHEMA_VERSION, bucketScrollDepth, bucketVisibleSeconds, estimateReadingSeconds, validatePacket,
} from '../../../src/utils/analytics/contract.js';
import { cleanup } from '../src/core.mjs';
import { createMockBackend } from '../src/mock-client.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const loadPublicInventory = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'src/utils/analytics/public-inventory.json'), 'utf8')).ids;

export const DEFAULT_SEED = 20261024;
export const FIRST_DAY = '2026-10-17'; // 21 generated days; retention (14 days) removes the first 6
export const LAST_DAY = '2026-11-06';
export const RETENTION_DAYS = 14;
export const K = 5;
const DAY_MS = 86400000;

/** The 8 features of the synthetic profile (task: 5-10 features). */
export const PROFILE_FEATURES = Object.freeze(['text_scale_change', 'share_use', 'hour_switch', 'chord_transpose', 'favorite_add', 'search_open', 'bible_chapter_nav', 'theme_change']);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SECTION_WEIGHTS = [['today', 16], ['hours', 20], ['readings', 14], ['prayers', 14], ['songs', 12], ['compendium', 5], ['bible', 9], ['mass', 3], ['ordo', 3], ['picker', 2], ['settings', 1], ['about', 1]];
const KIND_PREFIX = { prayers: 'prayer:', songs: 'song:', compendium: 'comp:', bible: 'bible:', hours: 'hour:' };
/** median foreground seconds, probability that the text fits the screen, characters of text */
const READING = {
  hours: [140, 0.05, 6000], songs: [60, 0.55, 900], prayers: [55, 0.5, 1400], readings: [120, 0.1, 3500],
  compendium: [90, 0.2, 5000], bible: [100, 0.15, 4500], mass: [150, 0, 8000],
};
const CATALOG_FOR = { hours: ['hours_list'], prayers: ['prayers_home', 'prayers_all'], songs: ['songs'], bible: ['bible_books'], compendium: ['compendium_home'] };
const FEATURES_FOR = {
  hours: ['hour_switch', 'text_scale_change', 'share_use'],
  songs: ['chord_transpose', 'favorite_add', 'text_scale_change', 'search_open'],
  prayers: ['favorite_add', 'share_use', 'text_scale_change', 'search_open'],
  bible: ['bible_chapter_nav', 'text_scale_change', 'share_use', 'search_open'],
  readings: ['text_scale_change', 'share_use'], compendium: ['text_scale_change', 'share_use'], mass: ['text_scale_change'],
  settings: ['theme_change'],
};
const PLATFORM_PACKETS = { web: 34, android: 20, ios: 14 };
const PLATFORM_VERSION = { web: '3.2', android: '1.4', ios: '1.4' };

const pickWeighted = (rnd, pairs) => {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let x = rnd() * total;
  for (const [value, w] of pairs) { x -= w; if (x < 0) return value; }
  return pairs[pairs.length - 1][0];
};

/** Zipf-like popularity over a fixed seeded shuffle of the ids of one kind: a few popular materials and a long tail. */
function makePopularity(ids, rnd, exponent = 1) {
  const order = [...ids].sort();
  for (let i = order.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return order.map((id, i) => [id, 1 / ((i + 1) ** exponent)]);
}

export function createGenerator({ seed = DEFAULT_SEED, publicIds = loadPublicInventory() } = {}) {
  const rnd = mulberry32(seed);
  const pop = {};
  for (const [section, prefix] of Object.entries(KIND_PREFIX)) pop[section] = makePopularity(publicIds.filter((id) => id.startsWith(prefix)), rnd);
  pop.hours = [['hour:invitatorium', 2], ['hour:lectionis', 3], ['hour:laudes', 14], ['hour:terz', 4], ['hour:sext', 4], ['hour:non', 4], ['hour:vesper', 14], ['hour:completorium', 10], ['hour:morning', 2]];
  const contentFor = (section) => {
    if (section === 'readings') return 'reading:day';
    if (section === 'mass') return 'mass:order';
    return pop[section] ? pickWeighted(rnd, pop[section]) : undefined;
  };

  function visit(add, section) {
    const contentId = contentFor(section);
    add(contentId ? { e: 'screen_view', section, content_id: contentId } : { e: 'screen_view', section });
    for (const catalogId of (CATALOG_FOR[section] || []).filter(() => rnd() < 0.35).slice(0, 1)) add({ e: 'catalog_open', catalog_id: catalogId });
    if (READING[section]) {
      const [median, fitProbability, chars] = READING[section];
      const seconds = rnd() < 0.09 ? 1 + rnd() * 3.5 : median * Math.exp((rnd() + rnd() + rnd() - 1.5) * 1.6);
      add({ e: 'text_read', section, content_id: contentId, metric: 'fv', bucket: bucketVisibleSeconds(seconds) });
      if (seconds >= 5) {
        const fits = rnd() < fitProbability;
        const fraction = fits ? 1 : Math.min(1, rnd() ** 0.6);
        const reading = estimateReadingSeconds({ visibleSeconds: seconds, totalChars: chars * (0.7 + rnd() * 0.6), maxScrollFraction: fraction });
        add({ e: 'text_read', section, content_id: contentId, metric: 'er', bucket: bucketVisibleSeconds(reading) });
        add({ e: 'text_read', section, content_id: contentId, metric: 'sd', bucket: bucketScrollDepth(fraction, { fits }) });
      }
    }
    const features = FEATURES_FOR[section];
    if (features && rnd() < 0.3) add({ e: 'feature_use', feature_id: features[Math.floor(rnd() * features.length)], section });
  }

  /** One batch of counters (the contract's packet). Never fewer than 3 distinct cells, like the P07 client. */
  function packet(day, platform) {
    for (;;) {
      const cells = new Map();
      const add = (cell) => { const key = JSON.stringify(cell); cells.set(key, (cells.get(key) || 0) + 1); };
      const visits = 3 + Math.floor(rnd() * 6);
      for (let i = 0; i < visits; i += 1) visit(add, pickWeighted(rnd, SECTION_WEIGHTS));
      if (rnd() < 0.03) add({ e: 'measurement_error', error_id: 'clock_anomaly' });
      if (platform === 'ios' && rnd() < 0.05) add({ e: 'measurement_error', error_id: 'scroll_unmeasurable' });
      if (platform === 'web' && rnd() < 0.04) add({ e: 'measurement_error', error_id: 'visibility_unsupported' });
      if (rnd() < 0.002) add({ e: 'measurement_error', error_id: 'queue_overflow' });
      if (cells.size < 3 || cells.size > 40) continue;
      return { schema_version: SCHEMA_VERSION, day, platform, app_version: PLATFORM_VERSION[platform], region: 'UNKNOWN', cells: [...cells].map(([key, n]) => ({ ...JSON.parse(key), n })) };
    }
  }

  function dayPackets(day, index) {
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    const factor = (weekday === 0 ? 1.3 : weekday === 6 ? 0.9 : 1) * (1 + index * 0.01);
    const packets = [];
    for (const platform of Object.keys(PLATFORM_PACKETS)) {
      const count = Math.round(PLATFORM_PACKETS[platform] * factor * (0.9 + rnd() * 0.2));
      for (let i = 0; i < count; i += 1) packets.push(packet(day, platform));
    }
    return packets;
  }
  return { dayPackets, rnd };
}

export const daysBetween = (from, to) => {
  const out = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY_MS) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
};

/** Raw tally straight from the packets (independent of storage): the "expected sums" of the fixture. */
export function tallyPackets(packets) {
  const tally = { screen_view: 0, catalog_open: 0, feature_use: 0, measurement_error: 0, text_read_fv: 0, byPlatform: {} };
  for (const p of packets) {
    const slot = (tally.byPlatform[p.platform] ||= { screen_view: 0, catalog_open: 0, feature_use: 0, measurement_error: 0, text_read_fv: 0 });
    for (const c of p.cells) {
      const name = c.e === 'text_read' ? (c.metric === 'fv' ? 'text_read_fv' : null) : c.e;
      if (!name) continue;
      tally[name] += c.n; slot[name] += c.n;
    }
  }
  return tally;
}

/**
 * Sends all packets through the real core day by day with an injected clock: most arrive on their day at 21:00 UTC,
 * about 5 % the next morning (late delivery, inside the 2-day window). Returns the backend and what was generated.
 * Deterministic: depends on `seed` only.
 */
export async function runSyntheticPipeline({ seed = DEFAULT_SEED, publicIds, firstDay = FIRST_DAY, lastDay = LAST_DAY, retentionDays = RETENTION_DAYS, ingestEnabled = true } = {}) {
  const ids = publicIds || loadPublicInventory();
  const generator = createGenerator({ seed, publicIds: ids });
  const idSet = new Set(ids);
  let clock = Date.parse(`${firstDay}T00:00:00Z`);
  const backend = createMockBackend({ now: () => clock, publicIds: idSet, ingestEnabled });
  const allPackets = [];
  const statuses = {};
  let late = [];
  const deliver = async (packet) => {
    if (validatePacket(packet, { publicIds: idSet }).length) throw new Error('generator produced an invalid packet');
    if (JSON.stringify(packet).length > LIMITS.maxPacketBytes) throw new Error('packet too large');
    const { status } = await backend.transport.send(packet);
    statuses[status] = (statuses[status] || 0) + 1;
  };
  const days = daysBetween(firstDay, lastDay);
  for (const [index, day] of days.entries()) {
    clock = Date.parse(`${day}T08:00:00Z`);
    for (const packet of late) await deliver(packet);
    const packets = generator.dayPackets(day, index);
    allPackets.push(...packets);
    late = [];
    clock = Date.parse(`${day}T21:00:00Z`);
    for (const packet of packets) {
      if (generator.rnd() < 0.05 && day !== lastDay) late.push(packet); else await deliver(packet);
    }
  }
  clock = Date.parse(`${lastDay}T23:00:00Z`);
  for (const packet of late) await deliver(packet);
  const deletedRows = await cleanup(backend.storage, clock, retentionDays);
  return { backend, packets: allPackets, statuses, days, deletedRows, now: clock };
}

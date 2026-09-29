#!/usr/bin/env node
/**
 * Generate `src/data/ordo/fixed-identities.js`: the stable celebration id and
 * the `days` document ids (`patchs/db-feasts/_id`, the Firestore ids) of every
 * `fixedCalendar.js` entry.
 *
 *   node scripts/ordo/build-identities.mjs          # write
 *   node scripts/ordo/build-identities.mjs --check  # exit 1 when stale
 *   node scripts/ordo/build-identities.mjs --live-index-from reports/ordo-firestore-cache
 *       # refresh scripts/ordo/data/firestore-days-index.json from a local snapshot/cache
 *
 * `patchs/db-feasts` splits multi-diocese documents (`…--pinsk`); Firestore
 * keeps one document with `_place: [...]`. The live index maps a diocese to
 * the document that actually exists (resolveLiveDayIds).
 *
 * The Ordo engine uses these ids so that engine candidates, parser evidence
 * (`identity.id`) and Firestore `days` documents share one identity.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { fixedCalendar, normalizeFixedPlace } from '../../src/constants/fixedCalendar.js';
import { normalizePlaces } from '../../src/utils/fixedFeasts.js';
import { celebrationSlug, loadFixedCatalog } from './lib/identity.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'src', 'data', 'ordo', 'fixed-identities.js');
/** Fixed `days` documents as stored in Firestore (id, `_date`, `_place`); see `--live-index-from`. */
export const LIVE_INDEX = path.join(ROOT, 'scripts', 'ordo', 'data', 'firestore-days-index.json');
const SEASONAL_ID = /^(advent|christmas)-\d{2}-\d{2}$/;

/** `[{ id, date, places }]` of the live fixed `days` documents, or null when no index exists. */
export function loadLiveIndex(file = LIVE_INDEX) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')).documents;
}

/** Build the live index from a local snapshot / public cache directory (never Firestore). */
export function buildLiveIndex(snapshotDir) {
  const manifest = JSON.parse(fs.readFileSync(path.join(snapshotDir, 'manifest.json'), 'utf8'));
  const descriptor = manifest.collections?.days;
  if (!descriptor) throw new Error(`No days collection in ${snapshotDir}`);
  const payload = JSON.parse(fs.readFileSync(path.join(snapshotDir, descriptor.file), 'utf8'));
  const documents = payload.documents
    .filter((item) => item.data?._date && !SEASONAL_ID.test(item.id))
    .map((item) => ({ id: item.id, date: item.data._date, places: normalizePlaces(item.data._place) }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return { source: { projectId: manifest.projectId, snapshotVersion: manifest.snapshotVersion, scope: manifest.scope || 'complete-backup' }, documents };
}

/**
 * Firestore stores one document for several dioceses (`_place: [a, b]`)
 * where `patchs/db-feasts` splits it per diocese (`…--pinsk`). When the
 * split ids are not live, the diocese resolves to the live document of the
 * same celebration and date whose `_place` includes it.
 */
export function resolveLiveDayIds(dayIds, { date, place, live }) {
  if (!live || !dayIds.length) return dayIds;
  const liveIds = new Set(live.map((doc) => doc.id));
  const present = dayIds.filter((id) => liveIds.has(id));
  if (present.length === dayIds.length) return dayIds;
  const slugs = new Set(dayIds.map(celebrationSlug));
  const variant = (id) => (/--(?!.*--)(.+)$/.exec(id.replace(/--(?:minsk-mohilev|vitebsk|grodno|pinsk)(?=--|$)/g, ''))?.[1] || '');
  const variants = new Set(dayIds.map(variant));
  const replacement = live.filter((doc) => doc.date === date
    && slugs.has(celebrationSlug(doc.id))
    && (place ? doc.places.includes(place) : !doc.places.length)
    && variants.has(variant(doc.id)))
    .map((doc) => doc.id);
  const result = [...new Set([...present, ...replacement])].sort();
  return result.length ? result : dayIds;
}

export function fixedIdentityKey(entry) {
  return `${entry.date}|${normalizeFixedPlace(entry.place) || '-'}|${entry.title}`;
}

function loadDocumentPlaces(root) {
  const dir = path.join(root, 'patchs', 'db-feasts');
  const places = new Map();
  if (!fs.existsSync(dir)) return places;
  fs.readdirSync(dir).filter((name) => name.endsWith('.json')).forEach((name) => {
    const data = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    places.set(data._id || name.replace(/\.json$/, ''), normalizePlaces(data._place));
  });
  return places;
}

export function buildFixedIdentities(root = ROOT, { live = loadLiveIndex(path.join(root, 'scripts', 'ordo', 'data', 'firestore-days-index.json')) } = {}) {
  const catalog = loadFixedCatalog(root);
  const documentPlaces = loadDocumentPlaces(root);
  const identities = {};
  catalog.filter((entry) => entry.fixedCalendarIndex !== null).forEach((entry) => {
    const source = fixedCalendar[entry.fixedCalendarIndex];
    // Parser placeholders (`fixed-MMDD-n`) are not stable identities.
    if (!entry.dayIds.length) return;
    // Keep only the documents of this entry's place (universal: no place).
    const place = normalizeFixedPlace(source.place);
    const own = entry.dayIds.filter((id) => {
      const places = documentPlaces.get(id) || [];
      return place ? places.includes(place) : !places.length;
    });
    const dayIds = resolveLiveDayIds(own.length ? own : entry.dayIds, { date: source.date, place, live });
    identities[fixedIdentityKey(source)] = { id: entry.id, dayIds };
  });
  return identities;
}

export function renderFixedIdentities(identities) {
  const lines = Object.entries(identities)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)},`);
  return `/**
 * GENERATED by \`node scripts/ordo/build-identities.mjs\` — do not edit.
 *
 * \`fixedCalendar.js\` entry (\`DD.MM|place|title\`) → stable celebration id and
 * the \`days\` document ids (Firestore ids from \`patchs/db-feasts\`).
 */
export const FIXED_IDENTITIES = Object.freeze({
${lines.join('\n')}
});
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const liveFrom = process.argv.indexOf('--live-index-from');
  if (liveFrom > 0) {
    const index = buildLiveIndex(path.resolve(process.argv[liveFrom + 1]));
    fs.mkdirSync(path.dirname(LIVE_INDEX), { recursive: true });
    fs.writeFileSync(LIVE_INDEX, `${JSON.stringify(index, null, 1)}\n`, 'utf8');
    console.log(`live days index: ${index.documents.length} documents (${index.source.snapshotVersion})`);
  }
  const text = renderFixedIdentities(buildFixedIdentities());
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (current !== text) {
      console.error('src/data/ordo/fixed-identities.js is stale. Run: node scripts/ordo/build-identities.mjs');
      process.exit(1);
    }
    console.log('fixed identities: up to date');
  } else {
    fs.writeFileSync(OUT, text, 'utf8');
    console.log(`fixed identities: ${text.split('\n').length} lines written`);
  }
}

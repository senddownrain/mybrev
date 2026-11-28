/** Local inputs and the idempotent import plan of novena drafts. */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { publicPrayerRows } from '../../src/utils/publicPrayerCatalog.mjs';
import { editableContent, generatedDraft, novenaSources } from '../../src/utils/novena/drafts.mjs';
import { EXCLUDED } from '../../src/utils/novena/core.mjs';
import { openFirestoreSnapshot } from '../lib/firestore-snapshot.mjs';
import { decodeCollection } from '../content/lib/app-content.mjs';

const bundleRows = (file) => Object.values(decodeCollection(JSON.parse(zlib.gunzipSync(fs.readFileSync(file)))));

/**
 * Public prayers from a local source only: a JSON array, an app bundle
 * directory (assets/content) or a Firestore snapshot directory.
 */
export async function readPublicPrayers(source) {
  let prayers;
  let categories = [];
  let version = null;
  let protectedPrayers = [];
  let protectedCategories = [];
  if (fs.statSync(source).isFile()) {
    prayers = JSON.parse(fs.readFileSync(source, 'utf8'));
  } else if (fs.existsSync(path.join(source, 'prayers.json.gz'))) {
    prayers = bundleRows(path.join(source, 'prayers.json.gz'));
    const categoryFile = path.join(source, 'prayerCategories.json.gz');
    if (fs.existsSync(categoryFile)) categories = bundleRows(categoryFile);
    version = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(source, 'prayers.json.gz')))).contentVersion;
  } else {
    const snapshot = await openFirestoreSnapshot(source);
    const rows = async (name) => await snapshot.collection(name) || [];
    prayers = await snapshot.collection('prayers');
    if (!prayers) throw new Error('The snapshot has no prayers collection.');
    categories = await rows('prayerCategories');
    protectedPrayers = [...await rows('priestProtectedPrayers'), ...await rows('protectedPrayers')];
    protectedCategories = [...await rows('priestProtectedCategories'), ...await rows('protectedCategories')];
    version = Date.parse(snapshot.manifest.exportedAt);
  }
  const { prayers: open } = publicPrayerRows({ prayers, categories, protectedPrayers, protectedCategories });
  return { prayers: new Map(open.map((item) => [item.id, item])), version };
}

/** All V1 drafts generated from the public prayers. */
export function generateDrafts(prayers) {
  const sources = novenaSources([...prayers.values()]).sort((a, b) => (a.id < b.id ? -1 : 1));
  return {
    sources: sources.length,
    excluded: sources.filter((item) => Object.hasOwn(EXCLUDED, item.id)).map((item) => item.id),
    drafts: sources.map((item) => generatedDraft(item, prayers)).filter(Boolean),
  };
}

export const contentHash = (draft) => createHash('sha256').update(editableContent(draft)).digest('hex').slice(0, 16);

/**
 * create / update / no-op / protected for one draft. A document is rewritten
 * only while it still equals what an earlier import wrote; anything edited by
 * hand (or created without provenance) is protected.
 */
export function planDraft(generated, existing, { overwriteManual = [] } = {}) {
  const hash = contentHash(generated);
  const id = generated.novenaId;
  if (!existing) return { id, action: 'create', data: { ...generated, importHash: hash } };
  const current = contentHash(existing);
  if (current === hash) return { id, action: 'noop' };
  const untouched = Boolean(existing.importHash) && existing.importHash === current;
  if (!untouched && !overwriteManual.includes(id)) return { id, action: 'protected' };
  // State and versions belong to the editor, not to the generator.
  const data = {
    ...generated,
    contentVersion: existing.contentVersion || generated.contentVersion,
    trackerEnabled: existing.trackerEnabled === true,
    ...(existing.everPublished ? { everPublished: true } : {}),
    importHash: hash,
  };
  return { id, action: 'update', data, previous: existing };
}

export function planImport(drafts, existing = new Map(), options = {}) {
  return drafts.map((draft) => planDraft(draft, existing.get(draft.novenaId), options));
}

export function countPlan(plan) {
  const counts = { create: 0, update: 0, noop: 0, protected: 0 };
  plan.forEach((item) => { counts[item.action] += 1; });
  return counts;
}

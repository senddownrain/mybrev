import {
  catalogError, evaluateAccessSets, hasV2ContentFields, isPriestMirror, validCatalogId, validAccessSetList,
} from '../../src/utils/accessSetsV2Policy.mjs';
import { ACCESS_SET_ID } from '../../src/utils/accessSetsV2Code.mjs';
import { removeCategoryFromContent } from '../../src/utils/prayerCategoryMembership.mjs';
import { PRAYER_STORAGE, MAX_ATOMIC_CONTENT_WRITES } from '../../src/utils/prayerStoragePlan.mjs';
import { ACCESS_V2 } from '../../src/services/accessSetsV2Gateway.mjs';
import { catalogContentHash, catalogPayload, catalogValueJson, digestCatalogValue } from './access-sets-v2-content-values.mjs';

export const CATALOG_ROLLOUT = 'priestContentControl/accessSetsV2';
export const CATALOG_PATHS = Object.freeze({
  prayers: ['prayers', PRAYER_STORAGE.prayers, ACCESS_V2.prayers],
  categories: ['prayerCategories', PRAYER_STORAGE.prayerCategories, ACCESS_V2.categories],
});
export const CATALOG_KINDS = Object.keys(CATALOG_PATHS);
const fail = (code) => { throw catalogError(code); };
const same = (a, b) => catalogValueJson(a) === catalogValueJson(b);
const owns = (object, key) => Object.hasOwn(object, key);
const indexPath = (set, kind, id) => `${ACCESS_V2.sets}/${set}/${kind}/${id}`;
const sortedRows = (docs) => [...docs].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
export const catalogDigest = (docs) => digestCatalogValue(
  sortedRows(docs).map(([path, data]) => ({ path, digest: digestCatalogValue(data) })),
);

export function assertCatalogParity({ documents, sets }) {
  const activeSets = new Set([...sets].filter(([, data]) => data.status === 'active').map(([id]) => id));
  const content = { prayers: [], categories: [] };
  const publicIds = { prayers: new Set(), categories: new Set() };
  const canonical = { prayers: new Map(), categories: new Map() };
  const mirrors = { prayers: new Map(), categories: new Map() };
  const observedIndexes = new Set();
  for (const [path, data] of documents) {
    const [collection, id, indexKind, indexId, ...extra] = path.split('/');
    if (collection === ACCESS_V2.sets) {
      if (!ACCESS_SET_ID.test(id) || !sets.has(id) || !CATALOG_KINDS.includes(indexKind)
        || !validCatalogId(indexId) || extra.length || Object.keys(data).length) fail('invalid-content-index');
      observedIndexes.add(path);
      continue;
    }
    const kind = CATALOG_KINDS.find((key) => CATALOG_PATHS[key].includes(collection));
    if (!kind || !validCatalogId(id) || indexKind !== undefined || owns(data, 'id')) fail('invalid-content-path');
    const [publicPath, mirrorPath] = CATALOG_PATHS[kind];
    if (collection === publicPath) {
      if (hasV2ContentFields(data) || (data.priestOnly !== undefined && data.priestOnly !== false)
        || (data.effectivePriestOnly !== undefined && data.effectivePriestOnly !== false)) fail('protected-public-document');
      publicIds[kind].add(id);
      content[kind].push({ ...data, id });
    } else if (collection === mirrorPath) {
      if (hasV2ContentFields(data)) fail('invalid-legacy-mirror');
      mirrors[kind].set(id, data);
    } else {
      canonical[kind].set(id, data);
      content[kind].push({ ...data, id });
    }
  }
  const effective = evaluateAccessSets(content, activeSets);
  for (const kind of CATALOG_KINDS) {
    for (const id of publicIds[kind]) if (effective[kind].get(id)) fail('protected-public-document');
    for (const [id, row] of canonical[kind]) {
      const expected = effective[kind].get(id);
      if (!expected || ![2, 2n].includes(row.accessSchemaVersion) || !validAccessSetList(row.accessSets)
        || !validAccessSetList(row.effectiveAccessSets) || !same([...row.effectiveAccessSets].sort(), expected)
        || row.contentHash !== catalogContentHash(row)) fail('invalid-canonical-content');
      if (isPriestMirror(expected) !== mirrors[kind].has(id)
        || (mirrors[kind].has(id) && row.contentHash !== catalogContentHash(mirrors[kind].get(id)))) fail('legacy-mirror-drift');
      for (const set of expected) if (!observedIndexes.delete(indexPath(set, kind, id))) fail('missing-content-index');
    }
    for (const id of mirrors[kind].keys()) if (!canonical[kind].has(id)) fail('missing-canonical-copy');
  }
  if (observedIndexes.size) fail('orphan-content-index');
  return { content, activeSets };
}

function applyEdit(content, edit) {
  const { kind, id, action, patch } = edit ?? {};
  if (!CATALOG_KINDS.includes(kind) || !validCatalogId(id) || !['create', 'update', 'delete'].includes(action)) {
    fail('invalid-content-edit');
  }
  const index = content[kind].findIndex((row) => row.id === id);
  if ((index < 0) !== (action === 'create')) fail('content-edit-conflict');
  if (action === 'delete') {
    if (kind === 'categories') removeCategoryFromContent(content, id);
    else {
      content.prayers.splice(index, 1);
      content.categories = content.categories.map((row) => row.prayerIds?.includes(id)
        ? { ...row, prayerIds: row.prayerIds.filter((value) => value !== id) } : row);
    }
    return;
  }
  if (!patch || Object.getPrototypeOf(patch) !== Object.prototype
    || ['id', 'accessSchemaVersion', 'effectiveAccessSets', 'contentHash', 'priestOnly', 'effectivePriestOnly', 'sourceDraftId']
      .some((key) => owns(patch, key))
    || (owns(patch, 'accessSets') && !validAccessSetList(patch.accessSets))) fail('invalid-content-patch');
  const row = { ...content[kind][index], ...patch, id };
  if (stageIsUnpublished(row)) fail('unpublished-catalog-content');
  if (owns(patch, 'accessSets')) {
    delete row.priestOnly;
    if (isPriestMirror(patch.accessSets)) row.priestOnly = true;
  }
  if (kind === 'categories' && (typeof row.name !== 'string' || !row.name.trim())) fail('invalid-category-name');
  if (kind === 'prayers' && (!hasPrayerText(row.title, row.titleVersions) || !hasPrayerText(row.text, row.textVersions))) {
    fail('invalid-prayer-payload');
  }
  for (const field of ['source', 'sourceBook']) {
    if (owns(patch, field) && (typeof patch[field] !== 'string' || patch[field].length > 500)
      && patch[field] !== content[kind][index]?.[field]) fail('invalid-prayer-attribution');
  }
  if (owns(patch, 'source') && !owns(patch, 'sourceManual')) row.sourceManual = true;
  if (index < 0) content[kind].push(row);
  else content[kind][index] = row;
}

function stageIsUnpublished(row) {
  return row.published === false || ['draft', 'pending', 'review', 'rejected', 'archived']
    .includes(String(row.status || '').toLowerCase());
}

function hasPrayerText(plain, localized) {
  const filled = (value) => typeof value === 'string' && Boolean(value.trim());
  return filled(plain) || (localized && typeof localized === 'object' && Object.values(localized).some(filled));
}

function projectCatalog(content, effective, before) {
  const desired = new Map();
  const privateIds = effective.prayers;
  // Keep public → private manual membership on the protected prayer. Otherwise
  // IDs in a public category would reveal an index entry outside the grant.
  const extraCategories = new Map();
  for (const category of content.categories) {
    if (effective.categories.get(category.id)) continue;
    for (const id of category.prayerIds || []) {
      if (!privateIds.get(id)) continue;
      if (!extraCategories.has(id)) extraCategories.set(id, []);
      extraCategories.get(id).push(category.id);
    }
    if (Array.isArray(category.prayerIds)) category.prayerIds = category.prayerIds.filter((id) => !privateIds.get(id));
  }
  for (const prayer of content.prayers) {
    if (extraCategories.has(prayer.id)) {
      prayer.categoryIds = [...new Set([...(prayer.categoryIds || []), ...extraCategories.get(prayer.id).sort()])];
    }
  }
  for (const kind of CATALOG_KINDS) {
    const [publicPath, mirrorPath, canonicalPath] = CATALOG_PATHS[kind];
    for (const row of content[kind]) {
      const payload = catalogPayload(row);
      const sets = effective[kind].get(row.id);
      if (!sets) {
        delete payload.priestOnly;
        delete payload.effectivePriestOnly;
        const publicBefore = before.get(`${publicPath}/${row.id}`);
        if (publicBefore?.priestOnly === false) payload.priestOnly = false;
        if (publicBefore?.effectivePriestOnly === false) payload.effectivePriestOnly = false;
        desired.set(`${publicPath}/${row.id}`, payload);
        continue;
      }
      const ownSets = [...(row.accessSets || [])].sort();
      const mirror = isPriestMirror(sets);
      if (mirror) {
        // Copied legacy records keep their original flags/attribution/types.
        if (!before.has(`${mirrorPath}/${row.id}`)) payload.effectivePriestOnly = true;
        if (isPriestMirror(ownSets) && row.priestOnly === undefined && !before.has(`${mirrorPath}/${row.id}`)) {
          payload.priestOnly = true;
        }
        desired.set(`${mirrorPath}/${row.id}`, payload);
      } else {
        delete payload.priestOnly;
        delete payload.effectivePriestOnly;
      }
      const canonical = { ...payload, accessSchemaVersion: 2, accessSets: ownSets, effectiveAccessSets: sets };
      desired.set(`${canonicalPath}/${row.id}`, { ...canonical, contentHash: catalogContentHash(canonical) });
      for (const set of sets) desired.set(indexPath(set, kind, row.id), {});
    }
  }
  return desired;
}

function makePlan(version, before, after) {
  const operations = [];
  let bytes = 1024; // content control write and protocol overhead
  for (const path of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const previous = before.get(path);
    const next = after.get(path);
    if (previous && next && same(previous, next)) continue;
    const preimage = previous ? catalogValueJson(previous) : '';
    const postimage = next ? catalogValueJson(next) : '';
    if (Buffer.byteLength(postimage) + Buffer.byteLength(path) > 900_000) fail('content-document-too-large');
    bytes += Buffer.byteLength(preimage) + Buffer.byteLength(postimage) + Buffer.byteLength(path) + 256;
    operations.push({ path, before: previous ?? null, after: next ?? null });
  }
  if (operations.length + 1 > MAX_ATOMIC_CONTENT_WRITES || bytes > 7_000_000) fail('content-transaction-too-large');
  const beforeDigest = catalogDigest(before);
  const afterDigest = catalogDigest(after);
  const planDigest = digestCatalogValue({ version, beforeDigest, afterDigest });
  return { version, beforeDigest, afterDigest, planDigest, operations };
}

export function planCanonicalCatalog(snapshot, edits) {
  if (!Number.isSafeInteger(snapshot.version) || snapshot.version < 0 || snapshot.version >= Number.MAX_SAFE_INTEGER) {
    fail('invalid-content-version');
  }
  const { content, activeSets } = assertCatalogParity(snapshot);
  if (!Array.isArray(edits) || !edits.length || edits.length >= MAX_ATOMIC_CONTENT_WRITES) fail('invalid-content-edits');
  for (const edit of edits) applyEdit(content, edit);
  const effective = evaluateAccessSets(content, activeSets);
  const desired = projectCatalog(content, effective, snapshot.documents);
  assertCatalogParity({ documents: desired, sets: snapshot.sets });
  return makePlan(snapshot.version, snapshot.documents, desired);
}

// Used only with a retained, trusted preimage. Atomically refuses drift or a
// later edit; the control version always increases, even on restore.
export function planCatalogRestore(snapshot, priorPlan) {
  if (snapshot.version !== priorPlan.version + 1 || catalogDigest(snapshot.documents) !== priorPlan.afterDigest) {
    fail('content-snapshot-drift');
  }
  const restored = new Map(snapshot.documents);
  for (const { path, before } of priorPlan.operations) {
    if (before) restored.set(path, before);
    else restored.delete(path);
  }
  if (catalogDigest(restored) !== priorPlan.beforeDigest) fail('invalid-content-preimage');
  assertCatalogParity({ documents: restored, sets: snapshot.sets });
  return makePlan(snapshot.version, snapshot.documents, restored);
}

export function summarizeCatalogPlan(plan) {
  return {
    version: plan.version, planDigest: plan.planDigest, writes: plan.operations.length,
    afterDigest: plan.afterDigest,
    creates: plan.operations.filter((op) => op.before === null).length,
    deletes: plan.operations.filter((op) => op.after === null).length,
    parity: 'verified',
  };
}

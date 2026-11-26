import {
  assembleCanonicalCatalog, catalogError, noCategory, permittedCanonicalRow, validAccessSetList, validCatalogId,
} from '../utils/accessSetsV2Policy.mjs';
import { MAX_CATEGORY_DEPTH } from '../utils/prayerCategoryMembership.mjs';
import { firestoreErrorCode, isFirestoreQuotaError } from '../utils/firestoreErrors.mjs';

export const ACCESS_CATALOG_PAGE_SIZE = 25;
export const ACCESS_CATALOG_CONCURRENCY = 4;
const kinds = ['categories', 'prayers'];
const empty = () => ({ prayers: [], categories: [] });
const expectedDenial = (error) => ['permission-denied', 'not-found'].includes(firestoreErrorCode(error));
const expired = () => catalogError('catalog-session-expired');

export function createAccessSetsCatalogSession({
  confirm, canRead = () => true, perform = (read) => read(), onInvalidated = () => {},
  pageSize = ACCESS_CATALOG_PAGE_SIZE,
}) {
  let current;
  let active = 0;
  const queued = [];
  let generation = 0;

  function invalidate() {
    generation++;
    current?.rows.clear();
    current = undefined;
    for (const job of queued.splice(0)) job.reject(expired());
    onInvalidated();
  }

  function assertCurrent(session) {
    if (session.generation !== generation || !canRead()) throw expired();
  }

  function runNext() {
    while (active < ACCESS_CATALOG_CONCURRENCY && queued.length) {
      const { session, read, resolve, reject } = queued.shift();
      active++;
      Promise.resolve().then(() => {
        assertCurrent(session);
        return perform(read);
      }).then((value) => {
        assertCurrent(session);
        resolve(value);
      }).catch((error) => {
        if (isFirestoreQuotaError(error)) failClosed(session);
        reject(error);
      }).finally(() => { active--; runNext(); });
    }
  }

  function request(session, read) {
    assertCurrent(session);
    return new Promise((resolve, reject) => {
      queued.push({ session, read, resolve, reject });
      runNext();
    });
  }

  function failClosed(session) {
    if (session.generation !== generation) return;
    invalidate();
    // A denied page or network/quota failure expires this generation. An
    // explicit provider event or foreground/reconnect can start a new one.
    current = { generation, rows: new Map(), confirmation: Promise.resolve(null) };
  }

  async function sessionForRead(retryConfirmation = true) {
    if (!canRead()) return null;
    const requestedGeneration = generation;
    if (!current) {
      const session = { generation, rows: new Map() };
      current = session;
      session.confirmation = Promise.resolve().then(() => perform(confirm)).then((source) => {
        assertCurrent(session);
        if (source?.mode === 'legacy' && source.legacyActive === true
          && (typeof source.readLegacy === 'function' || typeof source.readLegacyPrayer === 'function')) {
          session.source = source;
          return session;
        }
        if (source?.mode !== 'canonical' || !source.uid || !source.gateway
          || !validAccessSetList(source.allowedSets) || !source.allowedSets.length) return null;
        session.source = { ...source, allowedSets: [...source.allowedSets].sort() };
        return session;
      }).catch(() => {
        failClosed(session);
        return null;
      });
    }
    const session = await current.confirmation;
    // The first server confirmation can publish the restored rights and
    // invalidate this generation synchronously. Bind to the new one once.
    if (!session && retryConfirmation && requestedGeneration !== generation) return sessionForRead(false);
    return session?.generation === generation && canRead() ? session : null;
  }

  function fetchRow(session, kind, id) {
    if (!validCatalogId(id)) return Promise.resolve(null);
    const key = `${kind}/${id}`;
    if (!session.rows.has(key)) {
      const pending = request(session, () => session.source.gateway.readContent(kind, id)).then((row) => (
        row?.id === id && permittedCanonicalRow(row, session.source.allowedSets) ? row : null
      )).catch((error) => {
        if (expectedDenial(error)) return null;
        throw error;
      });
      session.rows.set(key, pending);
    }
    return session.rows.get(key);
  }

  function fetchLegacyPrayer(session, id) {
    const key = `prayers/${id}`;
    if (!session.rows.has(key)) {
      const pending = request(session, () => session.source.readLegacyPrayer(id)).then((row) => (
        row?.id === id ? { ...row, priestOnly: true, effectivePriestOnly: true } : null
      )).catch((error) => {
        if (expectedDenial(error)) return null;
        throw error;
      });
      session.rows.set(key, pending);
    }
    return session.rows.get(key);
  }

  async function collect(session) {
    if (session.source.mode === 'legacy') {
      if (typeof session.source.readLegacy !== 'function') return empty();
      const result = await request(session, () => session.source.readLegacy(() => assertCurrent(session)));
      assertCurrent(session);
      for (const prayer of result.prayers) {
        const key = `prayers/${prayer.id}`;
        if (!session.rows.has(key)) session.rows.set(key, Promise.resolve({ ...prayer, priestOnly: true, effectivePriestOnly: true }));
      }
      return result;
    }
    const result = empty();
    for (const kind of kinds) {
      const accepted = new Map();
      const pages = session.source.allowedSets.map((setId) => ({ setId, after: undefined }));
      while (pages.length) {
        const { setId, after } = pages.shift();
        const page = await request(session, () => session.source.gateway.listIds(kind, setId, { pageSize, after }));
        if (!Array.isArray(page?.ids) || page.ids.length > pageSize || !page.ids.every(validCatalogId)
          || (page.cursor !== null && (page.cursor !== page.ids.at(-1) || page.cursor === after))) {
          throw catalogError('invalid-catalog-page');
        }
        const rows = await Promise.all(page.ids.filter((id) => !accepted.has(id)).map((id) => fetchRow(session, kind, id)));
        for (const row of rows) if (row?.effectiveAccessSets.includes(setId)) accepted.set(row.id, row);
        if (page.cursor !== null) pages.push({ setId, after: page.cursor });
      }
      result[kind] = [...accepted.values()];
    }
    return result;
  }

  async function catalog() {
    const session = await sessionForRead();
    if (!session) return null;
    try {
      session.list ??= collect(session);
      const content = await session.list;
      assertCurrent(session);
      return { mode: session.source.mode, content };
    } catch {
      failClosed(session);
      return null;
    }
  }

  async function readPrayer(id, publicData) {
    if (!validCatalogId(id)) return null;
    const session = await sessionForRead();
    if (!session) return null;
    try {
      if (session.source.mode === 'legacy') {
        const cached = session.rows.get(`prayers/${id}`);
        const prayer = cached || (typeof session.source.readLegacyPrayer === 'function' && fetchLegacyPrayer(session, id));
        const result = prayer ? await prayer : null;
        assertCurrent(session);
        return result;
      }
      const row = await fetchRow(session, 'prayers', id);
      if (!row || (row.categoryIds !== undefined && !Array.isArray(row.categoryIds))) return null;
      const categories = new Map(publicData.categories.map((category) => [category.id, category]));
      const missing = new Map();
      async function loadAncestors(categoryId) {
        let count = 0;
        while (!noCategory(categoryId) && !categories.has(categoryId) && !missing.has(categoryId)) {
          if (++count > MAX_CATEGORY_DEPTH) return;
          const category = await fetchRow(session, 'categories', categoryId);
          if (!category) return;
          missing.set(categoryId, category);
          categoryId = category.parentId;
        }
      }
      for (const categoryId of new Set([row.categoryId, ...(row.categoryIds || [])])) await loadAncestors(categoryId);
      assertCurrent(session);
      return assembleCanonicalCatalog(publicData, { prayers: [row], categories: [...missing.values()] })
        .prayers.find((prayer) => prayer === row) ?? null;
    } catch {
      failClosed(session);
      return null;
    }
  }

  return { catalog, readPrayer, invalidate, get generation() { return generation; } };
}

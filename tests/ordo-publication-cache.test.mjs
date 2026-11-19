import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

// Exercise the real service/cache/definitions pipeline. Only Firestore I/O and storage are replaced.
test('warm complete cache detects new publication, refreshes manual years, rejects schema99 and preserves notes6', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const fake = '\0calendar-test-state';
  const plugin = { name: 'calendar-read-only-test', enforce: 'pre', resolveId(id) {
    if (id.startsWith('\0calendar-test-')) return id;
    if (id === 'firebase/firestore') return '\0calendar-test-firestore';
    if (id === '@/plugins/firebase' || id.endsWith('/plugins/firebase') || id.endsWith('/plugins/firebase.js')) return '\0calendar-test-db';
    if (id.includes('utils/firestoreRead')) return '\0calendar-test-reads';
    if (id.includes('publicContentCache')) return '\0calendar-test-cache';
  }, load(id) {
    if (id === fake) return 'export const state = { meta: null, collections: {}, reads: [], online: true };';
    if (id === '\0calendar-test-db') return 'export const db = {};';
    if (id === '\0calendar-test-firestore') return 'export const collection = (_, name) => name; export const doc = (_, name) => name;';
    if (id === '\0calendar-test-reads') return `import {state} from ${JSON.stringify(fake)};
      export async function getDocOfflineAware(name, session) { state.reads.push(name); const snapshot={exists:()=>!!state.meta,data:()=>state.meta,metadata:{fromCache:false}};session.observe(snapshot);return snapshot; }
      export async function getDocsOfflineAware(name, session) { state.reads.push(name);const snapshot={docs:(state.collections[name]||[]).map(item=>({id:item.id,data:()=>item})),metadata:{fromCache:false}};session.observe(snapshot);return snapshot; }`;
    if (id === '\0calendar-test-cache') return `import {createContentCache} from '/src/utils/contentCache.js'; import {state} from ${JSON.stringify(fake)};
      const records=new Map();export const isContentOnline=()=>state.online;export const publicContentKey=(...parts)=>JSON.stringify(parts);
      export const publicContentCache=createContentCache({storage:{get:async k=>records.get(k),set:async(k,v)=>records.set(k,v),keys:async()=>[...records.keys()]},getRevision:()=> 'unchanged-CONTENT_REVISION',isOnline:isContentOnline});
      export const requestContentRefresh=()=>{};`;
  } };
  const server = await createServer({ root, configFile: false, cacheDir: 'node_modules/.cache/calendar-service-test',
    resolve: { alias: { '@': `${root}src`, 'firebase/firestore': '\0calendar-test-firestore' } }, plugins: [plugin], server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, entries: [] } });
  try {
    const { state } = await server.ssrLoadModule(fake);
    const defs = await server.ssrLoadModule('/src/utils/ordo/definitions.js');
    const cache = await server.ssrLoadModule('/src/utils/ordoCalendarCache.js');
    const { publicContentCache } = await server.ssrLoadModule('\0calendar-test-cache');
    const service = await server.ssrLoadModule('/src/services/ordoCalendarService.js');
    const bundle = defs.getBundledCalendarDefinitions();
    state.meta = { schemaVersion: 1, revision: bundle.revision + 1, notesRevision: 4 };
    state.collections = { liturgicalCelebrations: bundle.celebrations,
      liturgicalDioceseOverrides: bundle.dioceseOverrides.map(x => x.celebrationId === 'our-lady-braslau' ? { ...x, title: 'New publication' } : x),
      liturgicalYearOverrides: bundle.yearOverrides.map(x => ({ ...x, enabled: true })) };
    await publicContentCache.read(cache.CALENDAR_CACHE_KEY, async () => ({ complete: true, data: { ...bundle, meta: { revision: bundle.revision, notesRevision: 4 } } }));
    await service.refreshCalendarDefinitions();
    assert.equal(defs.getCalendarDefinitions().revision, bundle.revision + 1);
    assert.ok(defs.getCalendarDefinitions().dioceseOverrides.some(x => x.title === 'New publication'));
    const reads = state.reads.length;
    await service.refreshCalendarDefinitions(); assert.equal(state.reads.length, reads);
    await service.refreshCalendarDefinitions({ revalidate: true });
    assert.equal(state.reads.filter(x => x === 'liturgicalCelebrations').length, 1, 'same revision reads only metadata/year docs');
    // Admin reload must bypass even a complete cache with the same CONTENT_REVISION.
    state.collections.liturgicalYearOverrides = bundle.yearOverrides;
    const years = await service.fetchYearOverridesFresh();
    assert.ok(years.every(x => x.enabled === false));
    assert.ok(defs.getCalendarDefinitions().yearOverrides.every(x => x.enabled === false));
    assert.equal(await service.loadPublishedOrdoNotes(6), null);
    assert.ok(!state.reads.includes('liturgicalOrdoNotes'));
    // Old server year rows cannot re-enable owner-cancelled moves in the new shell.
    const selected = cache.definitionsFromCache({ calendar: { revision: 3 }, overrides: { items: bundle.yearOverrides.map(x => ({ ...x, enabled: true })) }, bundled: bundle });
    assert.ok(selected.yearOverrides.every(x => x.enabled === false));
    const revision = defs.getCalendarDefinitions().revision;
    state.meta = { schemaVersion: 99, revision: 999, notesRevision: 4 };
    await service.refreshCalendarDefinitions({ revalidate: true });
    assert.equal(defs.getCalendarDefinitions().revision, revision);
    assert.equal(publicContentCache.peek(cache.CALENDAR_CACHE_KEY).revision, revision, 'invalid metadata retains the complete offline publication');
    state.meta = { schemaVersion: 1, revision: 3, notesRevision: 4 };
    await service.refreshCalendarDefinitions({ revalidate: true });
    assert.equal(publicContentCache.peek(cache.CALENDAR_CACHE_KEY).revision, revision);
    state.online = false;
    const beforeOffline = state.reads.length;
    await service.refreshCalendarDefinitions({ revalidate: true }); assert.equal(state.reads.length, beforeOffline);
    defs.setCalendarDefinitions(null);
    await cache.restoreCalendarCache();
    assert.equal(defs.getCalendarDefinitions().revision, revision);
    assert.ok(defs.getCalendarDefinitions().dioceseOverrides.some(x => x.title === 'New publication'));
    assert.ok(defs.getCalendarDefinitions().yearOverrides.every(x => x.enabled === false));
    assert.equal(state.reads.length, beforeOffline, 'startup applies the saved calendar without consulting Firestore');
  } finally { await server.close(); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContentCache } from '../src/utils/contentCache.js';
import { permittedPrayerContent } from '../functions/lib/priest-policy.mjs';

const source = (await readFile(new URL('../src/services/prayerContentService.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
const publicContentKey = (name, version = 1) => `${name}:${version}`;
const publicPrayer = { id: 'public', text: 'Public prayer', tags: ['public'] };
const privatePrayer = { id: 'private', text: 'Protected prayer', tags: ['private'], priestOnly: true };
const publicData = { prayers: [publicPrayer], categories: [] };

function harness({ online = true, request, check = async () => {}, saved = new Map() } = {}) {
  const navigator = { onLine: online };
  const access = { active: false, revision: 0 };
  const cache = createContentCache({
    storage: { get: async (key) => saved.get(key), set: async (key, entry) => saved.set(key, entry), keys: async () => [...saved.keys()] },
    getRevision: () => 'test', isOnline: () => navigator.onLine,
  });
  const getContent = new Function('publicContentCache', 'publicContentKey', 'checkPriestAccess', 'priestAccess', 'priestRequest', 'permittedPrayerContent', 'navigator',
    `${source}\nreturn getPrayerContent;`)(cache, publicContentKey, () => check(access), access, request, permittedPrayerContent, navigator);
  return { getContent, navigator, access, saved };
}

test('protected responses stay in memory while public content survives an offline restart', async () => {
  const saved = new Map();
  const client = harness({ saved, check: async (access) => { access.active = true; }, request: async (path) =>
    path.includes('public=1') ? publicData : { prayers: [publicPrayer, privatePrayer], categories: [] } });
  assert.equal((await client.getContent()).prayers.length, 2);
  assert.ok(!JSON.stringify([...saved.values()]).includes('Protected prayer'));
  const restarted = harness({ saved, online: false, request: async () => { assert.fail('offline cache must not fetch'); } });
  assert.deepEqual((await restarted.getContent()).prayers, [publicPrayer]);
});

test('revoked access stops protected requests and returns public prayers', async () => {
  let protectedRequests = 0;
  const client = harness({ check: async (access) => { access.active = false; }, request: async (path) => {
    if (!path.includes('public=1')) protectedRequests++;
    return publicData;
  } });
  client.access.active = true;
  assert.deepEqual((await client.getContent()).prayers, [publicPrayer]);
  assert.equal(protectedRequests, 0);
});

test('a disable during a protected request discards the late protected response', async () => {
  let client;
  client = harness({ check: async (access) => { access.active = true; }, request: async (path) => {
    if (path.includes('public=1')) return publicData;
    client.access.active = false;
    client.access.revision++;
    return { prayers: [privatePrayer], categories: [] };
  } });
  assert.deepEqual((await client.getContent()).prayers, [publicPrayer]);
});

test('legacy offline cache upgrade filters own and inherited restrictions', async () => {
  const inherited = { id: 'inherited', text: 'Inherited protected prayer', tags: ['child'] };
  const saved = new Map([
    ['prayers:1', { complete: true, revision: 'old', data: [publicPrayer, privatePrayer, inherited] }],
    ['prayerCategories:1', { complete: true, revision: 'old', data: [
      { id: 'root', tags: [], priestOnly: true }, { id: 'child', parentId: 'root', tags: ['child'] },
    ] }],
  ]);
  const client = harness({ saved, online: false, request: async () => { assert.fail('offline upgrade must not fetch'); } });
  assert.deepEqual((await client.getContent()).prayers.map((p) => p.id), ['public']);
});

test('offline restart prefers the current public cache over an older legacy copy', async () => {
  const saved = new Map([
    ['prayer-content:2', { complete: true, revision: 'test', data: publicData }],
    ['prayers:1', { complete: true, revision: 'old', data: [{ ...privatePrayer, priestOnly: false }] }],
    ['prayerCategories:1', { complete: true, revision: 'old', data: [] }],
  ]);
  const client = harness({ saved, online: false, request: async () => { assert.fail('offline cache must not fetch'); } });
  assert.deepEqual((await client.getContent()).prayers, [publicPrayer]);
});

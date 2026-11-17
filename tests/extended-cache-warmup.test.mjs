import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import moment from 'moment';
import { isFirestoreQuotaBlocked, noteFirestoreError, resetFirestoreQuota } from '../src/utils/firestoreErrors.mjs';

const source = (await readFile(new URL('../src/utils/extendedCacheWarmup.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');

const targetDay = new Date(2026, 9, 14);
const dateKey = (date) => moment(date).format('YYYY-MM-DD');
const hoursKey = (date, diocese) => `hours:${date}:${diocese}`;
const readingsKey = (date, options) => `readings:${date}:${options.diocese}:${options.includeAlternatives}`;

function fixture({ hidden = false, pathname = '/', offline = false, dataSaver = false, quotaAfterRead = false } = {}) {
  resetFirestoreQuota();
  const hours = [];
  const readings = [];
  const cached = new Set();
  const nav = { onLine: !offline, connection: { saveData: dataSaver, effectiveType: '4g' } };
  const doc = { visibilityState: hidden ? 'hidden' : 'visible' };
  const win = { location: { pathname }, addEventListener() {}, removeEventListener() {} };
  const diocese = 'vitebsk';
  const buildDateWarmupOrder = (baseDate, behind, ahead) => {
    const offsets = [0];
    for (let distance = 1; distance <= Math.max(behind, ahead); distance += 1) {
      if (distance <= ahead) offsets.push(distance);
      if (distance <= behind) offsets.push(-distance);
    }
    return offsets.map((offset) => moment(baseDate).startOf('day').add(offset, 'days'));
  };
  const bindings = {
    useLiturgicalStore: () => store,
    buildDateWarmupOrder, CACHE_DAYS_AHEAD: 7, CACHE_DAYS_BEHIND: 1,
    publicContentCache: null, contentKey: hoursKey, readingsKey,
    currentOrdoDiocese: () => diocese, isFirestoreQuotaBlocked,
    logger: { log() {}, error() {} },
    navigator: nav, document: doc, window: win,
  };
  const api = new Function(...Object.keys(bindings),
    `${source}\nreturn { warmupExtendedDateWindow, mayPrefetchExtendedContent, EXTENDED_CACHE_RECHECK_MS };`)(
    ...Object.values(bindings));
  const cache = {
    prime: async () => {},
    hasRecentComplete: (key) => cached.has(key),
  };
  const store = {
    async fetchContentByDate(date, options) {
      const day = dateKey(date);
      assert.equal(options.diocese, diocese);
      hours.push(day);
      if (quotaAfterRead) noteFirestoreError({ code: 'resource-exhausted' });
      else cached.add(hoursKey(day, diocese));
    },
    async fetchReadingsByDate(date, options) {
      const day = dateKey(date);
      assert.equal(options.diocese, diocese);
      assert.equal(options.includeAlternatives, true);
      readings.push(day);
      cached.add(readingsKey(day, options));
    },
  };
  const run = (extra = {}) => api.warmupExtendedDateWindow(targetDay, {
    cache, store, waitForSlot: async () => true, skipLock: true, ...extra,
  });
  return { run, api, hours, readings, cached, diocese, nav, doc, win };
}

test('the extended stage fills nine days, but only missing resources after today/tomorrow Hours', async () => {
  const f = fixture();
  f.cached.add(hoursKey('2026-10-14', f.diocese));
  f.cached.add(hoursKey('2026-10-15', f.diocese));
  const done = await f.run();
  assert.equal(done.loaded, 16);
  assert.equal(done.alreadyCached, 2);
  assert.equal(done.incomplete, 0);
  assert.equal(done.stopped, false);
  assert.equal(f.hours.length, 7);
  assert.equal(f.readings.length, 9);
  assert.deepEqual(f.readings.slice(0, 3), ['2026-10-14', '2026-10-15', '2026-10-13']);
  assert.deepEqual(f.hours, [
    '2026-10-13', '2026-10-16', '2026-10-17', '2026-10-18',
    '2026-10-19', '2026-10-20', '2026-10-21',
  ]);
  const repeated = await f.run();
  assert.equal(repeated.loaded, 0);
  assert.equal(repeated.alreadyCached, 18);
  assert.equal(f.hours.length, 7);
  assert.equal(f.readings.length, 9);
});

test('extended mode skips all Firestore requests when offline, hidden, in admin, or on data saver', async () => {
  for (const setup of [
    { hidden: true }, { pathname: '/admin' }, { pathname: '/login' },
    { offline: true }, { dataSaver: true },
  ]) {
    const f = fixture(setup);
    assert.equal(f.api.mayPrefetchExtendedContent(), false);
    assert.equal((await f.run()).stopped, true);
    assert.deepEqual(f.hours, []);
    assert.deepEqual(f.readings, []);
  }
});

test('a busy reader cancels speculative requests instead of blocking interaction', async () => {
  const f = fixture();
  const done = await f.run({ waitForSlot: async () => false });
  assert.equal(done.stopped, true);
  assert.equal(done.loaded, 0);
  assert.deepEqual(f.hours, []);
  assert.deepEqual(f.readings, []);
});

test('a quota error cuts off extended requests after the first attempted resource', async () => {
  const f = fixture({ quotaAfterRead: true });
  const done = await f.run();
  assert.equal(done.stopped, true);
  assert.deepEqual(f.hours, ['2026-10-14']);
  assert.deepEqual(f.readings, []);
  assert.equal(isFirestoreQuotaBlocked(), true);
});

test('the optional cross-tab lock prevents a competing tab from starting requests', async () => {
  const f = fixture();
  f.nav.locks = { request: async (_name, _options, callback) => callback(null) };
  const result = await f.run({ skipLock: false });
  assert.equal(result.stopped, true);
  assert.deepEqual(f.hours, []);
  assert.deepEqual(f.readings, []);
});

test('a complete cache is not touched if it already contains all nine days', async () => {
  const f = fixture();
  for (const offset of [-1, 0, 1, 2, 3, 4, 5, 6, 7]) {
    const date = moment(targetDay).add(offset, 'days').format('YYYY-MM-DD');
    f.cached.add(hoursKey(date, f.diocese));
    f.cached.add(readingsKey(date, { diocese: f.diocese, includeAlternatives: true }));
  }
  const done = await f.run({ waitForSlot: async () => { throw new Error('unexpected idle wait'); } });
  assert.equal(done.alreadyCached, 18);
  assert.equal(done.loaded, 0);
  assert.deepEqual(f.hours, []);
  assert.deepEqual(f.readings, []);
});


test('startup keeps one fast today/tomorrow pass and gates the delayed stage', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.equal((main.match(/await warmupCache\(\)/g) || []).length, 1,
    'initial warmup must never be scheduled twice');
  assert.match(main, /delay: 5000, idleTimeout: 5000/);
  assert.match(main, /VITE_ENABLE_EXTENDED_CACHE_WARMUP === 'true'/);
  assert.match(main, /delay: 20000, idleTimeout: 12000/);
  assert.ok(main.indexOf('await warmupCache()') < main.indexOf('warmupExtendedDateWindow()'),
    'the extended stage cannot run before the fast stage has finished');
});

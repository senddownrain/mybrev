import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  ANALYTICS_NETWORK_DEFAULT, FEATURE_IDS, SCHEMA_VERSION, SECTIONS, SECTION_CONTENT_KIND, LIMITS,
  bucketScrollDepth, bucketVisibleSeconds, estimateReadingSeconds,
  validateCell, validateContentId, validatePacket,
} from '../src/utils/analytics/contract.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = JSON.parse(readFileSync(path.join(root, 'tests/fixtures/analytics-contract-v2.json'), 'utf8'));

test('contract is v2 and the network gate defaults to off', () => {
  assert.equal(SCHEMA_VERSION, 2);
  assert.equal(fixture.schema_version, SCHEMA_VERSION);
  assert.equal(ANALYTICS_NETWORK_DEFAULT, false);
});

test('visible-time buckets follow the golden vectors', () => {
  for (const [seconds, bucket] of fixture.visibleSecondsBuckets) assert.equal(bucketVisibleSeconds(seconds), bucket, `${seconds}s`);
  assert.equal(bucketVisibleSeconds(-1), null);
  assert.equal(bucketVisibleSeconds(Number.NaN), null);
});

test('scroll-depth buckets follow the golden vectors', () => {
  for (const [fraction, fits, bucket] of fixture.scrollBuckets) assert.equal(bucketScrollDepth(fraction, { fits }), bucket, `${fraction}/${fits}`);
  assert.equal(bucketScrollDepth(-0.1), null);
});

test('estimated reading time is bounded by visible time and by the text reached', () => {
  for (const vector of fixture.readingEstimates) {
    assert.ok(Math.abs(estimateReadingSeconds(vector) - vector.seconds) < 1e-9, JSON.stringify(vector));
  }
  assert.equal(estimateReadingSeconds({ visibleSeconds: Number.NaN, totalChars: 1 }), null);
});

test('the golden packet is valid and every invalid cell is rejected', () => {
  assert.deepEqual(validatePacket(fixture.validPacket), []);
  for (const { why, cell } of fixture.invalidCells) assert.notDeepEqual(validateCell(cell), [], why);
});

test('packets reject identifiers, unknown fields and bad envelopes', () => {
  const base = fixture.validPacket;
  for (const extra of ['user_id', 'installation_id', 'session_id', 'device_id', 'ip', 'email', 'query', 'ts']) {
    assert.notDeepEqual(validatePacket({ ...base, [extra]: 'x' }), [], extra);
  }
  assert.notDeepEqual(validatePacket({ ...base, schema_version: 1 }), []);
  assert.notDeepEqual(validatePacket({ ...base, platform: 'desktop' }), []);
  assert.notDeepEqual(validatePacket({ ...base, region: 'DE' }), []);
  assert.notDeepEqual(validatePacket({ ...base, app_version: '4.5.2' }), []);
  assert.notDeepEqual(validatePacket({ ...base, day: '2026-02-30' }), []);
  assert.notDeepEqual(validatePacket({ ...base, day: '2026-10-14T10:00:00Z' }), []);
  assert.notDeepEqual(validatePacket({ ...base, cells: [] }), []);
  assert.notDeepEqual(validatePacket({ ...base, cells: Array.from({ length: LIMITS.maxCellsPerPacket + 1 }, (_, i) => ({ e: 'measurement_error', error_id: 'clock_anomaly', n: i + 1 })) }), []);
  const dup = base.cells[1];
  assert.notDeepEqual(validatePacket({ ...base, cells: [dup, { ...dup, n: 2 }] }), []);
});

test('closed material cannot pass: content_id must be in the public inventory', () => {
  const publicIds = new Set(['prayer:eMmCtxwyJ75ogmL5rwye']);
  assert.deepEqual(validateContentId('prayers', 'prayer:eMmCtxwyJ75ogmL5rwye', { publicIds }), []);
  assert.notDeepEqual(validateContentId('prayers', 'prayer:gMzVAGRUogiZa2MAxpr4', { publicIds }), []);
  assert.notDeepEqual(validatePacket({
    ...fixture.validPacket,
    cells: [{ e: 'screen_view', section: 'prayers', content_id: 'prayer:ClosedPriestPrayer0001', n: 1 }],
  }, { publicIds }), []);
});

test('whitelists contain no closed or personal sections and no free-text features', () => {
  for (const forbidden of ['admin', 'login', 'priest', 'priest-access', 'my', 'favorites', 'search']) assert.ok(!SECTIONS.includes(forbidden), forbidden);
  assert.ok(Object.keys(SECTION_CONTENT_KIND).every((section) => SECTIONS.includes(section)));
  assert.ok(FEATURE_IDS.every((id) => /^[a-z]+(?:_[a-z]+)+$/.test(id)));
  assert.equal(new Set(FEATURE_IDS).size, FEATURE_IDS.length);
});

test('stage guard: only main.js, behind the build flag, may reach the analytics code', () => {
  const offenders = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) { if (!full.endsWith(path.join('src', 'utils', 'analytics'))) walk(full); continue; }
      if (/analytics\/contract|utils\/analytics/.test(readFileSync(full, 'utf8'))) offenders.push(path.relative(root, full));
    }
  }(path.join(root, 'src')));
  assert.deepEqual(offenders, [path.join('src', 'main.js')]);
  const main = readFileSync(path.join(root, 'src/main.js'), 'utf8');
  // R03: two dynamic imports, both inside the LOCAL flag; the transport additionally behind its own compile-time STAGING flag
  const localBlock = main.slice(main.indexOf("if (import.meta.env.VITE_ANALYTICS_LOCAL === 'true') {"));
  assert.ok(localBlock.length > 0 && main.indexOf("if (import.meta.env.VITE_ANALYTICS_LOCAL === 'true') {") === main.lastIndexOf("if (import.meta.env.VITE_ANALYTICS_LOCAL === 'true') {"));
  assert.match(localBlock, /import\('\.\/utils\/analytics\/localAnalytics'\)/);
  assert.match(localBlock, /import\.meta\.env\.VITE_ANALYTICS_STAGING === 'true'\s*\?\s*import\('\.\/utils\/analytics\/stagingTransport'\)/);
  assert.equal((main.match(/utils\/analytics/g) || []).length, 2, 'only the two flagged dynamic imports');
  assert.equal(main.indexOf('utils/analytics'), main.indexOf("if (import.meta.env.VITE_ANALYTICS_LOCAL === 'true') {") + main.slice(main.indexOf("if (import.meta.env.VITE_ANALYTICS_LOCAL === 'true') {")).indexOf('utils/analytics'), 'nothing analytics-related before the flag');
  const indexHtml = readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(!/analytics/i.test(indexHtml));
  for (const file of readdirSync(root).filter((f) => /^\.env/.test(f))) {
    assert.ok(!/VITE_ANALYTICS_(LOCAL|STAGING)\s*=\s*true/.test(readFileSync(path.join(root, file), 'utf8')), `${file} must not enable analytics`);
  }
});

test('no analytics module contains a network call; only the DOM glue may touch localStorage', () => {
  const dir = path.join(root, 'src/utils/analytics');
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const text = readFileSync(path.join(dir, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    // R03: the QA-only staging transport is the single module allowed to call fetch (compile-time gated in main.js)
    const network = name === 'stagingTransport.js' ? /XMLHttpRequest|sendBeacon|WebSocket|EventSource|navigator\.\w*[Bb]eacon|sessionStorage|indexedDB|document\.cookie/ : /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|navigator\.\w*[Bb]eacon|sessionStorage|indexedDB|document\.cookie/;
    assert.ok(!network.test(text), name);
    if (!['localAnalytics.js', 'stagingTransport.js'].includes(name)) assert.ok(!/localStorage/.test(text), `${name} must not touch storage`);
  }
  const glue = readFileSync(path.join(dir, 'localAnalytics.js'), 'utf8');
  // Storage is written only from page-hide handlers and bounded, never from scroll/tap.
  assert.match(glue, /MAX_STORED_BYTES = 64 \* 1024/);
  const start = glue.indexOf("addEventListener('scroll'");
  const scrollBlock = glue.slice(start, glue.indexOf('{ passive: true, capture: true })', start) + '{ passive: true, capture: true })'.length);
  assert.ok(scrollBlock.length > 20 && !/persist\(|localStorage/.test(scrollBlock), 'the scroll listener is passive and only queues a throttled measurement');
  assert.match(scrollBlock, /queueMeasure\(\)/);
});

test('trackFeature is an empty function in a normal build and call sites pass only a feature id', () => {
  const track = readFileSync(path.join(root, 'src/utils/trackFeature.js'), 'utf8');
  assert.match(track, /import\.meta\.env\.VITE_ANALYTICS_LOCAL === 'true'/);
  const used = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (/trackFeature\.js$|localAnalytics\.js$/.test(full)) continue;
      const text = readFileSync(full, 'utf8');
      for (const match of text.matchAll(/trackFeature\(([^)]*)\)/g)) used.push(match[1]);
    }
  }(path.join(root, 'src')));
  assert.ok(used.length >= 20);
  for (const arg of used) {
    if (arg.startsWith('favoriteSongs.value.includes')) continue;
    assert.match(arg, /^'[a-z_]+'$/, `trackFeature argument must be a literal feature id: ${arg}`);
    assert.ok(FEATURE_IDS.includes(arg.slice(1, -1)), `unknown feature ${arg}`);
  }
});

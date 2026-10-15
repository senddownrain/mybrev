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
const fixture = JSON.parse(readFileSync(path.join(root, 'tests/fixtures/analytics-contract-v1.json'), 'utf8'));

test('contract is v1 and the network gate defaults to off', () => {
  assert.equal(SCHEMA_VERSION, 1);
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
  assert.notDeepEqual(validatePacket({ ...base, schema_version: 2 }), []);
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
  assert.deepEqual(offenders, ['src/main.js']);
  const main = readFileSync(path.join(root, 'src/main.js'), 'utf8');
  assert.match(main, /if \(import\.meta\.env\.VITE_ANALYTICS_LOCAL === 'true'\) \{\s*import\('\.\/utils\/analytics\/localAnalytics'\)/);
  assert.equal((main.match(/utils\/analytics/g) || []).length, 1, 'only the flagged dynamic import');
  const indexHtml = readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(!/analytics/i.test(indexHtml));
  for (const file of readdirSync(root).filter((f) => /^\.env/.test(f))) {
    assert.ok(!/VITE_ANALYTICS_LOCAL\s*=\s*true/.test(readFileSync(path.join(root, file), 'utf8')), `${file} must not enable analytics`);
  }
});

test('no analytics module contains a network call or storage write', () => {
  const dir = path.join(root, 'src/utils/analytics');
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const text = readFileSync(path.join(dir, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|localStorage|sessionStorage|indexedDB|document\.cookie/.test(text), name);
  }
});

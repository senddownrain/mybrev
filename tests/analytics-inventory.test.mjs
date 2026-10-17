import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { HOUR_IDS, SECTION_CONTENT_KIND, validateContentId } from '../src/utils/analytics/contract.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const inventory = JSON.parse(readFileSync(path.join(root, 'src/utils/analytics/public-inventory.json'), 'utf8'));
const KIND_SECTION = Object.fromEntries(Object.entries(SECTION_CONTENT_KIND).map(([section, kind]) => [kind, section]));

test('inventory ids are unique, sorted, well-formed and match their section kind', () => {
  assert.equal(new Set(inventory.ids).size, inventory.ids.length);
  assert.deepEqual([...inventory.ids].sort(), inventory.ids);
  for (const id of inventory.ids) {
    const kind = id.split(':')[0];
    assert.deepEqual(validateContentId(KIND_SECTION[kind], id, { publicIds: new Set(inventory.ids) }), [], id);
  }
});

test('inventory counts and checksum are consistent', () => {
  const counted = {};
  for (const id of inventory.ids) counted[id.split(':')[0]] = (counted[id.split(':')[0]] || 0) + 1;
  assert.deepEqual(counted, inventory.counts);
  assert.equal(createHash('sha256').update(JSON.stringify(inventory.ids)).digest('hex'), inventory.sha256);
});

test('inventory covers the fixed sets: mass order, nine hours, both Bible languages', () => {
  assert.ok(inventory.ids.includes('mass:order'));
  assert.ok(inventory.ids.includes('reading:day'));
  for (const hour of HOUR_IDS) assert.ok(inventory.ids.includes(`hour:${hour}`), hour);
  assert.equal(inventory.ids.filter((id) => id.startsWith('bible:bel:')).length, 73);
  assert.equal(inventory.ids.filter((id) => id.startsWith('bible:ru:')).length, 73);
});

test('nothing outside the public kinds can be in the inventory', () => {
  for (const id of inventory.ids) assert.match(id, /^(prayer|song|comp|mass|hour|bible|reading):/);
  assert.ok(!inventory.ids.some((id) => /admin|priest|login|my:|note|donat/i.test(id)));
});

test('inventory is in sync with the app bundle when the bundle is available', (t) => {
  const bundle = path.join(root, '..', 'ibreviarybyapp', 'assets', 'content');
  if (!existsSync(path.join(bundle, 'manifest.json'))) { t.skip('app bundle not present next to this repo'); return; }
  const manifest = JSON.parse(readFileSync(path.join(bundle, 'manifest.json'), 'utf8'));
  if (manifest.contentVersion !== inventory.source.bundleContentVersion) { t.skip('bundle moved on: rebuild with scripts/analytics/build-public-inventory.mjs'); return; }
  assert.equal(manifest.contentDate, inventory.source.bundleContentDate);
});

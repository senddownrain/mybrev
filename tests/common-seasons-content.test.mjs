/** Publication validator and generator contract for `_seasonalVariants`. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyPatch, describeDocuments, diffCollection, storedDocument, validateCollection, DOCUMENT_SCHEMAS } from '../scripts/content/lib/app-content.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (dir) => fs.readdirSync(path.join(ROOT, dir)).filter((n) => n.endsWith('.json')).sort().map((n) => JSON.parse(fs.readFileSync(path.join(ROOT, dir, n), 'utf8')));
const templates = read('patchs/db-templates').map(({ _id, ...data }) => storedDocument(_id, data));

test('the publication validator accepts the generated Commons and refuses a broken delta', () => {
  assert.deepEqual(validateCollection('liturgicalTemplates', templates), []);
  const bad = storedDocument('x', { _kind: 'common', title: 'T', _seasonalVariants: { ordinary: { vesper1Ant3: '<p>x</p>' }, lent: { vesper1Ant3: '<p><span>' } } });
  const issues = validateCollection('liturgicalTemplates', [bad]);
  assert.equal(issues.length, 1);
  assert.match(issues[0].reason, /unknown season/);
  assert.match(issues[0].reason, /unbalanced/);
  assert.deepEqual(DOCUMENT_SCHEMAS.liturgicalTemplates, { seasonalVariants: 1 });
});

test('generated templates keep the stored flat fields and carry exactly the stored deltas', () => {
  const dir = path.join(ROOT, 'patchs', 'feasts', 'common-texts');
  read('patchs/db-templates').filter((t) => t._kind === 'common').forEach((template) => {
    const source = JSON.parse(fs.readFileSync(path.join(dir, `${template._id}.json`), 'utf8'));
    assert.deepEqual(template._seasonalVariants || {}, source._seasonalVariants || {}, template._id);
    // nothing but the documented keys is added next to the flat fields
    assert.ok(Object.keys(template).every((key) => !key.startsWith('_') || ['_id', '_schema', '_kind', '_fieldRules', '_seasonalVariants', '_mainSection'].includes(key)), template._id);
  });
});

test('publication verdict comes from the real classifier: a delta-only change of 13 documents is a content patch, not a rebuild', () => {
  const before = templates.map((doc) => { const { _seasonalVariants, ...flat } = doc; void _seasonalVariants; return flat; });
  const diff = diffCollection('liturgicalTemplates', describeDocuments(templates), { hashes: describeDocuments(before).hashes });
  assert.equal(diff.changed.length, 13);
  assert.equal(classifyPatch([diff], { publishedSchema: 1 }).verdict, 'SAFE CONTENT PATCH');
  // the same data is still above the limits when every Common is replaced and the download is large
  const huge = { ...diff, bytes: 6 * 1024 * 1024 };
  assert.equal(classifyPatch([huge], { publishedSchema: 1 }).verdict, 'MASS CONTENT REBUILD');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { applyWebLiturgicalCorrections } from '../src/utils/webLiturgicalCorrections.js';
import { WEB_CORRECTIONS, webCorrectionsFor } from '../src/data/liturgical/web-corrections/index.js';
import { selectDaysTemplates } from '../scripts/liturgy/prepare-days-templates.mjs';
import { createContentCache } from '../src/utils/contentCache.js';

const root = 'docs/audits/liturgical-common-texts-2026-11/v4';
const full = JSON.parse(zlib.gunzipSync(fs.readFileSync(`${root}/full-content-plan.json.gz`)));
const plan = selectDaysTemplates(full, JSON.parse(fs.readFileSync(`${root}/PUBLICATION_RESULT.json`)));
const valueAt = (doc, path) => path.reduce((value, key) => value?.[key], doc);
function set(doc, path, value) {
  for (const key of path.slice(0, -1)) { doc[key] ||= {}; doc = doc[key]; }
  doc[path.at(-1)] = value;
}
function baseline(planned) {
  const doc = { id: planned.document.split('/')[1], untouched: { text: 'preserved' } };
  for (const field of planned.fields) set(doc, field.path, field.before);
  return doc;
}

test('Web layer reproduces all 7791 approved values, with exact scope, immutable inputs and idempotence', async () => {
  let count = 0;
  const held = new Set(full.fields.filter((f) => f.contentStatus === 'held').map((f) => `${f.document}|${f.field}`));
  assert.equal(plan.documents.length, WEB_CORRECTIONS.documents);
  for (const planned of plan.documents) {
    const collection = planned.document.split('/')[0], before = baseline(planned), saved = structuredClone(before);
    const edits = await webCorrectionsFor(planned.document);
    assert.equal(edits.length, planned.fields.length);
    const after = await applyWebLiturgicalCorrections(collection, before);
    assert.deepEqual(before, saved);
    const expected = structuredClone(before);
    for (const field of planned.fields) {
      assert.ok(!held.has(`${planned.document}|${field.field}`));
      assert.equal(valueAt(after, field.path), field.after, `${planned.document}|${field.field}`);
      set(expected, field.path, field.after);
      count++;
    }
    assert.deepEqual(after, expected, 'only selected fields change');
    assert.equal(await applyWebLiturgicalCorrections(collection, after), after);
  }
  assert.equal(count, 7791);
  assert.equal(count, WEB_CORRECTIONS.fields);
});

test('later edits, missing fields, unknown documents and Proper pass through unchanged', async () => {
  const planned = plan.documents[0], doc = baseline(planned);
  for (const field of planned.fields) set(doc, field.path, `${field.before} later edit`);
  assert.equal(await applyWebLiturgicalCorrections('days', doc), doc);
  const missing = { id: doc.id, unrelated: 'keep' };
  assert.equal(await applyWebLiturgicalCorrections('days', missing), missing);
  for (const collection of ['liturgicalProperTexts', 'unknown']) assert.equal(await applyWebLiturgicalCorrections(collection, doc), doc);
  const unknown = { id: 'not-in-reviewed-plan', text: 'keep' };
  assert.equal(await applyWebLiturgicalCorrections('days', unknown), unknown);
});

test('corrected presentation survives a cache restart and offline reload without another loader call', async () => {
  const planned = plan.documents[0], records = new Map();
  const create = (online) => createContentCache({
    storage: { get: async (key) => structuredClone(records.get(key)), set: async (key, value) => records.set(key, structuredClone(value)) },
    getRevision: () => WEB_CORRECTIONS.version, isOnline: () => online,
  });
  const first = await create(true).read('day', async () => ({ data: await applyWebLiturgicalCorrections('days', baseline(planned)), complete: true }));
  const reloaded = await create(false).read('day', () => assert.fail('no network on reload'));
  assert.deepEqual(reloaded.data, first.data);
  for (const field of planned.fields) assert.equal(valueAt(reloaded.data, field.path), field.after);
});

test('static patch chunks fit existing PWA precache limits; no baseline documents are exported', async () => {
  const actual = [];
  for (const file of fs.readdirSync('src/data/liturgical/web-corrections').filter((name) => /^part-\d+\.js$/u.test(name))) {
    assert.ok(fs.statSync(`src/data/liturgical/web-corrections/${file}`).size < 1_000_000);
    const data = JSON.parse(fs.readFileSync(`src/data/liturgical/web-corrections/${file}`, 'utf8').slice('export default '.length).trim().slice(0, -1));
    for (const [document, fields] of Object.entries(data)) {
      assert.match(document, /^(days|liturgicalTemplates)\/[^/]+$/u);
      assert.ok(fields.every((field) => Array.isArray(field) && field.length === 5 && /^[a-f0-9]{64}$/u.test(field[1])));
      actual.push(...fields.map((field) => `${document}|${field[0].join('.')}`));
    }
  }
  assert.deepEqual(actual.sort(), plan.documents.flatMap((doc) => doc.fields.map((field) => `${doc.document}|${field.path.join('.')}`)).sort());
});

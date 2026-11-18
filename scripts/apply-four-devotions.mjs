#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { encodeFirestoreValue } from './ordo/lib/approved-calendar-rest.mjs';
import { createSourceRest, decodeSourceRestValue } from './lib/prayer-source-rest.mjs';
import { stableJson } from './prayer-import/lib/corpus.mjs';
import { validatePublicPrayerCatalog } from '../src/utils/publicPrayerCatalog.mjs';
import { contentKeys, prepareFourDevotions } from './validate-four-devotions.mjs';

const PROCESSION = 'Fd9rN0S9NU1mAmqb2isZ';
const CATEGORY = 'prayerCategories/devotions';
const CONTROL = 'priestContentControl/state';
const TAG = 'Набажэнства';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const fromFields = (fields = {}) => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decodeSourceRestValue(v)]));
const toFields = (data) => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, encodeFirestoreValue(v)]));
const idOf = (name) => name.split('/').at(-1);
const field = (fieldPath, op, value) => ({ fieldFilter: { field: { fieldPath }, op, value: encodeFirestoreValue(value) } });
const either = (...filters) => ({ compositeFilter: { op: 'OR', filters } });
const stamp = (fieldPath) => ({ fieldPath, setToServerValue: 'REQUEST_TIME' });

function conflicts(candidate, prayer) {
  const normalize = (value) => String(value || '').normalize('NFC').trim().toLocaleLowerCase('be').replace(/[’‘ʼ]/gu, "'").replace(/\s+/gu, ' ');
  const expected = contentKeys(candidate.proposed);
  const actual = contentKeys(prayer);
  return prayer.id === candidate.id || normalize(prayer.title) === normalize(candidate.title)
    || (actual.text && actual.text === expected.text)
    || [...expected.paragraphs].filter((paragraph) => actual.paragraphs.has(paragraph)).length >= 2;
}

async function run({ catalogPath, reportPath, apply }) {
  const { candidates, blockers } = await prepareFourDevotions();
  assert.deepEqual(blockers, ['No local snapshot supplied: category/duplicates unverified']);
  assert.ok(candidates.every((candidate) => !candidate.errors.length && candidate.sourcePdfSha256));
  const catalog = validatePublicPrayerCatalog(JSON.parse(await readFile(catalogPath, 'utf8')));
  const publishedProcession = catalog.prayers.find(({ id }) => id === PROCESSION);
  assert.ok(publishedProcession?.tags?.includes(TAG), 'Expected published procession and category membership');
  const targets = candidates.map((candidate, index) => ({
    ...candidate, target: index === 3 ? PROCESSION : candidate.id,
  }));
  for (const candidate of targets) {
    const unexpected = catalog.prayers.find((prayer) => prayer.id !== candidate.target && conflicts(candidate, prayer));
    assert.ok(!unexpected, `Public catalog duplicate for ${candidate.id}: ${unexpected?.id}`);
  }
  const api = await createSourceRest();
  const documents = api.base + '/documents';
  const name = (path) => documents.split('/v1/')[1] + '/' + path;
  const request = (action, body) => api.request(documents + ':' + action, body);
  const { transaction } = await request('beginTransaction', { options: { readWrite: {} } });
  let committing = false;
  const read = async (paths, tx) => {
    const rows = await request('batchGet', { documents: paths.map(name), ...(tx ? { transaction: tx } : {}) });
    const found = new Map(rows.filter(({ found }) => found).map(({ found }) => [found.name, found]));
    const missing = new Set(rows.map((row) => row.missing).filter(Boolean));
    assert.ok(paths.every((path) => found.has(name(path)) || missing.has(name(path))), 'Incomplete batch read');
    return found;
  };
  const query = async (collectionId, where) => {
    const rows = await request('runQuery', { structuredQuery: { from: [{ collectionId }], where, limit: 50 }, transaction });
    const docs = rows.map((row) => row.document).filter(Boolean);
    assert.ok(docs.length < 50, `Scope exceeds read bound for ${collectionId}`);
    return docs.map((doc) => ({ ...fromFields(doc.fields), id: idOf(doc.name) }));
  };
  try {
    const ids = [...new Set(targets.flatMap(({ id, target }) => [id, target]))];
    const paths = ['prayers', 'priestProtectedPrayers'].flatMap((collection) => ids.map((id) => collection + '/' + id));
    const live = await read([...paths, CATEGORY, CONTROL], transaction);
    const category = fromFields(live.get(name(CATEGORY))?.fields);
    assert.ok(category.name === 'Набажэнствы' && category.tags?.includes(TAG) && !category.parentId
      && !category.priestOnly && !category.effectivePriestOnly, 'Category changed or is restricted');
    const control = live.get(name(CONTROL));
    const state = fromFields(control?.fields);
    assert.ok(control && Number.isSafeInteger(state.version) && !state.lockUid, 'Canonical prayer storage lock unavailable');
    const protectedCategories = await query('priestProtectedCategories', either(
      field('tags', 'ARRAY_CONTAINS', TAG), field('prayerIds', 'ARRAY_CONTAINS_ANY', ids),
      field('name', 'EQUAL', 'Набажэнствы')));
    assert.equal(protectedCategories.length, 0, 'Protected category conflict');
    const membership = either(field('tags', 'ARRAY_CONTAINS', TAG), field('categoryId', 'EQUAL', 'devotions'),
      field('categoryIds', 'ARRAY_CONTAINS', 'devotions'), field('title', 'IN', candidates.map(({ title }) => title)));
    for (const collection of ['prayers', 'priestProtectedPrayers']) {
      const matches = await query(collection, membership);
      for (const candidate of targets) {
        const collision = matches.find((p) => (collection !== 'prayers' || p.id !== candidate.target) && conflicts(candidate, p));
        assert.ok(!collision, `Live duplicate for ${candidate.id}: ${collection}/${collision?.id}`);
      }
    }
    const writes = [];
    const checks = [];
    const before = [];
    for (const { id, target, proposed, hash: expectedSha256 } of targets) {
      const path = 'prayers/' + target;
      const current = live.get(name(path));
      const data = fromFields(current?.fields);
      assert.equal(hash(proposed.text), expectedSha256, id + ' checksum changed');
      assert.ok(!live.has(name('priestProtectedPrayers/' + target))
        && !live.has(name('priestProtectedPrayers/' + id))
        && (target === id || !live.has(name('prayers/' + id))), 'Deterministic ID or protected slot occupied');
      const replacing = target === PROCESSION;
      const expected = replacing
        ? Object.fromEntries(['title', 'text', 'textFormat', 'textFormatVersion', 'source'].map((key) => [key, proposed[key]]))
        : proposed;
      if (replacing) {
        assert.ok(current && !data.priestOnly && !data.effectivePriestOnly && data.tags?.includes(TAG), 'Existing procession is missing or restricted');
        if (data.titleVersions || data.textVersions) {
          expected.titleVersions = { ...data.titleVersions, be: proposed.title };
          expected.textVersions = { ...data.textVersions, be: proposed.text };
        }
      }
      const unchanged = Object.entries(expected).every(([key, value]) => stableJson(data[key]) === stableJson(value));
      checks.push({ id: target, action: unchanged ? 'NOOP' : replacing ? 'UPDATE' : 'CREATE', expectedSha256, expected });
      if (unchanged) continue;
      if (replacing) {
        assert.equal(data.title, publishedProcession.title, 'Existing procession title changed');
        assert.equal(hash(data.text), hash(publishedProcession.text), 'Existing procession text changed');
        assert.equal(data.titleVersions?.be, publishedProcession.titleVersions?.be, 'Existing Belarusian title changed');
        assert.equal(data.textVersions?.be, publishedProcession.textVersions?.be, 'Existing Belarusian text changed');
      } else assert.equal(current, undefined, 'Create target already exists with different content');
      before.push({ path, document: current ?? null });
      writes.push({
        update: { name: name(path), fields: toFields(expected) },
        ...(replacing ? { updateMask: { fieldPaths: Object.keys(expected) } } : {}),
        currentDocument: replacing ? { updateTime: current.updateTime } : { exists: false },
        updateTransforms: replacing ? [stamp('updatedAt')] : [stamp('createdAt'), stamp('updatedAt')],
      });
    }
    if (writes.length) writes.push({
      update: { name: name(CONTROL), fields: toFields({ version: state.version + 1 }) },
      updateMask: { fieldPaths: ['version'] }, currentDocument: { updateTime: control.updateTime }, updateTransforms: [stamp('updatedAt')],
    });
    const plan = {
      project: 'ibreviaryby', category: 'devotions', mode: 'SCOPED_DRY_RUN',
      planSha256: hash(JSON.stringify(writes)),
      changes: checks.map(({ expected, ...check }) => ({ ...check, payloadSha256: hash(stableJson(expected)) })),
      controlBefore: control, before, writes,
    };
    const persist = () => writeFile(reportPath, JSON.stringify(plan, null, 2) + '\n', { mode: 0o600 });
    await persist();
    console.log(JSON.stringify({ ...plan, controlBefore: undefined, before: undefined, writes: undefined }));
    if (!apply || !writes.length) return;
    committing = true;
    const receipt = await request('commit', { transaction, writes });
    plan.mode = 'COMMITTED_READBACK_PENDING';
    plan.commitTime = receipt.commitTime;
    await persist();
    const verified = await read(checks.map(({ id }) => 'prayers/' + id));
    for (const { id, expected, expectedSha256 } of checks) {
      const actual = fromFields(verified.get(name('prayers/' + id))?.fields);
      assert.equal(hash(actual.text), expectedSha256, 'Readback checksum mismatch: ' + id);
      for (const [key, value] of Object.entries(expected)) assert.deepEqual(actual[key], value, id + ':' + key);
      assert.ok(actual.tags?.includes(TAG) && !actual.priestOnly && !actual.effectivePriestOnly, 'Readback is not a public category member');
    }
    plan.mode = 'APPLIED_AND_VERIFIED';
    await persist();
    console.log(JSON.stringify({ mode: plan.mode, commitTime: plan.commitTime, verified: checks.map(({ id }) => id) }));
  } finally {
    if (!committing) await request('rollback', { transaction });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length < 2 || args.length > 3 || (args[2] && args[2] !== '--apply')) {
    console.error('Usage: node scripts/apply-four-devotions.mjs <published-catalog.json> <private-report.json> [--apply]');
    process.exitCode = 1;
  } else run({ catalogPath: args[0], reportPath: args[1], apply: args[2] === '--apply' })
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}

/**
 * The publication of the seasonal Commons must be limited to the Commons this work changed (A1 of the PR #132 verification).
 * Nothing here contacts Firestore; the importer is only PLANNED (dry run, offline).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildFeastTargets, main as importFeasts, PROTECTED_TEMPLATE_IDS, scopeTemplateIds } from '../scripts/ordo/import-feasts.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const targets = buildFeastTargets();
const seasonal = targets.templates.filter((item) => item.data._seasonalVariants && Object.keys(item.data._seasonalVariants).length).map((item) => item.id).sort();

test('the allowlist is exactly the 13 Commons with seasonal data; no protected document is in it', () => {
  assert.equal(seasonal.length, 13);
  PROTECTED_TEMPLATE_IDS.forEach((id) => assert.ok(!seasonal.includes(id), id));
  assert.deepEqual(PROTECTED_TEMPLATE_IDS, ['office-for-dead', 'sunday-week-1', 'complementary-psalmody']);
  // the committed report names the same ids
  const report = JSON.parse(fs.readFileSync(path.join(ROOT, 'reports', 'liturgy', 'common-seasons-import-allowlist.json'), 'utf8'));
  assert.deepEqual(report.allowlist, seasonal);
  assert.equal(report.changedVsLive, 'NOT VERIFIED LIVE');
});

test('scopeTemplateIds keeps only the allowlist and refuses unknown, protected and empty lists', () => {
  const scoped = scopeTemplateIds(targets.templates, seasonal.join(','));
  assert.deepEqual(scoped.templates.map((item) => item.id).sort(), seasonal);
  assert.throws(() => scopeTemplateIds(targets.templates, 'office-for-dead'), /protected/);
  assert.throws(() => scopeTemplateIds(targets.templates, 'sunday-week-1,apostles'), /protected/);
  assert.throws(() => scopeTemplateIds(targets.templates, 'complementary-psalmody'), /protected/);
  assert.throws(() => scopeTemplateIds(targets.templates, 'no-such-common'), /unknown/);
  assert.throws(() => scopeTemplateIds(targets.templates, ' , '), /at least one/);
});

test('importer: --ids needs --only templates; the offline plan of a scoped run covers exactly the allowlist', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-import-'));
  const output = path.join(dir, 'plan.json');
  const base = ['--offline', '--output', output, '--backup-dir', path.join(dir, 'backup')];
  await assert.rejects(importFeasts([...base, '--ids', 'apostles']), /--ids requires --only templates/);
  await importFeasts([...base, '--only', 'templates', '--ids', seasonal.join(',')]);
  const plan = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(plan.mode, 'dry-run');
  assert.equal(plan.firestoreRead, false);
  assert.deepEqual(plan.plans.templates.operations.map((op) => op.id).sort(), seasonal);
  assert.equal(plan.plans.templates.counts.target, 13);
});

test('importer: a scoped run that names a protected document fails before any plan is written', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-import-'));
  const output = path.join(dir, 'plan.json');
  await assert.rejects(importFeasts(['--offline', '--output', output, '--only', 'templates', '--ids', 'office-for-dead']), /protected/);
  assert.equal(fs.existsSync(output), false);
});

// ---------------------------------------------------------------------------------------------------------------------
// Scoped import against a MOCK Firestore (no network, no production): reads, diff, fail-closed apply, backup.
// ---------------------------------------------------------------------------------------------------------------------
import { assertScopedApplySafe, changedPaths, diffScopedTemplates, liveOnlyPaths, readScopedState } from '../scripts/ordo/import-feasts.mjs';

function mockFirestore({ live = new Map(), meta = { templatesRevision: 7 }, failGetAll = false } = {}) {
  const log = { reads: [], writes: [], scans: [] };
  const docRef = (collection, id) => ({ collection, id, get: async () => { log.reads.push(`${collection}/${id}`); return snap(collection, id); } });
  const snap = (collection, id) => {
    const data = collection === 'liturgicalTemplates' ? live.get(id) : collection === 'liturgicalCalendarMeta' && id === 'current' ? meta : undefined;
    return { id, exists: data !== undefined, data: () => data };
  };
  const firestore = {
    collection: (collection) => ({
      doc: (id) => docRef(collection, id),
      get: async () => { log.scans.push(collection); return { docs: [] }; },
    }),
    getAll: async (...refs) => {
      if (failGetAll) throw new Error('RESOURCE_EXHAUSTED: quota exceeded');
      return refs.map((ref) => { log.reads.push(`${ref.collection}/${ref.id}`); return snap(ref.collection, ref.id); });
    },
    batch: () => {
      const ops = [];
      return { set: (ref, data, options) => ops.push({ ref: `${ref.collection}/${ref.id}`, data, options }), update: (ref) => ops.push({ ref: `${ref.collection}/${ref.id}`, update: true }), commit: async () => { log.writes.push(...ops); } };
    },
  };
  const admin = { firestore: { FieldValue: { serverTimestamp: () => '<serverTimestamp>' } } };
  return { firestore, admin, app: { delete: async () => {} }, projectId: 'mock-project', log };
}
const liveFrom = (templates, mutate = (data) => data) => new Map(templates.map((item) => [item.id, mutate(JSON.parse(JSON.stringify(item.data)), item.id)]));
const scopedTemplates = () => targets.templates.filter((item) => seasonal.includes(item.id));

async function scopedRun(mock, extra = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-mock-'));
  const args = ['--only', 'templates', '--ids', seasonal.join(','), '--output', path.join(dir, 'plan.json'), '--backup-dir', path.join(dir, 'backup'), ...extra];
  const report = await importFeasts(args, { connect: async () => mock, recordRoot: dir });
  return { report, dir };
}

test('scoped dry-run reads exactly the 13 allowlisted documents plus the meta document, scans nothing, writes nothing', async () => {
  const mock = mockFirestore({ live: liveFrom(scopedTemplates()) });
  const { report, dir } = await scopedRun(mock);
  assert.deepEqual(mock.log.scans, [], 'no collection scan');
  assert.equal(mock.log.reads.filter((entry) => entry.startsWith('liturgicalTemplates/')).length, 13);
  assert.deepEqual(mock.log.reads.filter((entry) => entry.startsWith('liturgicalTemplates/')).map((entry) => entry.split('/')[1]).sort(), seasonal);
  assert.deepEqual(mock.log.reads.filter((entry) => !entry.startsWith('liturgicalTemplates/')), ['liturgicalCalendarMeta/current']);
  assert.ok(!mock.log.reads.some((entry) => /liturgicalProperTexts|^days\//.test(entry)), 'no ProperTexts and no days reads');
  assert.equal(mock.log.writes.length, 0, 'a dry run writes nothing');
  assert.equal(report.scope.documentsRequested, 14);
  assert.deepEqual(report.scope.reads.map((read) => [read.collection, read.documentsRequested]), [['liturgicalTemplates', 13], ['liturgicalCalendarMeta', 1]]);
  assert.match(report.scope.note, /billed/);
  assert.equal(report.summary.feasts.target, 0, 'the feasts collection is not planned in a scoped run');
  // the backup holds the full live documents of the scope and the meta
  const backup = JSON.parse(fs.readFileSync(path.join(dir, 'backup', fs.readdirSync(path.join(dir, 'backup'))[0]), 'utf8'));
  assert.equal(backup.projectId, 'mock-project');
  assert.deepEqual(backup.scope.slice().sort(), seasonal);
  assert.equal(backup.templates.length, 13);
  assert.equal(backup.meta.templatesRevision, 7);
});

test('an identical live state gives an all-unchanged plan; a live state without _seasonalVariants gives 13 updates with created paths', async () => {
  const same = await scopedRun(mockFirestore({ live: liveFrom(scopedTemplates()) }));
  assert.equal(same.report.summary.templates.update, 0);
  assert.equal(same.report.summary.templates.unchanged, 13);
  const old = await scopedRun(mockFirestore({ live: liveFrom(scopedTemplates(), ({ _seasonalVariants, ...rest }) => { void _seasonalVariants; return rest; }) }));
  assert.equal(old.report.summary.templates.update, 13);
  old.report.scope.liveDiff.forEach((item) => { assert.equal(item.status, 'update'); assert.ok(item.created.includes('_seasonalVariants'), item.id); assert.deepEqual(item.liveOnly, []); });
  assert.deepEqual(old.report.scope.applyBlockedBy, []);
});

test('a missing live document is a create, not an error', async () => {
  const live = liveFrom(scopedTemplates());
  live.delete('apostles');
  const { report } = await scopedRun(mockFirestore({ live }));
  assert.equal(report.summary.templates.create, 1);
  assert.equal(report.scope.liveDiff.find((item) => item.id === 'apostles').status, 'create');
});

test('live-only fields (also nested) are listed; service timestamp fields are ignored; apply is refused before the first write', async () => {
  const live = liveFrom(scopedTemplates(), (data, id) => {
    data.importedAt = { seconds: 1 }; // written by the importer itself: ignored
    if (id === 'pastors') { data.productionOnlyNote = 'x'; data._seasonalVariants.advent.manualFix = '<p>edit</p>'; }
    return data;
  });
  const dry = await scopedRun(mockFirestore({ live }));
  const pastors = dry.report.scope.liveDiff.find((item) => item.id === 'pastors');
  assert.deepEqual(pastors.liveOnly.sort(), ['_seasonalVariants.advent.manualFix', 'productionOnlyNote']);
  assert.deepEqual(dry.report.scope.liveDiff.filter((item) => item.id !== 'pastors').flatMap((item) => item.liveOnly), []);
  assert.deepEqual(dry.report.scope.applyBlockedBy, ['pastors']);
  const mock = mockFirestore({ live });
  await assert.rejects(scopedRun(mock, ['--apply']), /Refusing to apply.*pastors: .*productionOnlyNote/s);
  assert.equal(mock.log.writes.length, 0, 'nothing was written');
});

test('a scoped apply with a clean live diff writes only the allowlist and the meta revision in ONE batch; protected documents never appear', async () => {
  const mock = mockFirestore({ live: liveFrom(scopedTemplates(), ({ _seasonalVariants, ...rest }) => { void _seasonalVariants; return rest; }) });
  await scopedRun(mock, ['--apply']);
  const refs = mock.log.writes.map((write) => write.ref);
  assert.equal(refs.filter((ref) => ref.startsWith('liturgicalTemplates/')).length, 13);
  assert.deepEqual(refs.filter((ref) => !ref.startsWith('liturgicalTemplates/')), ['liturgicalCalendarMeta/current']);
  PROTECTED_TEMPLATE_IDS.forEach((id) => assert.ok(!refs.includes(`liturgicalTemplates/${id}`), id));
  assert.ok(!refs.some((ref) => /liturgicalProperTexts|^days\//.test(ref)));
  assert.equal(mock.log.writes.find((write) => write.ref === 'liturgicalCalendarMeta/current').data.templatesRevision, 8);
});

test('a read failure (quota) stops the run safely: nothing is written, nothing is planned as applied', async () => {
  const mock = mockFirestore({ live: liveFrom(scopedTemplates()), failGetAll: true });
  await assert.rejects(scopedRun(mock, ['--apply']), /quota exceeded/);
  assert.equal(mock.log.writes.length, 0);
});

test('without --ids the importer keeps its full-collection read path (unchanged behaviour)', async () => {
  const mock = mockFirestore({});
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'full-mock-'));
  await importFeasts(['--only', 'templates', '--output', path.join(dir, 'plan.json'), '--backup-dir', path.join(dir, 'backup')], { connect: async () => mock, recordRoot: dir });
  assert.deepEqual(mock.log.scans, ['liturgicalTemplates']);
  assert.equal(mock.log.writes.length, 0);
});

test('pure helpers: nested live-only paths, created/changed paths, service fields', () => {
  assert.deepEqual(liveOnlyPaths({ a: 1, b: { c: 2, d: 3 }, importedAt: 'x', list: [1] }, { a: 1, b: { c: 2 }, list: [1, 2] }), ['b.d']);
  assert.deepEqual(changedPaths({ a: 1, b: { c: 2 } }, { a: 2, b: { c: 2, e: 5 }, f: 1 }), { created: ['b.e', 'f'], changed: ['a'] });
  assert.doesNotThrow(() => assertScopedApplySafe(diffScopedTemplates([{ id: 'x', data: { a: 1 } }], new Map([['x', { a: 1, importedAt: 't' }]]))));
  assert.throws(() => assertScopedApplySafe(diffScopedTemplates([{ id: 'x', data: { a: 1 } }], new Map([['x', { a: 1, extra: 1 }]]))), /extra/);
  void readScopedState;
});

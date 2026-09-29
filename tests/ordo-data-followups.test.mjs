import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildMissingContentReport,
  buildRankMigrationPlan,
  indexEvidence,
  renderMissingContentMarkdown,
  suggestCommons,
} from '../scripts/lib/ordo-data-followups.mjs';
import { run as runRanks, applyPlan } from '../scripts/ordo-migrate-ranks.mjs';
import { run as runMissing, parseYears } from '../scripts/ordo-missing-content.mjs';
import { loadAnalysisSource } from '../scripts/lib/ordo-analysis-source.mjs';
import { decodeRestFields, writeSnapshotCache } from '../scripts/lib/firestore-rest-cache.mjs';

const doc = (id, data) => ({ id, ...data });

function fixtureDays() {
  return [
    doc('22-07-sv-mary-magdalene', { _date: '22.07', _rank: 'memoria', _feastName: 'СВ. МАРЫІ МАГДАЛЕНЫ' }),
    doc('02-11-all-faithful-departed', { _date: '02.11', _rank: 'memoria-ad-libitum', _feastName: 'Успамін усіх памерлых вернікаў' }),
    doc('05-06-sv-boniface--martyr-one', { _date: '05.06', _rank: 'memoria' }),
    doc('05-06-sv-boniface--pastors', { _date: '05.06', _rank: 'memoria' }),
    doc('06-06-sv-boniface-vitebsk--pastors', { _date: '06.06', _rank: 'memoria-ad-libitum', _place: 'vitebsk' }),
    doc('06-06-sv-boniface-vitebsk--martyr-one', { _date: '06.06', _rank: 'memoria-ad-libitum', _place: 'vitebsk' }),
    // Successor 10-10-vitebsk-cathedral-dedication is missing on purpose.
    doc('05-06-vitebsk-cathedral-dedication', { _date: '05.06', _rank: 'festum', _place: 'vitebsk' }),
    doc('01-01-legacy-unknown', { _date: '01.01', _rank: 'memoria' }),
    doc('feast-eastersunday', { _feast: 'feast-eastersunday', _rank: 'solemnitas', _feastName: 'ВЕЛІКОДНАЯ НЯДЗЕЛЯ<br>АБО НЯДЗЕЛЯ ЎВАСКРАСЕННЯ ПАНА' }),
    doc('advent-17-12', { _date: '17.12', _periodType: 'advent' }),
  ];
}

function fixtureReadings() {
  return [
    doc('22-07-sv-mary-magdalene', { _date: '22.07', _rank: 'memoria', _dayId: '22-07-sv-mary-magdalene', title: '22 ліпеня — свята св. Марыі Магдалены' }),
    doc('05-06-sv-boniface', { _date: '05.06', _rank: 'memoria', _dayIds: ['05-06-sv-boniface--pastors'], title: 'св. Баніфацыя' }),
  ];
}

const EVIDENCE = indexEvidence({
  vitebsk: { days: [{ date: '2026-07-22', celebrations: [{ id: 'vitebsk:2026-07-22:c0', rank: 'festum', identity: { id: 'sv-mary-magdalene' } }] }] },
  pinsk: { days: [{ date: '2026-07-22', celebrations: [{ id: 'pinsk:2026-07-22:c0', rank: 'festum', identity: { id: 'sv-mary-magdalene' } }] }] },
});

const shuffle = (list) => [...list].reverse();

test('rank plan is deterministic regardless of input order', () => {
  const a = buildRankMigrationPlan({ days: fixtureDays(), readings: fixtureReadings(), evidenceIndex: EVIDENCE });
  const b = buildRankMigrationPlan({ days: shuffle(fixtureDays()), readings: shuffle(fixtureReadings()), evidenceIndex: EVIDENCE });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('rank plan aligns Mary Magdalene and All Souls, and the linked readings', () => {
  const plan = buildRankMigrationPlan({ days: fixtureDays(), readings: fixtureReadings(), evidenceIndex: EVIDENCE });
  const find = (collection, id) => plan.writes.find((item) => item.collection === collection && item.documentId === id);
  const magdalene = find('days', '22-07-sv-mary-magdalene');
  assert.equal(magdalene.action, 'update');
  assert.deepEqual(magdalene.set, { _rank: 'festum' });
  assert.deepEqual(magdalene.precondition, { _rank: 'memoria' });
  assert.ok(magdalene.reason);
  assert.ok(magdalene.evidence.includes('vitebsk:2026-07-22:c0'));
  assert.deepEqual(find('days', '02-11-all-faithful-departed').set, { _rank: 'commemoratio-defunctorum' });
  assert.deepEqual(find('readings', '22-07-sv-mary-magdalene').set, { _rank: 'festum' });
  assert.equal(find('days', '05-06-sv-boniface--pastors'), undefined, 'correct ranks are not touched');
  assert.equal(find('readings', '05-06-sv-boniface'), undefined);
  plan.writes.forEach((item) => {
    assert.ok(item.reason, `${item.documentId} has a reason`);
    assert.ok(Array.isArray(item.evidence) && item.evidence.length, `${item.documentId} has evidence`);
  });
});

test('plan never deletes without the explicit flag', () => {
  const plan = buildRankMigrationPlan({ days: fixtureDays(), readings: fixtureReadings() });
  assert.equal(plan.writes.filter((item) => item.action === 'delete').length, 0);
  const obsolete = plan.writes.filter((item) => item.action === 'mark-obsolete').map((item) => item.documentId).sort();
  assert.deepEqual(obsolete, ['06-06-sv-boniface-vitebsk--martyr-one', '06-06-sv-boniface-vitebsk--pastors']);
  obsolete.forEach((id) => {
    const item = plan.writes.find((write) => write.documentId === id);
    assert.equal(item.set._obsolete, true);
    assert.deepEqual(item.supersededBy, ['05-06-sv-boniface--martyr-one', '05-06-sv-boniface--pastors']);
  });

  const withDelete = buildRankMigrationPlan({ days: fixtureDays(), readings: fixtureReadings(), allowDelete: true });
  assert.deepEqual(withDelete.writes.filter((item) => item.action === 'delete').map((item) => item.documentId).sort(), obsolete);
});

test('uncertain documents stay in place as review items', () => {
  const plan = buildRankMigrationPlan({ days: fixtureDays(), readings: fixtureReadings(), allowDelete: true });
  const review = (id) => plan.reviews.find((item) => item.documentId === id);
  assert.equal(review('05-06-vitebsk-cathedral-dedication').kind, 'obsolete-without-successor');
  assert.equal(review('01-01-legacy-unknown').decision, 'leave-in-place');
  assert.equal(review('feast-eastersunday').kind, 'title-markup');
  assert.equal(review('feast-eastersunday').decision, 'leave-in-place');
  const written = new Set(plan.writes.map((item) => item.documentId));
  ['05-06-vitebsk-cathedral-dedication', '01-01-legacy-unknown', 'feast-eastersunday', 'advent-17-12']
    .forEach((id) => assert.ok(!written.has(id), `${id} is never written`));
});

function fakeFirestore(store) {
  const calls = [];
  return {
    calls,
    projectId: 'fixture',
    async runPreconditioned(collection, id, precondition, operation) {
      calls.push({ collection, id, operation });
      const key = `${collection}/${id}`;
      if (!store.has(key)) return 'missing';
      const data = store.get(key);
      if (Object.entries(precondition || {}).some(([field, value]) => (data[field] ?? null) !== value)) return 'drifted';
      if (operation.type === 'delete') store.delete(key);
      else store.set(key, { ...data, ...operation.set });
      return operation.type === 'delete' ? 'deleted' : 'updated';
    },
    async close() {},
  };
}

function runDeps(overrides = {}) {
  const files = new Map();
  let firestoreCreated = 0;
  const deps = {
    root: '/fixture-root',
    log: () => {},
    loadSource: async () => ({ days: fixtureDays(), readings: fixtureReadings(), source: { projectId: 'fixture', snapshotVersion: 'test' } }),
    loadEvidence: () => ({}),
    mkdir: async () => {},
    writeFile: async (file, content) => { files.set(file, content); },
    createFirestore: async () => { firestoreCreated++; return overrides.firestore; },
    ...overrides,
  };
  return { deps, files, created: () => firestoreCreated };
}

test('dry run writes only the local plan and never opens Firestore', async () => {
  const { deps, files, created } = runDeps();
  const first = await runRanks([], deps);
  assert.equal(first.applied, null);
  assert.equal(created(), 0);
  assert.deepEqual([...files.keys()], [path.join('/fixture-root', 'reports/ordo-migration-plan.json')]);
  const again = runDeps();
  await runRanks([], again.deps);
  assert.equal(again.files.get(path.join('/fixture-root', 'reports/ordo-migration-plan.json')), files.get(path.join('/fixture-root', 'reports/ordo-migration-plan.json')));
});

test('--apply requires the confirmation token before any Firestore access', async () => {
  const { deps, created } = runDeps();
  await assert.rejects(() => runRanks(['--apply'], deps), /--confirm ordo-migrate-ranks/);
  assert.equal(created(), 0);
});

test('--apply writes updates and obsolete marks with preconditions, no deletes without the flag', async () => {
  const store = new Map([...fixtureDays().map((item) => [`days/${item.id}`, item]), ...fixtureReadings().map((item) => [`readings/${item.id}`, item])]);
  store.set('days/02-11-all-faithful-departed', { ...store.get('days/02-11-all-faithful-departed'), _rank: 'changed-live' });
  const firestore = fakeFirestore(store);
  const { deps, created } = runDeps({ firestore });
  const { applied } = await runRanks(['--apply', '--confirm', 'ordo-migrate-ranks'], deps);
  assert.equal(created(), 1);
  assert.equal(firestore.calls.filter((call) => call.operation.type === 'delete').length, 0);
  assert.equal(store.get('days/22-07-sv-mary-magdalene')._rank, 'festum');
  assert.equal(store.get('days/06-06-sv-boniface-vitebsk--pastors')._obsolete, true);
  assert.ok(store.has('days/06-06-sv-boniface-vitebsk--pastors'));
  assert.equal(applied.results.find((item) => item.documentId === '02-11-all-faithful-departed' && item.collection === 'days').status, 'drifted');
  assert.equal(store.get('days/02-11-all-faithful-departed')._rank, 'changed-live');
});

test('applyPlan refuses delete items unless deletes are allowed', async () => {
  const plan = buildRankMigrationPlan({ days: fixtureDays(), readings: fixtureReadings(), allowDelete: true });
  const firestore = fakeFirestore(new Map(fixtureDays().map((item) => [`days/${item.id}`, item])));
  const result = await applyPlan(plan, firestore, { allowDelete: false });
  assert.equal(firestore.calls.filter((call) => call.operation.type === 'delete').length, 0);
  assert.ok(result.counts['skipped-delete-not-allowed'] >= 2);
});

test('missing-content detection on fixtures', () => {
  const days = [
    doc('22-07-sv-mary-magdalene', { _date: '22.07', _rank: 'festum' }),
    doc('05-06-sv-boniface--pastors', { _date: '05.06', _rank: 'memoria' }),
  ];
  const readings = [doc('22-07-sv-mary-magdalene', { _date: '22.07', _dayId: '22-07-sv-mary-magdalene', title: 'св. Марыі Магдалены' })];
  const report = buildMissingContentReport({ days, readings, years: [2026], dioceses: ['vitebsk'] });
  const item = (id) => report.items.find((entry) => entry.id === id);
  assert.equal(item('sv-mary-magdalene'), undefined, 'days + readings present');
  assert.equal(item('sv-boniface').daysMissing, false);
  assert.equal(item('sv-boniface').readingsMissing, true);
  assert.equal(item('sv-boniface').priority, 'low');
  assert.equal(item('holy-name-of-jesus').daysMissing, true);
  assert.equal(item('holy-name-of-jesus').need.coverage, 'proper');
  assert.equal(item('saturday-blessed-virgin-mary').need.coverage, 'common');
  assert.deepEqual(item('saturday-blessed-virgin-mary').need.commons, ['blessed-virgin-mary']);
  assert.equal(item('sv-hildegard-bingen').need.coverage, 'common-plus-collect');
  assert.deepEqual(item('sv-hildegard-bingen').dioceses.vitebsk.roles, ['alternative']);
  assert.equal(item('mary-mother-church').daysMissing, true);

  const again = buildMissingContentReport({ days: shuffle(days), readings, years: [2026], dioceses: ['vitebsk'] });
  assert.equal(renderMissingContentMarkdown(again), renderMissingContentMarkdown(report));
});

test('suggested Commons', () => {
  assert.deepEqual(suggestCommons({ title: 'Найсв. Панны Марыі Ларэтанскай', category: 'mary' }), ['blessed-virgin-mary']);
  assert.deepEqual(suggestCommons({ title: 'Св. Яна XXIII, папы' }), ['pastors']);
  assert.deepEqual(suggestCommons({ title: 'Св. Фаўстыны Кавальскай, панны' }), ['virgins']);
  assert.deepEqual(suggestCommons({ title: 'Бл. Вінцэнта Леванюка і 12 паплечнікаў, мучанікаў з Пратуліна' }), ['martyrs-many']);
  assert.deepEqual(suggestCommons({ title: 'Найсвяцейшага Імя Езуса', category: 'lord' }), []);
});

test('missing-content script writes JSON and Markdown only locally', async () => {
  const files = new Map();
  await runMissing(['--years', '2026'], {
    root: '/fixture-root',
    log: () => {},
    loadSource: async () => ({ days: [], readings: [], source: { projectId: 'fixture', snapshotVersion: 'test' } }),
    loadEvidence: () => ({}),
    mkdir: async () => {},
    writeFile: async (file, content) => { files.set(file, content); },
  });
  assert.deepEqual([...files.keys()].sort(), [
    path.join('/fixture-root', 'docs/ordo-missing-content.md'),
    path.join('/fixture-root', 'reports/ordo-missing-content.json'),
  ]);
  assert.deepEqual(parseYears('2026-2028'), [2026, 2027, 2028]);
});

test('REST cache round-trips through the snapshot reader', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ordo-cache-'));
  try {
    const decoded = decodeRestFields({
      _date: { stringValue: '22.07' },
      _rank: { nullValue: null },
      _dayIds: { arrayValue: { values: [{ stringValue: 'a' }] } },
      _periodWeekNumber: { integerValue: '3' },
    });
    assert.deepEqual(decoded, { _date: '22.07', _rank: null, _dayIds: ['a'], _periodWeekNumber: 3 });
    await writeSnapshotCache(dir, {
      days: { documents: [{ id: 'x', data: decoded }], fieldMask: ['_date'], requests: 1 },
      readings: { documents: [], fieldMask: ['_date'], requests: 1 },
    }, { now: new Date('2026-01-01T00:00:00Z') });
    const source = await loadAnalysisSource(dir);
    assert.equal(source.days[0].id, 'x');
    assert.equal(source.source.kind, 'public-rest-cache');
    assert.equal(source.source.readingsComplete, false);
    const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
    assert.equal(manifest.scope, 'public-rest-field-mask');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

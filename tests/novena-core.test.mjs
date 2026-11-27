// Novena Tracker V1: resolver, generator, calendar, export filter and import plan.
// Synthetic prayers only; no Firestore.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { buildDefinition, dayNumberOfHeading, headingsOf, resolveDay, sectionText, validateDefinition } from '../src/utils/novena/core.mjs';
import { INITIAL_SCHEDULES, scheduleFor } from '../src/utils/novena/schedules.mjs';
import { LITURGICAL_EVENTS, recommendedStarts } from '../src/utils/novena/calendar.mjs';
import { publicNovenaRows, validateSchedule, validateShape } from '../src/utils/novena/document.mjs';
import { generatedDraft, novenaSources, publicationDocument } from '../src/utils/novena/drafts.mjs';
import { countPlan, generateDrafts, planImport } from '../scripts/novena/lib.mjs';
import { applyImport, parseArgs } from '../scripts/novena/import-drafts.mjs';
import { publicAppCollections, validateCollection } from '../scripts/content/lib/app-content.mjs';
import { readCollections, writeBundle } from '../scripts/content/build-app-bundle.mjs';

const DAYS = ['першы', 'другі', 'трэці', 'чацвёрты', 'пяты', 'шосты', 'сёмы', 'восьмы', 'дзявяты'];
const source = {
  id: 'novena-a',
  title: 'Навэнна А',
  tags: ['Навэнна'],
  text: [
    'Рубрыка перад пачаткам.',
    ':::rubric', 'Парадак навэнны', ':::',
    '1\\. Уступ', '2\\. Малітва на вызначаны дзень', '3\\. [Літанія](/prayer/litany)',
    '## Уступ', 'Уступны тэкст.',
    ...DAYS.flatMap((day, n) => [`## Дзень ${day}`, `Тэкст дня ${n + 1}.`]),
  ].join('\n'),
};
const litany = { id: 'litany', title: 'Літанія', text: 'Тэкст літаніі.' };
const prayers = () => new Map([source, litany].map((item) => [item.id, item]));
const published = (extra = {}) => {
  const { blockers: _blockers, ...definition } = generatedDraft(source, prayers());
  return { ...definition, status: 'published', trackerEnabled: true, ...extra };
};

test('a stated order becomes a template and every day assembles in that order', () => {
  const { definition, blockers } = buildDefinition(source, prayers());
  assert.deepEqual(blockers, []);
  assert.deepEqual(definition.template.map((block) => block.type), ['inline', 'section', 'daySection', 'prayer']);
  assert.deepEqual(resolveDay(definition, 5, prayers()).map((block) => [block.kind, block.markdown.split('\n').at(-1)]), [
    ['rubric', 'Рубрыка перад пачаткам.'], ['section', 'Уступны тэкст.'], ['section', 'Тэкст дня 5.'], ['prayer', 'Тэкст літаніі.'],
  ]);
});

test('a novena is selected by its tag or by its title (contract 1.1)', () => {
  const untagged = { ...source, id: 'untagged', title: 'НАВЭННА Б', tags: undefined };
  const tagged = { ...source, id: 'tagged', title: 'Дзевяць дзён' };
  const other = { id: 'other', title: 'Літанія з навэнны', text: 'Тэкст.', tags: [] };
  assert.deepEqual(novenaSources([untagged, tagged, other]).map((item) => item.id), ['untagged', 'tagged']);
  const all = new Map([untagged, tagged, other, litany].map((item) => [item.id, item]));
  assert.deepEqual(generateDrafts(all).drafts.map((draft) => draft.novenaId), ['tagged', 'untagged']);
});

test('headings, repeated sections and day numbers', () => {
  const text = '## А\nадзін\n### Б\nдва\n## А\nтры\n**Молімся.**\nчатыры\n**В**\nпяць';
  assert.equal(sectionText(text, '## А'), '## А\nадзін\n### Б\nдва');
  assert.equal(sectionText(text, '## А', 2), '## А\nтры\n**Молімся.**\nчатыры\n**В**\nпяць');
  assert.deepEqual(headingsOf(text).map((item) => `${item.heading}#${item.occurrence}`), ['## А#1', '### Б#1', '## А#2', '**В**#1']);
  assert.equal(dayNumberOfHeading('## Дзень сёмы'), 7);
  assert.equal(dayNumberOfHeading('Дзень сёмы'), 0);
});

test('a closed or missing referenced prayer blocks the whole novena', () => {
  const closed = new Map([[source.id, source], [litany.id, { ...litany, priestOnly: true }]]);
  const definition = published();
  assert.deepEqual(validateDefinition(definition, closed), ['missing-or-closed-prayer:litany']);
  assert.throws(() => resolveDay(definition, 1, new Map([[source.id, source]])), /missing-or-closed-prayer/);
  assert.ok(buildDefinition(source, closed).blockers.includes('missing-or-closed-prayer:litany'));
});

test('2027 control dates of contract §4 in every diocese', () => {
  const expected = {
    'catholicby-yearcycle-100111': '2027-03-26', Iiufha8NyLABTw92rA5S: '2027-05-07', cn_f875a48f69204c9b: '2027-05-14',
    cn_3b9c7bc54d8108f8: '2027-05-18', DVCz2NZEvgNdVFmQJaJB: '2027-05-26', cn_ef983a62c664ccaa: '2027-05-27',
    cn_d3e3bc0e7d1b276c: '2027-11-12', cn_609ae58774e83552: '2027-12-17', a8tYTDVjR2Ni75PjzOyz: '2027-02-23',
  };
  for (const diocese of ['minsk-mohilev', 'grodno', 'pinsk', 'vitebsk']) {
    for (const [id, start] of Object.entries(expected)) {
      assert.deepEqual(recommendedStarts(scheduleFor(id), 2027, { diocese }), [start], `${id} ${diocese}`);
    }
  }
  assert.deepEqual(recommendedStarts(scheduleFor('a8tYTDVjR2Ni75PjzOyz'), 2028), ['2028-02-24']);
});

test('schedule rules: neighbouring year, one-off dates, scope and switches', () => {
  const base = { enabled: true, extraDates: [] };
  assert.deepEqual(recommendedStarts({ ...base, type: 'fixedFeast', month: 1, day: 3, offsetDays: -9 }, 2027), ['2027-12-25']);
  assert.deepEqual(recommendedStarts({ ...base, type: 'fixedStart', month: 2, day: 29 }, 2027), []);
  assert.deepEqual(recommendedStarts({ ...base, type: 'fixedStart', month: 2, day: 29 }, 2028), ['2028-02-29']);
  const manual = { ...base, type: 'manual', extraDates: ['2027-03-01', '2028-03-01'] };
  assert.deepEqual(recommendedStarts(manual, 2027), ['2027-03-01']);
  assert.deepEqual(recommendedStarts({ ...manual, enabled: false }, 2027), []);
  assert.deepEqual(recommendedStarts({ ...manual, dioceses: ['pinsk'] }, 2027, { diocese: 'grodno' }), []);
  assert.deepEqual(recommendedStarts({ ...base, type: 'liturgical', event: 'unknown', offsetDays: 0 }, 2027), []);
});

test('initial schedules are well formed and use known events', () => {
  assert.equal(Object.keys(INITIAL_SCHEDULES).length, 38);
  for (const id of Object.keys(INITIAL_SCHEDULES)) assert.deepEqual(validateSchedule(scheduleFor(id)), [], id);
  for (const event of LITURGICAL_EVENTS) {
    assert.equal(recommendedStarts({ enabled: true, extraDates: [], type: 'liturgical', event, offsetDays: 0 }, 2027).length, 1, event);
  }
  assert.deepEqual(validateSchedule({ enabled: true, extraDates: ['2027-02-30'], type: 'manual', month: 1 }), ['schedule:fields', 'schedule:extraDates']);
});

test('the export keeps only published, enabled, contract-shaped, public definitions', () => {
  const rows = (data) => publicNovenaRows([{ id: source.id, ...data }], prayers());
  assert.equal(rows(published()).rows.length, 1);
  for (const data of [
    published({ status: 'draft' }), published({ trackerEnabled: false }), published({ blockers: [] }),
    published({ template: [{ type: 'prayer', prayerId: 'secret' }] }),
    published({ template: [{ type: 'prayer', prayerId: 'litany', note: 'private' }] }),
    published({ novenaId: 'other' }),
  ]) assert.equal(rows(data).rows.length, 0);
  assert.ok(validateShape(published({ novenaId: 'v4g6eUqZvze29v5vq4o1', sourcePrayerId: 'v4g6eUqZvze29v5vq4o1' })).includes('excluded-from-v1'));
  assert.deepEqual(validateCollection('novenaDefinitions', [{ id: source.id, ...published() }]), []);
});

test('the app export applies prayer access inheritance to novena references', () => {
  const collections = (litanyExtra = {}, categories = []) => new Map([
    ['prayers', [{ ...source }, { ...litany, ...litanyExtra }]],
    ['prayerCategories', categories],
    ['novenaDefinitions', [{ id: source.id, ...published() }]],
  ]);
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(publicAppCollections(collections()).get('novenaDefinitions').length, 1);
    assert.equal(publicAppCollections(collections({ priestOnly: true })).get('novenaDefinitions').length, 0);
    const restricted = [{ id: 'c', name: 'Closed', priestOnly: true }];
    assert.equal(publicAppCollections(collections({ categoryIds: ['c'] }, restricted)).get('novenaDefinitions').length, 0);
    assert.throws(() => publicAppCollections(new Map([['novenaDefinitions', [{ id: source.id, ...published() }]]])), /requires prayers/);
    assert.deepEqual(publicAppCollections(new Map([['novenaDefinitions', []]])).get('novenaDefinitions'), []);
  } finally {
    console.warn = warn;
  }
});

test('a snapshot without novenaDefinitions gives an empty collection in the bundle', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'novena-snapshot-'));
  fs.writeFileSync(path.join(dir, 'songs.json'), JSON.stringify({ schemaVersion: 1, collectionPath: 'songs', documents: [] }));
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
    schemaVersion: 1, exportedAt: '2026-11-27T00:00:00.000Z', collections: { songs: { file: 'songs.json' } },
  }));
  const warn = console.warn;
  console.warn = () => {};
  try {
    const { collections, versions, contentVersion } = await readCollections([dir], ['songs', 'novenaDefinitions']);
    assert.deepEqual(collections.get('novenaDefinitions'), []);
    const out = path.join(dir, 'out');
    const manifest = writeBundle(new Map([['novenaDefinitions', []]]), versions, contentVersion, out, { log: () => {} });
    assert.equal(manifest.collections.novenaDefinitions.count, 0);
    const payload = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(out, 'novenaDefinitions.json.gz'))));
    assert.deepEqual(payload.docs, {});
  } finally {
    console.warn = warn;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('import is idempotent and never overwrites a hand-edited draft', () => {
  const { drafts } = generateDrafts(prayers());
  const first = planImport(drafts);
  assert.deepEqual(countPlan(first), { create: 1, update: 0, noop: 0, protected: 0 });
  const stored = new Map([[source.id, first[0].data]]);
  assert.deepEqual(countPlan(planImport(drafts, stored)), { create: 0, update: 0, noop: 1, protected: 0 });

  const regenerated = [{ ...drafts[0], title: 'Новая назва' }];
  const [update] = planImport(regenerated, new Map([[source.id, { ...first[0].data, trackerEnabled: true, contentVersion: 3 }]]));
  assert.equal(update.action, 'update');
  assert.deepEqual([update.data.title, update.data.trackerEnabled, update.data.contentVersion], ['Новая назва', true, 3]);

  const edited = new Map([[source.id, { ...first[0].data, title: 'Уручную' }]]);
  assert.equal(planImport(regenerated, edited)[0].action, 'protected');
  assert.equal(planImport(regenerated, edited, { overwriteManual: [source.id] })[0].action, 'update');
  const { importHash: _hash, ...unknownOrigin } = first[0].data;
  assert.equal(planImport(regenerated, new Map([[source.id, unknownOrigin]]))[0].action, 'protected');
});

test('apply writes only the delta, backs it up and repeats as a no-op', async () => {
  const store = new Map();
  let writes = 0;
  const db = {
    collection: () => ({ doc: (id) => ({ id }) }),
    runTransaction: (task) => task({
      getAll: async (...refs) => refs.map(({ id }) => ({ id, exists: store.has(id), data: () => store.get(id) })),
      set: (ref, data) => { writes += 1; store.set(ref.id, data); },
    }),
  };
  const { drafts } = generateDrafts(prayers());
  const backups = [];
  await applyImport(db, drafts, { backup: (items) => backups.push(items) });
  const repeat = await applyImport(db, drafts, { backup: (items) => backups.push(items) });
  assert.equal(writes, 1);
  assert.equal(backups.length, 1);
  assert.deepEqual(countPlan(repeat), { create: 0, update: 0, noop: 1, protected: 0 });
});

test('the script is a dry-run unless fully told otherwise', () => {
  assert.equal(parseArgs(['--prayers', 'x']).apply, false);
  assert.throws(() => parseArgs(['--prayers', 'x', '--apply']), /service-account/);
  assert.throws(() => parseArgs(['--prayers', 'x', '--apply', '--existing', 'y']), /Firestore only/);
  assert.throws(() => parseArgs(['--aply']), /Unknown/);
});

test('contentVersion grows only when published content changes', () => {
  const draft = { ...published(), status: 'draft', blockers: [] };
  const first = publicationDocument(draft);
  assert.deepEqual([first.status, first.contentVersion, 'blockers' in first], ['published', 1, false]);
  assert.equal(publicationDocument(draft, first).contentVersion, 1);
  assert.equal(publicationDocument({ ...draft, title: 'Іншая' }, first).contentVersion, 2);
  assert.equal(publicationDocument({ ...draft, contentVersion: 4, everPublished: true }).contentVersion, 5);
});

test('an owner decision replaces the parsed order, and blocks when its source no longer fits', () => {
  // «days only» decision (St Jude): the text states no order.
  const jude = { id: 'XMJCWmBqkteNID7PxGeC', title: 'Навэнна', tags: ['Навэнна'], text: DAYS.flatMap((day, n) => [`**${day} дзень**`, `Тэкст ${n + 1}.`]).join('\n') };
  const decided = buildDefinition(jude, new Map([[jude.id, jude]]));
  assert.deepEqual(decided.blockers, []);
  assert.deepEqual(decided.definition.template, [{ type: 'daySection' }]);
  // A «page reference» decision whose reference is gone.
  const changed = { ...source, id: 'cn_38e44fcd858f9423' };
  const stale = buildDefinition(changed, new Map([[changed.id, changed], [litany.id, litany]]));
  assert.ok(stale.blockers.includes('decision-outdated:(с. 28)'));
});

// The frozen contract fixtures hold full prayer texts and live outside the repository.
const contract = process.env.NOVENA_CONTRACT_DIR;
test('contract fixtures: resolver and validator parity', { skip: !contract && 'set NOVENA_CONTRACT_DIR' }, () => {
  const dir = path.join(contract, 'fixtures');
  let days = 0;
  for (const file of fs.readdirSync(dir)) {
    const fixture = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    const map = new Map(fixture.prayers.map((item) => [item.id, item]));
    for (const expected of fixture.expected || []) {
      assert.deepEqual(resolveDay(fixture.definition, expected.day, map), expected.blocks, `${file} day ${expected.day}`);
      days += 1;
    }
    if (!fixture.blockers.length) assert.deepEqual(validateDefinition(fixture.definition, map), [], file);
  }
  assert.ok(days > 0);
});

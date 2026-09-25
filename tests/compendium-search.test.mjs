import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { indexCompendium, buildPartOutline, answerParagraphs, compendiumFromDocuments } from '../src/utils/compendiumData.js';
import { createCompendiumSearchIndex, normalizeSearchText, searchCompendium } from '../src/utils/compendiumSearch.js';
import { createCompendiumLoader, isNewerCompendium } from '../src/utils/compendiumLoader.js';

const read = (path) => JSON.parse(readFileSync(new URL(`../src/data/compendium/${path}`, import.meta.url), 'utf8'));
const dataset = read('compendium.json');
const aliases = read('compendium_search_aliases.json');
const index = indexCompendium(dataset);
const search = createCompendiumSearchIndex(index.questions, aliases);
const top = (query, count = 5) => searchCompendium(search, query).slice(0, count).map((result) => result.question.number);

test('index: flat order, lookup by number/id and reading groups', () => {
  assert.equal(index.questions.length, 598);
  assert.deepEqual(index.questions.slice(0, 3).map((question) => question.number), [1, 2, 3]);
  assert.equal(index.getQuestion(598).id, 'q598');
  assert.equal(index.getQuestion('q042').number, 42);
  assert.equal(index.getQuestion('777'), null);
  const grouped = [...index.groups.values()].flatMap((group) => group.questions.map((question) => question.number));
  assert.deepEqual(grouped.sort((a, b) => a - b), index.questions.map((question) => question.number));
  assert.equal(index.getGroup(index.getQuestion(252).groupId).title, 'САКРАМЭНТ ХРОСТУ');
  const outline = buildPartOutline(index, 'p2');
  assert.equal(outline.sections.length, 2);
  assert.ok(outline.sections[1].chapters.some((chapter) => chapter.groups.some((group) => group.title === 'САКРАМЭНТ ЭЎХАРЫСТЫI')));
});

test('answer paragraphs keep source text and emphasis', () => {
  const question = index.getQuestion(445);
  const paragraphs = answerParagraphs(question);
  assert.equal(paragraphs.map((runs) => runs.map((run) => run.text).join('')).join('\n'), question.answer.replace(/\n+/g, '\n'));
  assert.equal(paragraphs[1][0].style, 'italic');
});

test('normalisation folds Belarusian orthographic variants', () => {
  assert.equal(normalizeSearchText('Эўхарыстыя'), normalizeSearchText('еухарыстыя'));
  assert.equal(normalizeSearchText('Касцёл'), 'касцел');
  assert.equal(normalizeSearchText('Аб’яўленне'), 'абяуленне');
  assert.equal(normalizeSearchText('ПIСАННЕ'), normalizeSearchText('Пісанне'));
});

test('number search puts the exact question first', () => {
  assert.equal(top('1')[0], 1);
  assert.equal(top('100')[0], 100);
  assert.equal(top('598')[0], 598);
  assert.equal(searchCompendium(search, '1066')[0].field, 'refs');
});

test('Belarusian search is case-insensitive and prefers question matches', () => {
  for (const query of ['Бог', 'вера', 'Касцёл', 'сакрамэнт', 'хрост', 'Эўхарыстыя', 'малітва', 'грэх']) {
    const results = searchCompendium(search, query);
    assert.ok(results.length > 0, query);
    assert.equal(results[0].field, 'question', query);
  }
  assert.ok(top('што такое малітва').includes(534));
  assert.ok(top('ЭЎХАРЫСТЫЯ', 10).includes(271));
  assert.deepEqual(searchCompendium(search, 'зззззз'), []);
  assert.deepEqual(searchCompendium(search, '   '), []);
});

test('hidden Russian aliases widen matching only', () => {
  const expectations = { крещение: 252, исповедь: 296, причастие: 271, грех: 392, священник: 328, 'таинство брака': 337 };
  for (const [query, number] of Object.entries(expectations)) {
    assert.ok(searchCompendium(search, query).some((result) => result.question.number === number), query);
  }
  // Aliases are not rendered: results are the unchanged Belarusian records.
  const result = searchCompendium(search, 'исповедь')[0].question;
  assert.equal(result, index.getQuestion(result.number));
  assert.ok(!JSON.stringify(dataset).includes('исповед'));
  // Without the alias file, a Russian-only word finds nothing.
  assert.deepEqual(searchCompendium(createCompendiumSearchIndex(index.questions), 'исповедь'), []);
});

test('every alias target exists in the Belarusian text', () => {
  const words = new Set(search.entries.flatMap((entry) => [...entry.words.question, ...entry.words.answer, ...entry.words.context]));
  for (const group of search.aliases.groups) {
    for (const stem of group.be) assert.ok([...words].some((word) => word.startsWith(stem)), stem);
  }
});

test('Firestore documents reassemble into the canonical dataset', () => {
  const meta = { ...dataset.meta, parts: dataset.parts, importedAt: { seconds: 1 } };
  const shuffled = [...dataset.units].reverse().map((unit) => ({ ...unit, importedAt: { seconds: 1 } }));
  assert.deepEqual(compendiumFromDocuments(meta, shuffled), dataset);
});

const newer = { ...dataset, meta: { ...dataset.meta, contentVersion: dataset.meta.contentVersion + 1, checksum: 'remote' } };
function loader({ remoteMeta = null, remoteDataset = newer, cached = null, failCache = false } = {}) {
  const calls = { dataset: 0 };
  const load = createCompendiumLoader({
    loadBundled: async () => dataset,
    readCached: async (fetcher) => {
      if (failCache) throw new Error('offline and nothing cached');
      return cached ?? fetcher();
    },
    readRemoteMeta: async () => ({ data: remoteMeta, complete: true }),
    readRemoteDataset: async () => { calls.dataset++; return { data: remoteDataset, complete: true }; },
  });
  return { load, calls };
}

test('loader: bundled content when Firestore has nothing newer (one meta read)', async () => {
  const { load, calls } = loader({ remoteMeta: dataset.meta });
  const result = await load();
  assert.equal(result.source, 'bundled');
  assert.equal(calls.dataset, 0);
  assert.equal((await loader().load()).dataset, dataset);
});

test('loader: newer valid Firestore content replaces the bundle', async () => {
  const result = await loader({ remoteMeta: newer.meta }).load();
  assert.equal(result.source, 'remote');
  assert.equal(result.dataset.meta.checksum, 'remote');
  assert.equal(isNewerCompendium({ ...newer.meta, schemaVersion: 99 }, dataset.meta), false);
});

test('loader: invalid remote data and failed refresh keep usable content', async () => {
  const broken = { ...newer, units: newer.units.slice(1) };
  assert.equal((await loader({ remoteMeta: newer.meta, remoteDataset: broken }).load()).source, 'bundled');
  const offline = await loader({ failCache: true }).load();
  assert.equal(offline.source, 'bundled');
  assert.ok(offline.refreshError);
  // A previously cached newer copy stays in use while offline.
  const cached = await loader({ cached: { data: newer, complete: false } }).load();
  assert.equal(cached.source, 'remote');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'node-html-parser';
import { loadEditorDocument, verifyEditorWrite } from '../src/utils/liturgicalEditorPersistence.js';
import { sparseUpdatePayload } from '../src/utils/liturgicalEditorSources.js';
import { resolveRuntimeDay, legacyContextOf } from '../src/utils/ordo/runtime.js';
import { buildOrdoDayOptions, contentDayMap, findResolvedDayById } from '../src/utils/ordoDayOptions.js';
import { OFFICE_CONTENT_FIELDS } from '../src/constants/officeFields.js';
import { getLiturgicalAlternatives, formatIntercessions } from '../src/utils/liturgicalAlternatives.js';
import { createContentCache } from '../src/utils/contentCache.js';

const id = '28-10-sv-simon-jude-apostles';
const wrong = '<p>Хрыстэ, Ты паслаў вучняў сеяць зерне слова,</p><p><em>Пачуй нас.</em></p><p>–дай усім, хторупліва сее слова, з радасцю збіраць плён.</p>';
const right = wrong.replace('хторупліва', 'хто рупліва');

// Minimal reproduction of the live document topology, read 2026-11-06.
function fixture() {
  const proper = { id, _schema: 2, _date: '28.10', _rank: 'festum', _celebrationId: 'sv-simon-jude-apostles', _templates: ['apostles'], _defaultTemplate: 'apostles' };
  const legacy = { id, _date: '28.10', _rank: 'festum', vesperInter: right };
  const storage = new Map([[`days/${id}`, legacy], [`liturgicalProperTexts/${id}`, proper]]);
  const read = async (collection, key) => structuredClone(storage.get(`${collection}/${key}`) || null);
  const publicContent = () => {
    const resolved = resolveRuntimeDay('2026-10-28', { diocese: 'minsk-mohilev' });
    const context = legacyContextOf(resolved);
    const period = { id: 'ordinary-w30-d4', _periodType: 'ordinary', _periodWeekNumber: '30', _dayOfWeek: '4' };
    const templates = new Map([['apostles', { vesperInter: wrong, laudesInter: wrong, vesperHymn: wrong, vesperR: wrong }]]);
    const daysResult = { periodDays: [period], periodFallback: period, fixedDateDays: [legacy], properDays: [storage.get(`liturgicalProperTexts/${id}`)], dynamicDaysByFeast: new Map() };
    const { dayOptions } = buildOrdoDayOptions({ resolved, daysResult, context, date: '2026-10-28', diocese: 'minsk-mohilev', templates });
    return { dayOptions, itemsDays: [...contentDayMap([legacy, period], dayOptions).values()] };
  };
  return { storage, read, publicContent };
}
const publicDay = (f, key = id) => findResolvedDayById(f.publicContent(), key);

test('28.10.2026: editor chooses the published Proper even when corrected days exists', async () => {
  const f = fixture();
  assert.match(f.storage.get(`days/${id}`).vesperInter, /хто рупліва/);
  assert.match(publicDay(f).vesperInter, /хторупліва/);
  const target = await loadEditorDocument(id, f.read);
  assert.equal(target.collection, 'liturgicalProperTexts');
  assert.equal(target.id, id);
  assert.equal(target.data.vesperInter, undefined, 'the Common supplies it until an own override is saved');
});

for (const field of ['vesperInter', 'laudesInter', 'vesperHymn', 'vesperR']) {
  test(`save, reopen and public rendering preserve ${field}, including inline spaces`, async () => {
    const f = fixture();
    const target = await loadEditorDocument(id, f.read);
    const html = right.replace('хто рупліва', '<span>хто</span> <strong>рупліва</strong>');
    const { set, remove } = sparseUpdatePayload(target.data, { ...target.data, [field]: html }, OFFICE_CONTENT_FIELDS);
    assert.deepEqual(Object.keys(set), [field]);
    Object.assign(f.storage.get(`${target.collection}/${target.id}`), set);
    const reopened = await loadEditorDocument(id, f.read);
    verifyEditorWrite(reopened.data, set, remove);
    assert.equal(reopened.data[field], html);
    assert.equal(publicDay(f)[field], html);
    assert.equal(publicDay(f, `${id}--apostles`)[field], html);
    const options = getLiturgicalAlternatives(publicDay(f)[field], field.endsWith('Inter') ? 'intercession' : 'generic');
    const rendered = field.endsWith('Inter') ? formatIntercessions(options[0].html) : options[0].html;
    assert.match(parse(rendered).textContent, /хто рупліва/);
  });
}

test('ordinary and unpublished legacy days remain editable, including variant ids', async () => {
  for (const key of ['ordinary-w30-d4', 'legacy-feast', 'legacy-feast--apostles']) {
    const read = async (collection, id) => collection === 'days' && id === key ? { vesperInter: right } : null;
    const target = await loadEditorDocument(key, read);
    assert.equal(target.collection, 'days');
    assert.equal(target.id, key);
    verifyEditorWrite(await read(target.collection, key), { vesperInter: right });
  }
});

test('Proper variants resolve to the base document and preserve the requested assembly', async () => {
  const f = fixture();
  for (const choice of ['apostles', 'day']) {
    const target = await loadEditorDocument(`${id}--${choice}`, f.read);
    assert.equal(target.id, id);
    assert.equal(target.collection, 'liturgicalProperTexts');
    assert.equal(target.choice, choice);
  }
});

test('read errors cannot silently switch the editor to the unused legacy copy', async () => {
  let reads = 0;
  await assert.rejects(loadEditorDocument(id, async () => { reads += 1; throw new Error('permission-denied'); }), /permission-denied/);
  assert.equal(reads, 1);
});

test('server verification detects missing write, lost space, wrong field and failed deletion', () => {
  assert.throws(() => verifyEditorWrite(null, { vesperInter: right }), /не знойдзены/);
  assert.throws(() => verifyEditorWrite({ vesperInter: wrong }, { vesperInter: right }), /vesperInter/);
  assert.throws(() => verifyEditorWrite({ laudesInter: right }, { vesperInter: right }), /vesperInter/);
  assert.throws(() => verifyEditorWrite({ vesperInter: '' }, {}, ['vesperInter']), /vesperInter/);
  verifyEditorWrite({}, {}, ['vesperInter']);
  verifyEditorWrite({ _fieldRules: { b: 2, a: 1 } }, { _fieldRules: { a: 1, b: 2 } });
});

test('old persistent content refreshes after save and stays correct in a new session', async () => {
  const f = fixture();
  const persisted = new Map();
  let revision = 'before';
  const storage = { get: async (key) => structuredClone(persisted.get(key)), set: async (key, value) => persisted.set(key, structuredClone(value)), keys: async () => [...persisted.keys()] };
  const create = () => createContentCache({ storage, getRevision: () => revision, isOnline: () => true, maxAgeMs: 900000 });
  const loader = async () => ({ complete: true, data: f.publicContent() });
  const cache = create();
  await cache.read('2026-10-28', loader);
  f.storage.get(`liturgicalProperTexts/${id}`).vesperInter = right;
  revision = 'after-save';
  for (const session of [cache, create()]) {
    const result = await session.read('2026-10-28', loader);
    assert.equal(findResolvedDayById(result.data, id).vesperInter, right);
  }
});

for (const middle of [' ', '&nbsp;', '&#32;', '\n']) {
  test(`formatting preserves inline separator ${JSON.stringify(middle)}`, () => {
    const html = `<p>Молімся:</p><p><em>Пачуй нас</em></p><p><span>хто</span>${middle}<span>рупліва</span></p>`;
    for (const option of getLiturgicalAlternatives(html, 'intercession')) {
      assert.match(parse(formatIntercessions(option.html)).textContent, /хто[\s\u00a0]рупліва/);
    }
  });
}

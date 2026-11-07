import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'node-html-parser';
import { loadDayEditorDocument, verifyDayEditorWrite } from '../src/utils/dayEditorPersistence.js';
import { sparseUpdatePayload } from '../src/utils/liturgicalEditorSources.js';
import { OFFICE_CONTENT_FIELDS } from '../src/constants/officeFields.js';
import { getLiturgicalAlternatives, formatIntercessions } from '../src/utils/liturgicalAlternatives.js';
import { fixture, properPath, legacyPath, readFixture, publicFixtureDay } from './helpers/day-editor-fixture.mjs';

const formatted = (html) => formatIntercessions(getLiturgicalAlternatives(html, 'intercession')[0].html);

test('2026-10-28: corrected legacy document is shadowed by Common in public Vespers', () => {
  const documents = structuredClone(fixture.documents);
  assert.match(documents[legacyPath].vesperInter, /хто рупліва/);
  assert.equal(documents[properPath].vesperInter, undefined);
  const day = publicFixtureDay(documents);
  assert.equal(day.vesperInter, documents['liturgicalTemplates/apostles'].vesperInter);
  assert.match(parse(formatted(day.vesperInter)).text, /хторупліва/);
});

test('2026-10-28: editor saves to the public Proper; reopen and public display use saved HTML', async () => {
  const documents = structuredClone(fixture.documents);
  const source = await loadDayEditorDocument(fixture.dayId, readFixture(documents));
  assert.equal(`${source.collection}/${source.id}`, properPath);
  const corrected = documents[legacyPath].vesperInter;
  const { set, remove } = sparseUpdatePayload(source.data, { ...source.data, vesperInter: corrected }, OFFICE_CONTENT_FIELDS);
  assert.deepEqual(set, { vesperInter: corrected });
  assert.deepEqual(remove, []);
  Object.assign(documents[properPath], set);
  verifyDayEditorWrite(documents[properPath], { path: properPath, set, remove });
  const reopened = await loadDayEditorDocument(fixture.dayId, readFixture(documents));
  const publicDay = publicFixtureDay(documents);
  assert.equal(reopened.data.vesperInter, corrected);
  assert.equal(publicDay.vesperInter, reopened.data.vesperInter);
  assert.match(parse(formatted(publicDay.vesperInter)).text, /хто рупліва/);
  // A feast override must not change the Common for every other apostle feast.
  assert.match(documents['liturgicalTemplates/apostles'].vesperInter, /хторупліва/);
});

test('all Office fields: own edits survive save/reopen and public assembly, including references', async () => {
  const documents = structuredClone(fixture.documents);
  const source = await loadDayEditorDocument(fixture.dayId, readFixture(documents));
  for (const field of OFFICE_CONTENT_FIELDS.filter((field) => /^(laudes|vesper|sext|officeOfReadings)/.test(field))) {
    if (field === 'officeOfReadingsTeDeum') continue;
    const text = `<p>${field}: <span>слова</span> <strong>разам</strong></p>`;
    const { set } = sparseUpdatePayload(source.data, { ...source.data, [field]: text }, OFFICE_CONTENT_FIELDS);
    const changed = { ...documents, [properPath]: { ...documents[properPath], ...set } };
    const reopened = await loadDayEditorDocument(fixture.dayId, readFixture(changed));
    assert.equal(publicFixtureDay(changed)[field], reopened.data[field], field);
    assert.equal(reopened.data[field], text);
  }
});

test('canonical Proper and alternative links win over legacy copies; diocesan suffixes retain identity', async () => {
  const documents = structuredClone(fixture.documents);
  documents[`days/${fixture.dayId}--apostles`] = { vesperInter: 'old choice' };
  const selected = await loadDayEditorDocument(`${fixture.dayId}--apostles`, readFixture(documents));
  assert.equal(selected.id, fixture.dayId);
  assert.equal(selected.choice, 'apostles');
  const localId = `${fixture.dayId}--pinsk`;
  documents[`liturgicalProperTexts/${localId}`] = { _schema: 2, _place: 'pinsk' };
  assert.equal((await loadDayEditorDocument(localId, readFixture(documents))).id, localId);
  delete documents[`liturgicalProperTexts/${localId}`];
  documents[`days/${localId}`] = { _place: 'pinsk' };
  assert.equal((await loadDayEditorDocument(localId, readFixture(documents))).collection, 'days');
});

test('saved alternative texts keep both choices and their inline spaces in public assembly', async () => {
  const documents = structuredClone(fixture.documents);
  const source = await loadDayEditorDocument(fixture.dayId, readFixture(documents));
  const html = '<p>Першы тэкст: <span>слова</span> <em>разам</em>.</p><hr><p>Або:</p><p>Другі тэкст: <strong>два </strong><span>словы</span>.</p>';
  const { set } = sparseUpdatePayload(source.data, { ...source.data, vesperInter: html }, OFFICE_CONTENT_FIELDS);
  Object.assign(documents[properPath], set);
  const reopened = await loadDayEditorDocument(fixture.dayId, readFixture(documents));
  assert.equal(publicFixtureDay(documents).vesperInter, reopened.data.vesperInter);
  const options = getLiturgicalAlternatives(publicFixtureDay(documents).vesperInter, 'intercession');
  assert.equal(options.length, 2);
  assert.match(parse(formatIntercessions(options[0].html)).text, /слова разам/);
  assert.match(parse(formatIntercessions(options[1].html)).text, /два словы/);
});

test('ordinary days and unpublished/obsolete Propers keep days as the editable source', async () => {
  const documents = structuredClone(fixture.documents);
  assert.equal((await loadDayEditorDocument('ordinary-w30-d4', readFixture(documents))).collection, 'days');
  documents[properPath]._obsolete = true;
  assert.equal((await loadDayEditorDocument(fixture.dayId, readFixture(documents))).collection, 'days');
  delete documents[properPath];
  assert.equal((await loadDayEditorDocument(fixture.dayId, readFixture(documents))).collection, 'days');
  await assert.rejects(loadDayEditorDocument('missing', readFixture(documents)), /не знойдзены/);
  await assert.rejects(loadDayEditorDocument(fixture.dayId, async () => { throw new Error('unavailable'); }), /unavailable/);
});

test('server verification rejects missing fields, deleted fields and whitespace differences', () => {
  const write = { path: properPath, set: { vesperInter: '<p>хто рупліва</p>', _fieldRules: { b: 2, a: 1 } }, remove: ['vesperR'] };
  assert.doesNotThrow(() => verifyDayEditorWrite({ vesperInter: '<p>хто рупліва</p>', _fieldRules: { a: 1, b: 2 } }, write));
  assert.throws(() => verifyDayEditorWrite({ ...write.set, vesperInter: '<p>хторупліва</p>' }, write), /vesperInter/);
  assert.throws(() => verifyDayEditorWrite({ ...write.set, vesperR: '' }, write), /vesperR/);
  assert.throws(() => verifyDayEditorWrite(null, write), /Не пацверджана/);
});

test('intercessions retain spaces inside, outside and between inline tags without inventing word boundaries', () => {
  for (const phrase of ['<span>хто</span> <span>рупліва</span>', '<span>хто </span><strong>рупліва</strong>', '<span>хто</span><em> рупліва</em>', '<span>хто</span>&nbsp;<span>рупліва</span>']) {
    const result = formatted(`<p>Молімся:</p><p><em>Пане, пачуй.</em></p><p>– дай усім, ${phrase} сее слова.</p>`);
    assert.match(parse(result).text, /хто[\s\u00a0]рупліва/);
  }
  const source = '<p>Молімся:</p><p><em>Пане.</em></p><p>– <span>сло</span><span>ва</span></p>';
  assert.match(parse(formatted(source)).text, /слова/);
  assert.doesNotMatch(parse(formatted(source)).text, /сло ва/);
});

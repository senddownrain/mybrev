import assert from 'node:assert/strict';
import test from 'node:test';
import { FIXED_IDENTITIES } from '../src/data/ordo/fixed-identities.js';
import { claimedDayIds, resolveRuntimeDay, selectFixedDocuments } from '../src/utils/ordo/runtime.js';
import { isObsoleteDocument, withoutObsoleteDocuments } from '../src/utils/liturgicalDayResolution.js';
import { loadLiveIndex, resolveLiveDayIds } from '../scripts/ordo/build-identities.mjs';

// Firestore shape: one document serves several dioceses through `_place`.
const DAYS = [
  { id: '16-11-our-lady-mother-mercy', _date: '16.11', _rank: 'memoria-ad-libitum', _feastName: 'Найсв. Панны Марыі, Маці Міласэрнасці' },
  { id: '16-11-our-lady-mother-mercy-grodno', _date: '16.11', _rank: 'solemnitas', _place: 'grodno', _feastName: 'Найсв. Панны Марыі, Маці Міласэрнасці' },
  { id: '16-11-our-lady-mother-mercy-minsk-mohilev-pinsk--minsk-mohilev', _date: '16.11', _rank: 'memoria', _place: ['minsk-mohilev', 'pinsk'], _feastName: 'Найсв. Панны Марыі, Маці Міласэрнасці' },
  { id: '16-11-sv-margaret-scotland', _date: '16.11', _rank: 'memoria-ad-libitum', _feastName: 'Св. Маргарыты Шатландскай' },
  { id: '16-05-sv-andrei-bobola', _date: '16.05', _rank: 'memoria-ad-libitum', _feastName: 'Св. Андрэя Баболі' },
  { id: '16-05-sv-andrei-bobola-minsk-mohilev', _date: '16.05', _rank: 'memoria', _place: ['minsk-mohilev', 'vitebsk'], _feastName: 'Св. Андрэя Баболі' },
  { id: '16-05-sv-andrei-bobola-pinsk', _date: '16.05', _rank: 'solemnitas', _place: 'pinsk', _feastName: 'Св. Андрэя Баболі' },
];

function documentsFor(date, diocese, celebrationId, days = DAYS) {
  const day = resolveRuntimeDay(date, { diocese });
  const option = [day.primary, ...day.alternatives].find((item) => item.id === celebrationId);
  assert.ok(option, `${celebrationId} is an option on ${date} in ${diocese}`);
  return selectFixedDocuments(option, days.filter((doc) => doc._date === option.daysRef._date), {
    diocese, claimedIds: claimedDayIds(day, option.id),
  });
}

test('16.11 in Pinsk resolves to the multi-place diocesan document, not the universal one', () => {
  const docs = documentsFor('2026-11-16', 'pinsk', 'our-lady-mother-mercy');
  assert.deepEqual(docs.map((doc) => doc.id), ['16-11-our-lady-mother-mercy-minsk-mohilev-pinsk--minsk-mohilev']);
  assert.equal(docs[0]._rank, 'memoria');
});

test('16.05 in Vitebsk resolves to the multi-place diocesan document, not the universal one', () => {
  const docs = documentsFor('2026-05-16', 'vitebsk', 'sv-andrei-bobola');
  assert.deepEqual(docs.map((doc) => doc.id), ['16-05-sv-andrei-bobola-minsk-mohilev']);
  assert.equal(docs[0]._rank, 'memoria');
});

test('generated identities point every diocese of a multi-place document to the live id', () => {
  assert.deepEqual(FIXED_IDENTITIES['16.11|pinsk|Найсв. Панны Марыі, Маці Міласэрнасці (Маці Божай Вастрабрамскай)'].dayIds,
    // The canonical sparse document of the diocese first, then the live one.
    ['16-11-our-lady-mother-mercy-minsk-mohilev-pinsk--pinsk', '16-11-our-lady-mother-mercy-minsk-mohilev-pinsk--minsk-mohilev']);
  assert.deepEqual(FIXED_IDENTITIES['16.05|vitebsk|Св. Андрэя Баболі, прэзбітэра і мучаніка'].dayIds,
    ['16-05-sv-andrei-bobola-minsk-mohilev--vitebsk', '16-05-sv-andrei-bobola-minsk-mohilev']);
  // Every identity still reaches a live document (the split id is only the
  // canonical sparse document, never the only one).
  const live = new Set(loadLiveIndex().map((doc) => doc.id));
  Object.entries(FIXED_IDENTITIES).forEach(([key, item]) => {
    assert.ok(item.dayIds.some((id) => live.has(id)) || item.dayIds.every((id) => !/--/.test(id)), key);
  });
});

test('resolveLiveDayIds keeps live ids, keeps Common variants and leaves unknown ids alone', () => {
  const live = [
    { id: '12-11-sv-josaphat-minsk-mohilev-pinsk--minsk-mohilev--martyr-one', date: '12.11', places: ['minsk-mohilev', 'pinsk'] },
    { id: '12-11-sv-josaphat-minsk-mohilev-pinsk--minsk-mohilev--pastors', date: '12.11', places: ['minsk-mohilev', 'pinsk'] },
    { id: '12-11-sv-josaphat--martyr-one', date: '12.11', places: [] },
  ];
  assert.deepEqual(resolveLiveDayIds(
    ['12-11-sv-josaphat-minsk-mohilev-pinsk--pinsk--martyr-one', '12-11-sv-josaphat-minsk-mohilev-pinsk--pinsk--pastors'],
    { date: '12.11', place: 'pinsk', live },
  ), ['12-11-sv-josaphat-minsk-mohilev-pinsk--minsk-mohilev--martyr-one', '12-11-sv-josaphat-minsk-mohilev-pinsk--minsk-mohilev--pastors']);
  assert.deepEqual(resolveLiveDayIds(['12-11-sv-josaphat--martyr-one'], { date: '12.11', place: '', live }), ['12-11-sv-josaphat--martyr-one']);
  assert.deepEqual(resolveLiveDayIds(['01-01-not-imported'], { date: '01.01', place: 'pinsk', live }), ['01-01-not-imported']);
  assert.deepEqual(resolveLiveDayIds(['x'], { date: '01.01', place: '', live: null }), ['x']);
});

test('obsolete documents are filtered', () => {
  assert.equal(isObsoleteDocument({ _obsolete: true }), true);
  assert.equal(isObsoleteDocument({ _obsolete: 'yes' }), false);
  assert.equal(isObsoleteDocument(null), false);
  assert.deepEqual(withoutObsoleteDocuments([{ id: 'a' }, { id: 'b', _obsolete: true }]).map((doc) => doc.id), ['a']);
  assert.deepEqual(withoutObsoleteDocuments(undefined), []);
});

test('runtime never selects an obsolete document, by id or by title', () => {
  const days = DAYS.map((doc) => (doc.id === '16-11-our-lady-mother-mercy-minsk-mohilev-pinsk--minsk-mohilev' ? { ...doc, _obsolete: true } : doc));
  const docs = documentsFor('2026-11-16', 'pinsk', 'our-lady-mother-mercy', days);
  assert.ok(docs.length);
  assert.ok(docs.every((doc) => !doc._obsolete));
  assert.deepEqual(docs.map((doc) => doc.id), ['16-11-our-lady-mother-mercy']);

  const day = resolveRuntimeDay('2026-06-06', { diocese: 'vitebsk' });
  const norbert = [day.primary, ...day.alternatives].find((item) => item.id === 'sv-norbert');
  const titleOnly = { ...norbert, daysRef: { ...norbert.daysRef, dayIds: [] }, fallbackDaysRefs: [] };
  const stale = [{ id: '06-06-sv-norbert-old', _date: '06.06', _feastName: 'Св. Норбэрта, біскупа', _obsolete: true }];
  assert.deepEqual(selectFixedDocuments(titleOnly, stale, { diocese: 'vitebsk' }), []);
});

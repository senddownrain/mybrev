import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrayerFromDraft, canTransition, draftSourceNotice, findDuplicateCandidates, normalizeTitleKey, publishBlockers, targetPrayerIdFor, validateDraft } from '../src/utils/prayerDraftModel.mjs';
import { formatSourceNotice } from '../src/utils/prayerSource.mjs';

const draft = { draftId: 'd1', title: ' Літанія ', text: 'Кірые', textFormat: 'mybrev-markdown', status: 'draft', tags: ['Літанія', 'Літанія', ' '], sourceBook: '«Бог Добры»', sourceEdition: '(Пінск, 2022)', printedPageStart: 10, printedPageEnd: 12, pdfPageStart: 12, copyrightNotices: ['© Пінская дыяцэзія, 2022'] };

test('title keys fold graphic variants', () => {
  assert.equal(normalizeTitleKey('Літанія да Ёсіфа'), normalizeTitleKey('Litanija да Есіфа'.replace('Litanija', 'Літанія')));
  assert.equal(normalizeTitleKey("Ойча наш, Св. Юзафа’"), normalizeTitleKey('ойча  наш св юзафа'));
  assert.equal(normalizeTitleKey('Пі\u0301ус'), normalizeTitleKey('Піус'));
});
test('duplicate candidates: exact first, similar by tokens, none for unrelated', () => {
  const prayers = [{ id: 'a', title: 'Літанія да Найсвяцейшага Імя Езус' }, { id: 'b', titleVersions: { be: 'Ойча наш' } }, { id: 'c', title: 'Ружанец' }];
  assert.deepEqual(findDuplicateCandidates('ойча наш', prayers).map((x) => [x.id, x.kind]), [['b', 'exact']]);
  assert.equal(findDuplicateCandidates('Літанія да Найсвяцейшага Імя Езус Хрыста', prayers)[0].id, 'a');
  assert.equal(findDuplicateCandidates('Невядомая', prayers).length, 0);
});
test('two-state machine: direct publish, old statuses are treated as drafts', () => {
  assert.ok(canTransition('draft', 'published') && canTransition('draft', 'draft'));
  assert.ok(canTransition('needs_review', 'published') && canTransition('archived', 'published'));
  assert.ok(!canTransition('published', 'draft') && !canTransition('draft', 'archived'));
});
test('validation and publish blockers', () => {
  assert.deepEqual(validateDraft(draft), []);
  assert.ok(validateDraft({ ...draft, textFormat: 'html' }).length);
  assert.ok(validateDraft({ ...draft, title: '' }).length);
  assert.deepEqual(publishBlockers(draft), []);
  assert.deepEqual(publishBlockers({ ...draft, copyrightNotices: [], rightsStatus: 'unconfirmed', rightsBasis: '' }), []);
  assert.ok(publishBlockers({ ...draft, tags: [] }).length);
  assert.ok(publishBlockers({ ...draft, sourceBook: '', source: '' }).length);
  assert.equal(draftSourceNotice({ ...draft, source: 'Рэдакцыйная крыніца' }), 'Рэдакцыйная крыніца');
});
test('published document: reader fields only, deduped tags, book source with rights, no PDF hashes', () => {
  const prayer = buildPrayerFromDraft({ ...draft, sourceSha256: 'abc', notes: 'private', reason: 'ambiguous' });
  assert.equal(prayer.title, 'Літанія'); assert.deepEqual(prayer.tags, ['Літанія']);
  assert.equal(prayer.source, '«Бог Добры» (Пінск, 2022), с. 10–12. © Пінская дыяцэзія, 2022');
  assert.ok(!('sourceSha256' in prayer) && !('notes' in prayer) && !('reason' in prayer));
  assert.equal(prayer.sourceDraftId, 'd1'); assert.equal(targetPrayerIdFor(draft), 'd_d1');
});
test('replacement keeps other language versions of a multi-language prayer', () => {
  const prayer = buildPrayerFromDraft(draft, { existing: { titleVersions: { be: 'a', ru: 'b' }, textVersions: { be: 'x', ru: 'y' } } });
  assert.deepEqual(prayer.textVersions, { be: 'Кірые', ru: 'y' }); assert.deepEqual(prayer.titleVersions, { be: 'Літанія', ru: 'b' });
});
test('source notice without pages', () => assert.equal(formatSourceNotice({ book: 'Кніга', copyrightNotices: ['© A', '© A'] }), 'Кніга. © A'));

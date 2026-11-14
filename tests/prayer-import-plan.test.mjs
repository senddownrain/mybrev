import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { kindFromTitle, matchCanonical } from '../scripts/prayer-import/lib/matching.mjs';
import { buildTagUniverse, chooseTags } from '../scripts/prayer-import/lib/tags.mjs';
import { canonId, planCanonical } from '../scripts/prayer-import/lib/plan-canon.mjs';
import { entryToMarkdown } from '../scripts/prayer-import/lib/blocks-to-markdown.mjs';
import { loadOfficialCorpus } from '../scripts/prayer-import/lib/corpus.mjs';
import { prayerMarkdownToPlainText } from '../src/utils/prayerMarkdown.js';
import { corpusOf, litanyEntry, SOURCES } from './helpers/prayer-import-fixture.mjs';
import { readFileSync } from 'node:fs';

const SOURCES_JSON = JSON.parse(readFileSync(new URL('../scripts/prayer-import/sources.json', import.meta.url), 'utf8'));
const oldPrayer = (id, title, text, extra = {}) => ({ id, title, text, textFormat: 'mybrev-markdown', tags: [], ...extra });
const BODY = 'Святы Юзафе маліся за нас Апекуне Святой Сям’і маліся за нас Абаронца Царквы маліся за нас';

test('matching: exact title + text confirms, kinds never cross, unrelated -> CREATE, same title/different text -> REVIEW', () => {
  const canon = { title: 'Літанія да св. Юзафа', text: BODY, kind: 'litany' };
  assert.equal(matchCanonical(canon, [oldPrayer('a', 'Літанія да св. Юзафа', BODY)]).decision, 'REPLACE_KEEP_ID');
  assert.equal(matchCanonical(canon, [oldPrayer('a', 'Навэнна да св. Юзафа', BODY)]).decision, 'CREATE');
  assert.equal(matchCanonical(canon, [oldPrayer('a', 'Ружанец', 'Вітай Марыя')]).decision, 'CREATE');
  const other = matchCanonical(canon, [oldPrayer('a', 'Літанія да св. Юзафа', 'зусім іншы тэкст пра нешта іншае тут цалкам')]);
  assert.equal(other.decision, 'REVIEW_AMBIGUOUS');
  assert.equal(matchCanonical(canon, [oldPrayer('a', 'Літанія да св. Юзафа', BODY), oldPrayer('b', 'Літанія да св. Юзафа', BODY)]).decision, 'REVIEW_AMBIGUOUS');
});
test('matching: graphic variants (і/i, ’) match; different saints do not', () => {
  const canon = { title: 'Малітва да Маці Божай Фацімскай', text: BODY };
  assert.equal(matchCanonical(canon, [oldPrayer('a', 'Малітва да Маці Божай Балеснай', 'Маці Балесная глянь на нас з любоўю і суцеш нас у смутку')]).decision, 'CREATE');
  assert.equal(matchCanonical({ title: 'Літанія да Дзіцятка Езуса', text: BODY }, [oldPrayer('a', 'Літанія да Дзіцяткі Езуса', BODY)]).decision, 'REPLACE_KEEP_ID');
  assert.equal(kindFromTitle('Вяночак да Божай Міласэрнасці'), 'chaplet');
});
test('tags: only existing tags, type tag, one proposed generic tag for chaplets, old tags kept (deduped)', () => {
  const universe = buildTagUniverse([{ tags: ['Літанія', 'Юзаф', ' Марыя'] }]);
  const litany = chooseTags({ kind: 'litany', title: 'Літанія да святога Юзафа', sourceId: 'x', keepTags: ['Юзаф', 'Незнаёмы'] }, universe);
  assert.deepEqual(litany.tags, ['Літанія', 'Юзаф']); assert.deepEqual(litany.proposedNew, []);
  const chaplet = chooseTags({ kind: 'chaplet', title: 'Вяночак да Марыі', sourceId: 'x' }, universe);
  assert.deepEqual(chaplet.proposedNew.map((t) => t.tag), ['Вяночак']); assert.ok(chaplet.tags.includes('Марыя'));
  assert.deepEqual(chooseTags({ kind: 'prayer', title: 'Малітва', sourceId: 'our_father_needs' }, universe).tags, []); // tag does not exist -> not invented
});

function fixtureCorpus() {
  const entries = [
    litanyEntry('lit-new', 'Літанія да св. Антонія', { saint: 'Антоні' }),
    // same shape as lit-new but a different saint: must not be matched to the old Joseph litany by structure alone
    litanyEntry('lit-old', 'Літанія да св. Юзафа'),
    litanyEntry('nov-flag', 'Навэнна да св. Яна', { kind: 'novena', status: 'needs_review' }),
    { ...litanyEntry('week-sunday', 'Нядзеля', { sourceId: 'our_father_weekly', kind: 'other' }), members: ['x'] },
    litanyEntry('rite-1', 'Парадак пакаяння', { sourceId: 'rite_penance', kind: 'ritual', status: 'partial' }),
    litanyEntry('pr-1', 'Малітва ўдзячнасці', { sourceId: 'our_father_weekly', kind: 'prayer' }),
  ];
  return corpusOf(entries);
}
test('plan: every entry gets exactly one route; structure is preserved not created; rites and flagged entries are closed drafts', () => {
  const corpus = fixtureCorpus();
  const old = [oldPrayer('P1', 'Літанія да св. Юзафа', entryToMarkdown(litanyEntry('lit-old', 'Літанія да св. Юзафа')).markdown, { tags: ['Літанія'], priestOnly: false, createdAt: 1 })];
  const plan = planCanonical({ corpus, sources: SOURCES, oldPrayers: old, categories: [] });
  const by = (id) => plan.operations.find((op) => op.sourceEntryId === id);
  assert.equal(plan.operations.length, corpus.index.length);
  assert.equal(by('lit-new').action, 'CREATE'); assert.equal(by('lit-new').targetId, canonId('lit-new'));
  assert.equal(by('lit-old').action, 'REPLACE_KEEP_ID'); assert.equal(by('lit-old').targetId, 'P1'); assert.deepEqual(by('lit-old').oldIds, ['P1']);
  assert.equal(by('week-sunday').action, 'PRESERVE_STRUCTURE'); assert.equal(by('week-sunday').targetId, undefined);
  for (const id of ['nov-flag', 'rite-1']) { assert.equal(by(id).action, 'REVIEW_AMBIGUOUS'); assert.equal(by(id).targetCollection, 'prayerDrafts'); assert.equal(plan.payloads[by(id).targetId].data.status, 'needs_review'); }
  assert.equal(by('rite-1').reason, 'rite_scope');
  for (const op of plan.operations.filter((item) => item.action !== 'PRESERVE_STRUCTURE')) {
    assert.ok(op.source && op.copyrightNotices.length, `source and © on ${op.sourceEntryId}`); assert.equal(op.rightsStatus, 'unconfirmed');
    assert.ok(op.printedPageStart && op.pdfPageStart);
  }
  assert.ok(plan.payloads[canonId('lit-new')].data.source.includes('© Выдавецтва'));
  assert.ok(!('sourceSha256' in plan.payloads[canonId('lit-new')].data)); // no PDF hashes in public documents
  assert.equal(plan.payloads[canonId('nov-flag')].data.sourceSha256.length, 64);
  assert.equal(plan.proposedNewTags.length, 0);
});
test('plan is deterministic (same inputs -> same operations and ids)', () => {
  const a = planCanonical({ corpus: fixtureCorpus(), sources: SOURCES, oldPrayers: [], categories: [] });
  const b = planCanonical({ corpus: fixtureCorpus(), sources: SOURCES, oldPrayers: [], categories: [] });
  assert.deepEqual(a.operations, b.operations);
});
test('rights policy lists every source with a book and © (no empty source)', () => {
  for (const [id, source] of Object.entries(SOURCES_JSON.sources)) assert.ok(source.book && source.copyrightNotices.length, id);
  assert.ok(SOURCES_JSON.rightsNote.includes('not proof'));
});

// Optional full check against the real corpus: PRAYER_IMPORT_OFFICIAL=<extracted dir> npm test (never committed).
const REAL = process.env.PRAYER_IMPORT_OFFICIAL;
test('real corpus: 139 (69+52+18) + 87 prayers + 9 structure + 3 rites, all words survive conversion', { skip: !REAL || !existsSync(REAL) }, () => {
  const corpus = loadOfficialCorpus(REAL);
  const plan = planCanonical({ corpus, sources: SOURCES_JSON, oldPrayers: [], categories: [] });
  const kinds = corpus.index.reduce((acc, m) => ({ ...acc, [m.kind]: (acc[m.kind] || 0) + 1 }), {});
  assert.deepEqual({ litany: kinds.litany, novena: kinds.novena, chaplet: kinds.chaplet, prayer: kinds.prayer, other: kinds.other, ritual: kinds.ritual }, { litany: 69, novena: 52, chaplet: 18, prayer: 87, other: 9, ritual: 3 });
  assert.equal(plan.operations.length, 238);
  assert.equal(plan.counts.PRESERVE_STRUCTURE, 9);
  assert.equal(plan.operations.filter((op) => op.action !== 'PRESERVE_STRUCTURE' && (!op.source || !op.copyrightNotices?.length)).length, 0);
  const norm = (s) => s.replace(/[*\\]/g, '').replace(/(^|\s)\d{1,3}\.\s/g, '$1').replace(/\s+/g, ' ').trim(); // list numbers are markup
  let lost = 0;
  for (const meta of corpus.index.filter((m) => m.kind !== 'other')) {
    const entry = corpus.readEntry(meta);
    const out = norm(prayerMarkdownToPlainText(entryToMarkdown(entry).markdown));
    const src = norm(entry.blocks.filter((b, i) => !(b.type === 'heading' && i < 3 && norm(b.text).toLowerCase() === norm(entry.title).toLowerCase())).map((b) => b.text.replace(/\t/g, ' ')).join(' '));
    if (out !== src) lost += 1;
  }
  assert.ok(lost <= 4, `entries whose words differ after conversion: ${lost}`); // `* * *` separators become a rule
});

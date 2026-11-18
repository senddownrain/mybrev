import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { bogDraftId, BOG_SOURCE_ID, planBogDobry, sentenceCase } from '../scripts/prayer-import/lib/plan-bog.mjs';
import { planCanonical } from '../scripts/prayer-import/lib/plan-canon.mjs';
import { selectOperations } from '../scripts/prayer-import/apply.mjs';
import { entryToMarkdown } from '../scripts/prayer-import/lib/blocks-to-markdown.mjs';
import { loadBogCorpus, loadOfficialCorpus } from '../scripts/prayer-import/lib/corpus.mjs';
import { corpusOf, litanyEntry, SOURCES } from './helpers/prayer-import-fixture.mjs';

const SOURCES_JSON = JSON.parse(readFileSync(new URL('../scripts/prayer-import/sources.json', import.meta.url), 'utf8'));
const bog = (id, type, title, text, extra = {}) => ({ id, sourceId: BOG_SOURCE_ID, type, title, printedHeading: title, language: 'be', status: 'complete', sectionTrail: ['МАЛІТОЎНІК', 'МАЛІТВЫ Ў РОЗНЫХ ПАТРЭБАХ'], pdfPageStart: 40, pdfPageEnd: 41, printedPageStart: 40, printedPageEnd: 41, uncertainties: [],
  blocks: [{ type: 'heading', text: title, runs: [{ text: title, bold: true, color: '#231f20' }], semantic: { level: 2 } }, ...text.split('\n\n').map((t) => ({ type: 'paragraph', text: t, runs: [{ text: t, color: '#231f20' }] })), { type: 'image', text: '', runs: [], semantic: { decorative: true } }], ...extra });
const corpusFrom = (entries) => ({ index: entries.map(({ blocks: _b, ...meta }) => meta), readEntry: (meta) => entries.find((e) => e.id === meta.id) });
const UNIQUE = 'Божа, дабраславі нашы палі і ўсе пасевы; дай нам дажджу ў час і сонца ў час, каб мы елі хлеб удзячна.';

function build(entries, oldPrayers = []) {
  const canonical = planCanonical({ corpus: corpusOf([litanyEntry('lit-1', 'Літанія да св. Юзафа')]), sources: SOURCES, oldPrayers: [], categories: [] });
  return planBogDobry({ corpus: corpusFrom(entries), sources: SOURCES_JSON, canonical, oldPrayers, categories: [{ id: 'c', name: 'У патрэбах', tags: ['У розных патрэбах'] }], sourceSha256: 'a'.repeat(64) });
}
test('excluded groups never become drafts: songs, sections, catechism, offices, front matter, articles, tables, other languages, sacrament orders, misclassified lists', () => {
  const entries = [
    ...['song', 'section', 'catechism', 'office', 'frontmatter', 'article', 'table'].map((type) => bog(`x-${type}`, type, `Тэст ${type}`, 'Тэкст тэксту тэксту')),
    bog('pl-1', 'prayer', 'Modlitwa Pańska', 'Ojcze nasz któryś jest w niebie', { language: 'pl' }),
    bog('la-1', 'prayer', 'Oratio Dominica', 'Pater noster qui es in caelis', { language: 'la' }),
    bog('rite-1', 'rite', 'САКРАМЭНТ ХРОСТУ', 'Парадак хросту дзяцей і дарослых'),
    bog('list-1', 'prayer', 'Абавязковыя святы', 'Усе нядзелі і ўрачыстасці года'),
  ];
  const plan = build(entries);
  assert.equal(plan.counts.EXCLUDE, entries.length);
  assert.deepEqual(Object.keys(plan.payloads), []);
  assert.ok(plan.exclusionReasons['language:pl'] && plan.exclusionReasons['language:la'] && plan.exclusionReasons.rite && plan.exclusionReasons.title);
});
test('unique prayer -> one closed draft with book, pages, tags from existing tags; images skipped; no public document', () => {
  const plan = build([bog('p-1', 'prayer', 'Малітва аб урадлівасці', UNIQUE)], [{ id: 'live-1', title: 'Іншая', text: 'зусім іншы тэкст', tags: ['У розных патрэбах'] }]);
  assert.deepEqual(plan.counts, { EXCLUDE: 0, ALREADY_EXISTS: 0, UNIQUE_DRAFT: 1, REVIEW: 0 });
  const draft = plan.payloads[bogDraftId('p-1')].data;
  assert.equal(draft.status, 'draft'); assert.equal(draft.origin, 'bog_dobry'); assert.equal(draft.rightsStatus, undefined);
  assert.match(draft.sourceBook, /«Бог Добры» \(Пінск, 2022\)/u); assert.equal(draft.printedPageStart, 40); assert.equal(draft.sourceSha256.length, 64);
  assert.ok(draft.copyrightNotices.length >= 1); assert.deepEqual(draft.tags, ['У розных патрэбах']);
  assert.equal(plan.qa.imagesSkipped, 1);
  assert.equal(plan.operations[0].targetCollection, 'prayerDrafts');
});
test('already present (canon text, live prayer, repeated in the book) -> ALREADY_EXISTS, no draft', () => {
  const canonBlock = entryToMarkdown(litanyEntry('lit-1', 'Літанія да св. Юзафа')).markdown;
  const plan = build([
    bog('c-1', 'litany', 'Літанія да св. Юзафа', canonBlock),
    bog('l-1', 'prayer', 'Тое ж самае ў базе', 'Ойча наш які ёсць на небе ды свяціся імя тваё прыйдзі валадарства тваё будзь воля твая'),
    bog('d-1', 'prayer', 'Малітва аб урадлівасці', UNIQUE),
    bog('d-2', 'prayer', 'Малітва аб урадлівасці', UNIQUE),
  ], [{ id: 'live-2', title: 'Ойча наш', text: 'Ойча наш які ёсць на небе ды свяціся імя тваё прыйдзі валадарства тваё будзь воля твая', tags: [] }]);
  const by = (id) => plan.operations.find((op) => op.sourceEntryId === id).action;
  assert.equal(by('c-1'), 'ALREADY_EXISTS'); assert.equal(by('l-1'), 'ALREADY_EXISTS'); assert.equal(by('d-1'), 'UNIQUE_DRAFT'); assert.equal(by('d-2'), 'ALREADY_EXISTS');
  assert.equal(Object.keys(plan.payloads).length, 1);
});
test('uncertain cases become REVIEW drafts (parser flag, similar title, instruction), never silent', () => {
  const plan = build([
    bog('r-1', 'prayer', 'Малітва падзякі', UNIQUE, { status: 'needs_review', uncertainties: [{ reason: 'TOC title differs' }] }),
    bog('r-2', 'devotion', 'Як маліцца на ружанцы', 'Спачатку ўсе пакрыжуюцца'),
    bog('r-3', 'prayer', 'Ойча наш', 'зусім іншы тэкст пра нешта іншае і доўгі такі, каб не супасці з нічым', {}),
  ], [{ id: 'live-3', title: 'Ойча наш', text: 'Ойча наш які ёсць на небе', tags: [] }]);
  assert.deepEqual([plan.counts.REVIEW, plan.counts.UNIQUE_DRAFT], [3, 0]);
  for (const op of plan.operations) { const doc = plan.payloads[op.targetId].data; assert.equal(doc.status, 'draft'); assert.equal(doc.origin, 'disputed'); }
});
test('title case: ALL-CAPS headings become sentence case with sacred names capitalised', () => {
  assert.equal(sentenceCase('НАБАЖЭНСТВА ДА НАЙСВЯЦЕЙШАГА СЭРЦА ПАНА ЕЗУСА'), 'Набажэнства да Найсвяцейшага Сэрца Пана Езуса');
  assert.equal(sentenceCase('Малітва да св. Юзафа'), 'Малітва да св. Юзафа');
});
test('a drafts-only plan can never write public content', () => {
  const plan = { draftsOnly: true, operations: [{ sourceId: 'x', targetId: 'a', targetCollection: 'prayerDrafts' }, { sourceId: 'x', targetId: 'b', targetCollection: 'prayers' }] };
  const { run, skipped } = selectOperations(plan, { x: { confirmedBy: 'owner', basis: 'тэставая пісьмовая згода выдаўца, 2026-11-14' } }, null);
  assert.deepEqual(run.map((op) => op.targetId), ['a']); assert.equal(skipped.length, 1);
});

const REAL = process.env.PRAYER_IMPORT_BOG; const REAL_OFFICIAL = process.env.PRAYER_IMPORT_OFFICIAL;
test('real corpus: 707 entries, 403 candidates, excluded types never drafted', { skip: !REAL || !REAL_OFFICIAL || !existsSync(REAL) }, () => {
  const corpus = loadBogCorpus(REAL);
  assert.equal(corpus.index.length, 707);
  const canonical = planCanonical({ corpus: loadOfficialCorpus(REAL_OFFICIAL), sources: SOURCES_JSON, oldPrayers: [], categories: [] });
  const plan = planBogDobry({ corpus, sources: SOURCES_JSON, canonical, oldPrayers: [], categories: [], sourceSha256: 'a'.repeat(64) });
  assert.equal(Object.values(plan.counts).reduce((a, b) => a + b, 0), 707);
  const drafted = new Set(plan.operations.filter((op) => op.targetId).map((op) => op.type));
  for (const type of ['song', 'section', 'catechism', 'office', 'frontmatter', 'article', 'table']) assert.ok(!drafted.has(type), type);
  assert.ok(plan.operations.filter((op) => op.targetId).every((op) => op.copyrightNotices.length && op.source && op.printedPageStart));
  assert.ok(Object.values(plan.payloads).every((p) => p.data.status !== 'published' && p.collection === 'prayerDrafts'));
});

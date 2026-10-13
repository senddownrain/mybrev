/**
 * Full Lectionary audit: parser patterns of every source class found on
 * Catholic.by, the lossless-parse invariant over the whole crawl, identities,
 * the section comparison, the engine fixes, the resync plan, the admin
 * editors' round trips and the committed reports.
 *
 * The crawl snapshots (reports/lectionary/snapshots, force-added to git) are
 * the fixtures: re-running the crawler with --refresh changes them on purpose.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLectionaryPage, validateParsedPage, headingOf, tokenizeLectionaryHtml } from '../scripts/liturgy/lib/lectionary-parser.mjs';
import { READING_SET_CELEBRATIONS, buildReadingsSetsMigration } from '../scripts/liturgy/lib/readings-sets-plan.mjs';
import { LECTIONARY_PAGES } from '../scripts/liturgy/lib/lectionary-pages.mjs';
import { parseFidelity } from '../scripts/lectionary/lib/fidelity.mjs';
import { pageIdentity, docSelector } from '../scripts/lectionary/lib/identity.mjs';
import {
  compareSections, normalizeCitation, normalizeText, relationOf,
} from '../scripts/lectionary/lib/compare.mjs';
import { expectedPageKey } from '../scripts/lectionary/lib/expected-page.mjs';
import { buildResyncPlan, flatFieldsFromPage, partitionWaves } from '../scripts/lectionary/lib/resync-plan.mjs';
import { isReadingPage } from '../scripts/lectionary/lib/reconcile.mjs';
import { loadPages, pageIdOfUrl } from '../scripts/lectionary/lib/source-pages.mjs';
import { createReadingsRuntime, screenFor } from '../scripts/lectionary/lib/runtime-sim.mjs';
import { resolveLiturgicalDate } from '../src/utils/ordo/index.js';
import { planReadings, selectReadingDocuments } from '../src/utils/ordo/runtime.js';
import { massReadingSetsOf, passionToPlainText, sectionsForCycle } from '../src/utils/massReadingSets.js';
import { buildSetsPayload, createSetsDraft, linkedProjectionUpdates, markupToPassion, passionToMarkup, sanitizeSetsDraft } from '../src/utils/massReadingSetsEditor.js';
import { buildParsedReadingPayload, createParsedReadingDraft } from '../src/utils/parsedReadingEditor.js';
import { sanitizeEditorPreviewHtml } from '../src/utils/editorHtml.js';
import { resolveReadingsScreen } from '../src/utils/readingsScreen.js';
import { sparseUpdatePayload } from '../src/utils/liturgicalEditorSources.js';
import { canonicalJson, collectionDigest } from '../scripts/content/lib/app-content.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNAP = path.join(ROOT, 'reports', 'lectionary', 'snapshots');
const body = (category, id) => fs.readFileSync(path.join(SNAP, category, `${id}.html`), 'utf8');
const parsed = (category, id) => parseLectionaryPage(body(category, id));
const section = (page, predicate) => page.sets.flatMap((set) => set.sections).find(predicate);
const { pages } = loadPages();
const prune = (value) => {
  if (Array.isArray(value)) return value.map(prune);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null && item !== undefined).map(([k, v]) => [k, prune(v)]));
  return value;
};

// ── crawl and inventory ─────────────────────────────────────────────────────

test('the crawl snapshot covers every article of the index (listed + unlisted holes), all HTTP 200', () => {
  const crawl = JSON.parse(fs.readFileSync(path.join(SNAP, '_crawl.json'), 'utf8'));
  const items = Object.values(crawl.items);
  assert.equal(items.length, 617);
  assert.equal(items.filter((item) => item.category !== '_unlisted').length, 599);
  assert.ok(items.every((item) => item.status === 200 && item.error === null && item.sha256));
  assert.deepEqual(crawl.index.categories, ['advent', 'bn', 'post', 'sviaty', 'tryduum', 'urachystasci', 'uspaminy', 'velikodny', 'zvychajny']);
  Object.values(crawl.categories).forEach((category) => assert.equal(category.pagination, 0));
  assert.ok(crawl.holes.probed.includes(4898) && crawl.holes.probed.includes(4984));
  items.forEach((item) => assert.ok(fs.existsSync(path.join(SNAP, item.category || '_root', `${item.id}.html`)), String(item.id)));
});

test('lossless parse: every word of every source article is in the parsed sets (617 pages)', () => {
  const bad = [];
  for (const page of pages.values()) {
    if (!page.parsed || !page.parsed.sets.some((set) => set.sections.some((s) => ['reading', 'gospel'].includes(s.kind)))) continue;
    const fidelity = parseFidelity(page.html);
    if (fidelity.droppedWords || fidelity.extraWords) bad.push(`${page.id}: -${fidelity.droppedWords}/+${fidelity.extraWords} ${JSON.stringify(fidelity.dropped.slice(0, 3))}`);
  }
  assert.deepEqual(bad, []);
});

test('only two reading pages fail the structural validation and each one is a documented source defect', () => {
  const failing = [...pages.values()].filter((page) => isReadingPage(page) && page.errors.length).map((page) => page.id).sort();
  assert.deepEqual(failing, ['4798', '5089']);
  // 4798: the Year II reading has no liturgical title on the page; 5089: the long first reading has no text on the page.
  assert.match(pages.get('4798').errors.join(';'), /no liturgical title/);
  assert.match(pages.get('5089').errors.join(';'), /no text/);
});

// ── parser: one test per source pattern ─────────────────────────────────────

test('pattern: weekday years «Год І / Год ІІ» tag the first reading and psalm, the Gospel is shared', () => {
  const page = parsed('zvychajny', 4616);
  const sections = page.sets[0].sections;
  assert.deepEqual(sections.filter((s) => s.kind === 'reading').map((s) => [s.year, s.bible]), [['1', 'Гбр 1, 1–6'], ['2', '1 Сам 1, 1–8']]);
  assert.deepEqual(sections.filter((s) => s.kind === 'psalm').map((s) => s.year), ['1', '2']);
  assert.equal(sections.find((s) => s.kind === 'gospel').year, undefined);
  assert.ok(sections.filter((s) => s.kind === 'psalm').every((s) => s.verses.every((v) => !/Год\s/.test(v))), 'the «Год ІІ» marker must not leak into the strophes');
});

test('pattern: a second refrain «Або: (Р.: 9а) Рэфрэн: …» is the alternative refrain, never a strophe', () => {
  const psalm = section(parsed('uspaminy', 4939), (s) => s.kind === 'psalm');
  assert.equal(psalm.chorus, 'Благаслаўляць буду Пана ва ўсе часы.');
  assert.equal(psalm.altChorus, 'Пакаштуйце і ўбачце, які добры ёсць Пан.');
  assert.match(psalm.altChorusRef, /9а/);
  assert.ok(psalm.verses.every((verse) => !/^Або/.test(verse)));
});

test('pattern: two refrains printed one after another before the strophes', () => {
  const psalm = section(parsed('uspaminy', 4980), (s) => s.kind === 'psalm');
  assert.equal(psalm.chorus, 'Паглядзі, дачка, і схілі сваё вуха.');
  assert.equal(psalm.altChorus, 'Вось жаніх, выходзьце Хрысту насустрач.');
  assert.match(psalm.verses[0], /^11\./);
});

test('pattern: refrain text repeated between strophes, plain citation lines, «альбо» after the conclusion', () => {
  const page = parsed('uspaminy', 8570);
  const reading = page.sets[0].sections.find((s) => s.kind === 'reading');
  assert.equal(reading.bible, 'Эф 1, 3–6. 11–12');
  assert.equal(reading.alternatives.length, 1);
  assert.equal(reading.alternatives[0].bible, 'Гал 4, 4–7');
  assert.equal(reading.conclusion, 'Гэта слова Божае.');
  const psalm = page.sets[0].sections.find((s) => s.kind === 'psalm');
  assert.equal(psalm.chorus, 'Вялікае ўчыніў мне Усемагутны.');
  assert.equal(psalm.verses.length >= 3, true);
  assert.deepEqual(validateParsedPage(page), []);
});

test('pattern: heading + citation on one line and «або:» + a second heading of the same slot (Mary Mother of the Church)', () => {
  const page = parsed('uspaminy', 8105);
  const reading = page.sets[0].sections.find((s) => s.role === 'reading1');
  assert.equal(reading.bible, 'Быц 3, 9-15. 20');
  assert.deepEqual(reading.alternatives.map((alt) => alt.bible), ['Дз 1, 12-14']);
  assert.equal(page.sets[0].sections.filter((s) => s.role === 'reading1').length, 1);
  assert.equal(page.sets[0].sections.find((s) => s.kind === 'gospel').bible, 'Ян 19, 25-34');
  assert.deepEqual(validateParsedPage(page), []);
  assert.deepEqual(page.warnings, []);
});

test('pattern: long and short first reading (Lent III B): the long form keeps its citation, the short form is an alternative', () => {
  const page = parsed('post', 5089);
  const reading = page.sets[0].sections.find((s) => s.role === 'reading1');
  assert.equal(reading.form, 'long');
  assert.equal(reading.bible, 'Зых 20, 1–17');
  assert.equal(reading.alternatives[0].form, 'short');
  assert.equal(reading.alternatives[0].bible, 'Зых 20, 1-3. 7-8. 12-17');
  assert.ok(reading.alternatives[0].text.length > 300);
  // the page does not print the text of the long form: it is reported, never invented
  assert.equal(reading.text, '');
  assert.ok(validateParsedPage(page).some((error) => /no text/.test(error)));
});

test('pattern: cycle markers «Год А.» (and the missing markers inferred from the table of contents)', () => {
  const holyFamily = parsed('sviaty', 4994);
  assert.deepEqual(holyFamily.sets[0].sections.filter((s) => s.kind === 'gospel').map((s) => [s.cycle, s.bible]), [['A', 'Мц 2, 13–15. 19–23'], ['B', 'Лк 2, 22.39–40'], ['C', 'Лк 2, 41–52']]);
  assert.equal(holyFamily.warnings.length, 2, 'two inferred cycle markers are reported as page defects');
  const baptism = parsed('sviaty', 4996);
  assert.deepEqual(baptism.sets[0].sections.filter((s) => s.kind === 'gospel').map((s) => s.cycle), ['A', 'B', 'C']);
  assert.deepEqual(baptism.warnings, []);
  assert.equal(baptism.sets[0].sections.filter((s) => s.kind === 'gospel' && !s.text).length, 0, 'no empty Gospel section after a marker');
  const transfiguration = parsed('sviaty', 5012);
  assert.deepEqual(transfiguration.sets[0].sections.filter((s) => s.kind === 'gospel').map((s) => [s.cycle, s.bible]), [['A', 'Мц 17, 1–9'], ['B', 'Мк 9, 2–10'], ['C', 'Лк 9, 28b–36']]);
});

test('pattern: preface, collect and a plain summary line before the bold title (22 October)', () => {
  const page = parsed('uspaminy', 4983);
  const set = page.sets[0];
  assert.ok(set.preface.some((line) => /Агульная Імша/.test(line)));
  assert.equal(set.prayers[0].kind, 'collect');
  const reading = set.sections.find((s) => s.kind === 'reading');
  assert.equal(reading.comment, 'Убачаць усе межы зямлі збаўленне Бога нашага.');
  assert.equal(reading.title, '+ Чытанне кнігі прарока Ісаі.');
  assert.deepEqual(validateParsedPage(page), []);
});

test('pattern: a title that is not bold, a divider letter outside the divider span', () => {
  const reading = section(parsed('sviaty', 5020), (s) => s.role === 'reading1');
  assert.equal(reading.title, 'Чытанне кнігі прарока Эзэхіэля.');
  assert.ok(!/^Чытанне/.test(reading.text));
  const page = parsed('sviaty', 5020);
  assert.ok(page.sets[0].sections.every((s) => s.kind !== 'rubric' || s.text.length > 1), 'a lone divider letter is not a rubric');
});

test('pattern: the page repeats «Гэта слова Божае.» inside the text (4690): reported, stripped', () => {
  const page = parsed('zvychajny', 4690);
  const reading = page.sets[0].sections.find((s) => s.role === 'reading2');
  assert.ok(!/Гэта слова/.test(reading.text));
  assert.match(page.warnings.join(';'), /repeats the conclusion/);
});

test('pattern: bold lower-case «Секвенцыя» is a heading (Corpus Christi)', () => {
  const page = parsed('urachystasci', 5035);
  assert.ok(page.sets[0].sections.some((s) => s.kind === 'sequence' && s.text.length > 200));
  assert.equal(headingOf({ text: 'Секвенцыя', bold: true, italic: false, align: null, segments: [] }).kind, 'sequence');
});

test('pattern: several Masses of a page keep their source labels (24.06, 29.06, 15.08, 25.12, All Souls, Palm Sunday)', () => {
  const labels = (category, id) => parsed(category, id).sets.map((set) => set.sourceLabel);
  assert.deepEqual(labels('urachystasci', 5040), ['Імша ў вігілію', 'Імша ўдзень']);
  assert.deepEqual(labels('urachystasci', 5041), ['Імша ў вігілію', 'Імша ўдзень']);
  assert.deepEqual(labels('urachystasci', 5043), ['Імша ў вігілію', 'Імша ўдзень']);
  assert.deepEqual(labels('urachystasci', 5024), ['Імша ўначы', 'Імша на світанні', 'Імша ўдзень']);
  assert.deepEqual(labels('uspaminy', 4972), ['Першая Імша', 'Другая Імша', 'Трэцяя Імша']);
  assert.equal(parsed('post', 5097).sets.length, 2);
});

test('identity: titles of all 617 articles normalize to a liturgical identity (mixed Latin/Cyrillic numerals and typos)', () => {
  const unknown = [...pages.values()].filter((page) => page.identity.kind === 'unknown').map((page) => `${page.id}: ${page.identity.heading}`);
  assert.deepEqual(unknown.filter((line) => !/^(4575|4605|4606|4615|4898|4982|4984|4985|4986|4987|4988|4989|4990|5019|5039|5098|5107|5166):/.test(line)), []);
  assert.equal(pageIdentity('Catholic.by - ХХІ Звычайная нядзеля, Год А').key, 'period:ordinary:w21:d1:cycle=A');
  assert.equal(pageIdentity('Аўторак — дваццаць першы звычайны тыдзень').key, 'period:ordinary:w21:d3');
  assert.equal(pageIdentity('Панядзелак — дзяcяты звычайны тыдзень').key, 'period:ordinary:w10:d2');
  assert.equal(pageIdentity('ІV Нядзеля Адвэнту, Год С').key, 'period:advent:w4:d1:cycle=C');
  assert.equal(pageIdentity('Субота пасля Папяльца').key, 'period:lent:w0:d7');
  assert.equal(pageIdentity('Серада ў актаве Пасхі').key, 'period:easter:w1:d4');
  assert.equal(pageIdentity('15 жніўня — урачыстасць Унебаўзяцця Найсвяцейшай Панны Марыі').key, 'date:15.08:solemnity');
  assert.equal(pageIdentity('2 студзеня — будзень').key, 'date:02.01:weekday');
  assert.equal(pageIdentity('Урачыстасць Найсвяцейшай Тройцы, Год С').key, 'feast:trinity:cycle=C');
  assert.equal(docSelector({ _periodType: 'lent', _periodWeekNumber: 3, _dayOfWeek: 2 }), 'period:lent:w3:d2');
});

test('source duplicates are detected: identical words (5105=5109, 5106=5108) and the same identity under two articles (Christ the King)', () => {
  const words = (id) => pages.get(id).record.wordsSha256;
  assert.equal(words('5105'), words('5109'));
  assert.equal(words('5106'), words('5108'));
  assert.equal(pages.get('4913').identity.key, pages.get('5047').identity.key);
});

// ── comparison ──────────────────────────────────────────────────────────────

test('comparison: typography differences are not differences; words, citations and structure are', () => {
  assert.equal(normalizeText('«Пан» — мой  пастыр…'), '"Пан" - мой пастыр...');
  assert.equal(normalizeCitation('Пс 97 (96), 1 і 2b. 6 і 7с. 9'), normalizeCitation('Пс 97(96),1 і 2b.6 і 7c.9'));
  const expected = [
    { kind: 'reading', role: 'reading1', bible: 'Іс 2, 1–5', title: 'Чытанне.', text: 'Раз два.\n\nТры чатыры.' },
    { kind: 'psalm', role: 'psalm', bible: 'Пс 122', chorus: 'Радуемся.', verses: ['1. А *\nБ', '2. В *\nГ'] },
    { kind: 'gospel', role: 'gospel', bible: 'Мц 8, 5–11', title: '+ Чытанне.', text: 'Евангелле.' },
  ];
  assert.deepEqual(compareSections(expected, JSON.parse(JSON.stringify(expected))), []);
  const broken = JSON.parse(JSON.stringify(expected));
  broken[0].bible = 'Іс 2, 1–6';
  broken[0].text = 'Раз два.';
  broken[1].altChorus = '2. В * Г';
  broken[1].verses = ['1. А * Б'];
  delete broken[2];
  const classes = compareSections(expected, broken.filter(Boolean)).map((d) => d.class);
  assert.ok(classes.includes('WRONG_REFERENCE') && classes.includes('WRONG_TEXT') && classes.includes('MISSING_BLOCK'));
  // same words, different paragraphing: a layout note only
  const layout = JSON.parse(JSON.stringify(expected));
  layout[0].text = 'Раз два. Тры чатыры.';
  assert.deepEqual(compareSections(expected, layout).map((d) => [d.class, d.severity]), [['STRUCTURE_LOSS', 'low']]);
  assert.equal(relationOf('а б в г', 'а б'), 'stored text is a truncated prefix of the source');
  assert.equal(relationOf('а б в г', 'в г'), 'stored text lacks the beginning of the source');
});

test('comparison: the last strophe stored as «altChorus» is a structure error with all words present', () => {
  const expected = [{ kind: 'psalm', role: 'psalm', bible: 'Пс 1', chorus: 'Р.', verses: ['1. а *\nб', '2. в *\nг', '3. д *\nе'] }];
  const stored = [{ kind: 'psalm', role: 'psalm', bible: 'Пс 1', chorus: 'Р.', verses: ['1. а * б 2. в * г'], altChorus: '3. д * е' }];
  const diffs = compareSections(expected, stored);
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].class, 'STRUCTURE_LOSS');
  assert.equal(diffs[0].artifact, 'last strophe stored as the alternative refrain');
});

test('comparison against the Catholic.by page: a legacy document with the typical artifacts is found and fixed by the resync plan, idempotently', () => {
  const page = pages.get('4616');
  const { flat } = flatFieldsFromPage({ year: '1' }, page);
  const legacy = {
    id: 'ordinary-w1-d2--1', year: '1', _periodType: 'ordinary', _periodWeekNumber: 1, _dayOfWeek: 2, _sourceUrl: page.record.url, title: 'Панядзелак', sectionsFound: ['reading1', 'psalm', 'alleluia', 'gospel'],
    ...JSON.parse(JSON.stringify(flat)),
  };
  // production artifacts: title in the text, last strophe in altChorus, drop-cap letter in the citation
  legacy.reading1.text = `${legacy.reading1.comment}${legacy.reading1.title}${legacy.reading1.text}`;
  legacy.psalm.altChorus = legacy.psalm.verses.pop();
  legacy.alleluia = { bible: `${legacy.alleluia.bible} В`, verse: legacy.alleluia.verse.slice(1) };
  const docs = [legacy];
  const findings = [];
  // findings come from the audit comparison; build them the same way the audit does
  return import('../scripts/lectionary/lib/reconcile.mjs').then(({ reconcileDocuments }) => {
    const { findings: found } = reconcileDocuments({ docs, pages });
    findings.push(...found);
    assert.ok(found.some((f) => f.class === 'WRONG_TEXT'));
    assert.ok(found.some((f) => f.class === 'WRONG_REFERENCE' && f.artifact === 'drop-cap letter moved into the citation'));
    const { changes } = buildResyncPlan({ docs, pages, findings });
    assert.equal(changes.length, 1);
    assert.equal(changes[0].after.reading1.text, flat.reading1.text);
    assert.deepEqual(changes[0].after.psalm.verses, flat.psalm.verses);
    assert.equal(changes[0].after.alleluia.bible, flat.alleluia.bible);
    assert.equal(changes[0].after._sourceUrl, page.record.url, 'selectors and links are kept');
    assert.equal(changes[0].after.title, 'Панядзелак');
    // the second run on the fixed document finds nothing
    const fixed = [{ id: legacy.id, ...changes[0].after }];
    const again = reconcileDocuments({ docs: fixed, pages });
    assert.deepEqual(again.findings.filter((f) => f.severity !== 'low'), []);
    assert.deepEqual(buildResyncPlan({ docs: fixed, pages, findings: again.findings }).changes, []);
  });
});

test('a weekday-year-2 document that carries the first reading of year 1 is a WRONG_CYCLE, not a typo', async () => {
  const { reconcileDocuments } = await import('../scripts/lectionary/lib/reconcile.mjs');
  const page = pages.get('4616');
  const year1 = flatFieldsFromPage({ year: '1' }, page).flat;
  const year2 = flatFieldsFromPage({ year: '2' }, page).flat;
  assert.notEqual(year1.reading1.bible, year2.reading1.bible);
  const wrong = { id: 'ordinary-w1-d2--2', year: '2', _periodType: 'ordinary', _periodWeekNumber: 1, _dayOfWeek: 2, _sourceUrl: page.record.url, ...JSON.parse(JSON.stringify(year2)), reading1: JSON.parse(JSON.stringify(year1.reading1)) };
  const right = { ...JSON.parse(JSON.stringify(wrong)), id: 'ordinary-w1-d2--1b', year: '2', reading1: JSON.parse(JSON.stringify(year2.reading1)) };
  const classes = (doc) => reconcileDocuments({ docs: [doc], pages }).findings.filter((f) => f.severity !== 'low').map((f) => `${f.class}:${f.field}`);
  assert.deepEqual(classes(right), []);
  assert.ok(classes(wrong).includes('WRONG_CYCLE:bible'));
  assert.ok(classes(wrong).includes('WRONG_CYCLE:text'));
});

test('resync waves stay under the manifest patch limits', () => {
  const changes = Array.from({ length: 321 }, (_, i) => ({ id: `d${i}`, classes: i % 3 ? ['WRONG_TEXT'] : ['WRONG_REFERENCE'] }));
  const waves = partitionWaves(changes);
  const bySize = waves.reduce((acc, c) => { acc[c.wave] = (acc[c.wave] || 0) + 1; return acc; }, {});
  assert.deepEqual(bySize, { 1: 150, 2: 150, 3: 21 });
  assert.ok(Object.values(bySize).every((n) => n <= 300 && n < 0.25 * 822));
  assert.equal(waves[0].classes[0], 'WRONG_TEXT', 'the most serious documents go first');
});

// ── engine ──────────────────────────────────────────────────────────────────

const optionOf = (iso, diocese = 'minsk-mohilev') => resolveLiturgicalDate(iso, { country: 'BY', diocese });

test('engine: a Sunday inside the date-keyed windows reads the Sunday lectionary documents', () => {
  const advent4 = optionOf('2025-12-21').candidates.find((c) => c.kind === 'temporal');
  assert.deepEqual(advent4.readingsRef, { _periodType: 'advent', _periodWeekNumber: 4, _dayOfWeek: 1 });
  const christmas2 = optionOf('2026-01-04').candidates.find((c) => c.kind === 'temporal');
  assert.deepEqual(christmas2.readingsRef, { _periodType: 'christmas', _periodWeekNumber: 2, _dayOfWeek: 1 });
  // weekdays of the same windows keep the date documents
  assert.deepEqual(optionOf('2025-12-22').candidates.find((c) => c.kind === 'temporal').readingsRef, { _date: '22.12', dateOnly: true });
  assert.deepEqual(optionOf('2026-01-05').candidates.find((c) => c.kind === 'temporal').readingsRef, { _date: '05.01', dateOnly: true });
  // III Sunday of Advent on the 17th (2028)
  assert.equal(optionOf('2028-12-17').candidates.find((c) => c.kind === 'temporal').readingsRef._periodType, 'advent');
});

test('engine: independent oracle of the page identity of temporal options', () => {
  assert.equal(expectedPageKey(optionOf('2025-12-21')), 'period:advent:w4:d1:cycle=A');
  assert.equal(expectedPageKey(optionOf('2025-12-22')), 'date:22.12:advent-weekday');
  assert.equal(expectedPageKey(optionOf('2026-03-02')), 'period:lent:w2:d2');
  assert.equal(expectedPageKey(optionOf('2026-10-14')), 'period:ordinary:w28:d4');
  assert.equal(expectedPageKey(optionOf('2026-10-11')), 'period:ordinary:w28:d1:cycle=A');
  assert.equal(expectedPageKey(optionOf('2026-04-08')), 'period:easter:w1:d4');
});

test('engine: on a Sunday 24 December the Christmas Vigil Mass is a lookup of the option (evening default)', () => {
  const plan = planReadings(optionOf('2028-12-24'), {});
  assert.deepEqual(plan.options[0].lookup.map((entry) => entry.where), [
    { _periodType: 'advent', _periodWeekNumber: 4, _dayOfWeek: 1 },
    { _date: '24.12', dateOnly: true, _variant: 'christmas-vigil' },
  ]);
  const weekday = planReadings(optionOf('2027-12-24'), {});
  assert.equal(weekday.options[0].lookup.length, 1);
  const docs = [
    { id: 'advent-w4-d1--A', _periodType: 'advent', _periodWeekNumber: 4, _dayOfWeek: 1, year: 'A', reading1: { bible: 'Іс 7', text: 'Тэкст чытання дня A' }, gospel: { bible: 'Мц 1', text: 'Тэкст чытання дня A' } },
    { id: 'advent-w4-d1--B', _periodType: 'advent', _periodWeekNumber: 4, _dayOfWeek: 1, year: 'B', reading1: { bible: '2 Сам 7', text: 'Тэкст чытання дня B' }, gospel: { bible: 'Лк 1', text: 'Тэкст чытання дня B' } },
    { id: 'advent-24-12', _date: '24.12', reading1: { bible: 'weekday', text: 'Тэкст чытання будняга' }, gospel: { bible: 'weekday', text: 'Тэкст чытання будняга' }, massReadings: { schema: 1, sets: [{ id: 'morning', label: 'm', context: 'morning', sections: [{ kind: 'gospel', role: 'gospel', bible: 'x', text: 'x' }] }, { id: 'vigil', label: 'v', context: 'vigil', sections: [{ kind: 'gospel', role: 'gospel', bible: 'y', text: 'y' }] }] } },
    { id: 'advent-24-12--christmas-vigil', _date: '24.12', _variant: 'christmas-vigil', gospel: { bible: 'Мц 1, 1–25', text: 'Тэкст чытання вігіліі' }, reading1: { bible: 'Іс 62', text: 'Тэкст чытання вігіліі' }, _massReadingsRef: { doc: 'advent-24-12', set: 'vigil', projected: true } },
  ];
  const runtime = createReadingsRuntime(docs);
  const loaded = runtime.load('2028-12-24', 'minsk-mohilev');
  const ids = loaded.items.map((doc) => doc.id).sort();
  assert.deepEqual(ids, ['advent-24-12--christmas-vigil', 'advent-w4-d1--A', 'advent-w4-d1--B']);
  assert.equal(selectReadingDocuments({ where: { _date: '24.12', _variant: 'christmas-vigil' }, purpose: 'weekday' }, {}, docs).length, 1);
  const screen = screenFor(loaded, {});
  assert.equal(screen.groups.length, 2);
  assert.equal(screen.activeGroup.documents[0].id, 'advent-24-12--christmas-vigil', 'the evening Mass is the default group');
  const sunday = screenFor(loaded, { option: 'temporal:advent-w4-d1' });
  assert.ok(sunday.activeReading);
});

test('the Readings screen is a pure module: cycle documents, sets and the route query', () => {
  const docs = ['A', 'B', 'C'].map((year) => ({ id: `feast-x--${year}`, _feast: 'feast-x', year, title: 'X', gospel: { bible: year } }));
  const state = resolveReadingsScreen({ items: docs, context: { sundayCycle: 'B', cycle: '1' }, query: {} });
  assert.equal(state.activeReading.id, 'feast-x--B');
  assert.equal(resolveReadingsScreen({ items: docs, context: { sundayCycle: 'B' }, query: { year: 'C' } }).activeReading.id, 'feast-x--C');
  const canonical = { id: 'doc', title: 'D', massReadings: { schema: 1, sets: [
    { id: 'vigil', label: 'v', context: 'vigil', sections: [{ kind: 'gospel', role: 'gospel', bible: 'a', text: 'Тэкст чытання дня A' }] },
    { id: 'day', label: 'd', context: 'day', default: true, sections: [{ kind: 'gospel', role: 'gospel', bible: 'b', text: 'Тэкст чытання дня B' }] }] } };
  assert.equal(resolveReadingsScreen({ items: [canonical], query: {} }).activeSet.id, 'day');
  assert.equal(resolveReadingsScreen({ items: [canonical], query: { set: 'vigil' } }).activeSet.id, 'vigil');
});

// ── migration plan extensions found by the audit ────────────────────────────

test('the sets migration covers 24.06 (vigil + day, day default) and the Transfiguration (A/B/C Gospels)', () => {
  const fixtures = Object.fromEntries(LECTIONARY_PAGES.map((page) => [page.key, fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'catholicby', `${page.key}.html`), 'utf8')]));
  const docs = new Map();
  READING_SET_CELEBRATIONS.forEach((celebration) => { if (!celebration.create) docs.set(celebration.doc, { title: celebration.key }); (celebration.linked || []).forEach((link) => docs.set(link.doc, { title: link.doc })); });
  const migration = buildReadingsSetsMigration({ docs, pages: fixtures });
  assert.deepEqual(migration.warnings, []);
  const john = migration.changes.find((change) => change.id === '24-06-nativity-john-baptist').after;
  assert.deepEqual(massReadingSetsOf(john).map((set) => [set.id, set.label, Boolean(set.default)]), [['vigil', 'Св. Імша ў вігілію', false], ['day', 'Св. Імша ўдзень', true]]);
  const tr = migration.changes.find((change) => change.id === '06-08-transfiguration-lord').after;
  const set = massReadingSetsOf(tr)[0];
  assert.deepEqual(sectionsForCycle(set, 'B').filter((s) => s.kind === 'gospel').map((s) => s.bible), ['Мк 9, 2–10']);
  assert.equal(tr.gospel.bible, 'Мц 17, 1–9', 'released apps keep the Gospel of year A in the flat fields');
});

// ── admin editors ───────────────────────────────────────────────────────────

test('legacy editor: every page-derived flat document round-trips unchanged (600 reading pages)', () => {
  let checked = 0;
  for (const page of pages.values()) {
    if (!page.parsed || page.parsed.sets.length !== 1 || page.errors.some((e) => !/no liturgical title/.test(e))) continue;
    const { flat } = flatFieldsFromPage({ year: '' }, page);
    if (!flat?.reading1 || !flat.gospel) continue;
    const doc = { title: page.record.title, year: null, _date: '01.01', ...JSON.parse(JSON.stringify(flat)), sectionsFound: Object.keys(flat) };
    const payload = buildParsedReadingPayload(createParsedReadingDraft(doc), doc);
    // the editor writes explicit nulls (`altChorus: null`): equal once nulls are dropped
    assert.equal(canonicalJson(prune(payload)), canonicalJson(prune(doc)), page.id);
    checked += 1;
  }
  assert.ok(checked > 400, `checked ${checked}`);
});

test('legacy editor keeps unknown fields of sections, alternatives, psalm, alleluia and sequence; null Lent week stays null', () => {
  const doc = {
    title: 'T', year: null, _periodType: 'lent', _periodWeekNumber: null, _dayOfWeek: 5, futureField: { a: 1 },
    reading1: { bible: 'Іс 1', comment: 'c', title: 't', text: 'x', form: 'long', conclusion: 'Гэта слова Божае.', rubrics: ['r'], alternatives: [{ bible: 'Іс 2', comment: 'c2', title: 't2', text: 'y', form: 'short', extra: true }] },
    psalm: { bible: 'Пс 1', chorus: 'R', altChorus: 'R2', altChorusRef: '(Р.: 9а)', verses: ['1. а'], futureP: 1 },
    alleluia: { bible: 'Мк 1', verse: 'v', acclamation: 'Аллелюя', futureA: 1 },
    sequence: { text: 's', labelled: true },
    gospel: { bible: 'Мц 1', comment: 'c', title: 't', text: 'g', conclusion: 'Гэта слова Пана.', passion: { blocks: [{ type: 'paragraph', runs: [{ role: 'narrator', text: 'n' }] }] } },
  };
  const payload = buildParsedReadingPayload(createParsedReadingDraft(doc), doc);
  assert.equal(canonicalJson(payload), canonicalJson(doc));
  assert.equal(payload._periodWeekNumber, null);
});

test('sets editor: canonical documents round-trip with roles, cycles, ordered sections, rubrics, reference-only and unknown fields', () => {
  const fixtures = Object.fromEntries(LECTIONARY_PAGES.map((page) => [page.key, fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'catholicby', `${page.key}.html`), 'utf8')]));
  const docs = new Map();
  READING_SET_CELEBRATIONS.forEach((celebration) => { if (!celebration.create) docs.set(celebration.doc, { title: celebration.key, keepMe: 'unknown' }); (celebration.linked || []).forEach((link) => docs.set(link.doc, { title: link.doc })); });
  const migration = buildReadingsSetsMigration({ docs, pages: fixtures });
  let withPassion = 0;
  let withCycles = 0;
  let referenceOnly = 0;
  for (const change of migration.changes) {
    const doc = JSON.parse(JSON.stringify(change.after));
    if (!doc.massReadings) continue;
    // unknown fields at every level
    doc.futureDoc = 1;
    doc.massReadings.futureRoot = { x: 1 };
    doc.massReadings.sets.forEach((set) => { set.futureSet = 'k'; set.sections.forEach((s) => { s.futureSection = 'k'; if (s.alternatives) s.alternatives.forEach((a) => { a.futureAlt = 1; }); }); });
    const payload = buildSetsPayload(doc, createSetsDraft(doc));
    assert.equal(canonicalJson(payload.massReadings), canonicalJson(doc.massReadings), change.id);
    assert.equal(payload.futureDoc, 1);
    for (const set of doc.massReadings.sets) {
      if (set.referenceOnly) referenceOnly += 1;
      if (set.sections.some((s) => s.cycle)) withCycles += 1;
      for (const s of set.sections) if (s.passion) {
        withPassion += 1;
        const again = markupToPassion(passionToMarkup(s.passion));
        assert.equal(canonicalJson(again), canonicalJson(s.passion), `${change.id}/${set.id}/${s.cycle}`);
        assert.ok(passionToPlainText(s.passion).length > 500);
      }
    }
  }
  assert.ok(withPassion >= 4 && withCycles >= 4 && referenceOnly >= 4, `${withPassion}/${withCycles}/${referenceOnly}`);
});

test('sets editor: sanitizing a draft keeps new source fields (year, form, altChorusRef, prayers, preface) and drops markup', () => {
  const draft = { schema: 1, flatSet: 'mass', sets: [{ id: 'mass', label: 'm', prayers: [{ kind: 'collect', text: 'c' }], preface: ['p'], sections: [
    { kind: 'psalm', role: 'psalm', year: '1', bible: 'Пс 1', chorus: '<b>R</b>', altChorus: 'R2', altChorusRef: '(Р.: 9а)', verses: ['<script>x</script>1. а'] },
    { kind: 'reading', role: 'reading1', form: 'long', bible: 'Іс 1', text: '<p onclick="x">T</p>', title: 't', comment: 'c', alternatives: [{ bible: 'Іс 2', form: 'short', text: 'y', title: 't' }] }] }] };
  const clean = sanitizeSetsDraft(draft);
  const [psalm, reading] = clean.sets[0].sections;
  assert.equal(psalm.year, '1');
  assert.equal(psalm.altChorusRef, '(Р.: 9а)');
  assert.equal(psalm.chorus, 'R');
  assert.deepEqual(psalm.verses, ['1. а']);
  assert.equal(reading.form, 'long');
  assert.equal(reading.alternatives[0].form, 'short');
  assert.equal(reading.text, '<p>T</p>');
  assert.deepEqual(clean.sets[0].preface, ['p']);
  assert.equal(clean.sets[0].prayers[0].kind, 'collect');
});

test('sets editor: a linked projection follows its set; a non-projected legacy mix is left alone', () => {
  const draft = { schema: 1, sets: [{ id: 'mass', label: 'm', sections: [{ kind: 'gospel', role: 'gospel', cycle: 'A', bible: 'Мц 27', text: 'Тэкст чытання дня A' }, { kind: 'gospel', role: 'gospel', cycle: 'B', bible: 'Мк 15', text: 'Тэкст чытання дня B' }] }] };
  const updates = linkedProjectionUpdates(draft, [
    { id: 'x--A', _massReadingsRef: { doc: 'x', set: 'mass', cycle: 'A', projected: true }, keepMe: 1 },
    { id: 'x--procession', _massReadingsRef: { doc: 'x', set: 'procession', projected: false } },
  ]);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].data.gospel.bible, 'Мц 27');
  assert.equal(updates[0].data.keepMe, 1);
});

test('InlineEditor preview is sanitized (formatting survives, scripts/handlers/frames/unsafe URLs do not); cancel never writes the model', () => {
  const dirty = '<p style="color: #ff0000; position: fixed; background: url(x)">A <b>b</b><script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">l</a><a href="https://catholic.by/x">ok</a></p><iframe src="//evil"></iframe>';
  const clean = sanitizeEditorPreviewHtml(dirty);
  assert.ok(/<p style="color: #ff0000">/.test(clean));
  assert.ok(!/script|iframe|onerror|javascript:|<img|position|url\(/i.test(clean), clean);
  assert.ok(/<a href="https:\/\/catholic\.by\/x" rel="noopener noreferrer" target="_blank">ok<\/a>/.test(clean));
  assert.equal(sanitizeEditorPreviewHtml('plain text'), 'plain text');
  const vue = fs.readFileSync(path.join(ROOT, 'src', 'components', 'admin', 'InlineEditor.vue'), 'utf8');
  assert.match(vue, /v-html="safePreview"/);
  assert.ok(!/v-html="previewValue"/.test(vue));
  const cancel = /const cancelEditing = \(\) => \{([\s\S]*?)\};/.exec(vue)[1];
  assert.ok(!/modelValue\.value\s*=/.test(cancel), 'cancel must not assign the model');
});

test('DayEditor: a sparse Proper is written as a difference only (unknown fields untouched), a full day with merge', () => {
  const original = { laudesHymn: 'a', unknownField: { keep: true }, _fieldRules: { x: 1 } };
  const edited = { ...original, laudesHymn: 'b' };
  assert.deepEqual(sparseUpdatePayload(original, edited, ['laudesHymn', 'vespersHymn']), { set: { laudesHymn: 'b' }, remove: [] });
  assert.deepEqual(sparseUpdatePayload(original, { ...original, laudesHymn: '' }, ['laudesHymn']), { set: {}, remove: ['laudesHymn'] });
  assert.deepEqual(sparseUpdatePayload(original, original, ['laudesHymn']), { set: {}, remove: [] });
  const vue = fs.readFileSync(path.join(ROOT, 'src', 'views', 'admin', 'DayEditor.vue'), 'utf8');
  assert.match(vue, /batch\.set\(targetRef, dayPayload, \{ merge: !isNew\.value \}\)/);
});

// ── committed reports and safety ────────────────────────────────────────────

const report = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, 'reports', 'lectionary', name), 'utf8'));

test('reports: counts are consistent with each other and never claim completeness while mismatches exist', () => {
  const inventory = report('source-inventory.json');
  const coverage = report('coverage.json');
  const discrepancies = report('discrepancies.json');
  const drift = report('publication-drift.json');
  const contract = report('flutter-export-contract.json');
  assert.equal(inventory.pages.length, inventory.totals.articles);
  assert.equal(inventory.totals.articles, 617);
  assert.equal(coverage.sources.articles, inventory.totals.articles);
  assert.equal(discrepancies.items.length, discrepancies.summary.total);
  assert.equal(new Set(discrepancies.items.map((item) => item.id)).size, discrepancies.items.length);
  assert.ok(discrepancies.items.every((item) => discrepancies.classes.includes(item.class) && item.resolution?.status));
  const mismatches = coverage.plannedVerification.mismatch || 0;
  assert.equal(coverage.complete, mismatches === 0 && !coverage.sources.readingPagesWithoutDocument.some((p) => !p.duplicateOf && !p.sameIdentityAs));
  assert.ok(coverage.sections.totals.exact <= coverage.sections.totals.checked);
  assert.ok(coverage.sections.totals.citationsExact <= coverage.sections.totals.citations);
  assert.equal(coverage.planned.years.join('-'), '2025-2035');
  assert.equal(coverage.planned.dateDioceseCombinations, 4017 * 4);
  assert.equal(drift.driftTable.length, 11);
  assert.ok(drift.snapshot.readOnly);
  // the contract hash recomputes from its own content
  const { hashes } = contract;
  assert.equal(typeof hashes.contract, 'string');
  assert.ok(contract.documents.length > 800);
  assert.equal(collectionDigest(Object.fromEntries(contract.documents.map((d) => [d.id, d.hash]))), hashes.documents);
  assert.equal(contract.dataset.digest, hashes.documents, 'the dataset revision is the digest of the per-document hashes');
  assert.ok(contract.documents.every((d) => d.kind !== 'canonical' || d.sets.every((s) => s.sections.every((x) => /^[0-9a-f]{16}$/.test(x.hash)))));
  assert.ok(contract.edgeCases.length >= 8);
});

test('safety: the audit and its analysis scripts are read-only; only resync-readings.mjs --apply can write, behind guards', () => {
  const dir = path.join(ROOT, 'scripts', 'lectionary');
  const files = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((entry) => (entry.isDirectory() ? walk(path.join(d, entry.name)) : files.push(path.join(d, entry.name))));
  walk(dir);
  const writers = files.filter((file) => /\.(set|update|create|delete|commit)\(/.test(fs.readFileSync(file, 'utf8').replace(/fs\.write\w*\(|new Set\(|Map\.set|\.set\(\s*(key|id|k)\b/g, '')) && /firebase-admin|firestore\(/.test(fs.readFileSync(file, 'utf8')));
  // the only writer is the guarded wave applier (lib/apply-wave.mjs), reachable only from resync-readings.mjs --apply
  assert.deepEqual(writers.map((file) => path.relative(ROOT, file).replaceAll('\\', '/')), ['scripts/lectionary/lib/apply-wave.mjs', 'scripts/lectionary/resync-readings.mjs']); // the CLI only calls app.delete() and the applier
  const resync = fs.readFileSync(path.join(dir, 'resync-readings.mjs'), 'utf8');
  assert.match(resync, /if \(!flag\('--apply'\)\)/);
  assert.match(resync, /reviewed plan/);
  assert.ok(!/\.(set|update|create|add)\(/.test(resync.replace(/firestore\.settings\(/g, '').replace(/new Set\(|\.set\(/g, '')), 'the CLI itself writes nothing');
  assert.match(resync, /'backups', 'lectionary-apply'/);
  const applier = fs.readFileSync(path.join(dir, 'lib', 'apply-wave.mjs'), 'utf8');
  assert.match(applier, /lastUpdateTime/);
  assert.match(applier, /refusing to re-apply/);
  assert.ok(!/\.set\(\{|\.delete\(\)|collection\([^)]*\)\.add\(/.test(applier.replace(/tx\.set\(ref, decodeValue/g, '').replace(/FieldValue\.delete\(\)/g, '')), 'no document set/delete/add outside the restore transaction');
  const audit = fs.readFileSync(path.join(ROOT, 'scripts', 'lectionary', 'audit.mjs'), 'utf8');
  assert.ok(!/firebase-admin|--apply/.test(audit));
  // the liturgy:audit pipeline never calls a Firestore writer
  const pipeline = fs.readFileSync(path.join(ROOT, 'scripts', 'liturgy', 'audit.mjs'), 'utf8');
  for (const [, script] of pipeline.matchAll(/'(scripts\/[^']+\.mjs)'/g)) {
    const source = fs.readFileSync(path.join(ROOT, script), 'utf8');
    assert.ok(!/--apply/.test(pipeline) && !/\.(set|update|create|delete)\(\s*[a-zA-Z.]*ref|batch\.(set|update)|collection\([^)]*\)\.doc\([^)]*\)\.set\(/.test(source) || /--apply|options\.apply/.test(source), script);
  }
});

test('the content of pageIdOfUrl and the snapshot loader', () => {
  assert.equal(pageIdOfUrl('https://catholic.by/3/liturgy/lectionary/urachystasci/5043-15-zhniunya-urachystasts'), '5043');
  assert.equal(pageIdOfUrl('https://catholic.by/3/liturgy/lectionary/bn/4564-2-studzenya-budzen?layout=edit'), '4564');
  assert.equal(pageIdOfUrl('https://old.catholic.by/2/liturgy/lectionary/liturgia-velikodny/103542.html'), '');
  assert.ok(tokenizeLectionaryHtml('<b>ПЕРШАЕ ЧЫТАННЕ</b>').length === 1);
});

test('reports: the published data were verified after the write (apply record, memorial classification, post-write verification)', () => {
  const read = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, 'reports', 'lectionary', name), 'utf8'));
  const record = read('apply-record.json');
  assert.equal(record.waves.reduce((sum, wave) => sum + wave.documents, 0), 324);
  assert.deepEqual(record.waves.map((wave) => wave.documents), [150, 150, 21, 3]);
  record.waves.forEach((wave) => assert.match(wave.manifestVerdict, /^SAFE CONTENT PATCH/));
  assert.ok(record.flutterDelivery.bundle20261007.changedAfterAllWaves <= record.flutterDelivery.bundle20261007.threshold, 'the oldest bundle still receives a patch, not a rebuild');
  const applied = read('resync-plan.applied.json');
  assert.equal(applied.totals.changes, 324);
  const verification = read('published-verification.json');
  assert.equal(verification.diocesan.policyScenarios.ok, verification.diocesan.policyScenarios.total);
  assert.deepEqual(verification.lostSections.missingBlockFindings.map((row) => row[0]), ['lent-w3-d1--B'], 'the only lost block is the documented source defect');
  assert.equal(verification.sequences.allPresent, true);
  assert.equal(verification.passion.roleOrTextFindings, 0);
  assert.deepEqual(verification.materialFindingsLeft, ['christmas-05-01--sunday', 'lent-w3-d1--B']);
  const memorials = read('memorials.json');
  assert.equal(memorials.celebrations, memorials.rows.length);
  assert.equal(memorials.byClass['proper-prescribed'] + memorials.byClass['proper-prescribed-document-missing'], 12, 'prescribed memorials of the closed list that the engine offers');
  assert.equal(read('pending-authorization.json').plans.every((plan) => ['NEEDS_AUTHORIZATION', 'DECISION_NEEDED'].includes(plan.status)), true);
});

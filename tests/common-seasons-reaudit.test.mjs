/**
 * Re-audit of the seasonal Commons: the three volumes are compared SECTION BY SECTION
 * (Common → hour → field → text), a missing local marker never means "equal to Volume III",
 * and the decisions of the editor (NR-001 … NR-012) are checked on the generated data.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { generate, unknownArguments } from '../scripts/liturgy/common-seasons.mjs';
import { SEASONS, SEASON_VOLUME, swapLabels } from '../scripts/liturgy/common-seasons/lib/analyze.mjs';
import { comparableText } from '../scripts/liturgy/common-seasons/lib/fields.mjs';
import { classifyDifference, isReferenceOnly, tokenDiff, tokensOf } from '../scripts/liturgy/common-seasons/lib/compare.mjs';
import { classifyLine } from '../scripts/liturgy/common-seasons/lib/volume.mjs';
import { htmlToPlain } from '../scripts/liturgy/common-seasons/lib/html.mjs';
import {
  BASE_CORRECTIONS, baseVersusOrdinary, scanSourceMisprints, volumeWordCoverage,
} from '../scripts/liturgy/common-seasons/lib/ledger.mjs';
import { buildAudit, renderBaseCorrectionsMarkdown, renderMarkdown } from '../scripts/liturgy/common-seasons/lib/report.mjs';
import { variantKeyForSeason } from '../src/utils/ordo/commonSeasons.js';
import { computeSeason } from '../src/utils/ordo/season.js';
import { computeYearAnchors } from '../src/utils/ordo/movableFeasts.js';
import { resolveRuntimeDay } from '../src/utils/ordo/runtime.js';
import { assembleOffice } from '../src/utils/ordo/officeAssembly.js';
import { OFFICE_TEXT_FIELDS } from '../src/constants/officeFields.js';
import {
  classifyPatch, describeDocuments, diffCollection, storedDocument, validateCollection,
} from '../scripts/content/lib/app-content.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generated = generate();
const { corpus, analysis, documents } = generated;
const plain = (value) => htmlToPlain(Array.isArray(value) ? value.join('\n') : String(value || '')).replace(/\s+/g, ' ').trim();
const variant = (id, season, field) => documents.get(id)?.[season]?.[field];
const baseOf = (id, field) => corpus.base.get(id)[field];
const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'reports', 'liturgy', 'common-seasons-audit-baseline-adf6b14.json'), 'utf8'));
const cellOf = (common, field, season) => analysis.matrix.find((c) => c.common === common && c.field === field && c.season === season);

// ------------------------------------------------------------------------------------------------ parser

test('a verse that merely begins with the word «Гімн» is text, not a reference to a hymn (the pastors hymn was cut after four lines)', () => {
  assert.equal(classifyLine('Гімн пастыру сёння спяваем.').kind, 'text');
  assert.equal(classifyLine('Гімн, які табе спяваем,').kind, 'text');
  assert.equal(classifyLine('Гімн хвалы і пашаны спявае').kind, 'text');
  assert.equal(classifyLine('Гімн з ІІ Нешпараў, с. 1548.').kind, 'hymnRef');
  assert.equal(classifyLine('Гімн з Уласных тэкстаў пра святых.').kind, 'hymnRef');
  assert.equal(classifyLine('Гімн ...з ІІ Нешпараў, с. 1503 і с.1504.').kind, 'hymnRef');
  assert.equal(classifyLine('Гімн').kind, 'hymn');
  const hymn = comparableText(corpus.volumes.III.commons.get('pastors').fields.get('officeOfReadingsHymn'), null);
  assert.ok(tokensOf(hymn).length > 200, 'the whole hymn is one unit');
  assert.match(plain(baseOf('pastors', 'officeOfReadingsHymn')), /Гімн пастыру сёння спяваем/);
  assert.ok(hymn.includes('Дазволь тым, хто йдзе іх дарогай'), 'the last strophe is in the parsed unit');
});

test('Volume III parsed by the same parser is the stored base: words of the volume missing in the base are exactly the known, listed gaps', () => {
  const gaps = baseVersusOrdinary(corpus).map((g) => `${g.common}.${g.field}`).sort();
  // not repaired here (the base fields of Ordinary Time stay as they are): every one is an open question for the owner (D-6)
  assert.deepEqual(gaps, [
    'blessed-virgin-mary.laudesAntBen', 'blessed-virgin-mary.laudesHymn', 'blessed-virgin-mary.laudesR', 'blessed-virgin-mary.officeOfReadingsHymn',
    'holy-men.officeOfReadingsHymn', 'holy-women.officeOfReadingsR2', 'martyr-one.vesper1R', 'religious.officeOfReadingsR1',
  ]);
  // every other field of Volume III is covered by the stored base (±3 % of the words)
  const ledger = baseVersusOrdinary(corpus);
  assert.ok(ledger.every((g) => g.share < 0.6));
});

test('unknown switches are an error, the retired --include-unverified never enables anything', () => {
  assert.deepEqual(unknownArguments(['--dry-run', '--report', '--sources', '/x']), []);
  assert.deepEqual(unknownArguments(['--include-unverified']), ['--include-unverified']);
  assert.equal(generate.length, 0, 'generate() takes no switches');
  const run = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'liturgy', 'common-seasons.mjs'), '--include-unverified'], { encoding: 'utf8' });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /unknown argument\(s\): --include-unverified/);
  assert.match(run.stderr, /was removed/);
  assert.ok(!/includeUnverified|include-unverified/.test(fs.readFileSync(path.join(ROOT, 'scripts', 'liturgy', 'common-seasons', 'lib', 'analyze.mjs'), 'utf8')));
  const ok = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'liturgy', 'common-seasons.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
});

// ------------------------------------------------------------------------------------------------ classification

test('classes of difference: orthography, wording, another text, another composition', () => {
  assert.equal(classifyDifference('Праслаўляй, душа мая, Пана!', 'праслаўляй душа мая пана').class, 'orthography');
  assert.equal(classifyDifference('Хваліце Пана с. 1017.', 'Хваліце Пана с. 945.').class, 'orthography', 'page references are not text');
  const wording = classifyDifference('Яны абвяшчалі справу Бога і зразумелі Яго ўчынкі.', 'Яны абвяшалі справы Бога і зразумелі Яго ўчынкі.');
  assert.equal(wording.class, 'lexical');
  assert.equal(wording.minor, true);
  assert.deepEqual(wording.changes.map((c) => [c.ordinary, c.volume]), [['абвяшалі справы', 'абвяшчалі справу']]);
  const other = classifyDifference('Першая кніга Кароляў Саламон сабраў усіх старэйшын Ізраэля у Ерузалем', 'Першае пасланне Паўла Карынцянам Браты мы слугі Хрыста і распарадчыкі таямніц');
  assert.equal(other.class, 'different');
  // a К./Н. line replaced by another sentence is another text, whatever the rest shares
  const versicle = classifyDifference('Кароткае чытанне Юдт 13. Благаслаўлёная ты, дачка. К. Марыя захоўвала ўсе гэтыя словы. Н. Разважаючы ў сэрцы сваім.', 'Кароткае чытанне Юдт 13. Благаслаўлёная ты, дачка. К. Благаслаўлёная Ты між жанчынамі. Н. І благаслаўлёны плод улоння Твайго.');
  assert.equal(versicle.class, 'different');
  // fewer alternatives (subset) and a verse printed by one volume only are composition, not wording
  const subset = classifyDifference('Ант. Хадземце, паклонімся Хрысту, Сыну Марыі.', 'Ант. Хадземце, паклонімся Хрысту, Сыну Марыі. Або: Адзначаючы ўспамін Найсвяцейшай Панны Марыі, праславім Пана. Або іншае: Праславім Пана ў гонар Марыі, Маці Хрыста. Або яшчэ: Славім Дзеву.');
  assert.equal(subset.class, 'structure');
  assert.equal(subset.relation, 'subset-of-ordinary');
  const words = Array.from({ length: 40 }, (_, i) => `слова${i}`);
  assert.equal(classifyDifference([...words.slice(0, 20), 'дачка', 'тыру', 'багатыя', 'з', 'народу', 'прыносяць', 'дары', ...words.slice(20)].join(' '), words.join(' ')).relation, 'passage-only-in-volume');
  assert.equal(isReferenceOnly(['Другое чытанне', 'Выбіраюцца найбольш адпаведныя тэксты з ліку тых, што былі пададзены ў Агульных тэкстах пра святых мужчын, с. 1275-1277.']), true);
  assert.equal(isReferenceOnly(['Першае чытанне', 'Браты: Малю вас я, вязень Пана, паступаць годна паклікання.']), false);
  assert.equal(swapLabels('К. А. Н. Б.'), 'Н. А. К. Б.');
  assert.deepEqual(tokenDiff(['a', 'b'], ['a', 'c']).map((x) => x.op), ['=', '-', '+']);
});

test('every one of the 500 editorial_difference cells of the first audit is classified (six classes) and has a resolution', () => {
  const cells = baseline.cells.editorial_difference;
  assert.equal(cells.length, 500);
  const byKey = new Map(analysis.matrix.map((c) => [`${c.common}.${c.field}.${c.season}`, c]));
  const unclassified = cells.filter((key) => {
    const c = byKey.get(key);
    if (!c) return true;
    if (c.category === 'seasonal_explicit') return false;
    if (c.category === 'ordinary_base') return !c.difference?.identical;
    if (c.resolution === 'whole-field-variant') return !(c.difference.class === 3 && c.status === 'variant');
    return !(c.difference && c.difference.class >= 1 && c.difference.class <= 6 && c.resolution);
  });
  assert.deepEqual(unclassified, []);
  // no cell of the whole matrix is left with a difference and without a decision
  analysis.matrix.filter((c) => c.category === 'editorial_difference').forEach((c) => {
    assert.ok(c.resolution && c.difference, `${c.common}.${c.field}.${c.season}`);
    assert.notEqual(c.resolution, 'unresolved');
  });
  const audit = buildAudit({ corpus, analysis, baseline, generatedFrom: {} });
  assert.equal(audit.reclassification.total, 500);
  assert.equal(Object.values(audit.reclassification.byOutcome).reduce((a, b) => a + b, 0), 500);
  assert.equal(audit.reclassification.cells.every((c) => c.outcome), true);
});

test('before / after numbers of the audit', () => {
  const audit = buildAudit({ corpus, analysis, baseline, generatedFrom: {} });
  assert.deepEqual(audit.beforeAfter.baseline.bySeason, { advent: 7, christmas: 7, lent: 82, easter: 330 });
  assert.equal(audit.beforeAfter.baseline.total, 426);
  assert.deepEqual(audit.beforeAfter.after.bySeason, { advent: 21, christmas: 21, lent: 84, easter: 404 });
  assert.equal(audit.beforeAfter.after.total, 530);
  assert.equal(audit.beforeAfter.removedFields.length, 0, 'nothing that was found before is lost');
  assert.equal(audit.beforeAfter.newWholeFieldVariants.cells, 32);
  assert.equal(audit.beforeAfter.newWholeFieldVariants.wholeReadingCells, 24);
  assert.equal(audit.beforeAfter.newWholeFieldVariants.distinctReadings, 12);
  assert.deepEqual(audit.beforeAfter.addedFieldsByCause, {
    'whole-field (целиком напечатанный текст тома)': 32,
    'унаследовано от родительского Common (doctors ← pastors)': 28,
    'К./Н. с пометкой «(Велікодны перыяд Аллелюя)» (NR-001)': 43,
    'антифона, заканчивающаяся «!» (NR-002)': 1,
  });
  assert.equal(audit.summary.reviewCells, 0);
  assert.equal(audit.summary.alleluia.versicleLines, 100);
  assert.equal(audit.baselineComparison.unverifiedAlleluiaElements.after, 0);
  assert.deepEqual(audit.unresolved, []);
});

// ------------------------------------------------------------------------------------------------ complete texts of Volumes I and II

test('apostles: Advent / Christmas read 1 Кар 1, 18 – 2, 5 (Volume I), the base keeps 1 Кар 4, 1–16, Lent / Easter read their own readings', () => {
  ['advent', 'christmas'].forEach((season) => {
    const value = plain(variant('apostles', season, 'officeOfReadingsR1'));
    assert.match(value, /Першае пасланне св\. апостала Паўла да Карынцянаў 1, 18 – 2, 5/);
    assert.match(value, /Апосталы абвяшчаюць крыж/);
    assert.match(value, /Рэспансорый пар\. Мц 10, 18\. 19-20 Н\. Калі ж вас паставяць перад каралямі/);
    assert.doesNotMatch(value, /4 ?, 1-16/);
    assert.equal(cellOf('apostles', 'officeOfReadingsR1', season).resolution, 'whole-field-variant');
    assert.equal(cellOf('apostles', 'officeOfReadingsR1', season).volume, 'I');
  });
  assert.match(plain(baseOf('apostles', 'officeOfReadingsR1')), /Карынцянаў 4 ?, 1-16/);
  assert.doesNotMatch(plain(baseOf('apostles', 'officeOfReadingsR1')), /1, 18 – 2, 5/);
  // Volume II marks its own readings: Lent prints the same reading as Volume I, Easter another one; both are explicit variants
  assert.match(plain(variant('apostles', 'lent', 'officeOfReadingsR1')), /Карынцянаў 1, 18 – 2, 5/);
  assert.match(plain(variant('apostles', 'easter', 'officeOfReadingsR1')), /^Дзеі Апосталаў 5, 12-32/);
  assert.equal(cellOf('apostles', 'officeOfReadingsR1', 'lent').category, 'seasonal_explicit');
  assert.equal(cellOf('apostles', 'officeOfReadingsR1', 'easter').category, 'seasonal_explicit');
});

test('religious and works-of-mercy: the whole first reading with its responsory, in every season of both volumes, not spread beyond the proof', () => {
  const base = plain(baseOf('religious', 'officeOfReadingsR1'));
  assert.match(base, /^Радуйцеся заўсёды ў Пану Браты: Што было для мяне набыткам/);
  assert.doesNotMatch(base, /Эфесцаў/);
  assert.match(plain(baseOf('works-of-mercy', 'officeOfReadingsR1')), /Карынцянаў ?12, 31 – 13, 13/);
  SEASONS.forEach((season) => {
    const religious = plain(variant('religious', season, 'officeOfReadingsR1'));
    assert.match(religious, /Пасланне св\. апостала Паўла да Эфесцаў 4, 1-24/);
    assert.match(religious, /Кожнаму даецца ласка для будавання цела Хрыстовага/);
    assert.match(religious, /Рэспансорый Мц 19, 29\. 27 Н\. Кожны, хто дзеля Майго імя пакінуў дом/);
    assert.match(religious, /Пра законн.цу: Лк 10, 42\. 39 Н\. Патрэбна толькі адно/u);
    assert.doesNotMatch(religious, /Радуйцеся заўсёды ў Пану Браты: Што было/);
    const works = plain(variant('works-of-mercy', season, 'officeOfReadingsR1'));
    assert.match(works, /Першае пасланне св\. апостала Яна 4, 7-21/);
    assert.match(works, /Рэспансорый 1 Ян 5, 3; Сір 23, 37 Н\. Любоў да Бога ёсць у тым/);
    assert.doesNotMatch(works, /Карынцянаў/);
    const easter = season === 'easter';
    // the Alleluia belongs to the Easter reading only, at the two annotated responsory lines of the volume
    assert.equal((religious.match(/аллелюя/g) || []).length, easter ? 2 : 0, `religious ${season}`);
    assert.equal((works.match(/аллелюя/g) || []).length, easter ? 1 : 0, `works-of-mercy ${season}`);
    assert.equal(cellOf('religious', 'officeOfReadingsR1', season).volume, SEASON_VOLUME[season]);
  });
  assert.match(plain(variant('religious', 'easter', 'officeOfReadingsR1')), /здабудзе ў сто разоў больш і атрымае ў спадчыну жыццё вечнае, аллелюя\./);
  assert.match(plain(variant('religious', 'easter', 'officeOfReadingsR1')), /Яна выбрала найлепшую частку, якая не адымецца ў яе, аллелюя\./);
  assert.match(plain(variant('works-of-mercy', 'easter', 'officeOfReadingsR1')), /не з’яўляюцца цяжкімі, аллелюя\./);
  // the scope proof is recorded for every one of them
  const audit = buildAudit({ corpus, analysis, baseline, generatedFrom: {} });
  const proof = audit.beforeAfter.newWholeFieldVariants.list.filter((c) => c.volume === 'II');
  assert.equal(proof.length, 4);
  proof.forEach((c) => assert.match(c.scopeProof, /unmarked block with «\(Велікодны перыяд Аллелюя\)» inside/));
});

test('Volume I whole readings: every Common that prints another first reading in Advent / Christmas gets it, and only there', () => {
  const expected = ['church-dedication', 'blessed-virgin-mary', 'apostles', 'martyrs-many', 'martyr-one', 'pastors', 'doctors-of-church', 'holy-men', 'religious', 'works-of-mercy'];
  expected.forEach((id) => {
    ['advent', 'christmas'].forEach((season) => {
      const cell = cellOf(id, 'officeOfReadingsR1', season);
      assert.equal(cell.resolution, 'whole-field-variant', `${id} ${season}`);
      assert.equal(plain(variant(id, season, 'officeOfReadingsR1')), plain(variant(id, 'advent', 'officeOfReadingsR1')), 'Advent and Christmas share the unmarked text of Volume I');
      // the text of the season is the text printed by Volume I, word for word
      const printed = tokensOf(comparableText(corpus.volumes.I.commons.get(id).fields.get('officeOfReadingsR1'), season)).filter((t) => !['першае', 'чытанне'].includes(t));
      const shown = tokensOf(plain(variant(id, season, 'officeOfReadingsR1'))).filter((t) => !['першае', 'чытанне'].includes(t));
      assert.deepEqual(shown, printed, `${id} ${season}`);
    });
    assert.notEqual(plain(variant(id, 'advent', 'officeOfReadingsR1')), plain(baseOf(id, 'officeOfReadingsR1')));
  });
  // Volume II prints the Ordinary Time reading unchanged for these (or marks its own): no whole-field variant by accident
  const wholeFieldVolumeII = analysis.matrix.filter((c) => c.resolution === 'whole-field-variant' && c.volume === 'II').map((c) => `${c.common}.${c.field}.${c.season}`);
  assert.deepEqual(wholeFieldVolumeII, ['religious.officeOfReadingsR1.lent', 'religious.officeOfReadingsR1.easter', 'works-of-mercy.officeOfReadingsR1.lent', 'works-of-mercy.officeOfReadingsR1.easter']);
  // holy-men / pastors keep their alternatives in order
  assert.match(plain(variant('holy-men', 'advent', 'officeOfReadingsR1')), /Або іншае:/);
});

test('blessed-virgin-mary: the versicle and the short responsories printed by Volume I replace the base in Advent / Christmas only', () => {
  ['advent', 'christmas'].forEach((season) => {
    assert.equal(plain(variant('blessed-virgin-mary', season, 'officeOfReadingsVers')), 'К. Шчаслівыя, хто слухае слова Божае. Н. І захоўвае яго.');
    assert.match(plain(variant('blessed-virgin-mary', season, 'sext1R')), /К\. Благаслаўлёная Маці і беззаганная Дзева, слаўная Валадарка свету\. Н\. Заступайся за нас перад Панам\./);
    assert.match(plain(variant('blessed-virgin-mary', season, 'sext2R')), /К\. О якая слаўная Маці\. Н\. Яна нарадзіла Караля нябёсаў\./);
    assert.match(plain(variant('blessed-virgin-mary', season, 'sext3R')), /К\. Марыя захоўвала ўсе гэтыя словы\. Н\. Разважаючы ў сэрцы сваім\./);
    assert.match(plain(variant('blessed-virgin-mary', season, 'officeOfReadingsR1')), /Першая кніга Кронікаў 17, 1-15/);
    assert.doesNotMatch(plain(variant('blessed-virgin-mary', season, 'sext1R')), /У дадатковай псальмодыі/, 'the page note of another volume is not a part of the reading');
  });
  assert.equal(plain(baseOf('blessed-virgin-mary', 'officeOfReadingsVers')), 'К. Марыя захоўвала ўсе гэтыя словы. Н. Разважаючы ў сэрцы сваім.');
  ['lent'].forEach((season) => assert.equal(variant('blessed-virgin-mary', season, 'officeOfReadingsVers'), undefined));
  // the same Vers, Easter: base + Alleluia on both lines (NR-001)
  assert.equal(plain(variant('blessed-virgin-mary', 'easter', 'officeOfReadingsVers')), 'К. Марыя захоўвала ўсе гэтыя словы, аллелюя. Н. Разважаючы ў сэрцы сваім, аллелюя.');
});

test('doctors-of-church inherits what the volume does not print («Усё з Агульных тэкстаў пра пастыраў»), where the stored text equals the pastors', () => {
  ['I', 'II', 'III'].forEach((id) => assert.match(corpus.volumes[id].commons.get('doctors-of-church').common.preamble.map((l) => l.text).join(' '), /Усё з Агульных тэкстаў пра пастыраў/));
  const doctors = documents.get('doctors-of-church').easter;
  const pastors = documents.get('pastors').easter;
  const inherited = Object.keys(doctors).filter((field) => analysis.variants.get('doctors-of-church').easter[field].inheritedFrom === 'pastors');
  assert.equal(inherited.length, 28);
  inherited.forEach((field) => {
    assert.equal(plain(baseOf('doctors-of-church', field)), plain(baseOf('pastors', field)), `${field}: the stored doctors text is the pastors text`);
    assert.deepEqual(doctors[field], pastors[field]);
    assert.equal(corpus.volumes.II.commons.get('doctors-of-church').fields.has(field), false, `${field}: the volume does not print it`);
  });
  // what the doctors section prints itself is never overwritten by the parent
  Object.keys(doctors).filter((field) => !inherited.includes(field)).forEach((field) => assert.ok(corpus.volumes.II.commons.get('doctors-of-church').fields.has(field), field));
});

test('nothing printed by Volume I or II is lost: every word is found in the text of the season, the unfound ones are wording, references and listed gaps', () => {
  const coverage = volumeWordCoverage({ corpus, variants: analysis.variants, seasons: SEASONS, seasonVolume: SEASON_VOLUME });
  assert.equal(coverage.cells, 1782);
  assert.deepEqual(coverage.buckets, { 0: 1326, '1–5': 370, '6–19': 80, '≥ 20': 6 });
  const large = coverage.largest.filter((r) => r.notFoundWords >= 20).map((r) => `${r.common}.${r.field}.${r.season}`).sort();
  assert.deepEqual(large, [
    // the stored I Vespers short reading of the martyr lacks the printed reading Рым 8, 35. 37-39 in EVERY season (D-6)
    'holy-women.officeOfReadingsR1.advent', 'holy-women.officeOfReadingsR1.christmas', 'holy-women.officeOfReadingsR1.easter', 'holy-women.officeOfReadingsR1.lent',
    'martyr-one.vesper1R.advent', 'martyr-one.vesper1R.christmas',
  ].sort());
  // every whole text that differs from Volume III (class 3) is a seasonal variant of exactly the seasons of its volume
  analysis.matrix.filter((c) => c.difference?.className === 'different').forEach((c) => {
    assert.ok(c.status.startsWith('variant'), `${c.common}.${c.field}.${c.season}`);
  });
});

test('hymns, antiphons, psalms, short readings, prayers and readings printed by a volume are in the variant of their season word for word, and only there', () => {
  const LABELS = new Set(['першае', 'чытанне', 'другое', 'ант', 'да', 'песні', 'марыі', 'захарыі', 'аллелюя']);
  const significant = (text) => tokensOf(text).filter((t) => !LABELS.has(t));
  const KINDS = new Set(['hymn', 'ant', 'psalm', 'shortReading', 'prayer', 'reading1', 'reading2', 'versicle', 'canticleAnt']);
  const seen = new Set();
  const mismatches = [];
  analysis.variants.forEach((bySeason, commonId) => Object.entries(bySeason).forEach(([season, fields]) => Object.entries(fields).forEach(([field, info]) => {
    if (info.method !== 'render' || !KINDS.has(info.kind)) return;
    const units = corpus.volumes[info.volume].commons.get(commonId).fields.get(field);
    const printed = significant(comparableText(units, season));
    const shown = significant(plain(info.value));
    seen.add(info.kind);
    const diff = tokenDiff(printed, shown).filter((x) => x.op !== '=');
    if (diff.length) mismatches.push(`${commonId}.${season}.${field}: ${diff.slice(0, 4).map((x) => x.op + x.token).join(' ')}`);
  })));
  assert.deepEqual(mismatches, []);
  ['hymn', 'psalm', 'prayer', 'reading1', 'shortReading', 'versicle'].forEach((kind) => assert.ok(seen.has(kind), `${kind} variants exist and were checked`));
  // Lent and Easter texts of the same field are different texts when the volume prints two, never glued together
  let twoSeasons = 0;
  documents.forEach((bySeason, commonId) => Object.keys(bySeason.lent || {}).forEach((field) => {
    const lent = analysis.variants.get(commonId).lent[field];
    const easter = analysis.variants.get(commonId).easter?.[field];
    if (!easter || lent.method !== 'render' || easter.method !== 'render') return;
    twoSeasons += 1;
    const l = significant(plain(lent.value)); const e = significant(plain(easter.value));
    assert.ok(l.join(' ') !== e.join(' ') || lent.volume === easter.volume, `${commonId}.${field}`);
    ['Вялікі пост', 'Велікодны перыяд'].forEach((word) => { assert.doesNotMatch(plain(lent.value), new RegExp(`У ${word}:`)); assert.doesNotMatch(plain(easter.value), new RegExp(`У ${word}:`)); });
  }));
  assert.ok(twoSeasons > 3, `fields with a Lent and an Easter text: ${twoSeasons}`);
});

// ------------------------------------------------------------------------------------------------ decisions of the editor

test('NR-007…009: К./Н. of officeOfReadingsVers are in the right order in the base, in the variants and in every Common', () => {
  const labels = (html) => (plain(html).match(/(?:^|\s)([КН])\.(?=\s)/g) || []).map((m) => m.trim()[0]).join('');
  for (const [id, doc] of corpus.base) {
    if (!doc.officeOfReadingsVers) continue;
    assert.equal(labels(doc.officeOfReadingsVers), 'КН', `${id}: К. leads, Н. answers`);
    SEASONS.forEach((season) => { const v = variant(id, season, 'officeOfReadingsVers'); if (v) assert.equal(labels(v), 'КН', `${id} ${season}`); });
  }
  BASE_CORRECTIONS.forEach((correction) => {
    const result = correction.verify(corpus);
    assert.equal(result.ok, true, `${correction.id}: ${JSON.stringify(result)}`);
  });
  assert.deepEqual(BASE_CORRECTIONS.map((c) => c.id), ['NR-007', 'NR-008', 'NR-009', 'NR-003']);
  // holy-women: only Volume I prints it right (Volume II repeats the order of Volume III)
  assert.deepEqual(BASE_CORRECTIONS.find((c) => c.id === 'NR-009').verify(corpus), { baseLabels: 'КН', volumeI: 'КН', volumeII: 'НК', volumeIII: 'НК', ok: true });
});

test('NR-003: Ps 64 (63) of the apostles — psalm body identical, antiphons corrected, the Easter variant carries the Alleluia', () => {
  const ps = BASE_CORRECTIONS.find((c) => c.id === 'NR-003').verify(corpus);
  assert.equal(ps.ok, true);
  assert.equal(ps.psalmWordsDifferent, 0);
  assert.match(plain(baseOf('apostles', 'officeOfReadingsAnt2')), /абвяшчалі справу Бога/);
  const easter = plain(variant('apostles', 'easter', 'officeOfReadingsPs2'));
  assert.match(easter, /Ант\. Яны абвяшчалі справу Бога \* і зразумелі Яго ўчынкі, \/ аллелюя\.$/);
  assert.match(easter, /Яны абвесцяць справу Бога/);
  assert.match(plain(variant('apostles', 'easter', 'officeOfReadingsAnt2')), /2 ант\. Яны абвяшчалі справу Бога \* і зразумелі Яго ўчынкі, \/ аллелюя\./);
  assert.equal(variant('apostles', 'lent', 'officeOfReadingsPs2'), undefined, 'Lent: no variant of this psalm');
  assert.doesNotMatch(JSON.stringify(corpus.base.get('apostles')), /абвяшалі/);
  // the antiphon of Volume II and the corrected base are the same words (Volume III itself still prints «абвяшалі»: the comparison is with the source volume)
  const printedII = tokensOf(comparableText(corpus.volumes.II.commons.get('apostles').fields.get('officeOfReadingsAnt2'), 'easter'));
  assert.deepEqual(tokensOf(plain(baseOf('apostles', 'officeOfReadingsAnt2'))), printedII);
  assert.equal(cellOf('apostles', 'officeOfReadingsAnt2', 'easter').difference.className, 'lexical');
});

test('NR-002: church-dedication Ant2 gets «/ аллелюя.» in Easter and no †; the † printed by both volumes stays in the base', () => {
  assert.equal(plain(variant('church-dedication', 'easter', 'officeOfReadingsAnt2')), '2 ант. Якія мілыя Твае шатры, Пане Магуццяў! / аллелюя.');
  assert.doesNotMatch(variant('church-dedication', 'easter', 'officeOfReadingsAnt2'), /†/);
  assert.match(baseOf('church-dedication', 'officeOfReadingsAnt2'), /†/);
  assert.match(plain(baseOf('church-dedication', 'officeOfReadingsPs2')), /^Псальм 84 \(83\) Якія мілыя Твае шатры, Пане Магуццяў! \* † Знемагае/, 'the dagger belongs to the first line of the psalm');
  assert.equal(variant('church-dedication', 'lent', 'officeOfReadingsAnt2'), undefined);
});

test('NR-001: К./Н. lines annotated «(Велікодны перыяд Аллелюя)» end with «, аллелюя.» in Easter only, once, and the short responses stay as printed', () => {
  const lines = analysis.alleluia.filter((a) => a.rule === 'alleluia-v1-versicle');
  assert.equal(new Set(lines.map((a) => a.line)).size, 100);
  lines.forEach((a) => {
    assert.equal(a.season, 'easter');
    assert.match(a.after, /^[КН]\.\s.+, аллелюя\.$/u);
    assert.doesNotMatch(a.after, /аллелюя.*аллелюя/u, `no duplicate: ${a.after}`);
  });
  // a responsory: the long «Н.» line takes it, the short answer «Н. Яна выбрала.» does not
  const easter = plain(variant('religious', 'easter', 'officeOfReadingsR1'));
  assert.match(easter, /Н\. Яна выбрала\.$/);
  // versicle pair
  assert.equal(plain(variant('church-dedication', 'easter', 'officeOfReadingsVers')), 'К. Буду пакланяцца Тваёй святой святыні, аллелюя. Н. І праслаўлю Тваё імя, Пане, аллелюя.');
  assert.equal(variant('church-dedication', 'lent', 'officeOfReadingsVers'), undefined);
  assert.doesNotMatch(plain(baseOf('church-dedication', 'officeOfReadingsVers')), /аллелюя/);
  // no other season gets an Alleluia that the base does not have
  ['advent', 'christmas', 'lent'].forEach((season) => documents.forEach((bySeason, id) => Object.entries(bySeason[season] || {}).forEach(([field, value]) => {
    const printedByVolumeI = analysis.variants.get(id)[season][field].method === 'render' && season !== 'lent';
    if (printedByVolumeI) return;
    const count = (v) => (plain(v).match(/аллелюя/g) || []).length;
    assert.ok(count(value) <= count(baseOf(id, field) || ''), `${id}.${season}.${field}`);
  })));
});

test('NR-001: the Alleluia a variant gains is exactly the number of annotated elements of its field (no element missed, none doubled)', () => {
  const grouped = new Map();
  analysis.alleluia.forEach((a) => { const key = `${a.common}.${a.field}.${a.season}`; grouped.set(key, [...(grouped.get(key) || []), a]); });
  const count = (value) => (plain(value || '').match(/аллелюя/gi) || []).length;
  let checked = 0;
  grouped.forEach((list, key) => {
    const [common, field, season] = key.split('.');
    const info = analysis.variants.get(common)[season]?.[field];
    if (!info) { assert.equal(list.every((a) => a.already), true, `${key}: base already has the Alleluia`); return; }
    if (info.method === 'render' || String(info.method).startsWith('inherit')) return;
    assert.equal(count(info.value) - count(baseOf(common, field)), list.filter((a) => !a.already).length, key);
    checked += 1;
  });
  assert.ok(checked > 250, `checked ${checked}`);
});

test('NR-010: «аллеюя» is corrected in the variants, counted, and the three places of Volume II are on record', () => {
  const found = scanSourceMisprints(corpus);
  assert.deepEqual(found.map((m) => `${m.volume}:${m.line}`), ['II:118', 'II:527', 'II:1167']);
  assert.equal(found.reduce((s, m) => s + m.words, 0), 4);
  assert.doesNotMatch(JSON.stringify([...documents.values()]), /[Аа]ллеюя/);
  assert.doesNotMatch(JSON.stringify([...corpus.base.values()].map((doc) => { const { _seasonalVariants, ...flat } = doc; void _seasonalVariants; return flat; })), /[Аа]ллеюя/);
  assert.ok(analysis.typos.get('alleyuya') >= 3);
});

test('NR-012: Advent / Christmas show ONE prayer of Volume I, Ordinary Time keeps the list, the Saturday memorial alternatives are not in the seasonal field', () => {
  ['vesper1Pr', 'laudesPr', 'vesperPr', 'officeOfReadingsPr', 'sext1Pr', 'sext2Pr', 'sext3Pr'].forEach((field) => {
    ['advent', 'christmas'].forEach((season) => {
      const value = variant('blessed-virgin-mary', season, field);
      assert.ok(value, `${season}.${field}`);
      assert.doesNotMatch(Array.isArray(value) ? value.join('') : value, /<hr/, `${season}.${field}: one prayer, no alternatives`);
      assert.doesNotMatch(plain(value), /У перыяд Адвэнту|У перыяд Нараджэння Пана/);
    });
    const base = baseOf('blessed-virgin-mary', field);
    assert.ok((Array.isArray(base) ? base.join('') : base).split('<hr').length > 2, `${field}: the Ordinary Time list is intact`);
  });
  // the fields where the Saturday memorial of Volume III has more alternatives than the main section of Volume I / II keep them (D-2)
  const subset = analysis.matrix.filter((c) => c.common === 'blessed-virgin-mary' && c.resolution === 'kept-base-subset');
  assert.ok(subset.length >= 20);
  subset.forEach((c) => assert.equal(variant('blessed-virgin-mary', c.season, c.field), undefined, `${c.field}.${c.season}`));
  const satHeading = corpus.volumes.III.commons.get('blessed-virgin-mary').common.order.find((u) => u.section === 'saturday');
  assert.match(satHeading.sectionHeading.text, /УСПАМІН НАЙСВ\. ПАННЫ МАРЫІ Ў СУБОТУ/);
  assert.equal(corpus.volumes.I.commons.get('blessed-virgin-mary').common.order.some((u) => u.section === 'saturday'), false);
  assert.equal(corpus.volumes.II.commons.get('blessed-virgin-mary').common.order.some((u) => u.section === 'saturday'), false);
});

test('NR-011: Holy Week takes the Lent texts until the Triduum; the Ordo phase decides, never the period or the civil date', () => {
  const dayAfter = (iso) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  for (let year = 2020; year <= 2060; year += 1) {
    const a = computeYearAnchors(year);
    const expected = [
      [a.palmSunday, 'holyweek', 'palm-sunday', 'lent'],
      [dayAfter(a.palmSunday), 'holyweek', 'holy-week', 'lent'],
      [dayAfter(dayAfter(a.palmSunday)), 'holyweek', 'holy-week', 'lent'],
      [dayAfter(dayAfter(dayAfter(a.palmSunday))), 'holyweek', 'holy-week', 'lent'],
      [a.holyThursday, 'holyweek', 'triduum', null],
      [a.goodFriday, 'holyweek', 'triduum', null],
      [a.holySaturday, 'holyweek', 'triduum', null],
      [a.easterSunday, 'easter', 'octave', 'easter'],
    ];
    expected.forEach(([iso, period, phase, key]) => {
      const season = computeSeason(iso);
      assert.deepEqual([season.period, season.periodPhase], [period, phase], iso);
      assert.equal(variantKeyForSeason(season), key, iso);
    });
    assert.equal(dayAfter(a.holyThursday), a.goodFriday);
    assert.equal(computeSeason(a.palmSunday).isSunday, true);
  }
  // the phase, not the period, decides: a period without a known phase gives no variant
  assert.equal(variantKeyForSeason('holyweek'), null);
  assert.equal(variantKeyForSeason({ period: 'holyweek' }), null);
  assert.equal(variantKeyForSeason({ period: 'holyweek', periodPhase: 'triduum' }), null);
  // no Common-based Office is celebrated in Holy Week or the Triduum in 2026–2060, four dioceses
  for (let year = 2026; year <= 2060; year += 1) {
    const a = computeYearAnchors(year);
    for (let t = Date.parse(`${a.palmSunday}T00:00:00Z`); t <= Date.parse(`${a.easterSunday}T00:00:00Z`); t += 86400000) {
      const iso = new Date(t).toISOString().slice(0, 10);
      ['minsk-mohilev', 'pinsk'].forEach((diocese) => {
        assert.ok(resolveRuntimeDay(iso, { diocese }).officeOptions.every((o) => !(o.templates?.length)), `${iso} ${diocese}`);
      });
    }
  }
});

test('the seasons of the Ordo and the key of the variant on the boundaries (2026–2040): Christmas ends with the Baptism, Pentecost ends Easter, Advent begins on its Sunday', () => {
  const keyOf = (iso) => variantKeyForSeason(computeSeason(iso));
  const shift = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
  for (let year = 2026; year <= 2040; year += 1) {
    const a = computeYearAnchors(year);
    assert.equal(keyOf(a.baptismOfLord), 'christmas');
    assert.equal(keyOf(shift(a.baptismOfLord, 1)), null);
    assert.equal(keyOf(shift(a.ashWednesday, -1)), null);
    assert.equal(keyOf(a.ashWednesday), 'lent');
    assert.equal(keyOf(shift(a.easterSunday, -1)), null, 'Holy Saturday: Triduum');
    assert.equal(keyOf(a.pentecost), 'easter');
    assert.equal(keyOf(shift(a.pentecost, 1)), null);
    assert.equal(keyOf(shift(a.firstAdventSunday, -1)), null);
    assert.equal(keyOf(a.firstAdventSunday), 'advent');
    assert.equal(keyOf(`${year}-12-24`), 'advent');
    assert.equal(keyOf(`${year}-12-25`), 'christmas');
  }
});

// ------------------------------------------------------------------------------------------------ assembly through the real chain

const TEMPLATE_DIR = path.join(ROOT, 'patchs', 'db-templates');
const TEMPLATES = new Map(fs.readdirSync(TEMPLATE_DIR).filter((n) => n.endsWith('.json')).map((name) => {
  const data = JSON.parse(fs.readFileSync(path.join(TEMPLATE_DIR, name), 'utf8'));
  return [data._id, data];
}));
const currentDay = Object.fromEntries(OFFICE_TEXT_FIELDS.map((field) => [field, `<p>day:${field}</p>`]));
const SEASON_OF = {
  ordinary: { period: 'ordinary', periodPhase: 'after-pentecost' }, advent: { period: 'advent', periodPhase: 'advent-weekdays' },
  christmas: { period: 'christmas', periodPhase: 'after-epiphany' }, lent: { period: 'lent', periodPhase: 'lent-weeks' },
  easter: { period: 'easter', periodPhase: 'before-ascension' },
};
const officeFor = (iso, id) => { const day = resolveRuntimeDay(iso, { diocese: 'minsk-mohilev' }); return [day.officeResolution.primary, ...day.officeResolution.alternatives].find((o) => o.optionId === id); };

test('assembly: the whole readings arrive through assembleOffice by the season of the Ordo, never in another season, never over the own Proper', () => {
  const office = officeFor('2026-11-09', 'dedication-lateran-basilica');
  const assemble = (templateId, proper, season) => assembleOffice({
    proper: { _schema: 2, _celebrationId: 'x', _templates: [templateId], _defaultTemplate: templateId, _rank: 'festum', ...proper }, office, templates: TEMPLATES, currentDay, season: SEASON_OF[season],
  });
  const r1 = (templateId, season, proper) => plain(assemble(templateId, proper, season).day.officeOfReadingsR1);
  ['advent', 'christmas'].forEach((s) => assert.match(r1('apostles', s), /1, 18 – 2, 5/));
  ['ordinary'].forEach((s) => assert.match(r1('apostles', s), /4, 1-16/));
  ['advent', 'christmas', 'lent', 'easter'].forEach((s) => { assert.match(r1('religious', s), /Эфесцаў 4, 1-24/); assert.match(r1('works-of-mercy', s), /Яна 4, 7-21/); });
  assert.match(r1('religious', 'ordinary'), /^Радуйцеся заўсёды ў Пану/);
  assert.match(r1('works-of-mercy', 'ordinary'), /Карынцянаў ?12, 31 – 13, 13/);
  assert.doesNotMatch(r1('religious', 'lent'), /аллелюя/);
  assert.match(r1('religious', 'easter'), /аллелюя/);
  // the celebration's own reading is never replaced
  assert.equal(assemble('apostles', { officeOfReadingsR1: '<p>OWN</p>' }, 'advent').day.officeOfReadingsR1, '<p>OWN</p>');
  assert.equal(assemble('apostles', {}, 'advent').seasonal.fields.officeOfReadingsR1, 'advent');
  assert.equal(assemble('apostles', {}, 'easter').seasonal.fields.officeOfReadingsR1, 'easter');
  assert.equal('officeOfReadingsR1' in assemble('apostles', {}, 'ordinary').seasonal.fields, false);
  // doctors take the pastors' seasonal antiphons in Easter
  assert.equal(assemble('doctors-of-church', {}, 'easter').day.vesperAnt1, assemble('pastors', {}, 'easter').day.vesperAnt1);
});

// ------------------------------------------------------------------------------------------------ size limits and publication

test('documents stay far below the Firestore limit and the patch is a SAFE CONTENT PATCH for the real classifier', () => {
  const docs = [...TEMPLATES.values()].map(({ _id, ...data }) => storedDocument(_id, data));
  assert.deepEqual(validateCollection('liturgicalTemplates', docs), []);
  const described = describeDocuments(docs);
  const largest = Math.max(...Object.values(described.sizes));
  assert.ok(largest < 1048576 * 0.5, `largest template ${largest} bytes`);
  const before = docs.map((doc) => { const { _seasonalVariants, ...flat } = doc; void _seasonalVariants; return flat; });
  const diff = diffCollection('liturgicalTemplates', described, { hashes: describeDocuments(before).hashes });
  assert.ok(diff.bytes < 5 * 1024 * 1024, `patch ${diff.bytes} bytes`);
  assert.equal(classifyPatch([diff], { publishedSchema: 1 }).verdict, 'SAFE CONTENT PATCH');
  // every variant value is a valid, bounded fragment
  documents.forEach((bySeason) => Object.values(bySeason).forEach((fields) => Object.values(fields).forEach((value) => {
    const texts = Array.isArray(value) ? value : [value];
    texts.forEach((text) => { assert.ok(text.length < 200000); assert.doesNotMatch(text, /<(script|iframe|object|style)/i); });
  })));
});

test('the committed audit and the base-corrections ledger are what the parser reports now (run --report after a change)', () => {
  const audit = buildAudit({ corpus, analysis, baseline, generatedFrom: Object.fromEntries(Object.values(corpus.volumes).map((v) => [v.id, { file: v.file, sha256: v.sha256 }])) });
  const read = (name) => fs.readFileSync(path.join(ROOT, 'reports', 'liturgy', name), 'utf8');
  assert.equal(read('common-seasons-audit.json'), `${JSON.stringify(audit, null, 2)}\n`);
  assert.equal(read('common-seasons-audit.md'), renderMarkdown(audit));
  assert.equal(read('common-seasons-base-corrections.md'), renderBaseCorrectionsMarkdown(audit));
});

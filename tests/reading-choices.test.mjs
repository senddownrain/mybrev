/**
 * D-1: the reader offers each legal reading of an Office field as a choice instead of one glued block, and shows
 * the volume's «Выбіраюцца найбольш адпаведныя тэксты …» sentence as a note (it is a rubric, not a reading).
 *
 * Expectations are typed from the volumes (patchs/sources/common-seasons: I 4359-4360, II 4806-4807, III 5617-5633),
 * not produced by the generator. NOT covered here: the browser (see reports/liturgy/d1-reading-choices.md).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'node-html-parser';
import moment from '../src/utils/moment-be.js';
import { getLiturgicalAlternatives, getReadingChoices } from '../src/utils/liturgicalAlternatives.js';
import { materializeCommonForSeason } from '../src/utils/ordo/commonSeasons.js';
import { createReadingChoiceStore, readingChoiceContext, READING_CHOICE_STORAGE_KEY } from '../src/utils/readingChoice.js';
import { resolveLiturgicalDate } from '../src/utils/ordo/index.js';
import { resolveRuntimeDay } from '../src/utils/ordo/runtime.js';
import { buildOrdoDayOptions } from '../src/utils/ordoDayOptions.js';
import { buildFeastTargets } from '../scripts/ordo/import-feasts.mjs';
import { daysFixture } from './helpers/ordo-days-fixture.mjs';
import { assembleDaysResult } from '../src/utils/daysResult.js';
import { markLeadingLiturgicalSubheadings, removeLectionSectionHeading } from '../src/utils/liturgicalHtml.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const template = (id) => JSON.parse(fs.readFileSync(path.join(ROOT, 'patchs', 'db-templates', `${id}.json`), 'utf8'));
const women = template('holy-women');
const men = template('holy-men');
const inSeason = (doc, period) => materializeCommonForSeason(doc, { period });
const plain = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const WORKS = ['«Гамілія да кнігі Дзеяў Апосталаў» св. Яна Хрызастома, біскупа', 'Казанне св. Аўгустына, біскупа'];
const WOMEN_R1 = ['Кніга Прыпавесцяў', 'Першае пасланне св. апостала Пятра 3, 1-6. 8-17'];

test('Palm Sunday 29.03.2026: raw, assembled and Lectio HTML keep Hebrews and its responsory as one reading', () => {
  // Exact officeOfReadingsR1 from days/feast-palmsunday (also identical in
  // days/holyweek-w1-d1), read individually on 04.11.2026. No snapshot refresh.
  const html = fs.readFileSync(path.join(ROOT, 'tests/fixtures/office-readings/palm-sunday-r1.html'), 'utf8');
  assert.doesNotMatch(html, /<hr\b/iu, 'the reported split is not caused by a rule');
  const date = '2026-03-29';
  const resolved = resolveRuntimeDay(date, { diocese: 'pinsk' });
  const { context } = daysFixture(resolved);
  const daysResult = assembleDaysResult({
    mDate: moment(date), context, dynamicFeastCodes: ['palmsunday'],
    periodDay: { id: 'holyweek-w1-d1', officeOfReadingsR1: html },
    dynamicEntries: [['palmsunday', [{ id: 'feast-palmsunday', _feast: 'feast-palmsunday', officeOfReadingsR1: html }]]],
  });
  const result = buildOrdoDayOptions({ resolved, context, date, diocese: 'pinsk', daysResult });
  const assembled = result.dayOptions.find((o) => o.day.id === 'feast-palmsunday').day.officeOfReadingsR1;
  assert.equal(assembled, html, 'assembly preserves the stored reading');
  const formatted = markLeadingLiturgicalSubheadings(removeLectionSectionHeading(assembled, 'Першае чытанне'));
  for (const source of [html, assembled, formatted]) {
    const { notes, options } = getReadingChoices(source);
    assert.equal(notes.length, 0);
    assert.equal(options.length, 1);
    assert.equal(options[0].title, 'Пасланне да Габрэяў 10, 1-18');
    assert.equal(plain(options[0].html), plain(source), 'all words and fragments stay in order');
    assert.match(options[0].html, /Нашае асвячэнне праз ахвяру Хрыста/u);
    assert.match(options[0].html, /Пра гэта сведчыць нам і Дух Святы/u);
    assert.match(options[0].html, /РЭСПАНСОРЫЙ пар\. Гбр 10, 5-7\. 4 \(Пс 40 \[39\], 7-8\)/u);
    assert.match(options[0].html, /Вось іду, каб выканаць волю Тваю, Божа\.<\/p>$/u);
  }
});

test('Office for the Dead keeps its three explicit first readings and all their shared content', () => {
  const html = template('office-for-dead').officeOfReadingsR1;
  const { notes, options } = getReadingChoices(html);
  assert.equal(notes.length, 0);
  assert.deepEqual(options.map((o) => o.title), ['1 Кар 15, 12–34', '1 Кар 15, 35–57', '2 Кар 4, 16 — 5, 10']);
  const root = parse(html);
  const blocks = root.querySelectorAll('[data-alternative-title]');
  const suffixes = root.querySelectorAll('[data-alternative-suffix]');
  const bodies = blocks.map((block) => block.innerHTML);
  const suffix = suffixes.map((block) => block.innerHTML).join(' ');
  [...blocks, ...suffixes].forEach((block) => block.remove());
  assert.equal(options.length, blocks.length);
  options.forEach((option, index) => {
    assert.equal(plain(option.html), plain([root.innerHTML, bodies[index], suffix].join(' ')), 'complete reading with shared heading and responsory');
  });
});

test('the same narrative-category collision in martyr-one and St Sebastian does not hide the end of R2', () => {
  const martyr = template('martyr-one');
  const sebastian = JSON.parse(fs.readFileSync(path.join(ROOT, 'patchs/db-feasts/20-01-sv-sebastian.json'), 'utf8'));
  for (const doc of [martyr, ...Object.values(martyr._seasonalVariants), sebastian]) {
    const html = doc.officeOfReadingsR2;
    const { notes, options } = getReadingChoices(html);
    assert.equal(notes.length, 0);
    assert.equal(options.length, 1);
    assert.equal(plain(options[0].html), plain(html), 'all paragraphs including the responsory survive in order');
  }
});

test('holy-women R2 in Advent, Christmas, Lent, Easter: reference note + the two readings of holy men of the same volume', () => {
  const pages = { advent: '1275-1277', christmas: '1275-1277', lent: '1787-1791', easter: '1787-1791' };
  for (const [period, page] of Object.entries(pages)) {
    const { notes, options } = getReadingChoices(inSeason(women, period).officeOfReadingsR2);
    assert.equal(notes.length, 1, period);
    assert.match(plain(notes[0].html), new RegExp(`^Выбіраюцца найбольш адпаведныя тэксты .* святых мужчын, с\\. ${page}\\.$`, 'u'), period);
    assert.deepEqual(options.map((o) => o.title), WORKS, period);
    // each option is exactly one reading: no second reading, no reference sentence, no Pius XII (Volume III only)
    options.forEach((option, index) => {
      assert.doesNotMatch(plain(option.html), /Выбіраюцца|Пія ХІІ|Discorsi/u, `${period} #${index}`);
    });
    assert.match(plain(options[0].html), /Святло хрысціяніна не можа быць схавана/u, period);
    assert.match(plain(options[1].html), /Паўсюднае пакліканне да святасці/u, period);
  }
});

test('holy-women R2 in Ordinary Time (Volume III): reference note, the two holy-men texts, then Pius XII as the printed "Або іншае"', () => {
  const { notes, options } = getReadingChoices(women.officeOfReadingsR2);
  assert.equal(notes.length, 1);
  assert.match(plain(notes[0].html), /с\. 1584-1587\.$/u);
  // owner decision D-1 (#165): the reference is the SET of legal readings, so the holy-men texts of the same volume come first
  assert.deepEqual(options.map((o) => o.title), [...WORKS, 'Прамова папы Пія ХІІ, скіраваная да маладых сужэнстваў']);
  assert.match(plain(options[2].html), /Жонка – сонца сям’і/u);
});

test('holy-women R1: reference note, the first readings of holy men of the same volume, then the two printed for a married saint', () => {
  // holy-men R1 count per volume: I (Advent, Christmas) 3, II (Lent, Easter) 2, III (Ordinary Time) 3
  const menCount = { null: 3, advent: 3, christmas: 3, lent: 2, easter: 2 };
  for (const period of [null, 'advent', 'christmas', 'lent', 'easter']) {
    const { notes, options } = getReadingChoices((period ? inSeason(women, period) : women).officeOfReadingsR1);
    assert.equal(notes.length, 1, String(period));
    assert.equal(options.length, menCount[period] + 2, String(period));
    const own = options.slice(-2);
    assert.match(own[0].title, /^Кніга Прыпавесцяў(?: Саламона)? 31, 10-31$/u, String(period));
    assert.equal(own[1].title, WOMEN_R1[1], String(period));
    assert.doesNotMatch(plain(own[0].html), /Першае пасланне св\. апостала Пятра/u, `${period}: two readings glued`);
    const men1 = getReadingChoices((period ? inSeason(men, period) : men).officeOfReadingsR1).options;
    assert.deepEqual(options.slice(0, menCount[period]).map((o) => o.title), men1.map((o) => o.title), `${period}: holy-men readings unchanged`);
  }
});

test('no choice is invented or lost: the choices and notes together are the stored text, word for word', () => {
  const stored = [women.officeOfReadingsR1, women.officeOfReadingsR2,
    ...['advent', 'christmas', 'lent', 'easter'].flatMap((p) => [inSeason(women, p).officeOfReadingsR1, inSeason(women, p).officeOfReadingsR2]),
    men.officeOfReadingsR1, men.officeOfReadingsR2];
  const words = (html) => plain(html.replace(/<hr\s*\/?>/giu, ' ')).replace(/\s+/g, '');
  stored.forEach((html) => {
    const { notes, options } = getReadingChoices(html);
    assert.equal(words([...notes, ...options].map((o) => o.html).join(' ')), words(html));
  });
});

test('a single legal reading gets no picker, and a text that is only a reference stays readable', () => {
  assert.equal(getReadingChoices(women.officeOfReadingsR2).options.length, 3); // holy-women R2 is a set since D-1 (#165)
  assert.equal(getReadingChoices('<p>Кніга Рут 1, 1-5</p>').options.length, 1);
  const onlyReference = '<p>Выбіраюцца найбольш адпаведныя тэксты з Агульных тэкстаў пра святых мужчын, с. 1.</p>';
  const choices = getReadingChoices(onlyReference);
  assert.equal(choices.notes.length, 0);
  assert.equal(choices.options.length, 1);
  assert.match(plain(choices.options[0].html), /^Выбіраюцца/u);
});

test('other fields and kinds keep their choices: the new rules are for office readings only', () => {
  const sample = '<p>Выбіраюцца найбольш адпаведныя тэксты.</p><hr /><p>Кніга Рут 1, 1-5</p>';
  assert.equal(getLiturgicalAlternatives(sample, 'reading').every((o) => !o.reference), true);
  const hymns = getLiturgicalAlternatives('<p>Гімн раз</p><hr /><p>Або: Гімн два</p>', 'hymn');
  assert.equal(hymns.length, 2);
});

test('holy-men R2 (the legal set the reference points to) offers exactly the two volume texts in every period', () => {
  ['advent', 'christmas', 'lent', 'easter'].forEach((period) => {
    assert.deepEqual(getReadingChoices(inSeason(men, period).officeOfReadingsR2).options.map((o) => o.title), WORKS, period);
  });
});

test('a retained local proper of a holy woman in Easter keeps its reading choices (Jadwiga, no general diocesan assignment)', () => {
  const date = '2038-06-08';
  const resolved = resolveLiturgicalDate(date, { diocese: 'grodno', dioceseLayer: { add: [{ id: 'sv-jadwiga-queen', title: 'Св. Ядвігі, каралевы', rank: 'memoria', category: 'saint', layer: 'diocese', dioceseId: 'grodno', date: { type: 'fixed', month: 6, day: 8 }, templates: ['holy-women'], defaultTemplate: 'holy-women', daysRef: { source: 'fixed', _date: '08.06', dayIds: ['08-06-sv-jadwiga-queen-grodno'] } }] } });
  assert.equal(resolved.period, 'easter');
  const templates = new Map(buildFeastTargets().templates.map(({ id, data }) => [id, { id, ...data }]));
  const properDocs = fs.readdirSync(path.join(ROOT, 'patchs', 'db-feasts')).filter((n) => n.endsWith('.json')).map((n) => {
    const { _id, ...rest } = JSON.parse(fs.readFileSync(path.join(ROOT, 'patchs', 'db-feasts', n), 'utf8'));
    return { id: _id, ...rest };
  });
  const { context, daysResult } = daysFixture(resolved, { migrated: false });
  const result = buildOrdoDayOptions({
    resolved, context, date, diocese: 'grodno', templates,
    daysResult: { ...daysResult, properDays: properDocs.filter((doc) => doc._date === moment(date).format('DD.MM')) },
  });
  const card = result.dayOptions.find((option) => /jadwiga/u.test(option.ordo?.optionId || ''));
  assert.ok(card, 'the memorial of St Jadwiga is offered');
  // the memorial's own card says «з дня»; the Common formulary of holy women is its template
  const commonCard = card.templates.find((item) => /--holy-women$/u.test(item.id));
  assert.ok(commonCard, 'the Common of holy women is offered');
  const text = commonCard.day.officeOfReadingsR2;
  const { notes, options } = getReadingChoices(text);
  assert.equal(notes.length, 1);
  assert.deepEqual(options.map((o) => o.title), WORKS);
});

test('the picked reading is remembered per field, day and Office option, and reset by any change of them', () => {
  const memory = new Map();
  const storage = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };
  const day = readingChoiceContext('2026-12-04', 'grodno-cathedral-dedication');
  let store = createReadingChoiceStore(storage);
  assert.equal(store.get('officeOfReadingsR2', day, 3), 0);
  store.set('officeOfReadingsR2', day, 1);
  assert.equal(store.get('officeOfReadingsR2', day, 3), 1);
  assert.equal(store.get('officeOfReadingsR1', day, 3), 0, 'another field');
  assert.equal(store.get('officeOfReadingsR2', readingChoiceContext('2026-12-05', 'grodno-cathedral-dedication'), 3), 0, 'another day');
  assert.equal(store.get('officeOfReadingsR2', readingChoiceContext('2026-12-04', 'other-option'), 3), 0, 'Proper ↔ Common switch');
  assert.equal(store.get('officeOfReadingsR2', day, 1), 0, 'fewer readings than the stored index');
  store = createReadingChoiceStore(storage);
  assert.equal(store.get('officeOfReadingsR2', day, 3), 1, 'survives a page reload of the same session');
  // writing in another context replaces the entry: coming back to the first day starts from the default again
  store.set('officeOfReadingsR2', readingChoiceContext('2026-12-05', 'x'), 2);
  assert.equal(store.get('officeOfReadingsR2', day, 3), 0);
  store.set('officeOfReadingsR2', readingChoiceContext('2026-12-05', 'x'), 0);
  assert.equal(JSON.parse(memory.get(READING_CHOICE_STORAGE_KEY)).officeOfReadingsR2, undefined);
});

test('a broken or missing storage only means "no memory"', () => {
  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  const store = createReadingChoiceStore(broken);
  store.set('officeOfReadingsR2', 'a|b', 1);
  assert.equal(store.get('officeOfReadingsR2', 'a|b', 3), 1, 'kept in memory for the page');
  assert.equal(createReadingChoiceStore(null).get('x', 'y'), 0);
  const garbage = createReadingChoiceStore({ getItem: () => '[1,2', setItem() {} });
  assert.equal(garbage.get('x', 'y'), 0);
});

test('religious R1: the responsory variant «Пра законніцу» stays inside its reading, it is not a second reading (found on screen, D1 phase 8)', () => {
  const religious = template('religious');
  const expectedReading = {
    base: /Філіпянаў 3, 7 – 4, 1\. 4-9/u, advent: /Эфесцаў 4, 1-24/u, christmas: /Эфесцаў 4, 1-24/u, lent: /Эфесцаў 4, 1-24/u, easter: /Эфесцаў 4, 1-24/u,
  };
  const variant = { base: /Пс 45 \(44\), 2/u, advent: /Лк 10, 42\. 39/u, christmas: /Лк 10, 42\. 39/u, lent: /Лк 10, 42\. 39/u, easter: /Лк 10, 42\. 39/u };
  for (const season of Object.keys(expectedReading)) {
    const source = season === 'base' ? religious.officeOfReadingsR1 : religious._seasonalVariants[season].officeOfReadingsR1;
    const { options } = getReadingChoices(source);
    assert.equal(options.length, 1, `${season}: one reading, no responsory pseudo-choice`);
    assert.match(options[0].title, expectedReading[season], `${season}: the title names the reading`);
    const text = plain(options[0].html);
    assert.match(text, /Пра закон[нn][іi]цу/u, `${season}: the printed variant for a woman is kept in the text`);
    assert.match(text, variant[season], `${season}: its citation is kept`);
    assert.ok(text.indexOf('Пра закон') > text.indexOf('К. '), `${season}: it follows the responsory of the reading`);
  }
});

test('responsory variants are only merged when they are responsory-only blocks: real alternative readings stay choices', () => {
  const html = '<p>Пасланне св. апостала Паўла да Рымлянаў 12, 1-21</p><p>Тэкст адзін</p><hr /><p>Пасланне св. апостала Паўла да Эфесцаў 5, 21-32</p><p>Тэкст два</p>';
  assert.equal(getReadingChoices(html).options.length, 2);
  assert.equal(getReadingChoices(women.officeOfReadingsR1).options.length, 5);
});

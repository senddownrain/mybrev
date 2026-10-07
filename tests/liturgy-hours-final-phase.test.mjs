/**
 * Final phase — Liturgy of the Hours (spec §5.17, §7–10, §21 Hours, §25):
 * structured refs, source imports from the checked-in lh.catholic.by pages,
 * confirmed scaffold Commons, legacy reconciliation and source identities.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import moment from '../src/utils/moment-be.js';
import { resolveRuntimeDay, officeDescriptorOf } from '../src/utils/ordo/runtime.js';
import { buildOrdoDayOptions, CURRENT_DAY_LABEL } from '../src/utils/ordoDayOptions.js';
import { CURRENT_DAY_CHOICE, assembleOffice } from '../src/utils/ordo/officeAssembly.js';
import { describeFieldRule, fieldRuleKind, isValidFieldRule } from '../src/utils/ordo/fieldRules.js';
import { OFFICE_TEXT_FIELDS } from '../src/constants/officeFields.js';
import { classifyValue, splitSource } from '../scripts/lib/feast-content.mjs';
import {
  extractPageFields, hoursWithForeignIdentity, parseLhPage, plain, sourceIdentityOf,
} from '../scripts/liturgy/lib/lh-catholic-by.mjs';
import { pageFields, planTemporalImports, planProperImports } from '../scripts/liturgy/lib/hours-source-imports.mjs';
import { reconcileLegacyDifference } from '../scripts/liturgy/lib/legacy-reconciliation.mjs';
import { daysFixture, templatesFixture } from './helpers/ordo-days-fixture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
const PROPERS = fs.readdirSync(path.join(ROOT, 'patchs', 'db-feasts')).filter((name) => name.endsWith('.json')).map((name) => {
  const { _id, ...rest } = read(`patchs/db-feasts/${name}`);
  return { id: _id, ...rest };
});
const proper = (id) => PROPERS.find((doc) => doc.id === id);
const TEMPLATES = templatesFixture();
const DAY = Object.fromEntries(OFFICE_TEXT_FIELDS.map((field) => [field, `day:${field}`]));
const page = (file) => parseLhPage(fs.readFileSync(path.join(ROOT, 'patchs', 'sources', 'lh-catholic-by', file), 'utf8'));

function assemble(date, celebrationId, { choice, diocese = 'minsk-mohilev', currentDay = DAY } = {}) {
  const resolved = resolveRuntimeDay(date, { diocese });
  const office = officeDescriptorOf(resolved, celebrationId);
  assert.ok(office, `${celebrationId} is an option on ${date}`);
  const doc = PROPERS.find((item) => item._celebrationId === celebrationId
    && (!item._place || [].concat(item._place).includes(diocese)));
  return assembleOffice({ proper: doc, office, templates: TEMPLATES, choice, currentDay });
}

function content(date, { diocese = 'minsk-mohilev' } = {}) {
  const resolved = resolveRuntimeDay(date, { diocese });
  const { context, daysResult } = daysFixture(resolved, { migrated: false });
  const ddmm = moment(date).format('DD.MM');
  return buildOrdoDayOptions({
    resolved, daysResult: { ...daysResult, properDays: PROPERS.filter((doc) => doc._date === ddmm) }, context, date, diocese, templates: TEMPLATES,
  });
}

// ------------------------------------------------------------ rule kinds --

test('structured rule kinds are validated and described, never raw instructions', () => {
  assert.equal(fieldRuleKind({ ref: 'laudesHymn' }), 'same-day-field');
  assert.equal(fieldRuleKind({ source: 'proper' }), 'proper');
  assert.equal(fieldRuleKind({ source: 'template' }), 'invalid');
  assert.ok(!isValidFieldRule({ source: 'Гімн з Ютрані' }));
  assert.match(describeFieldRule({ ref: 'officeOfReadingsHymn' }), /гімн Гадзіны чытанняў/);
  assert.deepEqual(classifyValue('laudesHymn', ['Гімн з Уласных тэкстаў пра святых.']), { kind: 'rule', rule: { source: 'proper' } });
  const split = splitSource({ vesperHymn: '', _fieldRules: { vesperHymn: { ref: 'laudesHymn' }, laudesPr: { source: 'nonsense' } } });
  assert.deepEqual(split.rules.vesperHymn, { ref: 'laudesHymn' });
  assert.equal(split.report.invalidRules.length, 1);
});

test('§7.1 apostles Common laudesHymn is a structured Proper ref, not a literal instruction', () => {
  const apostles = TEMPLATES.get('apostles');
  assert.equal(apostles.laudesHymn, undefined);
  assert.deepEqual(apostles._fieldRules.laudesHymn, { source: 'proper' });
  // Every apostle celebration provides it (own text or its own rule).
  PROPERS.filter((doc) => (doc._templates || []).includes('apostles'))
    .forEach((doc) => assert.ok(doc.laudesHymn || doc._fieldRules?.laudesHymn, doc.id));
  // A Proper without the hymn is reported, never filled from the weekday.
  const resolved = resolveRuntimeDay('2026-07-25', { diocese: 'minsk-mohilev' });
  const office = officeDescriptorOf(resolved, 'sv-james-apostle');
  const { day, integrity, missing } = assembleOffice({
    proper: { ...proper('25-07-sv-james-apostle'), laudesHymn: undefined }, office, templates: TEMPLATES, currentDay: DAY,
  });
  assert.equal(day.laudesHymn, '');
  assert.ok(missing.includes('laudesHymn'));
  assert.ok(integrity.some((item) => item.source === 'proper' && item.field === 'laudesHymn'));
  assert.equal(assemble('2026-07-25', 'sv-james-apostle').day.laudesHymn, proper('25-07-sv-james-apostle').laudesHymn);
});

test('§7.2 Matthias: Lauds hymn = the Office of Readings hymn (same-day field)', () => {
  const doc = proper('14-05-sv-matthias');
  assert.deepEqual(doc._fieldRules.laudesHymn, { ref: 'officeOfReadingsHymn' });
  assert.equal(doc.laudesHymn, undefined);
  const { day, provenance } = assemble('2027-05-14', 'sv-matthias');
  assert.equal(day.laudesHymn, doc.officeOfReadingsHymn);
  assert.equal(provenance.laudesHymn, 'ref:officeOfReadingsHymn');
});

test('§7.3 Cyril & Methodius: Vespers hymn is the confirmed full Lauds hymn', () => {
  const doc = proper('14-02-sv-cyril-methodius');
  assert.match(plain(doc.vesperHymn), /^Браты, абраныя Богам/);
  assert.equal(plain(doc.vesperHymn), plain(pageFields('2026-02-14.html').fields.laudesHymn));
  assert.doesNotMatch(JSON.stringify(read('patchs/feasts/14-02-sv-cyril-methodius.json')), /с\. 1279/);
  assert.equal(plain(assemble('2028-02-14', 'sv-cyril-methodius').day.vesperHymn), plain(doc.laudesHymn));
});

test('§7.4 Holy Name (03.01): no Common, the Office is the Christmas weekday', () => {
  const doc = proper('03-01-holy-name-of-jesus');
  assert.deepEqual(doc._templates, []);
  assert.equal(doc._officeSource, 'current-day');
  assert.equal(doc._templatesConfirmed, true);
  const option = content('2027-01-03').dayOptions.find((item) => item.ordo?.optionId === 'holy-name-of-jesus')
    || content('2026-01-03').dayOptions.find((item) => item.ordo?.optionId === 'holy-name-of-jesus');
  assert.ok(option);
  assert.deepEqual(option.templates.map((item) => item.choice), [CURRENT_DAY_CHOICE]);
  assert.equal(option.templates[0].label, CURRENT_DAY_LABEL);
});

test('§7.5–7.7 confirmed Commons: Juan Diego, Dismas (holy men), Jadwiga (holy women)', () => {
  assert.deepEqual(proper('09-12-sv-juan-diego')._templates, ['holy-men']);
  assert.deepEqual(proper('26-03-sv-dismas-pinsk')._templates, ['holy-men']);
  assert.deepEqual(proper('08-06-sv-jadwiga-queen-grodno')._templates, ['holy-women']);
  ['09-12-sv-juan-diego', '26-03-sv-dismas-pinsk', '08-06-sv-jadwiga-queen-grodno'].forEach((id) => {
    assert.equal(proper(id)._templatesConfirmed, true, id);
    assert.equal(proper(id)._templatesInferred, undefined, id);
  });
  // §7.8: other scaffolds keep the automatic inference.
  assert.equal(proper('05-09-sv-teresa-calcutta')._templatesInferred, true);
});

// ------------------------------------------------------- source imports --

test('§25 07.06.2023: daytime is IX week Wednesday, Vespers belong to Corpus Christi', () => {
  const p = page('2023-06-07.html');
  const day = sourceIdentityOf(p, 'lauds');
  const evening = sourceIdentityOf(p, 'vespers');
  assert.match(day.title, /ІХ звычайны тыдзень/);
  assert.equal(sourceIdentityOf(p, 'officeOfReadings').title, day.title);
  assert.match(evening.title, /ЦЕЛА І КРЫВІ ХРЫСТА/);
  assert.equal(evening.firstVespers, true);
  assert.notEqual(evening.title, day.title);
  assert.deepEqual(hoursWithForeignIdentity(p), ['vespers']);
  const { fields, foreign } = extractPageFields(p);
  assert.equal(fields.vesperHymn, undefined, 'no Vespers field from a foreign identity');
  assert.ok(foreign[0].fields.vesper1Hymn);
  // The importer never takes ordinary-w9-d4 Vespers from this page.
  const w9 = planTemporalImports([{ id: 'ordinary-w9-d4' }, { id: 'ordinary-w21-d3' }, { id: 'ordinary-w21-d4' }], ROOT)
    .find((item) => item.id === 'ordinary-w9-d4');
  assert.equal(w9.page, '2018-06-06.html');
});

test('§10 ordinary-w9-d4 Vespers: clean 06.06.2018 page = psalter week I Wednesday (30.08.2023)', () => {
  const clean = page('2018-06-06.html');
  assert.deepEqual(hoursWithForeignIdentity(clean), []);
  const a = extractPageFields(clean).fields;
  const b = pageFields('2023-08-30.html').fields;
  ['vesperHymn', 'vesperAnt1', 'vesperPs1', 'vesperR', 'vesperAntMag', 'vesperInter', 'vesperPr']
    .forEach((field) => assert.equal(plain(a[field]), plain(b[field]), field));
  assert.match(plain(a.vesperHymn), /^Найсвяцейшы Божа ў небе/);
});

test('§8.1 ordinary-w21-d3 (Tuesday) and -d4 (Wednesday): R1/R2 with responsories from the source', () => {
  const plan = planTemporalImports([
    { id: 'ordinary-w21-d3', _dayOfWeek: 3, officeOfReadingsR1: '', officeOfReadingsR2: '' },
    { id: 'ordinary-w21-d4', _dayOfWeek: 4, officeOfReadingsR1: '', officeOfReadingsR2: '' },
    { id: 'ordinary-w9-d4' },
  ], ROOT);
  const d3 = plan.find((item) => item.id === 'ordinary-w21-d3');
  const d4 = plan.find((item) => item.id === 'ordinary-w21-d4');
  assert.equal(pageFields('2026-08-25.html').identity.title.replace(/\s/g, ''), 'ХХІзвычайнытыдзень');
  assert.match(page('2026-08-25.html').header.weekday, /Аўторак/);
  assert.match(page('2023-08-30.html').header.weekday, /Серада/);
  assert.match(plain(d3.fields.officeOfReadingsR1), /^Першае чытанне Пачатак кнігі прарока Ераміі 1, 1-19/);
  assert.match(plain(d3.fields.officeOfReadingsR1), /Рэспансорый Ер 1, 5аb/);
  assert.match(plain(d3.fields.officeOfReadingsR2), /^Другое чытанне Гамілія св. Яна Хрызастома/);
  assert.match(plain(d3.fields.officeOfReadingsR2), /Рэспансорый Тоб 12/);
  assert.match(plain(d4.fields.officeOfReadingsR1), /Кніга прарока Ераміі 2, 1-13/);
  assert.match(plain(d4.fields.officeOfReadingsR2), /Настаўленні св. Калумбана/);
  [d3, d4].forEach((item) => {
    assert.ok(plain(item.fields.officeOfReadingsR1).length > 1000);
    assert.doesNotMatch(plain(item.fields.officeOfReadingsR2), /МАЛІТВА/);
  });
});

test('§8.2 lent-w5-d1 is created complete enough for every hour', () => {
  const plan = planTemporalImports([{ id: 'ordinary-w9-d4' }, { id: 'ordinary-w21-d3' }, { id: 'ordinary-w21-d4' }], ROOT);
  const lent = plan.find((item) => item.id === 'lent-w5-d1');
  assert.equal(lent.action, 'create');
  assert.equal(lent.fields._periodType, 'lent');
  assert.equal(lent.fields._periodWeekNumber, 5);
  assert.equal(lent.fields._dayOfWeek, 1);
  const required = OFFICE_TEXT_FIELDS.filter((field) => !/^sext\dAnt[23]$/.test(field));
  required.forEach((field) => assert.ok(plain(lent.fields[field]), field));
  assert.equal(lent.fields.officeOfReadingsTeDeum, '', 'no Te Deum on a Sunday of Lent');
  assert.match(plain(lent.fields.laudesAntBen), /Год А:.*Год B:.*Год C:/);
});

test('§5.17 St Andrew Bobola: own R2 and hymns from the 16.05.2025 source survive every choice', () => {
  const source = pageFields('2025-05-16.html').fields;
  const doc = proper('16-05-sv-andrei-bobola');
  ['officeOfReadingsR1', 'officeOfReadingsR2', 'officeOfReadingsHymn', 'laudesHymn', 'vesperHymn', 'laudesPr']
    .forEach((field) => assert.equal(plain(doc[field]), plain(source[field]), field));
  assert.match(plain(doc.officeOfReadingsR2), /Энцыкліка папы Пія ХІІ/);
  assert.deepEqual(planProperImports(ROOT), [], 'the sources are already imported');
});

test('§8.3 Vitebsk 12.06 martyrs: optional memorial, martyrs Common, sparse Proper', () => {
  const doc = proper('12-06-bl-antoni-leszczewicz-jerzy-kaszyra-vitebsk');
  assert.equal(doc._rank, 'memoria-ad-libitum');
  assert.equal(doc._place, 'vitebsk');
  assert.deepEqual(doc._templates, ['martyrs-many']);
  assert.match(plain(doc.officeOfReadingsR2), /З духоўнай канферэнцыі бл. Юрыя Кашыры/);
  assert.match(plain(doc.officeOfReadingsR2), /Рэспансорый У. Калі мы змагаемся/);
  assert.match(plain(doc.officeOfReadingsPr), /^Усемагутны, спрадвечны Божа, Ты даў удзел/);
  ['laudesHymn', 'vesperHymn', 'laudesAntBen', 'vesperAntMag'].forEach((field) => assert.equal(doc[field], undefined, field));
  // 2027-06-12 (Saturday): «З дня» first, the Common allowed, own R2 kept.
  const option = content('2027-06-12', { diocese: 'vitebsk' }).dayOptions
    .find((item) => item.ordo?.optionId === 'bl-antoni-leszczewicz-jerzy-kaszyra');
  assert.ok(option, 'offered in Vitebsk');
  assert.deepEqual(option.templates.map((item) => item.choice), [CURRENT_DAY_CHOICE, 'martyrs-many']);
  option.templates.forEach(({ day }) => assert.equal(day.officeOfReadingsR2, doc.officeOfReadingsR2));
  assert.ok(!content('2027-06-12', { diocese: 'minsk-mohilev' }).dayOptions
    .some((item) => item.ordo?.optionId === 'bl-antoni-leszczewicz-jerzy-kaszyra'));
});

// --------------------------------------------------- legacy reconciliation --

test('§9.2 18.11: own elements from the source, Vespers hymn → Lauds hymn (structured)', () => {
  const doc = proper('18-11-dedication-basilicas-peter-paul');
  assert.deepEqual(doc._fieldRules.vesperHymn, { ref: 'laudesHymn' });
  assert.equal(doc.vesperHymn, undefined);
  assert.deepEqual(doc._templates, ['apostles']);
  assert.match(plain(doc.officeOfReadingsR2), /Казанне св. Льва Вялікага.*Рэспансорый Н. Святыя Апосталы/);
  const { day } = assemble('2026-11-18', 'dedication-basilicas-peter-paul', { choice: 'apostles' });
  assert.equal(day.vesperHymn, doc.laudesHymn);
  assert.equal(day.vesperPr, doc.laudesPr);
  // GILH 236: Daytime Prayer of a memorial is of the weekday (the legacy copy repeated the collect).
  ['sext1Pr', 'sext2Pr', 'sext3Pr'].forEach((field) => assert.equal(day[field], DAY[field], field));
});

test('§9.1 All Faithful Departed matches the 02.11.2026 source in the compared fields', () => {
  const source = pageFields('2026-11-02.html').fields;
  const { day } = assemble('2026-11-02', 'all-faithful-departed');
  ['laudesAnt3', 'laudesPr', 'sext1Pr', 'sext2Pr', 'sext3Pr', 'vesperPr', 'officeOfReadingsPr', 'sext1Hymn', 'sext2Ps1', 'sext3Ps3', 'laudesAntBen']
    .forEach((field) => assert.equal(plain(day[field]), plain(source[field]), field));
  assert.match(plain(day.laudesAnt3), /^3 ант. Буду славіць Пана \* ў сваім жыцці\.$/);
});

test('§9.3 Holy Innocents: one Daytime antiphon, as in the 28.12 source', () => {
  const source = pageFields('2023-12-28.html').fields;
  const { day } = assemble('2026-12-28', 'holy-innocents');
  // Vespers in the octave are of the octave day (source: «Святая і беззаганная Дзева…»).
  assert.equal(day.vesperAntMag, DAY.vesperAntMag);
  ['laudesAntBen', 'laudesAnt1', 'sext1R'].forEach((field) => assert.equal(plain(day[field]).toLowerCase(), plain(source[field]).toLowerCase(), field));
  // Daytime antiphons are those of the octave day (current day), one per hour.
  ['sext1Ant1', 'sext2Ant1', 'sext3Ant1'].forEach((field) => assert.equal(day[field], DAY[field], field));
  ['sext2Ant2', 'sext3Ant2'].forEach((field) => {
    assert.equal(source[field], undefined);
    assert.ok(!plain(day[field]) || day[field] === DAY[field], field);
  });
});

test('every former unexplained legacy difference has a source verdict', () => {
  const cases = [
    { optionId: 'all-faithful-departed', field: 'laudesAnt3', legacy: '3 ант. Буду славіць Пана * ў сваім жыцці. 3 ант. Усё жывое * няхай хваліць Пана.', assembled: '3 ант. Буду славіць Пана * ў сваім жыцці.' },
    { optionId: 'dedication-basilicas-peter-paul', field: 'sext1Pr', legacy: 'Усемагутны вечны Божа, захавай Твой Касцёл', assembled: 'Пане, Святы Ойча' },
    { optionId: 'holy-innocents', field: 'sext2Ant2', legacy: '``` ## sext2Ant3', assembled: '' },
  ];
  cases.forEach((item) => {
    const verdict = reconcileLegacyDifference(item, ROOT);
    assert.ok(verdict, item.field);
    assert.equal(verdict.winner, 'assembled', item.field);
    assert.ok(verdict.source, item.field);
  });
});

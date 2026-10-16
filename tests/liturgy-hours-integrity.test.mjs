/**
 * Hours data integrity (next phase): instruction normalization, field audit
 * classification, the Office assembler's reusable sources and the web
 * pipeline with `liturgicalProperTexts` preferred over legacy fixed `days`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import moment from '../src/utils/moment-be.js';
import { resolveRuntimeDay, dynamicFeastCodesOf, legacyContextOf, officeDescriptorOf } from '../src/utils/ordo/runtime.js';
import { buildOrdoDayOptions, CURRENT_DAY_LABEL, PROPER_SOURCE } from '../src/utils/ordoDayOptions.js';
import { CURRENT_DAY_CHOICE, assembleOffice } from '../src/utils/ordo/officeAssembly.js';
import { assembleDaysResult } from '../src/utils/daysResult.js';
import { getSeasonalDateDocumentId } from '../src/utils/liturgicalDayResolution.js';
import { COMPLEMENTARY_PSALMODY_TEMPLATE, OFFICE_TEXT_FIELDS, SUNDAY_WEEK_1_TEMPLATE } from '../src/constants/officeFields.js';
import { classifyValue, splitSource, stripLeadingHeading } from '../scripts/lib/feast-content.mjs';
import { classifyField, FIELD_VALUE_TYPE, NOT_RENDERABLE } from '../scripts/liturgy/lib/field-audit.mjs';
import { consensus, planTemporalRepairs } from '../scripts/liturgy/lib/temporal-repairs.mjs';
import { extractComplementaryPsalmody } from '../scripts/liturgy/extract-complementary-psalmody.mjs';
import { daysFixture, templatesFixture } from './helpers/ordo-days-fixture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROPERS = fs.readdirSync(path.join(ROOT, 'patchs', 'db-feasts')).filter((name) => name.endsWith('.json')).map((name) => {
  const { _id, ...rest } = JSON.parse(fs.readFileSync(path.join(ROOT, 'patchs', 'db-feasts', name), 'utf8'));
  return { id: _id, ...rest };
});
const TEMPLATES = templatesFixture();
const plain = (value) => (Array.isArray(value) ? value.join(' ') : String(value ?? '')).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

/** Web pipeline of a date; `propers: false` = Firestore before the migration. */
function content(date, { diocese = 'minsk-mohilev', propers = true, withoutDynamic = [] } = {}) {
  const resolved = resolveRuntimeDay(date, { diocese });
  const { context, daysResult } = daysFixture(resolved, { migrated: false });
  const ddmm = moment(date).format('DD.MM');
  const withPropers = {
    ...daysResult,
    properDays: propers ? PROPERS.filter((doc) => doc._date === ddmm) : [],
    // The fixture synthesizes a document for every movable feast; Firestore has none for some.
    dynamicDaysByFeast: new Map([...daysResult.dynamicDaysByFeast].filter(([code]) => !withoutDynamic.includes(code))),
  };
  return buildOrdoDayOptions({ resolved, daysResult: withPropers, context, date, diocese, templates: TEMPLATES });
}
const optionOf = (result, id) => result.dayOptions.find((option) => option.ordo?.optionId === id);

// ---------------------------------------------------------------------------
// Instruction normalization (import time, never at runtime)
// ---------------------------------------------------------------------------

test('known instructions become structured rules', () => {
  const rule = (field, value) => classifyValue(field, value);
  assert.deepEqual(rule('vesperHymn', 'Гімн з Ютрані').rule, { ref: 'laudesHymn' });
  assert.deepEqual(rule('vesperPr', 'Малітва з Ютрані').rule, { ref: 'laudesPr' });
  assert.deepEqual(rule('officeOfReadingsPr', 'Малітва з Агульных тэкстаў').rule, { source: 'common' });
  assert.deepEqual(rule('sext1Ps1', 'from-day').rule, { source: 'current-day' });
  assert.deepEqual(rule('sext1Ps1', 'з будня').rule, { source: 'current-day' });
  assert.deepEqual(rule('laudesPs1', 'from-first-week').rule, { source: 'sunday-week-1' });
  assert.deepEqual(rule('laudesPs1', ['з нядзелі І тыдня']).rule, { source: 'sunday-week-1' });
  assert.deepEqual(rule('laudesPs1', ['з нядзелі I тыдня']).rule, { source: 'sunday-week-1' });
  assert.deepEqual(rule('laudesInter', 'Просьбы з Агульных тэкстаў пра святых жанчын, або з будня').rule,
    { source: 'template', template: 'holy-women', allowCurrentDay: true });
});

test('a whole-hour instruction covers every field of that hour without own text', () => {
  const { texts, rules } = splitSource({
    vesperHymn: 'Усё бярэцца з бягучага дня',
    vesperPr: '<p>Уласная малітва празднавання, якая застаецца ўласнай.</p>',
  });
  assert.deepEqual(rules.vesperHymn, { source: 'current-day' });
  assert.deepEqual(rules.vesperPs1, { source: 'current-day' });
  assert.deepEqual(rules.vesperAntMag, { source: 'current-day' });
  assert.ok(texts.vesperPr && !rules.vesperPr);
});

test('page references are unresolved, never text', () => {
  assert.equal(classifyValue('vesperHymn', ['Гімн, с. 1279']).kind, 'unresolved');
  assert.equal(classifyValue('laudesR', 'Чытанне, с. 455').kind, 'unresolved');
  assert.equal(classifyValue('laudesAnt1', '3 ант. Усё, што дыхае, * няхай хваліць Пана, / аллелюя.').kind, 'text');
});

test('the printed heading of the intercessions is not part of the text', () => {
  assert.equal(stripLeadingHeading('laudesInter', '<p><span style="color:#f00">Просьбы</span><br />Пакорна просім</p>'), '<p>Пакорна просім</p>');
  assert.equal(stripLeadingHeading('laudesPr', '<p>Просьбы</p>'), '<p>Просьбы</p>');
});

// ---------------------------------------------------------------------------
// Field audit classification
// ---------------------------------------------------------------------------

test('field audit: instructions, short suspicious values, real short antiphons', () => {
  const type = (field, value, rule) => classifyField(field, value, { rule }).type;
  assert.equal(type('laudesPs1', ['з нядзелі І тыдня']), FIELD_VALUE_TYPE.SOURCE_RULE);
  assert.equal(type('vesperHymn', 'Гімн з Ютрані'), FIELD_VALUE_TYPE.STRUCTURED_REFERENCE);
  assert.equal(type('vesperHymn', 'Гімн, с. 1279'), FIELD_VALUE_TYPE.UNRESOLVED_REFERENCE);
  assert.equal(type('laudesPs1', 'Псальмы з дня'), FIELD_VALUE_TYPE.SUSPICIOUS_SHORT_TEXT);
  assert.equal(type('laudesAnt1', 'Ант. Аллелюя.'), FIELD_VALUE_TYPE.REAL_TEXT);
  assert.equal(type('vesperInter', '', { omit: true }), FIELD_VALUE_TYPE.OMIT);
  assert.equal(type('vesperInter', undefined), FIELD_VALUE_TYPE.EMPTY_ALLOWED);
  assert.ok(NOT_RENDERABLE.has(FIELD_VALUE_TYPE.SUSPICIOUS_SHORT_TEXT));
});

// ---------------------------------------------------------------------------
// Assembler: reusable sources
// ---------------------------------------------------------------------------

const DAY = Object.fromEntries(OFFICE_TEXT_FIELDS.map((field) => [field, `day:${field}`]));

test('«… або з будня»: the Common, but «З дня» keeps the weekday', () => {
  const office = officeDescriptorOf(resolveRuntimeDay('2026-10-06', { diocese: 'minsk-mohilev' }), 'sv-bruno');
  const proper = {
    id: 'x', _schema: 2, _templates: ['holy-women'], _defaultTemplate: 'holy-women',
    _fieldRules: { laudesInter: { source: 'template', template: 'holy-women', allowCurrentDay: true } },
  };
  const common = assembleOffice({ proper, office, templates: TEMPLATES, choice: 'holy-women', currentDay: DAY });
  const day = assembleOffice({ proper, office, templates: TEMPLATES, choice: CURRENT_DAY_CHOICE, currentDay: DAY });
  assert.equal(common.day.laudesInter, TEMPLATES.get('holy-women').laudesInter);
  assert.equal(day.day.laudesInter, 'day:laudesInter');
});

test('complementary psalmody exists and is never silently replaced by the day', () => {
  const complementary = TEMPLATES.get(COMPLEMENTARY_PSALMODY_TEMPLATE);
  assert.match(plain(complementary.sext1Ps1), /^Псальм 120/);
  assert.match(plain(complementary.sext3Ps3), /^Псальм 128/);
  const office = officeDescriptorOf(resolveRuntimeDay('2026-08-15', { diocese: 'minsk-mohilev' }), 'assumption-blessed-virgin-mary');
  const proper = { id: 'x', _schema: 2, _templates: [] };
  const withIt = assembleOffice({ proper, office, templates: TEMPLATES, currentDay: DAY });
  assert.equal(withIt.day.sext2Ps1, complementary.sext2Ps1);
  const without = new Map([...TEMPLATES].filter(([id]) => id !== COMPLEMENTARY_PSALMODY_TEMPLATE));
  const missing = assembleOffice({ proper, office, templates: without, currentDay: DAY });
  assert.equal(missing.day.sext2Ps1, '');
  assert.ok(missing.missing.includes('sext2Ps1'));
  assert.ok(missing.day._integrityErrors.some((item) => item.field === 'sext2Ps1' && item.reason === 'template-missing'));
});

test('complementary psalmody is extracted only from identical sources', () => {
  const psalm = (n) => `<p>Псальм ${n} (${n - 1}) тэкст</p>`;
  const fields = ['sext1', 'sext2', 'sext3'].flatMap((h, i) => [1, 2, 3].map((k) => [`${h}Ps${k}`, psalm(120 + i * 3 + k - 1)]));
  const doc = (id, change = {}) => ({ id, ...Object.fromEntries(fields), ...change });
  assert.deepEqual(extractComplementaryPsalmody([doc('a'), doc('b')]).sources, ['a', 'b']);
  assert.throws(() => extractComplementaryPsalmody([doc('a'), doc('b', { sext1Ps1: '<p>Псальм 120 (119) іншы</p>' })]), /differs/);
});

test('All Souls takes the Office for the Dead, not the weekday', () => {
  const resolved = resolveRuntimeDay('2026-11-02', { diocese: 'minsk-mohilev' });
  const office = officeDescriptorOf(resolved, 'all-faithful-departed');
  const proper = PROPERS.find((doc) => doc._celebrationId === 'all-faithful-departed');
  const { day } = assembleOffice({ proper, office, templates: TEMPLATES, currentDay: DAY });
  assert.equal(day.officeOfReadingsPs1, TEMPLATES.get('office-for-dead').officeOfReadingsPs1);
  assert.notEqual(day.laudesPs1, 'day:laudesPs1');
});

// ---------------------------------------------------------------------------
// Web pipeline: liturgicalProperTexts preferred, legacy `days` only fallback
// ---------------------------------------------------------------------------

test('2026-10-02 Guardian Angels: real Sunday week I psalms, own antiphons, no instruction', () => {
  const option = optionOf(content('2026-10-02'), 'holy-guardian-angels');
  assert.equal(option.ordo.properSource, PROPER_SOURCE.PROPER_TEXTS);
  const sunday = TEMPLATES.get(SUNDAY_WEEK_1_TEMPLATE);
  const proper = PROPERS.find((doc) => doc.id === '02-10-holy-guardian-angels');
  option.templates.forEach(({ day }) => {
    assert.equal(day.laudesPs1, sunday.laudesPs1);
    assert.equal(day.laudesAnt1, proper.laudesAnt1);
    OFFICE_TEXT_FIELDS.forEach((field) => {
      if (/^day:/.test(day[field])) return; // the fixture's day text
      assert.ok(!NOT_RENDERABLE.has(classifyField(field, day[field]).type), `${field}: ${plain(day[field])}`);
    });
    assert.doesNotMatch(JSON.stringify(day), /з нядзелі [ІI] тыдня/i);
  });
});

test('2026-10-06 St Bruno: «З дня» first, Commons after, the Proper survives switching', () => {
  const option = optionOf(content('2026-10-06'), 'sv-bruno');
  assert.equal(option.ordo.properSource, PROPER_SOURCE.PROPER_TEXTS);
  assert.deepEqual(option.templates.map((item) => item.label), [CURRENT_DAY_LABEL, 'Пра пастыраў', 'Пра законнікаў']);
  assert.equal(option.day._assembly.choice, CURRENT_DAY_CHOICE);
  const own = PROPERS.find((doc) => doc.id === '06-10-sv-bruno').officeOfReadingsR2;
  option.templates.forEach(({ day }) => assert.equal(day.officeOfReadingsR2, own));
  // The old route ids still open the matching assembly.
  assert.deepEqual(option.templates.map((item) => item.id), ['06-10-sv-bruno', '06-10-sv-bruno--pastors', '06-10-sv-bruno--religious']);
});

test('before the migration Bruno depends on legacy days and has no «З дня»', () => {
  const option = optionOf(content('2026-10-06', { propers: false }), 'sv-bruno');
  assert.equal(option.ordo.properSource, PROPER_SOURCE.LEGACY_DAYS);
  assert.ok(!option.templates.some((item) => item.label === CURRENT_DAY_LABEL));
});

test('a movable memorial without a document is assembled from its Common', () => {
  const result = content('2026-05-25', { withoutDynamic: ['feast-marymotherchurch', 'marymotherchurch'] });
  const option = optionOf(result, 'mary-mother-church');
  assert.ok(option, 'Mary, Mother of the Church is offered');
  assert.deepEqual(option.templates.map((item) => item.choice), [CURRENT_DAY_CHOICE, 'blessed-virgin-mary']);
  assert.equal(option.templates[1].day.laudesHymn, TEMPLATES.get('blessed-virgin-mary')._mainSection.laudesHymn); // D-2: the main section, not the Saturday one
});

// ---------------------------------------------------------------------------
// Christmas octave: the date document is the day a sparse Proper completes from
// ---------------------------------------------------------------------------

test('26.12: the octave date document is the current day of St Stephen', () => {
  const mDate = moment('2026-12-26');
  assert.equal(getSeasonalDateDocumentId(mDate), 'christmas-26-12');
  assert.equal(getSeasonalDateDocumentId(moment('2027-01-12')), 'christmas-12-01');
  assert.equal(getSeasonalDateDocumentId(moment('2027-01-13')), null);
  const resolved = resolveRuntimeDay('2026-12-26', { diocese: 'minsk-mohilev' });
  const context = legacyContextOf(resolved);
  const octave = { id: 'christmas-26-12', sext1Ant1: 'octave:sext1Ant1', sext1Hymn: 'octave:sext1Hymn' };
  const daysResult = assembleDaysResult({
    mDate, context, dynamicFeastCodes: dynamicFeastCodesOf(resolved),
    periodDay: { id: 'advent-w4-d7', ...DAY }, seasonalDay: octave,
    properDocs: PROPERS.filter((doc) => doc._date === '26.12'),
  });
  assert.equal(daysResult.seasonalException, null); // 26.12 stays a fixed celebration
  assert.equal(daysResult.seasonalDateDay.id, 'christmas-26-12');
  const { dayOptions } = buildOrdoDayOptions({ resolved, daysResult, context, date: '2026-12-26', diocese: 'minsk-mohilev', templates: TEMPLATES });
  const stephen = dayOptions.find((option) => option.ordo?.optionId === 'sv-stephen-protomartyr');
  assert.equal(stephen.day.sext1Ant1, 'octave:sext1Ant1');
});

// ---------------------------------------------------------------------------
// Temporal repair plan
// ---------------------------------------------------------------------------

test('temporal repair fills only empty fields, from agreeing equivalents', () => {
  const doc = (week, dow, extra = {}) => ({ id: `ordinary-w${week}-d${dow}`, _periodType: 'ordinary', _periodWeekNumber: String(week), _dayOfWeek: String(dow), ...extra });
  const psalter = { laudesPs1: '<p>Псальм 5</p>', officeOfReadingsR1: 'R1', officeOfReadingsPr: 'collect' };
  const days = [
    doc(21, 3, { laudesPs1: '', officeOfReadingsR1: '', officeOfReadingsPr: '' }),
    ...[1, 5, 9, 13].map((week) => doc(week, 3, { ...psalter, officeOfReadingsR1: `R1 w${week}`, officeOfReadingsPr: `collect w${week}` })),
    ...[2, 4, 5].map((dow) => doc(21, dow, { officeOfReadingsPr: 'collect w21' })),
  ];
  const { repairs, unfillable } = planTemporalRepairs(days);
  const target = repairs.find((item) => item.id === 'ordinary-w21-d3');
  assert.equal(target.fields.laudesPs1, '<p>Псальм 5</p>');
  assert.equal(target.fields.officeOfReadingsPr, 'collect w21');
  assert.ok(!('officeOfReadingsR1' in target.fields));
  assert.ok(unfillable.some((item) => item.id === 'ordinary-w21-d3' && item.field === 'officeOfReadingsR1'));
  assert.equal(consensus([{ id: 'a', x: '1' }, { id: 'b', x: '2' }], 'x'), null);
});

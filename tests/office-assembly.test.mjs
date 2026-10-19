/**
 * Hours content architecture: sparse feast documents, Commons as reusable
 * templates, structured field rules and the Office assembly.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveLiturgicalDate } from '../src/utils/ordo/index.js';
import { resolveRuntimeDay } from '../src/utils/ordo/runtime.js';
import {
  CURRENT_DAY_CHOICE, assembleOffice, assemblyChoices, defaultTemplateOf, hoursContentStatus,
} from '../src/utils/ordo/officeAssembly.js';
import {
  FIRST_VESPER_FIELDS, OFFICE_CONTENT_FIELDS, OFFICE_FIELD_SLOTS, OFFICE_TEXT_FIELDS, SUNDAY_WEEK_1_TEMPLATE,
} from '../src/constants/officeFields.js';
import {
  buildOrdoDayOptions, contentDayMap, findOptionByDayId, findResolvedDayById, resolveLegacyTemplatePlaceholders,
} from '../src/utils/ordoDayOptions.js';
import { resolveDateDayAgainstPeriod, resolveDayAgainstPeriod } from '../src/utils/liturgicalDayResolution.js';
import { getCompletoriumWeekday, shouldShowTeDeum } from '../src/utils/liturgicalOffice.js';
import { classifyValue, inferTemplates, splitSource } from '../scripts/lib/feast-content.mjs';
import { daysFixture, templatesFixture } from './helpers/ordo-days-fixture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readDir = (dir) => fs.readdirSync(path.join(ROOT, dir)).filter((name) => name.endsWith('.json'))
  .map((name) => ({ name, data: JSON.parse(fs.readFileSync(path.join(ROOT, dir, name), 'utf8')) }));
const FEASTS = readDir('patchs/db-feasts');
const feast = (id) => FEASTS.find((item) => item.data._id === id).data;
const TEMPLATES = templatesFixture();
const currentDay = Object.fromEntries(OFFICE_TEXT_FIELDS.map((field) => [field, `day:${field}`]));
const officeOf = (date, id, diocese = 'minsk-mohilev') => {
  const day = resolveLiturgicalDate(date, { diocese });
  return [day.officeResolution.primary, ...day.officeResolution.alternatives].find((item) => item.optionId === id);
};

test('every Hours field has a slot of the Office descriptor', () => {
  const office = officeOf('2026-08-15', 'assumption-blessed-virgin-mary');
  OFFICE_TEXT_FIELDS.forEach((field) => {
    const [hour, component] = OFFICE_FIELD_SLOTS[field];
    assert.ok(office.hours[hour]?.[component], `${field} → ${hour}.${component}`);
  });
  assert.equal(OFFICE_CONTENT_FIELDS.length, OFFICE_TEXT_FIELDS.length + 1 + FIRST_VESPER_FIELDS.length);
});

test('generated feast documents are sparse: one per celebration, no placeholders', () => {
  assert.ok(FEASTS.length > 250);
  const text = FEASTS.map((item) => JSON.stringify(item.data)).join('\n');
  assert.doesNotMatch(text, /"(?:\[?from-day\]?|from-first-week|from-apostles|from-apostels|from-own-texts)"/);
  FEASTS.forEach(({ name, data }) => {
    assert.equal(data._schema, 2, name);
    assert.ok(!/--(?:pastors|doctors-of-church|religious|virgins|martyr-one|martyrs-many|holy-men|holy-women|educators|works-of-mercy|apostles|blessed-virgin-mary)\.json$/.test(name), `${name} is a per-template copy`);
    assert.ok(!('_currentVersion' in data), name);
    if (data._templates.length) assert.ok(data._templates.includes(data._defaultTemplate), name);
    // Instructions never stay as text.
    Object.entries(data).forEach(([field, value]) => {
      if (!OFFICE_FIELD_SLOTS[field] && !FIRST_VESPER_FIELDS.includes(field)) return;
      assert.notEqual(classifyValue(field, value).kind, 'rule', `${name}: ${field} is an instruction`);
    });
  });
  // Several Commons: one document, the former copies listed for the migration.
  const alphonsus = feast('01-08-sv-alphonsus-liguori');
  assert.deepEqual(alphonsus._templates, ['pastors', 'doctors-of-church']);
  assert.equal(alphonsus._defaultTemplate, 'pastors');
  assert.deepEqual(alphonsus._legacyIds, ['01-08-sv-alphonsus-liguori--pastors', '01-08-sv-alphonsus-liguori--doctors-of-church']);
  // The Common is not copied into the feast.
  assert.ok(!('laudesHymn' in alphonsus) && 'officeOfReadingsR2' in alphonsus && 'officeOfReadingsPr' in alphonsus);
  assert.equal(defaultTemplateOf(alphonsus), 'pastors');
});

test('Commons and the Sunday, week I psalter are reusable templates', () => {
  for (const id of ['pastors', 'doctors-of-church', 'religious', 'virgins', 'martyr-one', 'martyrs-many', 'apostles',
    'blessed-virgin-mary', 'church-dedication', 'holy-men', 'holy-women']) {
    assert.ok(TEMPLATES.has(id), id);
  }
  const sunday = TEMPLATES.get(SUNDAY_WEEK_1_TEMPLATE);
  assert.equal(sunday._kind, 'psalter');
  assert.deepEqual(sunday._source, { collection: 'days', id: 'ordinary-w5-d1' });
  ['laudesPs1', 'laudesPs2', 'laudesPs3'].forEach((field) => assert.ok(String(sunday[field]).length > 100, field));
  // A Common asks for the Sunday psalmody by a structured rule.
  assert.deepEqual(TEMPLATES.get('pastors')._fieldRules.laudesPs1, { source: 'sunday-week-1' });
  // The runtime names the source, not a technical document id.
  const runtime = ['src/utils/ordo/office.js', 'src/utils/ordo/officeAssembly.js', 'src/utils/ordoDayOptions.js']
    .map((file) => fs.readFileSync(path.join(ROOT, file), 'utf8')).join('\n');
  assert.doesNotMatch(runtime, /ordinary-w5-d1['"`]/);
});

test('textual instructions are normalized to structured rules', () => {
  assert.deepEqual(classifyValue('vesperHymn', ['Гімн з Ютрані']), { kind: 'rule', rule: { ref: 'laudesHymn' } });
  assert.deepEqual(classifyValue('laudesPs1', 'з нядзелі I тыдня').rule, { source: 'sunday-week-1' });
  assert.deepEqual(classifyValue('laudesPs1', 'з нядзелі І тыдня').rule, { source: 'sunday-week-1' });
  assert.deepEqual(classifyValue('sext1Ps1', 'Антыфоны і псальмы з бягучага дня тыдня').rule, { source: 'current-day' });
  assert.deepEqual(classifyValue('vesperPs1', 'з Агульных тэкстаў пра Найсв. Панну Марыю').rule, { source: 'template', template: 'blessed-virgin-mary' });
  assert.deepEqual(classifyValue('sext1R', 'from-apostels').rule, { source: 'template', template: 'apostles' });
  assert.deepEqual(classifyValue('sext1Pr', 'Малітва, як пададзена вышэй.').rule, { ref: 'laudesPr' });
  assert.deepEqual(classifyValue('officeOfReadingsHymn', 'Ты гонар з Нешпараў').rule, { ref: ['vesperHymn', 'vesper1Hymn'] });
  assert.equal(classifyValue('officeOfReadingsTeDeum', 'Гімн Цябе, Бога, праслаўляем').kind, 'te-deum');
  assert.equal(classifyValue('vesperHymn', ['Гімн, с. 1279']).kind, 'unresolved');
  // A short antiphon is a text, not an instruction.
  assert.equal(classifyValue('invitatoriumAnt', 'Прыйдзіце, паклонімся Хрысту Валадару, / які ўкаранаваў сваю Маці.').kind, 'text');
  assert.equal(classifyValue('laudesHymn', '<p>Гімн</p>').kind, 'text');
  const split = splitSource({ laudesHymn: '<p>Hymn</p>', vesperHymn: ['Гімн з Ютрані'], laudesPs1: 'from-first-week', sext1Ps1: 'from-day', _date: '01.01' });
  assert.deepEqual(split.texts, { laudesHymn: '<p>Hymn</p>' });
  assert.deepEqual(split.rules, { vesperHymn: { ref: 'laudesHymn' }, laudesPs1: { source: 'sunday-week-1' }, sext1Ps1: { source: 'current-day' } });
  assert.deepEqual(inferTemplates('Бл. Марыі Стэлы і паплечніц, паннаў і мучаніц'), ['martyrs-many', 'virgins']);
});

test('vesperHymn = laudesHymn: the reference is resolved at assembly', () => {
  const withRule = FEASTS.filter(({ data }) => data._fieldRules?.vesperHymn?.ref === 'laudesHymn');
  assert.ok(withRule.length >= 2);
  withRule.forEach(({ name, data }) => {
    const rank = { solemnitas: 'solemnity', festum: 'feast' }[data._rank] || 'memorial';
    const office = { officeKind: rank, hours: officeOf(rank === 'memorial' ? '2026-08-04' : '2026-08-06', rank === 'memorial' ? 'sv-john-vianney' : 'transfiguration-lord').hours, allowedChoices: [] };
    const { day, provenance } = assembleOffice({ proper: data, office, templates: TEMPLATES, currentDay });
    assert.ok(day.laudesHymn && day.laudesHymn !== 'day:laudesHymn', name);
    assert.equal(day.vesperHymn, day.laudesHymn, name);
    assert.equal(provenance.vesperHymn, 'ref:laudesHymn');
  });
});

test('feast: Proper → chosen Common → rubrical source, never a blanket day fallback', () => {
  // A feast with own texts and one Common (the descriptor of a feast on a weekday).
  const proper = FEASTS.map((item) => item.data).find((data) => data._rank === 'festum' && data._templates.length === 1
    && !data._place && OFFICE_TEXT_FIELDS.some((field) => field in data) && !('laudesPs1' in data));
  assert.ok(proper, 'a feast with a Common exists');
  const office = officeOf('2026-04-25', 'sv-mark-evangelist');
  assert.equal(office.officeKind, 'feast');
  const { day, provenance, choice } = assembleOffice({ proper, office, templates: TEMPLATES, currentDay });
  assert.equal(choice, proper._defaultTemplate);
  const common = TEMPLATES.get(proper._defaultTemplate);
  // Own texts stay own.
  OFFICE_TEXT_FIELDS.filter((field) => field in proper).forEach((field) => {
    assert.equal(day[field], proper[field], field);
    assert.equal(provenance[field], 'proper');
  });
  // Lauds psalmody is of Sunday, week I — not of the weekday and not a string.
  ['laudesPs1', 'laudesPs2', 'laudesPs3'].filter((field) => !(field in proper)).forEach((field) => {
    assert.equal(day[field], TEMPLATES.get(SUNDAY_WEEK_1_TEMPLATE)[field], field);
    assert.equal(provenance[field], 'sunday-week-1');
  });
  // Daytime psalmody of a feast is of the current day; the hymn too.
  assert.equal(day.sext2Ps1, 'day:sext2Ps1');
  assert.equal(day.sext1Hymn, 'day:sext1Hymn');
  // A component the feast does not have comes from its Common.
  const fromCommon = OFFICE_TEXT_FIELDS.find((field) => !(field in proper) && !proper._fieldRules?.[field]
    && typeof common[field] === 'string' && common[field].length > 40 && /^(laudes|vesper)(Hymn|R|Inter)$/.test(field));
  assert.ok(fromCommon, 'a Common field is used');
  assert.equal(day[fromCommon], common[fromCommon]);
  assert.equal(provenance[fromCommon], `common:${proper._defaultTemplate}`);
  assert.equal(day.officeOfReadingsTeDeum, true);
  assert.equal(day._currentVersion, proper._defaultTemplate);
  assert.deepEqual(assemblyChoices(proper, office), proper._templates);
});

test('memorial: own texts stay, the rest is of the day; quick switch to a Common', () => {
  const proper = feast('01-08-sv-alphonsus-liguori');
  const office = officeOf('2028-08-01', 'sv-alphonsus-liguori');
  assert.equal(office.officeKind, 'memorial');
  assert.deepEqual(assemblyChoices(proper, office), [CURRENT_DAY_CHOICE, 'pastors', 'doctors-of-church']);

  const ofDay = assembleOffice({ proper, office, templates: TEMPLATES, currentDay });
  assert.equal(ofDay.choice, CURRENT_DAY_CHOICE);
  assert.equal(ofDay.day.officeOfReadingsR2, proper.officeOfReadingsR2, 'hagiographic reading is proper');
  // The saint's prayer is one prayer: at Lauds and Vespers too (never the Common's «Калі няма ўласнай малітвы…»).
  assert.equal(ofDay.day.laudesPr, proper.officeOfReadingsPr);
  assert.equal(ofDay.day.vesperPr, proper.officeOfReadingsPr);
  assert.deepEqual(proper._fieldRules.laudesPr, { ref: 'officeOfReadingsPr' });
  assert.equal(ofDay.day.laudesHymn, 'day:laudesHymn');
  assert.equal(ofDay.day.laudesAntBen, 'day:laudesAntBen');
  assert.equal(ofDay.day.laudesPs1, 'day:laudesPs1', 'psalmody of the current day');
  assert.equal(ofDay.day.officeOfReadingsR1, 'day:officeOfReadingsR1', 'biblical reading of the current day');
  assert.equal(ofDay.day.sext2Pr, 'day:sext2Pr');
  assert.ok(!('_currentVersion' in ofDay.day));

  for (const template of ['pastors', 'doctors-of-church']) {
    const common = TEMPLATES.get(template);
    const switched = assembleOffice({ proper, office, templates: TEMPLATES, choice: template, currentDay });
    assert.equal(switched.choice, template);
    // The selected Common supplies the festive formulary of the main hours.
    assert.equal(switched.day.laudesHymn, common.laudesHymn, template);
    assert.equal(switched.provenance.laudesHymn, `common:${template}`);
    assert.equal(switched.day.vesperAntMag, common.vesperAntMag);
    assert.equal(switched.day.laudesPs1, TEMPLATES.get(SUNDAY_WEEK_1_TEMPLATE).laudesPs1);
    assert.equal(switched.day.laudesAnt1, common.laudesAnt1);
    assert.equal(switched.day.officeOfReadingsR1, common.officeOfReadingsR1);
    // Daytime Prayer stays of the day.
    assert.equal(switched.day.sext1Ps1, 'day:sext1Ps1');
    // …and the proper fields survive the switch.
    assert.equal(switched.day.officeOfReadingsR2, proper.officeOfReadingsR2);
    assert.equal(switched.day.officeOfReadingsPr, proper.officeOfReadingsPr);
    assert.equal(switched.day.laudesPr, proper.officeOfReadingsPr, `${template}: own prayer at Lauds`);
    assert.equal(switched.day.vesperPr, proper.officeOfReadingsPr, `${template}: own prayer at Vespers`);
    assert.equal(switched.day._currentVersion, template);
  }
  const pastors = assembleOffice({ proper, office, templates: TEMPLATES, choice: 'pastors', currentDay }).day;
  const doctors = assembleOffice({ proper, office, templates: TEMPLATES, choice: 'doctors-of-church', currentDay }).day;
  assert.notEqual(pastors.laudesHymn, doctors.laudesHymn);
  // An unknown choice falls back to the default.
  assert.equal(assembleOffice({ proper, office, templates: TEMPLATES, choice: 'nope', currentDay }).choice, CURRENT_DAY_CHOICE);
});

test('Paul of the Cross, 19 October 2026: the day choice keeps weekday Hours', () => {
  const proper = feast('19-10-sv-paul-of-cross');
  const office = officeOf('2026-10-19', 'sv-paul-of-cross');
  assert.deepEqual(assemblyChoices(proper, office), [CURRENT_DAY_CHOICE, 'pastors', 'religious']);
  const { day, provenance } = assembleOffice({ proper, office, templates: TEMPLATES, currentDay });
  for (const prefix of ['laudes', 'vesper', 'officeOfReadings']) {
    for (const suffix of ['Ps1', 'Ps2', 'Ps3', 'Ant1', 'Ant2', 'Ant3']) {
      const field = `${prefix}${suffix}`;
      assert.equal(day[field], currentDay[field]);
      assert.equal(provenance[field], CURRENT_DAY_CHOICE);
    }
  }
  assert.equal(day.officeOfReadingsR1, currentDay.officeOfReadingsR1);
  assert.equal(day.officeOfReadingsR2, proper.officeOfReadingsR2);
  assert.equal(day.laudesPr, proper.officeOfReadingsPr);
  assert.equal(shouldShowTeDeum({ ...day, _ordo: { teDeum: office.teDeum } }), false);
});

test('Paul of the Cross: pastors supplies festive main Hours without changing other hours or rank', () => {
  const proper = feast('19-10-sv-paul-of-cross');
  const office = officeOf('2026-10-19', 'sv-paul-of-cross');
  const before = JSON.stringify({ proper, office, currentDay, templates: [...TEMPLATES] });
  const common = TEMPLATES.get('pastors');
  const { day, provenance, missing, integrity } = assembleOffice({ proper, office, templates: TEMPLATES, choice: 'pastors', currentDay });
  for (const prefix of ['laudes', 'vesper', 'officeOfReadings']) {
    for (const suffix of ['Ps1', 'Ps2', 'Ps3', 'Ant1', 'Ant2', 'Ant3']) {
      const field = `${prefix}${suffix}`;
      const sunday = prefix === 'laudes' && suffix.startsWith('Ps');
      assert.equal(day[field], (sunday ? TEMPLATES.get(SUNDAY_WEEK_1_TEMPLATE) : common)[field], field);
      assert.equal(provenance[field], sunday ? SUNDAY_WEEK_1_TEMPLATE : 'common:pastors', field);
    }
  }
  assert.equal(day.officeOfReadingsR1, common.officeOfReadingsR1, 'includes its responsory');
  assert.equal(day.officeOfReadingsR2, proper.officeOfReadingsR2);
  assert.equal(day.laudesR, common.laudesR, 'short reading includes its responsory');
  assert.equal(day.laudesInter, common.laudesInter);
  assert.equal(day.vesperInter, common.vesperInter);
  assert.equal(day.laudesPr, proper.officeOfReadingsPr);
  assert.equal(day.vesperPr, proper.officeOfReadingsPr);
  assert.equal(day._rank, proper._rank);
  assert.equal(office.firstVespers.byRight, false);
  assert.ok(FIRST_VESPER_FIELDS.every((field) => !(field in day)));
  OFFICE_TEXT_FIELDS.filter((field) => field.startsWith('sext')).forEach((field) => assert.equal(day[field], currentDay[field], field));
  assert.equal(getCompletoriumWeekday(day, 2), 2);
  assert.equal(shouldShowTeDeum({ ...day, _ordo: { teDeum: false } }), true);
  assert.deepEqual(missing, []);
  assert.deepEqual(integrity, []);
  assert.equal(JSON.stringify({ proper, office, currentDay, templates: [...TEMPLATES] }), before);

  // Follow the existing card → route → hour path with the sparse Proper
  // collection taking precedence over legacy materialized documents.
  const date = '2026-10-19';
  const resolved = resolveRuntimeDay(date, { diocese: 'minsk-mohilev' });
  const { context, daysResult } = daysFixture(resolved);
  daysResult.properDays = [{ ...proper, id: proper._id }];
  const content = buildOrdoDayOptions({ resolved, daysResult, context, date, diocese: 'minsk-mohilev', templates: TEMPLATES });
  const option = content.dayOptions.find((item) => item.ordo.optionId === 'sv-paul-of-cross');
  assert.deepEqual(option.templates.map((item) => item.label), ['З дня', 'Пра пастыраў', 'Пра законнікаў']);
  const id = `${proper._id}--pastors`;
  const routed = resolveDayAgainstPeriod(findResolvedDayById(content, id), daysResult.periodFallback);
  assert.equal(routed.laudesPs1, day.laudesPs1);
  assert.equal(routed.vesperPs1, common.vesperPs1);
  assert.equal(routed.officeOfReadingsR1, common.officeOfReadingsR1);
  assert.equal(shouldShowTeDeum({ ...routed, _ordo: findOptionByDayId(content, id).ordo }), true);
  const religious = resolveDayAgainstPeriod(findResolvedDayById(content, `${proper._id}--religious`), daysResult.periodFallback);
  assert.equal(religious.vesperPs1, TEMPLATES.get('holy-men').vesperPs1, 'route resolves the prescribed base Common');
  assert.ok(!religious._missingFields?.length);
});

test('Paul of the Cross: religious resolves all 20 inherited fields, keeping its own texts and the saint prayer', () => {
  const proper = feast('19-10-sv-paul-of-cross');
  const office = officeOf('2026-10-19', 'sv-paul-of-cross');
  const common = TEMPLATES.get('religious');
  const before = JSON.stringify([...TEMPLATES]);
  const { day, integrity, missing, provenance } = assembleOffice({ proper, office, templates: TEMPLATES, choice: 'religious', currentDay });
  for (const field of ['laudesHymn', 'laudesAntBen', 'vesperHymn', 'vesperAntMag', 'officeOfReadingsHymn', 'officeOfReadingsR1']) {
    assert.equal(day[field], common[field], field);
  }
  assert.equal(day.laudesPs1, TEMPLATES.get(SUNDAY_WEEK_1_TEMPLATE).laudesPs1);
  for (const field of ['officeOfReadingsR2', 'officeOfReadingsPr']) assert.equal(day[field], proper[field]);
  assert.equal(day.laudesPr, proper.officeOfReadingsPr);
  assert.equal(day.vesperPr, proper.officeOfReadingsPr);
  const inherited = [
    'officeOfReadingsAnt1', 'officeOfReadingsAnt2', 'officeOfReadingsAnt3',
    'officeOfReadingsPs1', 'officeOfReadingsPs2', 'officeOfReadingsPs3', 'officeOfReadingsVers',
    'laudesAnt1', 'laudesAnt2', 'laudesAnt3', 'laudesR', 'laudesInter',
    'vesperAnt1', 'vesperAnt2', 'vesperAnt3', 'vesperPs1', 'vesperPs2', 'vesperPs3', 'vesperR', 'vesperInter',
  ];
  for (const field of inherited) {
    assert.ok(TEMPLATES.get('holy-men')[field], field);
    assert.equal(day[field], TEMPLATES.get('holy-men')[field], field);
    assert.equal(provenance[field], 'common:holy-men', field);
  }
  assert.deepEqual(missing, []);
  assert.deepEqual(integrity, []);
  assert.equal(shouldShowTeDeum({ ...day, _ordo: { teDeum: false } }), true);
  assert.ok(FIRST_VESPER_FIELDS.every((field) => !(field in day)));
  OFFICE_TEXT_FIELDS.filter((field) => field.startsWith('sext')).forEach((field) => assert.equal(day[field], currentDay[field], field));
  assert.equal(getCompletoriumWeekday(day, 2), 2);
  assert.equal(JSON.stringify([...TEMPLATES]), before, 'cached templates are not modified');
  const own = assembleOffice({ proper: { ...proper, laudesAnt1: 'own antiphon', vesperPs1: 'own psalm' },
    office, templates: TEMPLATES, choice: 'religious', currentDay }).day;
  assert.equal(own.laudesAnt1, 'own antiphon');
  assert.equal(own.vesperPs1, 'own psalm');
});

test('religious references respect explicit rules and seasons; an unavailable base remains a diagnosed gap', () => {
  const proper = feast('19-10-sv-paul-of-cross');
  const office = officeOf('2026-10-19', 'sv-paul-of-cross');
  const templates = new Map(TEMPLATES);
  templates.set('religious', { ...templates.get('religious'), laudesAnt3: 'selected Common antiphon',
    _fieldRules: { laudesAnt1: { ref: 'laudesAntBen' }, laudesAnt2: { omit: true } } });
  templates.set('holy-men', { ...templates.get('holy-men'),
    _seasonalVariants: { easter: { laudesR: '<p>seasonal base reading</p>' } } });
  const seasonal = assembleOffice({ proper, office, templates, choice: 'religious', currentDay, season: 'easter' });
  assert.equal(seasonal.day.laudesAnt1, seasonal.day.laudesAntBen);
  assert.equal(seasonal.day.laudesAnt2, '');
  assert.equal(seasonal.day.laudesAnt3, 'selected Common antiphon');
  assert.equal(seasonal.day.laudesR, '<p>seasonal base reading</p>');
  assert.equal(seasonal.seasonal.fields.laudesR, 'easter');
  const incompleteBase = { ...templates.get('holy-men') };
  delete incompleteBase.vesperPs1;
  templates.set('holy-men', incompleteBase);
  const incomplete = assembleOffice({ proper, office, templates, choice: 'religious', currentDay });
  assert.equal(incomplete.day.vesperPs1, '');
  assert.ok(incomplete.integrity.some((item) => item.field === 'vesperPs1' && item.source === 'common:holy-men' && item.reason === 'field-missing'));
  templates.delete('holy-men');
  const unavailable = assembleOffice({ proper, office, templates, choice: 'religious', currentDay });
  assert.equal(unavailable.day.vesperPs1, '');
  assert.ok(unavailable.missing.includes('vesperPs1'));
  assert.ok(unavailable.integrity.some((item) => item.field === 'vesperPs1' && item.source === 'common:holy-men' && item.reason === 'template-missing'));
  const unconfirmed = assembleOffice({ proper: { ...proper, _celebrationId: 'unconfirmed-subject' }, office,
    templates: TEMPLATES, choice: 'religious', currentDay });
  assert.equal(unconfirmed.day.vesperPs1, '', 'never infer a male base for an unconfirmed saint');
});

test('Invitatorium: day/pastors/religious select their antiphon, while Proper always wins', () => {
  const proper = feast('19-10-sv-paul-of-cross');
  const office = officeOf('2026-10-19', 'sv-paul-of-cross');
  for (const choice of [CURRENT_DAY_CHOICE, 'pastors', 'religious']) {
    const result = assembleOffice({ proper, office, templates: TEMPLATES, choice, currentDay });
    const source = choice === CURRENT_DAY_CHOICE ? currentDay : TEMPLATES.get(choice);
    assert.equal(result.day.invitatoriumAnt, source.invitatoriumAnt, choice);
    assert.equal(result.provenance.invitatoriumAnt, choice === CURRENT_DAY_CHOICE ? CURRENT_DAY_CHOICE : `common:${choice}`);
    const own = assembleOffice({ proper: { ...proper, invitatoriumAnt: 'own invitation' }, office,
      templates: TEMPLATES, choice, currentDay });
    assert.equal(own.day.invitatoriumAnt, 'own invitation', choice);
    assert.equal(own.provenance.invitatoriumAnt, 'proper');
  }
});

test('festive Common: Proper texts and references take priority; absent sources never use the weekday', () => {
  const base = feast('19-10-sv-paul-of-cross');
  const office = officeOf('2026-10-19', 'sv-paul-of-cross');
  const proper = { ...base, laudesAnt1: 'own antiphon', laudesPs1: 'own psalm', vesperPs1: 'own evening psalm',
    _fieldRules: { ...base._fieldRules, vesperHymn: { ref: 'laudesHymn' } } };
  const { day } = assembleOffice({ proper, office, templates: TEMPLATES, choice: 'pastors', currentDay });
  for (const field of ['laudesAnt1', 'laudesPs1', 'vesperPs1']) assert.equal(day[field], proper[field]);
  assert.equal(day.vesperHymn, day.laudesHymn);
  const templates = new Map(TEMPLATES);
  templates.delete(SUNDAY_WEEK_1_TEMPLATE);
  const common = { ...templates.get('pastors'), _fieldRules: { officeOfReadingsR1: { ref: 'absentReading' } } };
  delete common.officeOfReadingsR1;
  templates.set('pastors', common);
  const incomplete = assembleOffice({ proper: base, office, templates, choice: 'pastors', currentDay });
  assert.equal(incomplete.day.laudesPs1, '');
  assert.equal(incomplete.day.officeOfReadingsR1, '');
  assert.ok(incomplete.integrity.some((item) => item.source === SUNDAY_WEEK_1_TEMPLATE && item.reason === 'template-missing'));
  assert.ok(incomplete.integrity.some((item) => item.field === 'officeOfReadingsR1'));
  const offline = assembleOffice({ proper: base, office, templates: new Map(), choice: 'pastors', currentDay });
  assert.equal(offline.day.officeOfReadingsR1, '');
  assert.equal(offline.day.vesperPs1, '');
});

test('legacy Sunday week I markers reuse the published psalter template', () => {
  const legacy = {
    id: '02-10-holy-guardian-angels',
    laudesAnt1: '<p>own antiphon 1</p>',
    laudesAnt2: '<p>own antiphon 2</p>',
    laudesAnt3: '<p>own antiphon 3</p>',
    laudesPs1: ['з нядзелі І тыдня'],
    laudesPs2: ['з нядзелі I тыдня'],
    laudesPs3: 'from-first-week',
  };
  const resolved = resolveLegacyTemplatePlaceholders(legacy, TEMPLATES);
  const sunday = TEMPLATES.get(SUNDAY_WEEK_1_TEMPLATE);
  assert.equal(resolved.laudesAnt1, legacy.laudesAnt1);
  assert.equal(resolved.laudesAnt2, legacy.laudesAnt2);
  assert.equal(resolved.laudesAnt3, legacy.laudesAnt3);
  assert.equal(resolved.laudesPs1, sunday.laudesPs1);
  assert.equal(resolved.laudesPs2, sunday.laudesPs2);
  assert.equal(resolved.laudesPs3, sunday.laudesPs3);

  const sparse = { ...legacy, _schema: 2, _fieldRules: { laudesPs1: { source: 'sunday-week-1' } } };
  assert.equal(resolveLegacyTemplatePlaceholders(sparse, TEMPLATES), sparse, 'sparse documents stay on the new assembly path');
});

test('Guardian Angels Lauds route pairs own antiphons with Sunday week I psalms in both document formats', () => {
  const date = '2026-10-02';
  const id = '02-10-holy-guardian-angels';
  const source = feast(id);
  const { _id, _schema, _fieldRules, ...proper } = source;
  const sunday = TEMPLATES.get(SUNDAY_WEEK_1_TEMPLATE);
  const psFields = ['laudesPs1', 'laudesPs2', 'laudesPs3'];
  assert.deepEqual(psFields.map((field) => source._fieldRules[field]),
    psFields.map(() => ({ source: SUNDAY_WEEK_1_TEMPLATE })));
  assert.equal(new Set(psFields.map((field) => sunday[field])).size, 3);
  psFields.forEach((field) => {
    assert.match(sunday[field], /<p\b/u, `${field} contains HTML`);
    assert.ok(sunday[field].length > 100, `${field} is a full psalm`);
  });

  const resolved = resolveRuntimeDay(date, { diocese: 'minsk-mohilev' });
  for (const sparse of [false, true]) {
    const document = sparse
      ? { id, ...source }
      : { id, ...proper, ...Object.fromEntries(psFields.map((field) => [field, ['з нядзелі І тыдня']])) };
    if (sparse) {
      assert.equal(resolveLegacyTemplatePlaceholders(document, TEMPLATES), document,
        'sparse document bypasses legacy resolver');
    }
    const { context, daysResult } = daysFixture(resolved, { migrated: true });
    const fetched = sparse ? document : resolveDateDayAgainstPeriod(document, daysResult.periodFallback);
    daysResult.fixedDateDays = [fetched];
    const { dayOptions } = buildOrdoDayOptions({
      resolved, daysResult, context, date, diocese: 'minsk-mohilev', templates: TEMPLATES,
    });
    const option = findOptionByDayId({ dayOptions }, id);
    assert.ok(option, `${sparse ? 'sparse' : 'legacy'} Guardian Angels option`);
    const itemsDays = [...contentDayMap([fetched, daysResult.periodFallback], dayOptions).values()];
    const oldCachedContent = { itemsDays: [fetched, daysResult.periodFallback], dayOptions };
    assert.equal(findResolvedDayById(oldCachedContent, id), option.templates[0].day,
      'route selects the resolved Office even from an old cached content shape');
    const selected = findResolvedDayById({ itemsDays, dayOptions }, id);
    const routeDay = resolveDayAgainstPeriod(selected, daysResult.periodFallback);
    assert.equal(routeDay.laudesHymn, source.laudesHymn);
    for (const field of ['laudesR', 'laudesAntBen', 'laudesInter', 'laudesPr']) {
      assert.equal(routeDay[field], source[field], field);
    }
    for (let i = 1; i <= 3; i += 1) {
      assert.equal(routeDay[`laudesAnt${i}`], source[`laudesAnt${i}`], `Guardian Angels own Ant${i}`);
      assert.equal(routeDay[`laudesPs${i}`], sunday[`laudesPs${i}`], `Sunday week I Ps${i}`);
    }
    assert.doesNotMatch(psFields.map((field) => routeDay[field]).join(''), /з нядзелі І тыдня/u);
  }
});

test('structured omit, explicit sources and a missing Common', () => {
  const office = officeOf('2026-04-25', 'sv-mark-evangelist');
  const proper = {
    id: 'x', _schema: 2, _templates: ['apostles'], _defaultTemplate: 'apostles',
    laudesHymn: '<p>own</p>',
    _fieldRules: {
      vesperHymn: { ref: 'laudesHymn' },
      vesperInter: { omit: true },
      laudesInter: { source: 'template', template: 'blessed-virgin-mary' },
      laudesR: { source: 'current-day' },
    },
  };
  const { day, provenance } = assembleOffice({ proper, office, templates: TEMPLATES, currentDay });
  assert.equal(day.vesperHymn, '<p>own</p>');
  assert.equal(day.vesperInter, '');
  assert.equal(provenance.vesperInter, 'omit');
  // D-2: outside the Saturday memorial the Marian Common shows its main section
  assert.equal(day.laudesInter, TEMPLATES.get('blessed-virgin-mary')._mainSection.laudesInter);
  assert.equal(day.laudesR, 'day:laudesR');
  // Templates not published yet: the Office is still complete, from the day.
  const offline = assembleOffice({ proper, office, templates: new Map(), currentDay });
  assert.equal(offline.day.laudesHymn, '<p>own</p>');
  assert.equal(offline.day.vesperR, 'day:vesperR');
  assert.deepEqual(offline.missing, []);
  assert.equal(hoursContentStatus(proper), 'proper');
  assert.equal(hoursContentStatus({ _templates: ['apostles'] }), 'common-only');
  assert.equal(hoursContentStatus(null, { hasTemplates: false }), 'day-fallback');
});

// ---------------------------------------------------------------------------
// Day options (Hours list)
// ---------------------------------------------------------------------------

function content(date, { diocese = 'minsk-mohilev', migrated = true, templates = TEMPLATES } = {}) {
  const resolved = resolveRuntimeDay(date, { diocese });
  const { context, daysResult } = daysFixture(resolved, { migrated });
  return { resolved, ...buildOrdoDayOptions({ resolved, daysResult, context, date, diocese, templates }) };
}

test('after the migration one sparse document gives the day/Common choices', () => {
  const { dayOptions } = content('2028-08-01');
  const option = dayOptions.find((item) => item.ordo.optionId === 'sv-alphonsus-liguori');
  assert.deepEqual(option.templates.map((item) => item.label), ['З дня', 'Пра пастыраў', 'Пра доктараў касцёла']);
  assert.deepEqual(option.templates.map((item) => item.id),
    ['01-08-sv-alphonsus-liguori', '01-08-sv-alphonsus-liguori--pastors', '01-08-sv-alphonsus-liguori--doctors-of-church']);
  assert.equal(option.dayId, '01-08-sv-alphonsus-liguori');
  assert.equal(option.day._assembly.choice, CURRENT_DAY_CHOICE);
  // Links to the former per-template copies open the matching assembly.
  assert.equal(findOptionByDayId({ dayOptions }, '01-08-sv-alphonsus-liguori--pastors'), option);
  assert.equal(option.templates[1].day._assembly.template, 'pastors');
  assert.ok(option.templates.every((item) => item.day.officeOfReadingsR2 === option.day.officeOfReadingsR2));
});

test('before the migration the live per-template documents still work', () => {
  const { dayOptions } = content('2028-08-01', { migrated: false, templates: new Map() });
  const option = dayOptions.find((item) => item.ordo.optionId === 'sv-alphonsus-liguori');
  assert.deepEqual(option.templates.map((item) => item.id).sort(),
    ['01-08-sv-alphonsus-liguori--doctors-of-church', '01-08-sv-alphonsus-liguori--pastors']);
  assert.ok(!option.day._assembly);
});

test('a celebration without a days document stays visible', () => {
  // St John XXIII (11.10, optional memorial): in the calendar, no texts yet.
  for (const migrated of [false, true]) {
    const { dayOptions, resolved, unavailable } = content('2028-10-11', { migrated });
    assert.ok(resolved.alternatives.some((item) => item.id === 'sv-john-xxiii'));
    const option = dayOptions.find((item) => item.ordo.optionId === 'sv-john-xxiii');
    assert.ok(option, `option is offered (migrated: ${migrated})`);
    assert.equal(option.title, 'Св. Яна XXIII, папы');
    assert.equal(option.hasLiturgicalDay, true);
    assert.equal(option.ordo.contentStatus.hours, 'common-only');
    assert.match(option.subtitle, /агульныя тэксты/);
    assert.equal(option.day.laudesPs1, 'day:laudesPs1');
    assert.equal(migrated ? unavailable.length : unavailable.some((item) => item.id === 'sv-john-xxiii'), migrated ? 0 : true);
  }
  // Pinsk's solemnity without texts is the primary Office, from its Common.
  const pinsk = content('2028-08-22', { diocese: 'pinsk' });
  const patron = pinsk.dayOptions[0];
  assert.equal(patron.ordo.optionId, 'our-lady-lahishyn');
  assert.equal(patron.day._currentVersion, 'blessed-virgin-mary');
  assert.equal(patron.day.laudesHymn, TEMPLATES.get('blessed-virgin-mary')._mainSection.laudesHymn);
});

test('Saturday memorial of the BVM is offered from its Common', () => {
  const saturday = content('2028-07-15');
  const resolved = saturday.resolved;
  if (resolved.alternatives.some((item) => item.id === 'saturday-blessed-virgin-mary')) {
    const option = saturday.dayOptions.find((item) => item.ordo.optionId === 'saturday-blessed-virgin-mary');
    assert.ok(option);
    assert.deepEqual(option.templates.map((item) => item.label), ['З дня', 'Пра Найсвяцейшую Панну Марыю']);
    // Without the published Common there is nothing to show.
    assert.ok(!content('2028-07-15', { templates: new Map() }).dayOptions.some((item) => item.ordo.optionId === 'saturday-blessed-virgin-mary'));
  }
});

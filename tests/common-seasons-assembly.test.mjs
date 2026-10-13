/**
 * Seasonal Commons through the real chain: Ordo (season of the selected Office)
 * → assembleOffice → fields. Real templates (`patchs/db-templates`), real calendar.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRuntimeDay } from '../src/utils/ordo/runtime.js';
import { computeSeason } from '../src/utils/ordo/season.js';
import { computeYearAnchors } from '../src/utils/ordo/movableFeasts.js';
import { CURRENT_DAY_CHOICE, assembleOffice } from '../src/utils/ordo/officeAssembly.js';
import { OFFICE_TEXT_FIELDS } from '../src/constants/officeFields.js';
import { COMMON_SEASON_KEYS, variantKeyForSeason } from '../src/utils/ordo/commonSeasons.js';
import { htmlToPlain } from '../scripts/liturgy/common-seasons/lib/html.mjs';
import { normalizeForCompare } from '../scripts/liturgy/common-seasons/lib/volume.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE_DIR = path.join(ROOT, 'patchs', 'db-templates');
const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(deepFreeze); }
  return value;
};
const TEMPLATES = new Map(fs.readdirSync(TEMPLATE_DIR).filter((n) => n.endsWith('.json')).map((name) => {
  const data = JSON.parse(fs.readFileSync(path.join(TEMPLATE_DIR, name), 'utf8'));
  return [data._id, deepFreeze(data)];
}));
const text = (value) => normalizeForCompare(Array.isArray(value) ? value.join(' ') : value);
const plain = (value) => htmlToPlain(Array.isArray(value) ? value.join('\n') : String(value || ''));

const SEASON = {
  ordinary: { period: 'ordinary', periodPhase: 'after-pentecost' },
  advent: { period: 'advent', periodPhase: 'advent-weekdays' },
  christmas: { period: 'christmas', periodPhase: 'after-epiphany' },
  lent: { period: 'lent', periodPhase: 'lent-weeks' },
  easter: { period: 'easter', periodPhase: 'before-ascension' },
};
const currentDay = Object.fromEntries(OFFICE_TEXT_FIELDS.map((field) => [field, `<p>day:${field}</p>`]));
const officeOf = (iso, id, diocese = 'minsk-mohilev') => resolveRuntimeDay(iso, { diocese }).officeOptions.find((o) => o.id === id);
const descriptorOf = (iso, id, diocese = 'minsk-mohilev') => {
  const day = resolveRuntimeDay(iso, { diocese });
  return [day.officeResolution.primary, ...day.officeResolution.alternatives].find((o) => o.optionId === id);
};
const dedication = { _schema: 2, _celebrationId: 'dedication-lateran-basilica', _templates: ['church-dedication'], _defaultTemplate: 'church-dedication', _rank: 'festum' };
const dedicationOffice = descriptorOf('2026-11-09', 'dedication-lateran-basilica');
const assemble = (proper, season, extra = {}) => assembleOffice({
  proper, office: dedicationOffice, templates: TEMPLATES, currentDay, season: SEASON[season] || season, ...extra,
});

test('church-dedication I Vespers: Lent and Easter take different antiphon AND canticle (vesper1Ant3 + vesper1Ps3)', () => {
  const lent = assemble(dedication, 'lent').day;
  const easter = assemble(dedication, 'easter').day;
  const ordinary = assemble(dedication, 'ordinary').day;
  assert.match(plain(lent.vesper1Ant3), /Хвала Табе, Пане/);
  assert.match(plain(easter.vesper1Ant3), /У горадзе Божым радуецца мноства святых/);
  assert.match(plain(lent.vesper1Ps3), /Клс 1, 12-20/);
  assert.match(plain(lent.vesper1Ps3), /Мы дзякуем Богу Айцу/);
  assert.doesNotMatch(plain(lent.vesper1Ps3), /Ап 19/);
  assert.match(plain(easter.vesper1Ps3), /Ап 19, 1-2\. 5-7/);
  assert.doesNotMatch(plain(easter.vesper1Ps3), /Клс 1/);
  // the flat base (Ordinary Time) is the Volume III text
  assert.equal(text(ordinary.vesper1Ps3), text(TEMPLATES.get('church-dedication').vesper1Ps3));
  assert.notEqual(text(lent.vesper1Ps3), text(easter.vesper1Ps3));
});

test('church-dedication Office of Readings: three readings, never glued together', () => {
  const read = (season) => plain(assemble(dedication, season).day.officeOfReadingsR1);
  assert.match(read('ordinary'), /Першае пасланне св\. апостала Пятра\s+2, 1-17/);
  assert.match(read('lent'), /Першая кніга Валадарстваў\s+8, 1-4\. 10-13\. 22-30/);
  assert.match(read('lent'), /Мц 18, 19-20; 2 Кр 7, 15/);
  assert.match(read('easter'), /Кніга Апакаліпсіса св\. апостала Яна\s+21, 9-27/);
  assert.match(read('easter'), /Ап 21, 21; Тоб 13, 17\. 18\. 11/);
  ['ordinary', 'lent', 'easter'].forEach((season) => {
    const value = read(season);
    const hits = [/Пятра/, /Валадарстваў/, /Апакаліпсіса/].filter((re) => re.test(value)).length;
    assert.equal(hits, 1, `${season}: exactly one first reading`);
  });
});

test('church-dedication Lauds short responsory: Lent and Easter differ, the reading stays', () => {
  const lent = plain(assemble(dedication, 'lent').day.laudesR);
  const easter = plain(assemble(dedication, 'easter').day.laudesR);
  assert.match(lent, /Узвяду на гару Маю святую/);
  assert.match(easter, /Узвяду на гару Маю святую/);
  assert.doesNotMatch(lent, /[Аа]ллелюя/);
  assert.match(easter, /Вялікі Пан і праслаўлены вельмі,\s*\*\s*аллелюя, аллелюя/);
  assert.match(lent, /Вялікі Пан\s*\*\s*і праслаўлены вельмі/);
});

test('«(Велікодны перыяд Аллелюя)» is applied to the single element it follows, never globally', () => {
  const easter = assemble(dedication, 'easter').day;
  const lent = assemble(dedication, 'lent').day;
  assert.match(plain(easter.laudesAnt1), /домам малітвы, \/ аллелюя\./);
  assert.match(plain(easter.laudesAnt2), /святыні, \/ аллелюя\./);
  assert.doesNotMatch(plain(lent.laudesAnt1), /[Аа]ллелюя/);
  assert.doesNotMatch(plain(easter.laudesHymn), /[Аа]ллелюя/, 'hymns are not touched');
  assert.doesNotMatch(plain(easter.laudesPr), /[Аа]ллелюя/, 'prayers are not touched');
  Object.values(easter).filter((v) => typeof v === 'string').forEach((v) => assert.doesNotMatch(v, /\(Велікодны перыяд/));
  // the Alleluia that is part of the stored base is not removed outside Lent
  assert.match(plain(assemble(dedication, 'ordinary').day.laudesAntBen).trim(), /аллелюя\.$/);
  assert.match(plain(easter.laudesAntBen).trim(), /аллелюя\.$/);
  assert.doesNotMatch(plain(lent.laudesAntBen), /аллелюя/);
});

const BVM = { _schema: 2, _celebrationId: 'bvm-x', _templates: ['blessed-virgin-mary'], _defaultTemplate: 'blessed-virgin-mary', _rank: 'memoria' };
test('blessed-virgin-mary: ONE prayer per season (Advent / Christmas), the optional list in Ordinary Time', () => {
  const ADVENT = /Ты пажадаў, каб Тваё Слова праз звеставанне анёла/;
  const CHRISTMAS = /Ты праз дзявочае мацярынства Панны Марыі/;
  ['vesper1Pr', 'laudesPr', 'vesperPr', 'officeOfReadingsPr', 'sext2Pr'].forEach((field) => {
    const advent = plain(assemble(BVM, 'advent').day[field]);
    const christmas = plain(assemble(BVM, 'christmas').day[field]);
    const ordinary = plain(assemble(BVM, 'ordinary').day[field]);
    assert.match(advent, ADVENT, `${field} advent`);
    assert.doesNotMatch(advent, CHRISTMAS, `${field} advent has not the Christmas prayer`);
    assert.match(christmas, CHRISTMAS, `${field} christmas`);
    assert.doesNotMatch(christmas, ADVENT, `${field} christmas has not the Advent prayer`);
    assert.doesNotMatch(`${advent}${christmas}`, /У перыяд Адвэнту|У перыяд Нараджэння Пана/);
    assert.doesNotMatch(ordinary, ADVENT);
    assert.doesNotMatch(ordinary, CHRISTMAS);
  });
  // Lent / Easter prayers of Volume II
  assert.match(plain(assemble(BVM, 'lent').day.laudesPr), /улі ў нашыя сэрцы Тваю ласку/);
  assert.match(plain(assemble(BVM, 'easter').day.laudesPr), /Божа, Ты праз уваскрасенне Твайго Сына/);
});

test('the celebration\'s own Proper always wins over a seasonal Common text', () => {
  const own = { ...dedication, vesper1Ant3: '<p>OWN ant3</p>', laudesR: '<p>OWN reading</p>' };
  ['ordinary', 'lent', 'easter'].forEach((season) => {
    const result = assemble(own, season);
    assert.equal(result.day.vesper1Ant3, '<p>OWN ant3</p>');
    assert.equal(result.provenance.vesper1Ant3, 'proper');
    assert.equal(result.day.laudesR, '<p>OWN reading</p>');
    assert.ok(!('vesper1Ant3' in result.seasonal.fields) && !('laudesR' in result.seasonal.fields));
    // fields the Proper does not have still come from the (seasonal) Common
    assert.match(result.provenance.vesper1Ps3, /^common:church-dedication$/);
  });
  assert.equal(assemble(own, 'lent').seasonal.fields.vesper1Ps3, 'lent');
  assert.equal(assemble(own, 'ordinary').seasonal.variant, null);
});

test('memorial: «З дня» stays the weekday, the Common choice takes the seasonal texts', () => {
  const iso = '2026-04-13';
  const option = officeOf(iso, 'sv-martin-i-pope-martyr');
  assert.ok(option, 'legal memorial');
  const day = resolveRuntimeDay(iso, { diocese: 'minsk-mohilev' });
  const office = [day.officeResolution.primary, ...day.officeResolution.alternatives].find((o) => o.optionId === option.id);
  const proper = { _schema: 2, _celebrationId: option.id, _rank: option.rank, _templates: option.templates, _defaultTemplate: option.defaultTemplate };
  const season = { period: day.period, periodPhase: day.periodPhase };
  assert.equal(variantKeyForSeason(season), 'easter');
  const fromDay = assembleOffice({ proper, office, templates: TEMPLATES, choice: CURRENT_DAY_CHOICE, currentDay, season });
  const fromCommon = assembleOffice({ proper, office, templates: TEMPLATES, choice: option.defaultTemplate, currentDay, season });
  assert.equal(fromDay.day.laudesHymn, currentDay.laudesHymn);
  Object.entries(fromDay.provenance).filter(([, origin]) => origin === CURRENT_DAY_CHOICE)
    .forEach(([field]) => assert.ok(!(field in fromDay.seasonal.fields), `${field}: weekday text is never seasonal`));
  const common = TEMPLATES.get('pastors');
  assert.ok(Object.keys(fromCommon.seasonal.fields).length > 0);
  Object.entries(fromCommon.seasonal.fields).forEach(([field, key]) => {
    assert.equal(key, 'easter');
    assert.deepEqual(fromCommon.day[field], common._seasonalVariants.easter[field]);
  });
});

test('first Vespers of a celebration use the celebration\'s own season', () => {
  // 2026-11-30 St Andrew (Advent): I Vespers on the eve are assembled with the celebration's date.
  const day = resolveRuntimeDay('2026-11-30', { diocese: 'minsk-mohilev' });
  assert.equal(variantKeyForSeason({ period: day.period, periodPhase: day.periodPhase }), 'advent');
  const apostles = TEMPLATES.get('apostles');
  assert.ok(apostles._seasonalVariants.easter, 'apostles have Easter variants');
  const proper = { _schema: 2, _celebrationId: 'sv-andrew-apostle', _templates: ['apostles'], _defaultTemplate: 'apostles', _rank: 'festum' };
  const office = descriptorOf('2026-11-30', 'sv-andrew-apostle');
  const advent = assembleOffice({ proper, office, templates: TEMPLATES, currentDay, season: { period: day.period, periodPhase: day.periodPhase } });
  // Advent has only ONE variant for the apostles (the first reading of Volume I, 1 Кар 1, 18 – 2, 5): the flat base is
  // used for I Vespers, never a Lent/Easter text
  assert.equal(advent.day.vesper1R, apostles.vesper1R);
  assert.deepEqual(advent.seasonal.fields, { officeOfReadingsR1: 'advent' });
  assert.match(plain(advent.day.officeOfReadingsR1), /Карынцянаў 1, 18 – 2, 5/);
  const easter = assembleOffice({ proper, office, templates: TEMPLATES, currentDay, season: SEASON.easter });
  assert.equal(easter.day.vesper1R, apostles._seasonalVariants.easter.vesper1R);
  assert.notEqual(easter.day.vesper1R, advent.day.vesper1R);
  assert.match(plain(easter.day.vesper1R), /аллелюя, аллелюя/);
});

test('shared (cached) templates are never mutated and seasons never leak between calls or dates', () => {
  const before = JSON.stringify([...TEMPLATES.entries()]);
  const order = ['lent', 'easter', 'ordinary', 'lent', 'advent', 'easter'];
  const seen = order.map((season) => text(assemble(dedication, season).day.vesper1Ps3));
  assert.equal(seen[0], seen[3]);
  assert.equal(seen[1], seen[5]);
  assert.notEqual(seen[0], seen[1]);
  assert.equal(seen[2], seen[4], 'Advent has no variant of this Common: the flat base');
  assert.equal(JSON.stringify([...TEMPLATES.entries()]), before);
  // without a season nothing changes (legacy callers)
  const legacy = assembleOffice({ proper: dedication, office: dedicationOffice, templates: TEMPLATES, currentDay });
  assert.equal(text(legacy.day.vesper1Ps3), seen[2]);
  assert.equal(legacy.seasonal.variant, null);
});

test('calendar 2026–2028, four dioceses: every legal Common-based Office gets exactly the variant of its date', () => {
  const stats = Object.fromEntries(['advent', 'christmas', 'lent', 'easter', 'ordinary'].map((k) => [k, 0]));
  let withVariantFields = 0;
  for (const year of [2026, 2027, 2028]) {
    for (let day = new Date(Date.UTC(year, 0, 1)); day.getUTCFullYear() === year; day = new Date(day.getTime() + 86400000)) {
      const iso = day.toISOString().slice(0, 10);
      for (const diocese of ['minsk-mohilev', 'pinsk', 'grodno', 'vitebsk']) {
        const resolved = resolveRuntimeDay(iso, { diocese });
        const season = { period: resolved.period, periodPhase: resolved.periodPhase };
        const key = variantKeyForSeason(season);
        resolved.officeOptions.filter((o) => o.templates?.length).forEach((option) => {
          const proper = { _schema: 2, _celebrationId: option.id, _rank: option.rank, _templates: option.templates, _defaultTemplate: option.defaultTemplate };
          const office = [resolved.officeResolution.primary, ...resolved.officeResolution.alternatives].find((o) => o.optionId === option.id);
          const result = assembleOffice({ proper, office, templates: TEMPLATES, choice: option.defaultTemplate, currentDay, season });
          stats[key || 'ordinary'] += 1;
          const common = TEMPLATES.get(option.defaultTemplate);
          const delta = key ? common?._seasonalVariants?.[key] || {} : {};
          Object.entries(result.seasonal.fields).forEach(([field, appliedKey]) => {
            assert.equal(appliedKey, key, `${iso} ${option.id} ${field}`);
            assert.deepEqual(result.day[field], delta[field], `${iso} ${option.id} ${field}`);
            withVariantFields += 1;
          });
          if (!key) assert.deepEqual(result.seasonal.fields, {}, `${iso} ${option.id}`);
          // a field absent from the delta is the flat base
          Object.keys(delta).length || assert.deepEqual(result.seasonal.fields, {});
        });
      }
    }
  }
  Object.entries(stats).forEach(([key, count]) => assert.ok(count > 0, `${key} exercised`));
  assert.ok(withVariantFields > 500, `seasonal fields exercised: ${withVariantFields}`);
});

test('boundaries: Christmas→Ordinary, Ash Wednesday, Palm Sunday, Triduum, Easter, Pentecost, Advent (2026–2028)', () => {
  const dayBefore = (iso) => new Date(Date.parse(`${iso}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const dayAfter = (iso) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const keyOf = (iso) => variantKeyForSeason(computeSeason(iso));
  for (const year of [2026, 2027, 2028]) {
    const a = computeYearAnchors(year);
    assert.equal(keyOf(dayBefore(a.baptismOfLord)), 'christmas');
    assert.equal(keyOf(a.baptismOfLord), 'christmas');
    assert.equal(keyOf(dayAfter(a.baptismOfLord)), null, `${year}: Ordinary Time after the Baptism`);
    assert.equal(keyOf(dayBefore(a.ashWednesday)), null);
    assert.equal(keyOf(a.ashWednesday), 'lent');
    assert.equal(keyOf(dayBefore(a.palmSunday)), 'lent');
    assert.equal(keyOf(a.palmSunday), 'lent');
    assert.equal(keyOf(dayBefore(a.holyThursday)), 'lent', 'Wednesday of Holy Week');
    assert.equal(keyOf(a.holyThursday), null, 'Triduum');
    assert.equal(keyOf(a.goodFriday), null);
    assert.equal(keyOf(a.holySaturday), null);
    assert.equal(keyOf(a.easterSunday), 'easter');
    assert.equal(keyOf(a.ascension), 'easter');
    assert.equal(keyOf(a.pentecost), 'easter');
    assert.equal(keyOf(dayAfter(a.pentecost)), null);
    assert.equal(keyOf(a.firstAdventSunday), 'advent');
    assert.equal(keyOf(dayBefore(a.firstAdventSunday)), null);
    assert.equal(keyOf(`${year}-12-24`), 'advent');
    assert.equal(keyOf(`${year}-12-25`), 'christmas');
  }
});

test('no Common-based Office is celebrated in Holy Week or the Triduum (so «holyweek → Lent» never decides a real celebration)', () => {
  for (const year of [2026, 2027, 2028, 2029, 2030]) {
    const a = computeYearAnchors(year);
    for (let t = Date.parse(`${a.palmSunday}T00:00:00Z`); t <= Date.parse(`${a.easterSunday}T00:00:00Z`); t += 86400000) {
      const iso = new Date(t).toISOString().slice(0, 10);
      for (const diocese of ['minsk-mohilev', 'pinsk', 'grodno', 'vitebsk']) {
        const resolved = resolveRuntimeDay(iso, { diocese });
        assert.ok(resolved.officeOptions.every((o) => !(o.templates?.length)), `${iso} ${diocese}`);
      }
    }
  }
});

test('every season variant key is a known key and every stored delta field exists in the flat Common or is a rule', () => {
  TEMPLATES.forEach((template) => {
    Object.entries(template._seasonalVariants || {}).forEach(([season, delta]) => {
      assert.ok(COMMON_SEASON_KEYS.includes(season), `${template._id}.${season}`);
      assert.ok(Object.keys(delta).length > 0, `${template._id}.${season} is not empty`);
    });
  });
});

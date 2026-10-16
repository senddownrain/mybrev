/**
 * Golden acceptance for the seasonal Commons (owner prompt 2026-10-16, D-1…D-7).
 *
 * The expectations are typed here from the printed volumes (reference, season, passage), NOT derived from the
 * generator: a bug of the generator cannot make them pass by itself. The chain is the real one:
 * resolveRuntimeDay (calendar, diocese) → office descriptor (optionId) → assembleOffice (proper + stored Common).
 * The stored data are the repository's generated templates (patchs/db-templates); this proves the code and the
 * data, NOT the state of production Firestore (NOT VERIFIED LIVE).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRuntimeDay } from '../src/utils/ordo/runtime.js';
import { assembleOffice } from '../src/utils/ordo/officeAssembly.js';
import { OFFICE_TEXT_FIELDS } from '../src/constants/officeFields.js';
import { htmlToPlain } from '../scripts/liturgy/common-seasons/lib/html.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (...parts) => JSON.parse(fs.readFileSync(path.join(ROOT, ...parts), 'utf8'));
const TEMPLATES = new Map(fs.readdirSync(path.join(ROOT, 'patchs', 'db-templates')).filter((n) => n.endsWith('.json')).map((name) => {
  const data = readJson('patchs', 'db-templates', name);
  return [data._id, data];
}));
const plain = (value) => htmlToPlain(Array.isArray(value) ? value.join('\n') : String(value || '')).replace(/\s+/g, ' ').trim();
const currentDay = Object.fromEntries(OFFICE_TEXT_FIELDS.map((field) => [field, `<p>day:${field}</p>`]));

/** Assemble a Common as a bare celebration of the given season (the proper contributes nothing). */
function commonOnly(commonId, season) {
  const office = { optionId: `acceptance-${commonId}`, kind: 'feast' };
  return assembleOffice({
    proper: { _schema: 2, _celebrationId: office.optionId, _templates: [commonId], _defaultTemplate: commonId, _rank: 'festum' },
    office, templates: TEMPLATES, currentDay, season,
  }).day;
}
const SEASONS = {
  advent: { period: 'advent', periodPhase: 'late' },
  christmas: { period: 'christmas', periodPhase: 'octave' },
  lent: { period: 'lent', periodPhase: 'lent' },
  easter: { period: 'easter', periodPhase: 'easter' },
  ordinary: { period: 'ordinary', periodPhase: 'ordinary' },
};

test('04.12.2026, diocese Grodno, grodno-cathedral-dedication: first reading of the Office is Rev 21, 9-27, not 1 Pet 2, 1-17', () => {
  const day = resolveRuntimeDay('2026-12-04', { diocese: 'grodno' });
  assert.equal(day.period, 'advent');
  const office = [day.officeResolution.primary, ...day.officeResolution.alternatives].find((o) => o.optionId === 'grodno-cathedral-dedication');
  assert.ok(office, 'the dedication of the Grodno cathedral is offered on 04.12 in the diocese of Grodno');
  const proper = readJson('patchs', 'db-feasts', '04-12-grodno-cathedral-dedication.json');
  const { day: out } = assembleOffice({
    proper, office, templates: TEMPLATES, currentDay, season: { period: day.period, periodPhase: day.periodPhase },
  });
  const reading = plain(out.officeOfReadingsR1);
  assert.match(reading, /Кніга Апакаліпсіса св\. апостала Яна 21, 9-27/u);
  assert.doesNotMatch(reading, /2, 1-17/u);
  assert.doesNotMatch(reading, /Першае пасланне св\. апостала Пятра/u);
});

test('the same celebration in Ordinary Time keeps the Volume III reading (1 Pet 2, 1-17): the season, not the Common, decides', () => {
  const ordinary = plain(commonOnly('church-dedication', SEASONS.ordinary).officeOfReadingsR1);
  assert.match(ordinary, /Першае пасланне св\. апостала Пятра[^.]*2, 1-17/u);
  assert.doesNotMatch(ordinary, /Апакаліпсіса/u);
});

// reference printed in the seasonal volume → passage of the season (volume I = Advent/Christmas, II = Lent/Easter)
const GOLDEN_R1 = [
  ['church-dedication', 'advent', /Апакаліпсіса св\. апостала Яна 21, 9-27/u],
  ['church-dedication', 'christmas', /Апакаліпсіса св\. апостала Яна 21, 9-27/u],
  ['church-dedication', 'lent', /Валадарстваў[^.]*8, 1-4\. 10-13\. 22-30/u],
  ['church-dedication', 'easter', /Апакаліпсіса св\. апостала Яна 21, 9-27/u],
  // D-7: religious and works of mercy
  ['religious', 'advent', /да Эфесцаў[^.]*4, 1-24/u],
  ['religious', 'christmas', /да Эфесцаў[^.]*4, 1-24/u],
  ['religious', 'lent', /да Эфесцаў[^.]*4, 1-24/u],
  ['religious', 'easter', /да Эфесцаў[^.]*4, 1-24/u],
  ['works-of-mercy', 'advent', /Яна[^.]*4, 7-21/u],
  ['works-of-mercy', 'christmas', /Яна[^.]*4, 7-21/u],
  ['works-of-mercy', 'lent', /Яна[^.]*4, 7-21/u],
  ['works-of-mercy', 'easter', /Яна[^.]*4, 7-21/u],
];
GOLDEN_R1.forEach(([common, season, expected]) => {
  test(`golden: ${common} / ${season}: Office of Readings, first reading`, () => {
    assert.match(plain(commonOnly(common, SEASONS[season]).officeOfReadingsR1), expected);
  });
});

test('D-7: religious (Eph 4, 1-24) and works of mercy (1 Jn 4, 7-21) replace the Ordinary Time readings in every special season', () => {
  const base = { religious: /Філіпянаў[^.]*3, 7/u, 'works-of-mercy': /Карынцянаў[^.]*12, 31/u };
  Object.entries(base).forEach(([common, regex]) => {
    assert.match(plain(commonOnly(common, SEASONS.ordinary).officeOfReadingsR1), regex, `${common} in Ordinary Time`);
    ['advent', 'christmas', 'lent', 'easter'].forEach((season) => {
      assert.doesNotMatch(plain(commonOnly(common, SEASONS[season]).officeOfReadingsR1), regex, `${common} / ${season}`);
    });
  });
});

test('D-7: «аллелюя» is not added outside Easter to the religious / works-of-mercy readings; in Easter it stays only where the volume marks it', () => {
  ['religious', 'works-of-mercy'].forEach((common) => {
    ['advent', 'christmas', 'lent'].forEach((season) => {
      assert.doesNotMatch(plain(commonOnly(common, SEASONS[season]).officeOfReadingsR1), /[Аа]ллелюя/u, `${common} / ${season}`);
    });
  });
});

test('D-5: the volume I responsories of church-dedication and pastors keep their printed «аллелюя» and no extra one is added', () => {
  const volumeOne = {
    'church-dedication': { advent: 1, christmas: 1 },
    pastors: { advent: 1, christmas: 1 },
  };
  Object.entries(volumeOne).forEach(([common, seasons]) => {
    Object.entries(seasons).forEach(([season, printed]) => {
      const text = plain(commonOnly(common, SEASONS[season]).officeOfReadingsR1);
      assert.equal((text.match(/[Аа]ллелюя/gu) || []).length, printed, `${common} / ${season}`);
    });
  });
  // Lent: no «аллелюя» is introduced into the same fields
  ['church-dedication', 'pastors'].forEach((common) => {
    assert.doesNotMatch(plain(commonOnly(common, SEASONS.lent).officeOfReadingsR1), /[Аа]ллелюя/u, `${common} / lent`);
  });
});

test('D-3: volume I verse «Дачка Тыру!…» stays in Advent / Christmas', () => {
  const found = ['advent', 'christmas'].some((season) => Object.values(commonOnlyAll(season)).some((html) => /Дачка Тыру/u.test(html)));
  assert.ok(found, 'a field of a Common of the Advent / Christmas season prints «Дачка Тыру!»');
});

function commonOnlyAll(season) {
  const result = {};
  TEMPLATES.forEach((template, id) => {
    if (template._kind !== 'common') return;
    Object.entries(commonOnly(id, SEASONS[season])).forEach(([field, value]) => { result[`${id}.${field}`] = plain(value); });
  });
  return result;
}

test('D-6: martyr-one first Vespers prints the Rom 8, 35. 37-39 reading before the responsory; religious Office of Readings has the Philippians line and the nun responsory', () => {
  const martyr = plain(commonOnly('martyr-one', SEASONS.ordinary).vesper1R);
  assert.match(martyr, /Рым[^.]*8, 35\. 37-39/u);
  assert.ok(martyr.indexOf('Хто адлучыць нас') < martyr.indexOf('рэспансорый'), 'the reading comes before the responsory heading');
  const religious = plain(commonOnly('religious', SEASONS.ordinary).officeOfReadingsR1);
  assert.match(religious, /Філіпянаў[^.]*3, 7 – 4, 1\. 4-9/u);
  assert.match(religious, /Пра законніцу: Пс 45 \(44\), 2/u);
});

test('D-6: the seasonal I and II volumes are not overwritten by the Ordinary Time completion', () => {
  const religious = plain(commonOnly('religious', SEASONS.advent).officeOfReadingsR1);
  assert.doesNotMatch(religious, /Філіпянаў/u);
});

test('D-1: a cross-reference to the readings of another Common is a set of legal variants, not an empty field and not one mandatory text', () => {
  const holyWomen = readJson('patchs', 'feasts', 'common-texts', 'holy-women.json');
  for (const season of ['advent', 'christmas', 'lent', 'easter']) {
    const variant = holyWomen._seasonalVariants?.[season]?.officeOfReadingsR2;
    assert.ok(variant, `holy-women has a ${season} variant of the second reading`);
    const text = plain(variant.html ?? variant);
    assert.match(text, /Выбіраюцца найбольш адпаведныя тэксты/u, `${season}: the reference sentence is kept`);
    assert.match(text, /Або іншае, пра святую, якая жыла ў сужэнстве/u, `${season}: the further legal choice follows`);
  }
});

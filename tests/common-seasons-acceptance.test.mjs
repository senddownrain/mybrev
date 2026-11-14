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

test('D-3: volume I verse «Дачка Тыру!…» is in virgins.officeOfReadingsPs3 AND holy-women.officeOfReadingsPs3, in Advent AND Christmas, and nowhere else', () => {
  for (const common of ['virgins', 'holy-women']) {
    for (const season of ['advent', 'christmas']) {
      assert.match(plain(commonOnly(common, SEASONS[season]).officeOfReadingsPs3), /Дачка Тыру/u, `${common} / ${season}`);
    }
    for (const season of ['lent', 'easter', 'ordinary']) {
      assert.doesNotMatch(plain(commonOnly(common, SEASONS[season]).officeOfReadingsPs3), /Дачка Тыру/u, `${common} / ${season}`);
    }
  }
});

test('D-6: martyr-one first Vespers prints the Rom 8, 35. 37-39 reading before the responsory; religious Office of Readings has the Philippians line and the nun responsory', () => {
  const martyr = plain(commonOnly('martyr-one', SEASONS.ordinary).vesper1R);
  assert.match(martyr, /Рым[^.]*8, 35\. 37-39/u);
  assert.ok(martyr.indexOf('Хто адлучыць нас') < martyr.toLocaleLowerCase('be').indexOf('рэспансорый'), 'the reading comes before the responsory heading');
  const religious = plain(commonOnly('religious', SEASONS.ordinary).officeOfReadingsR1);
  assert.match(religious, /Філіпянаў[^.]*3, 7 – 4, 1\. 4-9/u);
  assert.match(religious, /Пра законніцу: Пс 45 \(44\), 2/u);
});

test('D-6: the seasonal I and II volumes are not overwritten by the Ordinary Time completion', () => {
  const religious = plain(commonOnly('religious', SEASONS.advent).officeOfReadingsR1);
  assert.doesNotMatch(religious, /Філіпянаў/u);
});

test('D-1: holy-women second reading: Volumes I/II offer the reference AND the holy-men texts of the same volume (readable set); the Pius XII address is Volume III only', () => {
  const holyMen = {
    advent: /Гамілія да кнігі Дзеяў Апосталаў/u, christmas: /Гамілія да кнігі Дзеяў Апосталаў/u,
    lent: /Гамілія да кнігі Дзеяў Апосталаў/u, easter: /Гамілія да кнігі Дзеяў Апосталаў/u,
  };
  for (const season of ['advent', 'christmas', 'lent', 'easter']) {
    const text = plain(commonOnly('holy-women', SEASONS[season]).officeOfReadingsR2);
    assert.match(text, /^Выбіраюцца найбольш адпаведныя тэксты з ліку тых, што былі пададзены ў Агульных тэкстах пра святых мужчын, с\. \d+-\d+\./u, `${season}: the volume's sentence first`);
    assert.match(text, holyMen[season], `${season}: the holy-men reading of the same volume follows, so it can be read`);
    assert.doesNotMatch(text, /Пія ХІІ|Пія XII/u, `${season}: the Pius XII address is not printed in Volumes I/II`);
    assert.doesNotMatch(text, /Або іншае, пра святую/u, `${season}: no Volume III lead-in`);
  }
  // Ordinary Time keeps Volume III: reference, then «Або іншае» with the Pius XII address
  const ordinary = plain(commonOnly('holy-women', SEASONS.ordinary).officeOfReadingsR2);
  assert.match(ordinary, /Выбіраюцца найбольш адпаведныя тэксты/u);
  assert.match(ordinary, /Або іншае, пра святую, якая жыла ў сужэнстве/u);
  assert.match(ordinary, /Пія ХІІ/u);
  // page references differ by volume (the sentence is the volume's own)
  assert.match(plain(commonOnly('holy-women', SEASONS.advent).officeOfReadingsR2), /с\. 1275-1277/u);
  assert.match(plain(commonOnly('holy-women', SEASONS.ordinary).officeOfReadingsR2), /с\. 1584-1587/u);
});

test('D-1 limitation (not "fully solved"): the legal choices are shown as text; the app has no per-reading selector for a Common that is not among the celebration\'s _templates', () => {
  const holyWomanDocs = fs.readdirSync(path.join(ROOT, 'patchs', 'db-feasts')).map((n) => readJson('patchs', 'db-feasts', n))
    .filter((doc) => (doc._templates || []).includes('holy-women'));
  assert.ok(holyWomanDocs.length > 0);
  holyWomanDocs.forEach((doc) => assert.ok(!(doc._templates || []).includes('holy-men'), `${doc._id}: holy-men is not offered as a selectable Common`));
});

test('A3: the base fields that Volume III prints with extra rubric words differ from the volume by rubrics/references only, no prayer text is lost', () => {
  // the real classification is done on the Volume III corpus in common-seasons-reaudit.test.mjs; here the user-visible result
  const hymn = plain(commonOnly('holy-men', SEASONS.ordinary).officeOfReadingsHymn);
  assert.match(hymn, /Пра аднаго святога/u);
  assert.match(hymn, /Пра некалькіх святых/u);
  assert.match(hymn, /Будзем праслаўляць за веру/u, 'the hymn for several saints (Volume III p. 1593) is reachable in the Office of Readings');
});

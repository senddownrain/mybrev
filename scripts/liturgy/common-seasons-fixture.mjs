#!/usr/bin/env node
/**
 * Parity fixture for the Flutter port of the seasonal Commons.
 *
 *   node scripts/liturgy/common-seasons-fixture.mjs [--out reports/liturgy/common-seasons-flutter-fixture.json] [--check]
 *
 * Input of every case: Ordo `period` + `periodPhase` + template id + field
 * (and, for assembly cases, the celebration's own texts and the choice).
 * Expected: which variant key applies, where the text comes from, its length
 * and SHA-256 over UTF-8 (`valueSha256`: the string, or the array items
 * joined with U+0000), the first/last 60 characters of its plain text and
 * the provenance. No new runtime field is introduced.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { computeSeason } from '../../src/utils/ordo/season.js';
import { computeYearAnchors } from '../../src/utils/ordo/movableFeasts.js';
import { materializeCommonForSeason, variantKeyForSeason } from '../../src/utils/ordo/commonSeasons.js';
import { assembleOffice, CURRENT_DAY_CHOICE } from '../../src/utils/ordo/officeAssembly.js';
import { resolveRuntimeDay } from '../../src/utils/ordo/runtime.js';
import { OFFICE_CONTENT_FIELDS, OFFICE_TEXT_FIELDS } from '../../src/constants/officeFields.js';
import { htmlToPlain } from './common-seasons/lib/html.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sha = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');
const rawOf = (value) => (Array.isArray(value) ? value.join('\u0000') : String(value));
const plainOf = (value) => htmlToPlain(Array.isArray(value) ? value.join('\n') : String(value)).replace(/\s+/g, ' ').trim();
const describe = (value) => {
  if (value === undefined || value === '' || value === null) return { present: false };
  const plain = plainOf(value);
  return {
    present: true, shape: Array.isArray(value) ? 'array' : 'string', length: rawOf(value).length, valueSha256: sha(rawOf(value)),
    plainStart: plain.slice(0, 60), plainEnd: plain.slice(-60),
  };
};

const PERIODS = [
  { label: 'ordinary', period: 'ordinary', periodPhase: 'after-pentecost' },
  { label: 'advent', period: 'advent', periodPhase: 'advent-weekdays' },
  { label: 'advent-dec17-24', period: 'advent', periodPhase: 'dec17-24' },
  { label: 'christmas-octave', period: 'christmas', periodPhase: 'octave' },
  { label: 'christmas-after-epiphany', period: 'christmas', periodPhase: 'after-epiphany' },
  { label: 'lent', period: 'lent', periodPhase: 'lent-weeks' },
  { label: 'palm-sunday', period: 'holyweek', periodPhase: 'palm-sunday' },
  { label: 'holy-week', period: 'holyweek', periodPhase: 'holy-week' },
  { label: 'triduum', period: 'holyweek', periodPhase: 'triduum' },
  { label: 'easter-octave', period: 'easter', periodPhase: 'octave' },
  { label: 'easter', period: 'easter', periodPhase: 'before-ascension' },
  { label: 'pentecost', period: 'easter', periodPhase: 'pentecost' },
];

export function loadTemplates(root = ROOT) {
  const dir = path.join(root, 'patchs', 'db-templates');
  return new Map(fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort().map((name) => {
    const data = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    return [data._id, data];
  }));
}

export function buildFixture(root = ROOT) {
  const templates = loadTemplates(root);
  const cases = [];
  templates.forEach((template, templateId) => {
    const fields = new Set(Object.values(template._seasonalVariants || {}).flatMap((delta) => Object.keys(delta)));
    [...fields].sort((a, b) => OFFICE_CONTENT_FIELDS.indexOf(a) - OFFICE_CONTENT_FIELDS.indexOf(b)).forEach((field) => {
      PERIODS.forEach((p) => {
        const flat = materializeCommonForSeason(template, p);
        const key = variantKeyForSeason(p);
        const variantValue = key ? template._seasonalVariants?.[key]?.[field] : undefined;
        const fromVariant = key && template._seasonalVariants?.[key] && field in template._seasonalVariants[key];
        cases.push({
          input: { templateId, field, period: p.period, periodPhase: p.periodPhase },
          expected: {
            variant: key, source: fromVariant ? 'variant' : 'base', provenance: `common:${templateId}`,
            seasonProvenance: fromVariant ? key : null,
            value: describe(fromVariant ? (variantValue === null ? '' : variantValue) : flat[field]),
          },
        });
      });
    });
  });

  // Composite situations (assembleOffice): own Proper wins, memorial «З дня», ordinary, Lent/Easter.
  const dedication = { _schema: 2, _celebrationId: 'dedication-lateran-basilica', _templates: ['church-dedication'], _defaultTemplate: 'church-dedication', _rank: 'festum' };
  const dayOffice = (iso, id) => { const day = resolveRuntimeDay(iso, { diocese: 'minsk-mohilev' }); return [day.officeResolution.primary, ...day.officeResolution.alternatives].find((o) => o.optionId === id); };
  const currentDay = Object.fromEntries(OFFICE_TEXT_FIELDS.map((field) => [field, `<p>day:${field}</p>`]));
  const assembly = [];
  const run = (name, proper, officeIso, officeId, season, choice, fieldsToCheck) => {
    const result = assembleOffice({ proper, office: dayOffice(officeIso, officeId), templates, choice, currentDay, season });
    assembly.push({
      name, input: { proper, office: { date: officeIso, id: officeId }, choice: choice || null, period: season.period, periodPhase: season.periodPhase },
      expected: {
        seasonVariant: result.seasonal.variant, seasonalFields: result.seasonal.fields,
        fields: Object.fromEntries(fieldsToCheck.map((field) => [field, { provenance: result.provenance[field] || null, value: describe(result.day[field]) }])),
      },
    });
  };
  const own = { ...dedication, vesper1Ant3: '<p>OWN</p>' };
  ['ordinary', 'lent', 'easter'].forEach((label) => {
    const p = PERIODS.find((item) => item.label === label);
    run(`church-dedication ${label}`, dedication, '2026-11-09', 'dedication-lateran-basilica', p, undefined, ['vesper1Ant3', 'vesper1Ps3', 'officeOfReadingsR1', 'laudesR']);
    run(`church-dedication with own vesper1Ant3 ${label}`, own, '2026-11-09', 'dedication-lateran-basilica', p, undefined, ['vesper1Ant3', 'vesper1Ps3']);
  });
  const bvm = { _schema: 2, _celebrationId: 'bvm-x', _templates: ['blessed-virgin-mary'], _defaultTemplate: 'blessed-virgin-mary', _rank: 'memoria' };
  ['advent', 'christmas-after-epiphany', 'ordinary'].forEach((label) => {
    const p = PERIODS.find((item) => item.label === label);
    run(`blessed-virgin-mary ${label}`, bvm, '2026-11-09', 'dedication-lateran-basilica', p, undefined, ['vesper1Pr', 'laudesPr', 'vesperPr', 'officeOfReadingsPr']);
  });
  const martin = resolveRuntimeDay('2026-04-13', { diocese: 'minsk-mohilev' });
  const option = martin.officeOptions.find((o) => o.id === 'sv-martin-i-pope-martyr');
  const memorial = { _schema: 2, _celebrationId: option.id, _rank: option.rank, _templates: option.templates, _defaultTemplate: option.defaultTemplate };
  [CURRENT_DAY_CHOICE, option.defaultTemplate].forEach((choice) => run(`memorial ${choice} easter`, memorial, '2026-04-13', option.id, { period: martin.period, periodPhase: martin.periodPhase }, choice, ['laudesHymn', 'laudesPr', 'officeOfReadingsPr']));

  // Calendar boundaries (Ordo `computeSeason`) → variant key.
  const calendar = [];
  for (const year of [2026, 2027, 2028]) {
    const a = computeYearAnchors(year);
    const shift = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
    [
      ['day after Baptism of the Lord', shift(a.baptismOfLord, 1)], ['Baptism of the Lord', a.baptismOfLord], ['day before Ash Wednesday', shift(a.ashWednesday, -1)],
      ['Ash Wednesday', a.ashWednesday], ['Palm Sunday', a.palmSunday], ['Wednesday of Holy Week', shift(a.holyThursday, -1)], ['Holy Thursday', a.holyThursday],
      ['Good Friday', a.goodFriday], ['Holy Saturday', a.holySaturday], ['Easter Sunday', a.easterSunday], ['Ascension', a.ascension], ['Pentecost', a.pentecost],
      ['day after Pentecost', shift(a.pentecost, 1)], ['First Sunday of Advent', a.firstAdventSunday], ['24 December', `${year}-12-24`], ['25 December', `${year}-12-25`],
    ].forEach(([label, date]) => {
      const season = computeSeason(date);
      calendar.push({ label, date, period: season.period, periodPhase: season.periodPhase, variant: variantKeyForSeason(season) });
    });
  }
  const templateDigest = sha([...templates.entries()].map(([id, t]) => `${id}:${sha(JSON.stringify(t))}`).join('\n'));
  return {
    schema: 1,
    description: 'Parity fixture of seasonal Commons (docs/common-seasons-flutter-handoff.md). valueSha256 = sha256(UTF-8 of the string, or of the array items joined with U+0000).',
    source: { templates: 'patchs/db-templates', templatesDigest: templateDigest, templateCount: templates.size },
    periods: PERIODS,
    cases, assembly, calendar,
    counts: { cases: cases.length, assembly: assembly.length, calendar: calendar.length },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const out = outIndex >= 0 ? path.resolve(args[outIndex + 1]) : path.join(ROOT, 'reports', 'liturgy', 'common-seasons-flutter-fixture.json');
  const text = `${JSON.stringify(buildFixture(), null, 2)}\n`;
  if (args.includes('--check')) {
    if (!fs.existsSync(out) || fs.readFileSync(out, 'utf8') !== text) { console.error('fixture is out of date'); process.exitCode = 1; } else console.log('fixture is up to date');
  } else {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, text);
    console.log(`${path.relative(ROOT, out)}: ${JSON.stringify(JSON.parse(text).counts)}`);
  }
}

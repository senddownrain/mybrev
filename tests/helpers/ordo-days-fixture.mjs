/**
 * Offline `fetchDaysForDate`-shaped fixture for the Ordo runtime tests:
 * fixed documents come from `patchs/db-feasts` (the Firestore `days` ids),
 * period / seasonal / dynamic / Office for the Dead documents are synthesized
 * with the same identities the service queries.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import moment from '../../src/utils/moment-be.js';
import {
  getPeriodDayDocumentId, getSeasonalDateExceptionId, isChristmasDateExceptionExclusion,
} from '../../src/utils/liturgicalDayResolution.js';
import { OFFICE_TEXT_FIELDS } from '../../src/constants/officeFields.js';
import { dynamicFeastCodesOf, extraFixedDatesOf, legacyContextOf } from '../../src/utils/ordo/runtime.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GENERATED = fs.readdirSync(path.join(ROOT, 'patchs', 'db-feasts'))
  .filter((name) => name.endsWith('.json'))
  .map((name) => {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'patchs', 'db-feasts', name), 'utf8'));
    const { _id, ...rest } = data;
    return { id: _id || name.replace(/\.json$/, ''), ...rest };
  });

/** Legacy (materialized) shape of a sparse document under one of its former ids. */
function legacyShape(doc, id) {
  const { _schema, _legacyIds, _fieldRules, _defaultTemplate, _contentStatus, _celebrationId, ...rest } = doc;
  const version = (doc._templates || []).find((template) => id.endsWith(`--${template}`));
  return { ...rest, id, ...(version ? { _currentVersion: version } : {}) };
}

/**
 * Mirror Firestore BEFORE the data migration with the live index
 * (`scripts/ordo/data/firestore-days-index.json`): live ids and `_place`
 * arrays win; a sparse document stands in for the per-template copies it
 * replaces (`_legacyIds`) and for a multi-diocese document that
 * `patchs/db-feasts` splits (`…--pinsk`).
 */
function mirrorLive(generated) {
  const file = path.join(ROOT, 'scripts', 'ordo', 'data', 'firestore-days-index.json');
  if (!fs.existsSync(file)) return generated;
  const live = JSON.parse(fs.readFileSync(file, 'utf8')).documents;
  const real = generated.filter((doc) => !doc._scaffold);
  const owns = (doc, id) => doc.id === id || (doc._legacyIds || []).includes(id);
  return live.map((entry) => {
    const source = real.find((doc) => owns(doc, entry.id))
      || real.find((doc) => doc.id.startsWith(`${entry.id}--`) || (doc._legacyIds || []).some((id) => id.startsWith(`${entry.id}--`)))
      || real.find((doc) => entry.id.startsWith(`${doc.id.replace(/--[^-]+(?:-[^-]+)*$/, '')}--`) && doc._date === entry.date
        && (doc._templates || []).some((template) => entry.id.endsWith(`--${template}`)));
    if (!source) return null;
    return { ...legacyShape(source, entry.id), _date: entry.date, _place: entry.places.length > 1 ? entry.places : entry.places[0] };
  }).filter(Boolean);
}

const LIVE = mirrorLive(GENERATED);
/** Firestore AFTER the migration (no prune): sparse documents next to the live ones. */
const MIGRATED = [...GENERATED, ...LIVE.filter((doc) => !GENERATED.some((item) => item.id === doc.id))];

export function fixedDocsFor(ddmm, { migrated = false } = {}) {
  return (migrated ? MIGRATED : LIVE).filter((doc) => doc._date === ddmm);
}

/** Generated `liturgicalTemplates` documents by id. */
export function templatesFixture() {
  const dir = path.join(ROOT, 'patchs', 'db-templates');
  return new Map(fs.readdirSync(dir).filter((name) => name.endsWith('.json')).map((name) => {
    const { _id, ...rest } = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    return [_id, { id: _id, ...rest }];
  }));
}

export function daysFixture(resolved, { migrated = false } = {}) {
  const mDate = moment(resolved.date, 'YYYY-MM-DD');
  const context = legacyContextOf(resolved);
  const periodId = getPeriodDayDocumentId(context.periodType, context.periodWeek, context.dayOfWeek);
  // Every Hours field of the day is a recognizable marker text.
  const period = {
    id: periodId, _periodType: context.periodType, _periodWeekNumber: context.periodWeek, _dayOfWeek: context.dayOfWeek,
    ...Object.fromEntries(OFFICE_TEXT_FIELDS.map((field) => [field, `day:${field}`])),
    vesperHymn: `hymn ${periodId}`,
  };
  const seasonalId = getSeasonalDateExceptionId(mDate, context.periodType);
  const seasonal = seasonalId ? { id: seasonalId, _periodType: context.periodType } : null;
  const dynamicDaysByFeast = new Map(dynamicFeastCodesOf(resolved).map((code) => [code, [{
    id: code, _feast: code, _feastName: code, vesperHymn: `hymn ${code}`,
  }]]));
  const fixedDateDays = fixedDocsFor(mDate.format('DD.MM'), { migrated });
  const extraFixedDays = extraFixedDatesOf(resolved, mDate.format('DD.MM')).flatMap((key) => fixedDocsFor(key, { migrated }));
  const exclusive = isChristmasDateExceptionExclusion(mDate);
  return {
    context,
    daysResult: {
      periodDays: seasonal || exclusive ? [] : [period],
      periodFallback: period,
      fixedDateDays: seasonal ? [seasonal, ...fixedDateDays] : fixedDateDays,
      extraFixedDays,
      dynamicDaysByFeast,
      seasonalException: seasonal,
      officeForDead: { id: 'office-for-dead', _kind: 'office-for-dead', _feastName: 'Афіцый за памерлых' },
    },
  };
}

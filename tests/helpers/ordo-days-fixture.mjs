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
import { dynamicFeastCodesOf, extraFixedDatesOf, legacyContextOf } from '../../src/utils/ordo/runtime.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GENERATED = fs.readdirSync(path.join(ROOT, 'patchs', 'db-feasts'))
  .filter((name) => name.endsWith('.json'))
  .map((name) => {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'patchs', 'db-feasts', name), 'utf8'));
    const { _id, ...rest } = data;
    return { id: _id || name.replace(/\.json$/, ''), ...rest };
  });

/**
 * Mirror Firestore with the live index (`scripts/ordo/data/firestore-days-index.json`):
 * live ids and `_place` arrays win; a multi-diocese document that
 * `patchs/db-feasts` splits (`…--pinsk`) takes the texts of its split sibling.
 */
function mirrorLive(generated) {
  const file = path.join(ROOT, 'scripts', 'ordo', 'data', 'firestore-days-index.json');
  if (!fs.existsSync(file)) return generated;
  const live = JSON.parse(fs.readFileSync(file, 'utf8')).documents;
  const byId = new Map(generated.map((doc) => [doc.id, doc]));
  return live.map((entry) => {
    const source = byId.get(entry.id) || generated.find((doc) => doc.id.startsWith(`${entry.id}--`));
    if (!source) return null;
    return { ...source, id: entry.id, _date: entry.date, _place: entry.places.length > 1 ? entry.places : entry.places[0] };
  }).filter(Boolean);
}

const DB_FEASTS = mirrorLive(GENERATED);

export function fixedDocsFor(ddmm) {
  return DB_FEASTS.filter((doc) => doc._date === ddmm);
}

export function daysFixture(resolved) {
  const mDate = moment(resolved.date, 'YYYY-MM-DD');
  const context = legacyContextOf(resolved);
  const periodId = getPeriodDayDocumentId(context.periodType, context.periodWeek, context.dayOfWeek);
  const period = {
    id: periodId, _periodType: context.periodType, _periodWeekNumber: context.periodWeek, _dayOfWeek: context.dayOfWeek,
    vesperHymn: `hymn ${periodId}`,
  };
  const seasonalId = getSeasonalDateExceptionId(mDate, context.periodType);
  const seasonal = seasonalId ? { id: seasonalId, _periodType: context.periodType } : null;
  const dynamicDaysByFeast = new Map(dynamicFeastCodesOf(resolved).map((code) => [code, [{
    id: code, _feast: code, _feastName: code, vesperHymn: `hymn ${code}`,
  }]]));
  const fixedDateDays = fixedDocsFor(mDate.format('DD.MM'));
  const extraFixedDays = extraFixedDatesOf(resolved, mDate.format('DD.MM')).flatMap(fixedDocsFor);
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

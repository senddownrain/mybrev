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
const DB_FEASTS = fs.readdirSync(path.join(ROOT, 'patchs', 'db-feasts'))
  .filter((name) => name.endsWith('.json'))
  .map((name) => {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'patchs', 'db-feasts', name), 'utf8'));
    const { _id, ...rest } = data;
    return { id: _id || name.replace(/\.json$/, ''), ...rest };
  });

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

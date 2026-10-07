/**
 * The web content pipeline of a date, run offline:
 *
 *   resolveRuntimeDay → legacy context → the documents `fetchDaysForDate`
 *   queries (here: from the local snapshot) → assembleDaysResult →
 *   buildOrdoDayOptions
 *
 * Only the Firestore reads are replaced; every decision is the runtime code.
 * Propers and templates come from the snapshot when it has them, otherwise
 * from the generated `patchs/db-feasts` / `patchs/db-templates` (what the next
 * import publishes) — `properSource` says which.
 */
import fs from 'node:fs';
import path from 'node:path';
import moment from '../../../src/utils/moment-be.js';
import { openFirestoreSnapshot } from '../../lib/firestore-snapshot.mjs';
import { resolveRuntimeDay, dynamicFeastCodesOf, extraFixedDatesOf, legacyContextOf } from '../../../src/utils/ordo/runtime.js';
import {
  getPeriodDayDocumentId, getSeasonalDateDocumentId, getSeasonalDateExceptionId, resolveDayAgainstPeriod,
  withoutObsoleteDocuments,
} from '../../../src/utils/liturgicalDayResolution.js';
import { calculatePsalterWeek } from '../../../src/utils/liturgicalPsalter.js';
import {
  applyPeriodPsalterFallback, assembleDaysResult, exclusiveFeastCodeOf, fixedDateVariantsOf, periodPsalterFallbackId,
} from '../../../src/utils/daysResult.js';
import { buildOrdoDayOptions } from '../../../src/utils/ordoDayOptions.js';
import { withTemporalRepairs } from './temporal-repairs.mjs';
import { withTemporalImports } from './hours-source-imports.mjs';

const readDir = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort() : [])
  .map((name) => {
    const { _id, ...rest } = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    return { id: _id || name.replace(/\.json$/, ''), ...rest };
  });

export const DEFAULT_SNAPSHOT = 'backups/firestore-snapshot';

/** Snapshot directory: `--snapshot <dir>`, `MYBREV_SNAPSHOT`, else `backups/firestore-snapshot`. */
export function snapshotDirectory(argv = process.argv, root = process.cwd()) {
  const index = argv.indexOf('--snapshot');
  return path.resolve(root, index > 0 ? argv[index + 1] : (process.env.MYBREV_SNAPSHOT || DEFAULT_SNAPSHOT));
}

/**
 * @param {object} o
 * @param {string} o.snapshotDir
 * @param {'snapshot'|'generated'|'none'} [o.propers]  where `liturgicalProperTexts` comes from
 * @param {'snapshot'|'generated'} [o.templates]
 * @param {boolean} [o.repairs]  apply the planned temporal `days` repairs in memory
 */
export async function openLiturgySource({
  snapshotDir, root = process.cwd(), propers = 'generated', templates = 'generated', repairs = false,
}) {
  const snapshot = await openFirestoreSnapshot(snapshotDir);
  const snapshotDays = (await snapshot.collection('days')) || [];
  // `repairs`: the planned temporal repairs (repair-temporal-days) and the
  // source imports (import-hours-sources) applied in memory.
  const days = repairs ? withTemporalRepairs(withTemporalImports(snapshotDays, root)) : snapshotDays;
  const readings = (await snapshot.collection('readings')) || [];
  const snapshotPropers = await snapshot.collection('liturgicalProperTexts');
  const snapshotTemplates = (await snapshot.collection('liturgicalTemplates')) || [];
  const properDocs = propers === 'none' ? []
    : (propers === 'snapshot' ? (snapshotPropers || []) : readDir(path.join(root, 'patchs', 'db-feasts')));
  const templateDocs = templates === 'snapshot' ? snapshotTemplates : readDir(path.join(root, 'patchs', 'db-templates'));
  return {
    manifest: snapshot.manifest,
    days,
    daysById: new Map(days.map((doc) => [doc.id, doc])),
    readings,
    properDocs,
    templates: new Map(templateDocs.map((doc) => [doc.id, doc])),
    origin: { propers, templates, repairs },
  };
}

function findDayByPeriod(source, periodType, week, dayOfWeek) {
  const canonical = source.daysById.get(getPeriodDayDocumentId(periodType, week, dayOfWeek));
  const day = canonical || source.days.find((doc) => doc._periodType === periodType
    && String(doc._dayOfWeek) === String(dayOfWeek) && String(doc._periodWeekNumber) === String(week));
  if (!day) return null;
  const resolved = resolveDayAgainstPeriod(day, null);
  const fallbackId = periodPsalterFallbackId(resolved, periodType, week, dayOfWeek);
  return fallbackId ? applyPeriodPsalterFallback(resolved, source.daysById.get(fallbackId), periodType) : resolved;
}

/** Same documents `fetchDaysForDate` queries, from the local source. */
export function daysResultFor(source, mDate, context, dynamicFeastCodes, { extraFixedDates = [] } = {}) {
  const exclusiveFeastCode = exclusiveFeastCodeOf(dynamicFeastCodes);
  let periodDay = null;
  if (context.periodType && context.periodWeek !== undefined && context.dayOfWeek) {
    periodDay = findDayByPeriod(source, context.periodType, context.periodWeek, context.dayOfWeek);
    if (!periodDay && context.periodType === 'christmas') {
      const psalterWeek = calculatePsalterWeek({ date: mDate, periodType: 'christmas', periodWeek: context.periodWeek });
      if (psalterWeek > 0) periodDay = findDayByPeriod(source, 'advent', psalterWeek, context.dayOfWeek);
    }
  }
  const variants = fixedDateVariantsOf(mDate);
  const live = withoutObsoleteDocuments(source.days);
  const byDate = (dates) => live.filter((doc) => dates.includes(doc._date));
  const seasonalId = ['advent', 'christmas'].includes(context.periodType)
    ? (getSeasonalDateExceptionId(mDate, context.periodType) || getSeasonalDateDocumentId(mDate)) : null;
  const dynamicEntries = dynamicFeastCodes.map((code) => {
    const bare = String(code).replace(/^feast-/, '');
    return [code, live.filter((doc) => doc._feast === bare || doc._feast === `feast-${bare}`)];
  });
  return assembleDaysResult({
    mDate,
    context,
    dynamicFeastCodes,
    periodDay,
    fixedDocs: exclusiveFeastCode ? [] : byDate(variants),
    seasonalDay: exclusiveFeastCode || !seasonalId ? null : (source.daysById.get(seasonalId) || null),
    officeForDead: source.daysById.get('office-for-dead') || null,
    dynamicEntries,
    extraFixedDocs: extraFixedDates.length ? byDate(extraFixedDates) : [],
    properDocs: exclusiveFeastCode ? [] : withoutObsoleteDocuments(source.properDocs)
      .filter((doc) => [...variants, ...extraFixedDates].includes(doc._date)),
  });
}

/** `fetchContentForDate` of one date and diocese. */
export function contentFor(source, date, { diocese = 'minsk-mohilev' } = {}) {
  const mDate = moment(date, 'YYYY-MM-DD');
  const resolved = resolveRuntimeDay(date, { diocese });
  const context = legacyContextOf(resolved);
  const daysResult = daysResultFor(source, mDate, context, dynamicFeastCodesOf(resolved), {
    extraFixedDates: extraFixedDatesOf(resolved, mDate.format('DD.MM')),
  });
  const built = buildOrdoDayOptions({ resolved, daysResult, context, date, diocese, templates: source.templates });
  return { resolved, context, daysResult, ...built };
}

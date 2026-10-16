/** Thin adapter: only Ordo decides dates, transfers and legal option IDs. */
import { getYearPlan } from './ordo/yearPlan.js';
import { resolveLiturgicalDate } from './ordo/index.js';
import { getOrdoYear, suppressionReason } from './ordoScreen.js';
import { periodMatchesDay } from './liturgicalCatalog.js';

export const OCCURRENCE_LABELS = Object.freeze({
  primary: 'Асноўнае святкаванне', 'legal-alternative': 'Дазволены варыянт',
  commemoration: 'Памінанне — толькі далучэнне ўласных частак', transferred: 'Перанесена',
  'suppressed/impeded': 'У гэтым годзе не адзначаецца',
  'not-applicable-in-diocese': 'Не адзначаецца ў гэтай дыяцэзіі', 'no-content': 'Тэксты не знойдзены',
});

export function calendarOccurrence(entry, year, diocese, mode = 'hours', { preview } = {}) {
  year = Number(year);
  if (!Number.isInteger(year) || year < 1583 || year > 4099) return null;
  const context = { country: 'BY', diocese };
  let day, originalDate = null, effectiveDate = null, optionId = entry.id, removed;
  if (entry.kind === 'period') {
    day = getOrdoYear(year, { diocese }).find((item) => periodMatchesDay(entry, item));
    effectiveDate = day?.date || null;
    originalDate = effectiveDate;
    const temporal = day?.candidates.find((item) => item.kind === 'temporal');
    // Merged temporal identities (Ash Wednesday, Palm Sunday, Easter…) are
    // represented by the actual Ordo option, never an invented option ID.
    optionId = day?.options.find((item) => item.id === temporal?.id)?.id
      || (day?.primary.temporal ? day.primary.id : temporal?.id);
    if (entry.specialDateKey && entry.fixedSourceRefs?.some((ref) => ref.dayIds?.some((id) => day?.primary.daysRef?.dayIds?.includes(id)))) optionId = day.primary.id;
  } else {
    const plan = getYearPlan(year, context);
    const definition = plan.celebrations.get(entry.id);
    if (!definition || definition.suppressedBy) return {
      entryId: entry.id, year, diocese, mode, originalDate, effectiveDate,
      status: 'not-applicable-in-diocese', reason: 'Святкаванне адсутнічае ў дзейным календары дыяцэзіі.',
      canOpenHours: false, canOpenReadings: false, color: entry.color,
    };
    const placement = plan.celebrationDates.get(entry.id);
    removed = [...plan.removedByDate.values()].flat().find((item) => item.celebration.id === entry.id);
    originalDate = placement?.originalDate || removed?.originalDate || null;
    effectiveDate = placement?.date || removed?.date || null;
    if (effectiveDate) day = resolveLiturgicalDate(effectiveDate, context);
  }
  const hours = day ? [day.officeResolution.primary, ...day.officeResolution.alternatives].find((item) => item.optionId === optionId) : null;
  const readings = day ? [day.readingResolution.primary, ...day.readingResolution.alternatives].find((item) => item.optionId === optionId) : null;
  const commemoration = day?.commemorations.find((item) => item.id === optionId);
  const suppressed = day?.suppressed.find((item) => item.id === optionId);
  const descriptor = mode === 'readings' ? readings : hours;
  const primaryId = mode === 'readings' ? day?.readingResolution.primary.optionId : day?.officeResolution.primary.optionId;
  const status = descriptor
    ? (originalDate !== effectiveDate ? 'transferred' : primaryId === optionId ? 'primary' : 'legal-alternative')
    : commemoration ? 'commemoration' : 'suppressed/impeded';
  const reason = !day ? 'Гэтай літургічнай пазіцыі няма ў выбраным годзе.'
    : removed?.override ? 'Рашэнне Ordo на гэты год: святкаванне прапускаецца.'
      : suppressed || removed ? suppressionReason(suppressed || removed)
      : commemoration ? 'Памінанне не з’яўляецца асобным варыянтам літургіі гадзінаў або чытанняў.'
        : !descriptor ? 'Ordo не дазваляе асобны варыянт для гэтага рэжыму.' : '';
  const missingContent = descriptor && preview && !preview.errors.length
    && (mode === 'readings'
      ? !preview.readings.length && (entry.kind === 'period' || ['proper', 'full', 'reference-only'].includes(entry.contentStatus?.readings))
      : preview.availability === 'none' && entry.contentStatus?.hours !== 'day-fallback');
  return { entryId: entry.id, year, diocese, mode, originalDate, effectiveDate, optionId,
    status: missingContent ? 'no-content' : status, calendarStatus: status, reason, canOpenHours: Boolean(hours), canOpenReadings: Boolean(readings),
    color: day?.candidates.find((item) => item.id === optionId)?.color || entry.color || day?.color,
  };
}

export function occurrenceRoute(occurrence, mode) {
  if (!occurrence || !(mode === 'readings' ? occurrence.canOpenReadings : occurrence.canOpenHours)) return null;
  return { name: mode === 'readings' ? 'ReadingsByDate' : 'SelectedDay',
    params: mode === 'readings' ? { date: occurrence.effectiveDate } : { day: occurrence.effectiveDate },
    query: { option: occurrence.optionId, diocese: occurrence.diocese } };
}

/** Bounded nearest-year search, every proposal verified in the same mode/diocese. */
export function nearestCatalogYear(entry, year, diocese, mode, limit = 12) {
  for (let distance = 1; distance <= limit; distance += 1) {
    for (const candidate of [Number(year) + distance, Number(year) - distance]) {
      const occurrence = calendarOccurrence(entry, candidate, diocese, mode);
      if (occurrenceRoute(occurrence, mode)) return occurrence;
    }
  }
  return null;
}

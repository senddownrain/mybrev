/**
 * Readings resolution descriptors, derived from the SAME resolved day as the
 * Office. `lookup` entries are `readings` collection identities in the order
 * `readingsService` should try them; texts stay in `readings`.
 */

const ALL_SOULS_MASSES = Object.freeze([1, 2, 3]);

function cycleFor(officeKind, season) {
  const { sunday, weekday } = season.readingCycle;
  // Sundays, solemnities and feasts of the Lord use the Sunday cycle when the
  // lectionary provides A/B/C variants; weekdays of Ordinary Time use I/II.
  if (['sunday', 'solemnity'].includes(officeKind)) return { lectionary: 'sunday', year: sunday };
  if (officeKind === 'feast') return { lectionary: 'proper', year: sunday };
  if (season.period === 'ordinary') return { lectionary: 'weekday', year: weekday };
  return { lectionary: 'weekday', year: null };
}

function vigilLookup(candidate, season) {
  if (candidate.id === 'pentecost') {
    return { _periodType: 'easter', _periodWeekNumber: 7, _dayOfWeek: 7, _variant: 'pentecost-vigil' };
  }
  if (season.date === season.anchors.easterSunday) {
    return { _periodType: 'holyweek', _periodWeekNumber: 1, _dayOfWeek: 7, _variant: 'vigil' };
  }
  return null;
}

/**
 * @param {object} candidate  primary/alternative (with officeKind)
 * @param {object} season
 * @param {object} temporal   the temporal candidate of the date
 */
export function buildReadingsDescriptor(candidate, season, temporal) {
  const kind = candidate.officeKind;
  const weekdayLookup = { purpose: 'weekday', where: temporal.readingsRef };
  const properLookup = candidate.kind === 'temporal' ? null : { purpose: 'proper', where: candidate.readingsRef, title: candidate.title };
  const lookup = [];
  const sourceFallbacks = [];
  const allowedChoices = [];

  if (kind === 'memorial' || kind === 'optional-memorial') {
    // GIRM 357: on memorials the weekday readings are normally kept; proper
    // readings (when assigned) or Common readings may be chosen.
    lookup.push(weekdayLookup, properLookup, { purpose: 'common', where: { common: 'from-days._templates' } });
    allowedChoices.push({ component: 'readings', options: ['weekday', 'proper', 'common'], default: 'weekday' });
    sourceFallbacks.push({ component: 'proper-readings', chain: ['proper', 'common'] });
  } else if (candidate.kind === 'temporal') {
    lookup.push(weekdayLookup);
    // 24 December on a Sunday: the Sunday of Advent (morning) and, in the
    // evening, the Mass of the Christmas Vigil (its own legacy document, the
    // projection of the `vigil` set of `advent-24-12`).
    if (season.date.slice(5) === '12-24' && Number(season.dayOfWeek) === 1) {
      lookup.push({ purpose: 'weekday', where: { _date: '24.12', dateOnly: true, _variant: 'christmas-vigil' } });
    }
  } else if (candidate.temporal) {
    // Ash Wednesday, Palm Sunday, Easter, Pentecost: dynamic identity first.
    lookup.push(properLookup, weekdayLookup);
    sourceFallbacks.push({ component: 'readings', chain: ['proper', 'current-day'] });
  } else {
    lookup.push(properLookup, { purpose: 'common', where: { common: 'from-days._templates' } });
    sourceFallbacks.push({ component: 'readings', chain: ['proper', 'common'] });
  }

  const vigil = vigilLookup(candidate, season);
  return {
    optionId: candidate.id,
    celebrationId: candidate.kind === 'temporal' ? null : candidate.id,
    officeKind: kind,
    cycle: cycleFor(kind, season),
    readingCycle: season.readingCycle,
    lookup: lookup.filter(Boolean),
    sourceFallbacks,
    allowedChoices,
    ...(vigil ? { vigilLookup: vigil } : {}),
    // All Souls: three Masses, i.e. three reading sets of the one
    // celebration (also when 2 November is a Sunday, §11.1). The sets are
    // the `readings` sets of the celebration; this only states the count.
    ...(kind === 'all-souls'
      ? { variants: ALL_SOULS_MASSES.map((ordinal) => ({ id: `all-souls-mass-${ordinal}`, ordinal })), variantsKind: 'reading-sets' }
      : {}),
    ...(season.date === season.anchors.holyThursday
      ? { variants: [{ id: 'chrism-mass' }, { id: 'evening-mass', where: { ...temporal.readingsRef, _variant: 'evening-mass' } }] }
      : {}),
  };
}

/** A commemoration keeps the weekday readings; only the collect may change. */
export function buildCommemorationReadings(candidate, temporal) {
  return {
    celebrationId: candidate.id,
    mode: 'commemoratio',
    lookup: [{ purpose: 'weekday', where: temporal.readingsRef }],
    allowedChoices: [{ component: 'collect', options: ['weekday', 'proper'], default: 'weekday' }],
  };
}

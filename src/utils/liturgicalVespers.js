/** Compact hour name for both the list and the text header; no separate rubric chip. */
export function vespersHourTitle(model, uppercase = false) {
  const ordinal = model?.firstVespers ? 'I ' : (model?.second ? 'II ' : '');
  return `${ordinal}${uppercase ? 'НЕШПАРЫ' : 'Нешпары'}`;
}

const VESPER_FIELDS = [
  'Hymn', 'Ant1', 'Ant2', 'Ant3', 'Ps1', 'Ps2', 'Ps3', 'R', 'AntMag', 'Inter', 'Pr',
];

function hasText(value) {
  return String(value || '').trim().length > 0;
}

const FIRST_VESPERS_RANKS = new Set([
  'solemnitas', 'solemnity', 'урачыстасць', 'ўрачыстасць',
]);

function normalizedRank(day) {
  return String(day?._rank || day?._feastType || '')
    .trim()
    .toLocaleLowerCase('be-BY');
}

function normalizedPlaces(day) {
  const places = Array.isArray(day?._place) ? day._place : [day?._place];
  return [...new Set(places.map((place) => String(place || '').trim()).filter(Boolean))];
}

/** Whether a day explicitly supplies any text for its first Vespers. */
export function hasFirstVespers(day) {
  return VESPER_FIELDS.some((field) => hasText(day?.[`vesper1${field}`]));
}

/**
 * Converts tomorrow's `vesper1*` fields to the regular Vespers shape used by
 * the renderer. Day identity stays intact so the UI can explain the source.
 */
export function normalizeFirstVespers(day) {
  if (!hasFirstVespers(day)) return null;
  const result = { ...day };
  VESPER_FIELDS.forEach((field) => {
    result[`vesper${field}`] = day[`vesper1${field}`] || '';
  });
  return result;
}

/**
 * I Vespers assembled for a celebration that has them by liturgical right:
 * field by field `vesper1*` (Proper) → the celebration's own Vespers fields
 * (Proper completed with its Common when the document was built). Having
 * I Vespers is decided by the Ordo, not by the presence of `vesper1*`.
 */
export function assembleFirstVespers(day) {
  if (!day) return null;
  const result = { ...day };
  let own = 0;
  VESPER_FIELDS.forEach((field) => {
    const first = day[`vesper1${field}`];
    if (hasText(first)) own += 1;
    result[`vesper${field}`] = hasText(first) ? first : (day[`vesper${field}`] || '');
    if (day._fieldSources) {
      const key = hasText(first) ? `vesper1${field}` : `vesper${field}`;
      result._fieldSources = { ...result._fieldSources,
        [`vesper${field}`]: day._fieldSources[key] || { document: day.id, field: key },
      };
    }
  });
  result._firstVespersSource = own === VESPER_FIELDS.length ? 'vesper1'
    : own ? 'vesper1+proper' : 'proper';
  return result;
}

/**
 * The ordinary Sunday document stores II Vespers in `vesper*`. When its
 * `vesper1*` are empty, I Vespers are the Saturday psalter's `vesper*`,
 * NOT Sunday's `vesper*`. Preserve any explicit Sunday `vesper1*` Proper.
 * Missing source fields are left blank and reported, never silently filled
 * with Sunday's II Vespers.
 */
export function assembleOrdinarySundayFirstVespers(sunday, saturdayPsalter) {
  if (!sunday) return null;
  const result = { ...sunday };
  const missing = [];
  VESPER_FIELDS.forEach((field) => {
    const first = sunday[`vesper1${field}`];
    const saturday = saturdayPsalter?.[`vesper${field}`];
    const value = hasText(first) ? first : (hasText(saturday) ? saturday : '');
    result[`vesper${field}`] = value;
    if (!hasText(value)) missing.push(field);
    if (sunday._fieldSources || saturdayPsalter?._fieldSources) {
      const selected = hasText(first) ? sunday : saturdayPsalter;
      const key = hasText(first) ? `vesper1${field}` : `vesper${field}`;
      result._fieldSources = { ...result._fieldSources,
        [`vesper${field}`]: selected?._fieldSources?.[key] || { document: selected?.id || '', field: key },
      };
    }
  });
  result._firstVespersSource = hasFirstVespers(sunday) ? 'vesper1+saturday-psalter' : 'saturday-psalter';
  result._missingFirstVespersFields = missing;
  return result;
}

/** Tomorrow's option that owns I Vespers tonight (by celebration id). */
export function findFirstVespersOption(tomorrowContent, celebrationId) {
  const options = tomorrowContent?.dayOptions || [];
  return options.find((option) => option.ordo?.optionId === celebrationId) || null;
}

export function needsTomorrowVespers(day) {
  const type = day?._ordo?.vespers?.type;
  return Boolean(day && !usesOwnVespers(day) && (!type || type === 'first'));
}

/**
 * Evening model shared by the hours list and the Vespers screen.
 * With an Ordo descriptor (`day._ordo.vespers`) the engine decides II Vespers
 * vs I Vespers of tomorrow by precedence (GNLYC 61); legacy days fall back to
 * conservative solemnity + `vesper1*` fallback.
 *
 * @returns {{ firstVespers: object|null, local: object[], second: boolean }}
 */
export function eveningVespersModel(day, tomorrowContent, { isoWeekday, requestedDayId = '', periodDay = null } = {}) {
  const none = { firstVespers: null, local: [], second: false };
  if (!day || usesOwnVespers(day)) return none;
  if (day._ordo?.vespers) {
    const { vespers } = day._ordo;
    if (vespers.type === 'first') {
      const option = findFirstVespersOption(tomorrowContent, vespers.celebrationId);
      if (!option?.day) return none;
      const ordinarySunday = Number(isoWeekday) === 6
        && option.ordo?.officeKind === 'sunday'
        && String(vespers.celebrationId || '').startsWith('temporal:ordinary-');
      const firstDay = ordinarySunday
        ? assembleOrdinarySundayFirstVespers(option.day, periodDay)
        : assembleFirstVespers(option.day);
      // The O antiphon follows the civil evening, including I Vespers of an
      // Advent Sunday (it must not advance to tomorrow's O antiphon).
      if (day._periodType === 'advent' && option.day._periodType === 'advent'
        && /^advent-\d{2}-12$/.test(day.id || '') && hasText(day.vesperAntMag)) {
        firstDay.vesperAntMag = day.vesperAntMag;
        firstDay._fieldSources = { ...firstDay._fieldSources,
          vesperAntMag: day._fieldSources?.vesperAntMag || { document: day.id, field: 'vesperAntMag' },
        };
      }
      return {
        ...none,
        firstVespers: {
          day: firstDay,
          sourceDayId: option.day.id || '',
          title: option.title || vespers.title || 'заўтрашняга дня',
          places: [],
        },
      };
    }
    return { ...none, second: vespers.type === 'second' };
  }
  const options = getTomorrowFirstVespersOptions(tomorrowContent);
  const requested = requestedDayId ? options.find((item) => item.dayIds.includes(String(requestedDayId))) : null;
  const universal = options.find((item) => !isLocalFirstVespers(item));
  return {
    firstVespers: requested || universal
      || (Number(isoWeekday) === 6 ? findTomorrowRegularVespers(tomorrowContent) : null),
    local: options.filter(isLocalFirstVespers),
    second: Number(isoWeekday) === 7 || isSolemnity(day),
  };
}

/**
 * Legacy heuristic for documents without an Ordo descriptor: only solemnities may replace the preceding evening's office. The Ordo grants
 * I Vespers to a feast only when it is a feast of the Lord on a Sunday.
 */
export function hasFirstVespersRank(day) {
  if (typeof day?._ordo?.firstVespersByRight === 'boolean') return day._ordo.firstVespersByRight;
  return FIRST_VESPERS_RANKS.has(normalizedRank(day));
}

/** A local celebration must be offered separately instead of replacing all dioceses. */
export function isLocalFirstVespers(item) {
  return Boolean(item?.places?.length);
}

/** Return one card per eligible celebration and diocesan scope with explicit first-Vespers texts. */
export function getTomorrowFirstVespersOptions(content) {
  const results = [];
  const seen = new Map();
  for (const [optionIndex, option] of (content?.dayOptions || []).entries()) {
    const candidates = [
      ...(option.templates?.map((template) => template.day).filter(Boolean) || []),
      option.day,
    ].filter(Boolean);
    candidates.forEach((source) => {
      const descriptor = option.ordo || source._ordo;
      const eligible = typeof descriptor?.firstVespersByRight === 'boolean'
        ? descriptor.firstVespersByRight : hasFirstVespersRank(source);
      if (!eligible || !hasFirstVespers(source)) return;
      const places = normalizedPlaces(source).sort();
      const identity = descriptor?.celebrationId || source._celebrationId || option.key || optionIndex;
      const key = JSON.stringify([identity, places, normalizedRank(source)]);
      const aliases = [source.id, ...(option.templates || [])
        .filter((template) => template.day === source).flatMap((template) => template.dayIds || [])].filter(Boolean);
      if (seen.has(key)) {
        seen.get(key).dayIds = [...new Set([...seen.get(key).dayIds, ...aliases])];
        return;
      }
      const item = {
        day: normalizeFirstVespers(source),
        sourceDayId: source.id || '',
        dayIds: aliases,
        title: option.title || source._feastName || source._title || 'заўтрашняга дня',
        places,
      };
      seen.set(key, item);
      results.push(item);
    });
  }
  return results;
}

/**
 * Select the first applicable celebration from the already priority-sorted
 * calendar options for tomorrow. Templates are checked individually because
 * one celebration can have local variants.
 */
export function findTomorrowFirstVespers(content) {
  return getTomorrowFirstVespersOptions(content)[0] || null;
}

/** Return tomorrow's highest-priority day in its regular Vespers form. */
export function findTomorrowRegularVespers(content) {
  for (const option of content?.dayOptions || []) {
    const candidates = [
      ...(option.templates?.map((template) => template.day).filter(Boolean) || []),
      option.day,
    ].filter(Boolean);
    // Saturday's ordinary Sunday office must not silently become a local
    // diocesan celebration; those are exposed through their own ora cards.
    const day = candidates.find((candidate) => normalizedPlaces(candidate).length === 0);
    if (day) return {
      day,
      title: option.title || day._feastName || day._title || 'нядзелі',
    };
  }
  return null;
}

/** Solemnities have II Vespers even when they do not fall on Sunday. */
export function isSolemnity(day) {
  return ['solemnitas', 'solemnity', 'урачыстасць', 'ўрачыстасць'].includes(normalizedRank(day));
}

/** Offices for the dead always retain their own Vespers. */
export function usesOwnVespers(day) {
  return day?._kind === 'office-for-dead';
}

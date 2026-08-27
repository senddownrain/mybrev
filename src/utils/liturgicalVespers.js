const VESPER_FIELDS = [
  'Hymn', 'Ant1', 'Ant2', 'Ant3', 'Ps1', 'Ps2', 'Ps3', 'R', 'AntMag', 'Inter', 'Pr',
];

function hasText(value) {
  return String(value || '').trim().length > 0;
}

const FIRST_VESPERS_RANKS = new Set([
  'solemnitas', 'solemnity', 'урачыстасць', 'ўрачыстасць',
  'festum', 'feast', 'свята',
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

/** Only feasts and solemnities may replace the preceding evening's office. */
export function hasFirstVespersRank(day) {
  return FIRST_VESPERS_RANKS.has(normalizedRank(day));
}

/** A local celebration must be offered separately instead of replacing all dioceses. */
export function isLocalFirstVespers(item) {
  return Boolean(item?.places?.length);
}

/** Return every eligible feast/solemnity with explicit first-Vespers texts. */
export function getTomorrowFirstVespersOptions(content) {
  const results = [];
  const seen = new Set();
  for (const option of content?.dayOptions || []) {
    const candidates = [
      ...(option.templates?.map((template) => template.day).filter(Boolean) || []),
      option.day,
    ].filter(Boolean);
    candidates.forEach((source) => {
      const key = source.id || source;
      if (seen.has(key) || !hasFirstVespersRank(source) || !hasFirstVespers(source)) return;
      seen.add(key);
      results.push({
        day: normalizeFirstVespers(source),
        sourceDayId: source.id || '',
        title: option.title || source._feastName || source._title || 'заўтрашняга дня',
        places: normalizedPlaces(source),
      });
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

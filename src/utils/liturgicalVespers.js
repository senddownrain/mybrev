const VESPER_FIELDS = [
  'Hymn', 'Ant1', 'Ant2', 'Ant3', 'Ps1', 'Ps2', 'Ps3', 'R', 'AntMag', 'Inter', 'Pr',
];

function hasText(value) {
  return String(value || '').trim().length > 0;
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
 * Select the first applicable celebration from the already priority-sorted
 * calendar options for tomorrow. Templates are checked individually because
 * one celebration can have local variants.
 */
export function findTomorrowFirstVespers(content) {
  for (const option of content?.dayOptions || []) {
    const candidates = [
      ...(option.templates?.map((template) => template.day).filter(Boolean) || []),
      option.day,
    ].filter(Boolean);
    const source = candidates.find(hasFirstVespers);
    if (source) return {
      day: normalizeFirstVespers(source),
      title: option.title || source._feastName || source._title || 'заўтрашняга дня',
    };
  }
  return null;
}

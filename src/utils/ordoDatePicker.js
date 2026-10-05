/**
 * Liturgical date picker (Hours / Readings bottom navigation).
 *
 * Pure: the colours and the options of a date come from the SAME
 * `ResolvedLiturgicalDay` the Hours and Readings use — there is no separate
 * selection algorithm here. Suppressed candidates never colour a date and
 * are never offered.
 */
import { resolveRuntimeDay } from './ordo/runtime.js';
import { colorInfo, legalColors, rankLabel } from './ordoScreen.js';

export const MAX_PICKER_COLORS = 3;

/** Calendar ring of a vestment colour (one vocabulary: `VESTMENT_COLORS`). */
export const pickerSwatch = (color) => colorInfo(color).ring || colorInfo(color).swatch;

/** Liturgical colours of the legal options of a date (primary first, max 3). */
export function pickerColorsOf(iso, diocese) {
  return legalColors(resolveRuntimeDay(iso, { diocese })).slice(0, MAX_PICKER_COLORS);
}

/**
 * CSS background of a date: one colour is a plain circle, two are halves,
 * three are segments.
 */
export function colorGradient(colors) {
  const swatches = colors.map(pickerSwatch);
  if (!swatches.length) return 'transparent';
  if (swatches.length === 1) return swatches[0];
  const step = 100 / swatches.length;
  const stops = swatches.map((swatch, index) => `${swatch} ${(index * step).toFixed(2)}% ${((index + 1) * step).toFixed(2)}%`);
  return `conic-gradient(from 0deg, ${stops.join(', ')})`;
}

/** Legal options of a date for the list under the calendar grid. */
export function pickerOptionsOf(iso, diocese) {
  const day = resolveRuntimeDay(iso, { diocese });
  return [day.primary, ...day.alternatives].map((option) => ({
    id: option.id,
    title: option.title,
    role: option.role,
    rank: option.kind === 'temporal' && !['sunday', 'solemnity', 'triduum'].includes(option.officeKind) ? 'Будзень' : rankLabel(option),
    color: option.color || day.color,
    swatch: pickerSwatch(option.color || day.color),
    colorLabel: colorInfo(option.color || day.color).label,
    hasProperHours: option.kind === 'temporal' || option.contentStatus?.hours === 'proper' || option.kind === 'dynamic',
  }));
}

/**
 * Where a chosen option leads. The option id travels in the query: the
 * target screen already has the day's documents and opens exactly that
 * option (`ItemsList` forwards to its Office, `ReadingsView` selects its
 * readings). The diocesan context of the screen is kept.
 */
export function pickerRouteFor(option, iso, mode, { today, diocese = '', defaultDiocese = '' } = {}) {
  const query = {
    ...(option?.id && option.role !== 'primary' ? { option: option.id } : {}),
    ...(diocese && diocese !== defaultDiocese ? { diocese } : {}),
  };
  const hasQuery = Object.keys(query).length > 0;
  if (mode === 'readings') {
    return iso === today && !hasQuery
      ? { name: 'Readings' }
      : { name: 'ReadingsByDate', params: { date: iso }, ...(hasQuery ? { query } : {}) };
  }
  // Hours: the primary of today is the home screen; anything else names the
  // option so the list forwards straight to its Office.
  if (iso === today && !hasQuery) return { name: 'Today' };
  return { name: 'SelectedDay', params: { day: iso }, query: { ...query, ...(option?.id ? { option: option.id } : {}) } };
}

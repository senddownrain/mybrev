/**
 * Liturgical date picker (Hours / Readings bottom navigation).
 *
 * Pure: the colours and the options of a date come from the SAME
 * `ResolvedLiturgicalDay` the Hours and Readings use — there is no separate
 * selection algorithm here. Suppressed candidates never colour a date and
 * are never offered.
 */
import { legacyContextOf, resolveRuntimeDay } from './ordo/runtime.js';
import { colorInfo, legalColors, rankLabel } from './ordoScreen.js';

export const MAX_PICKER_COLORS = 3;

/** Calendar ring of a vestment colour (one vocabulary: `VESTMENT_COLORS`). */
export const pickerSwatch = (color) => colorInfo(color).ring || colorInfo(color).swatch;

const asList = (dioceses) => (Array.isArray(dioceses) ? dioceses : [dioceses]).filter(Boolean);
const DIOCESE_BADGES = Object.freeze({ 'minsk-mohilev': 'Мінск', vitebsk: 'Віцебск', pinsk: 'Пінск', grodno: 'Гродна' });

/**
 * Liturgical colours of the legal options of a date (primary first, max 3);
 * with several dioceses, the colours of all of them.
 */
export function pickerColorsOf(iso, dioceses) {
  const days = asList(dioceses).map((diocese) => resolveRuntimeDay(iso, { diocese }));
  return legalColors(days.length ? days : [resolveRuntimeDay(iso, {})]).slice(0, MAX_PICKER_COLORS);
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
function optionsOfDay(day) {
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
 * Legal options of a date for one or several dioceses. The same celebration
 * with the same rank is one entry; an option of only some dioceses carries
 * their badges and the diocese it opens in (`diocese`).
 */
export function pickerOptionsOf(iso, dioceses) {
  const list = asList(dioceses);
  if (list.length <= 1) return optionsOfDay(resolveRuntimeDay(iso, { diocese: list[0] }));
  const merged = new Map();
  list.forEach((diocese) => optionsOfDay(resolveRuntimeDay(iso, { diocese })).forEach((option) => {
    const key = `${option.id}|${option.rank}`;
    const entry = merged.get(key) || { ...option, dioceses: [] };
    entry.dioceses.push(diocese);
    merged.set(key, entry);
  }));
  return [...merged.values()].map((option) => ({
    ...option,
    diocese: option.dioceses[0],
    badges: option.dioceses.length === list.length ? [] : option.dioceses.map((id) => DIOCESE_BADGES[id] || id),
  }));
}

/**
 * «Выбраць»: the date alone — the main screen of that day, where every legal
 * option is listed (Hours `/day/…`, Readings `/readings/…`).
 */
export function pickerDateRoute(iso, mode, { today, diocese = '', defaultDiocese = '' } = {}) {
  const query = diocese && diocese !== defaultDiocese ? { diocese } : {};
  const hasQuery = Object.keys(query).length > 0;
  if (mode === 'readings') {
    return iso === today && !hasQuery ? { name: 'Readings' } : { name: 'ReadingsByDate', params: { date: iso }, ...(hasQuery ? { query } : {}) };
  }
  return iso === today && !hasQuery ? { name: 'Today' } : { name: 'SelectedDay', params: { day: iso }, ...(hasQuery ? { query } : {}) };
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

/**
 * `/picker` «Па перыядзе»: the civil date of a liturgical position in a civil
 * year, found by the Ordo engine itself (the same context Hours/Readings use).
 * A position that does not exist that year (I Sunday of Ordinary Time is the
 * Baptism of the Lord, Advent IV past 24 December…) is null, never a date
 * from another period.
 */
export function ordoDateForPosition(year, periodType, periodWeek, dayOfWeek, { diocese } = {}) {
  for (let time = Date.UTC(year, 0, 1); time < Date.UTC(year + 1, 0, 1); time += 86_400_000) {
    const iso = new Date(time).toISOString().slice(0, 10);
    const context = legacyContextOf(resolveRuntimeDay(iso, { diocese }));
    if (context.periodType === periodType && Number(context.periodWeek) === Number(periodWeek)
      && Number(context.dayOfWeek) === Number(dayOfWeek)) return iso;
  }
  return null;
}

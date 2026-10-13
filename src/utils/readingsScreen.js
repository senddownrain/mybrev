/**
 * Pure model of the Readings screen (`ReadingsView.vue`): documents of a date
 * → reading groups → active group → Mass reading set → cycle → rendered
 * view. The view only binds the route and the loaded items to this function,
 * so the audit scripts can exercise the SAME resolution path headlessly.
 */
import { normalizeReadingCycle, readingCelebrationKey } from './parsedReadingsIdentity.js';
import {
  collapseCoveredDocuments, hasMassReadingSets, massReadingSetsOf, readingViewOfSet, selectSet, setCycles,
} from './massReadingSets.js';
import { preferredReadingGroup } from './readingSetChoice.js';

/** Reading groups of the date (legacy documents covered by a canonical one are hidden). */
export function readingGroupsOf(items = []) {
  const groups = new Map();
  for (const reading of collapseCoveredDocuments(items)) {
    const key = readingCelebrationKey(reading);
    if (!groups.has(key)) groups.set(key, { key, documents: [] });
    groups.get(key).documents.push(reading);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    label: group.documents.find((document) => document.title)?.title || 'Чытанні дня',
  }));
}

/**
 * @param {{ items: object[], context?: { cycle?: string, sundayCycle?: string }, query?: object }} input
 *   `query` = route query (`readingId`, `dayId`, `option`, `set`, `year`)
 */
export function resolveReadingsScreen({ items = [], context = {}, query = {} } = {}) {
  const groups = readingGroupsOf(items);
  const readingId = String(query.readingId || '');
  const dayId = String(query.dayId || '');
  const optionId = String(query.option || '');
  let activeGroup = null;
  if (readingId) activeGroup = groups.find((group) => group.documents.some((document) => document.id === readingId)) || null;
  if (!activeGroup && dayId) {
    activeGroup = groups.find((group) => group.documents.some((document) => document._dayId === dayId || document._dayIds?.includes(dayId))) || null;
  }
  if (!activeGroup && optionId) {
    // The option chosen in the calendar opens ITS DEFAULT readings: the weekday readings of a
    // memorial, the memorial's own readings only where the Lectionary prescribes them
    // (src/utils/ordo/memorialReadings.js); the other groups stay selectable alternatives.
    activeGroup = groups.find((group) => group.documents.some((document) => document._ordoOptionRoles?.[optionId]?.default))
      || groups.find((group) => group.documents.some((document) => document._ordoOptionId === optionId)) || null;
  }
  if (!activeGroup) activeGroup = preferredReadingGroup(groups);

  const setDocument = activeGroup?.documents.find(hasMassReadingSets) || null;
  const sets = massReadingSetsOf(setDocument);
  const activeSet = sets.length ? selectSet(sets, String(query.set || '')) : null;
  const availableCycles = activeSet
    ? setCycles(activeSet)
    : ['A', 'B', 'C', '1', '2'].filter((cycle) => new Set((activeGroup?.documents || [])
      .map((document) => normalizeReadingCycle(document.year)).filter(Boolean)).has(cycle));
  const hasSundayCycles = availableCycles.some((cycle) => ['A', 'B', 'C'].includes(cycle));
  const currentCycle = normalizeReadingCycle(hasSundayCycles ? context?.sundayCycle : context?.cycle);
  const requested = normalizeReadingCycle(query.year);
  let activeCycle;
  if (requested && availableCycles.includes(requested)) activeCycle = requested;
  else if (currentCycle && availableCycles.includes(currentCycle)) activeCycle = currentCycle;
  else if (!activeSet && activeGroup?.documents.some((document) => !normalizeReadingCycle(document.year))) activeCycle = '';
  else activeCycle = availableCycles[0] || '';

  let activeReading = null;
  if (setDocument && activeSet) activeReading = readingViewOfSet(setDocument, activeSet, activeCycle);
  else if (activeGroup?.documents.length) {
    const documents = activeGroup.documents;
    activeReading = (activeCycle && documents.find((document) => normalizeReadingCycle(document.year) === activeCycle))
      || documents.find((document) => !normalizeReadingCycle(document.year)) || documents[0];
  }
  return {
    groups, activeGroup, setDocument, sets, activeSet, availableCycles, currentCycle, activeCycle, activeReading,
  };
}

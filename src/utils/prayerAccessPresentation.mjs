import { prayerCategoryMatch } from './prayerCategoryMembership.mjs';

const oldNames = new Map([
  ['Святарскі доступ', 'Святары'],
  ['Марыянскія малітвы', 'Айцы марыяне'],
]);

export function displayAccessSetName(set) {
  return oldNames.get(set.name) || set.name;
}

export function accessSetName(id, sets) {
  const set = sets.find((item) => item.id === id);
  if (set) return displayAccessSetName(set);
  return id === 'priest' ? 'Святары' : 'Набор недаступны';
}

export function storedPrayerAccess(row) {
  if (Array.isArray(row?.effectiveAccessSets) && row.effectiveAccessSets.length) return row.effectiveAccessSets;
  return row?.priestOnly === true || row?.effectivePriestOnly === true ? ['priest'] : null;
}

export function effectivePrayerAccess(ownSets, inherited = []) {
  let result = ownSets.length ? ownSets : null;
  for (const sets of inherited) {
    if (!sets) continue;
    result = result === null ? sets : result.filter((id) => sets.includes(id));
  }
  return result;
}

export function inheritedPrayerAccess(prayer, categories) {
  return categories.filter((category) => prayerCategoryMatch(prayer, category).matches).map(storedPrayerAccess);
}

export function prayerAccessLabel(access, sets) {
  if (access === null) return 'Агульнадаступная';
  if (!access.length) return 'Несумяшчальныя абмежаванні';
  return [...new Set(access.map((id) => accessSetName(id, sets)))].join(', ');
}

export function prayerAccessFilters(sets) {
  return [
    { title: 'Усе', value: 'all' },
    { title: 'Агульнадаступныя', value: 'public' },
    { title: 'Асаблівы доступ', value: 'restricted' },
    ...sets.map((set) => ({ title: displayAccessSetName(set), value: 'set:' + set.id })),
  ];
}

export function matchesPrayerAccessFilter(row, filter) {
  const effective = storedPrayerAccess(row);
  return filter === 'all' || (filter === 'public' && effective === null)
    || (filter === 'restricted' && effective !== null) || Boolean(effective?.includes(filter.slice(4)) && filter.startsWith('set:'));
}

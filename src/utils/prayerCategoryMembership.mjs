/** Shared Web / bundle contract: direct membership never includes descendants. */
export function prayerCategoryMatch(prayer, category) {
  const tagged = (category.tags || []).some((tag) => (prayer.tags || []).includes(tag));
  const manual = (category.prayerIds || []).includes(prayer.id);
  const legacy = Boolean(category.id) && (prayer.categoryId === category.id || (prayer.categoryIds || []).includes(category.id));
  return { tagged, manual, legacy, matches: tagged || manual || legacy };
}

export function directCategoryPrayers(prayers, category) {
  return [...new Map(prayers.filter((p) => prayerCategoryMatch(p, category).matches).map((p) => [p.id, p])).values()];
}

export function comparePrayerCategories(a, b) {
  const order = (c) => Number.isFinite(c.order) ? c.order : Number.MAX_SAFE_INTEGER;
  return order(a) - order(b) || String(a.name || '').localeCompare(String(b.name || ''), 'be', { sensitivity: 'base' })
    || String(a.id).localeCompare(String(b.id));
}

export const MAX_CATEGORY_DEPTH = 64;

/** Validate against the latest canonical content inside the atomic mutator. */
export function validateCategoryChange(category, categories, prayers) {
  if (!category.name?.trim()) throw new Error('Назва катэгорыі абавязковая.');
  if (!Number.isFinite(category.order)) throw new Error('Парадак павінен быць лікам.');
  if (categories.some((c) => c.id !== category.id && (c.parentId || null) === (category.parentId || null)
    && c.name.localeCompare(category.name, 'be', { sensitivity: 'base' }) === 0)) {
    throw new Error('У гэтым раздзеле ўжо ёсць катэгорыя з такой назвай.');
  }
  const byId = new Map(categories.map((c) => [c.id, c]));
  byId.set(category.id, category);
  // Also validate descendants: moving a branch must not exceed the depth limit.
  const affected = new Set([category.id]);
  let previousSize;
  do {
    previousSize = affected.size;
    for (const c of byId.values()) if (affected.has(c.parentId)) affected.add(c.id);
  } while (previousSize !== affected.size);
  for (const id of affected) {
    const item = byId.get(id);
    let current = item;
    const seen = new Set();
    while (current) {
      if (seen.has(current.id)) throw new Error('Нельга ствараць цыкл катэгорый.');
      seen.add(current.id);
      if (seen.size > MAX_CATEGORY_DEPTH) throw new Error('Занадта глыбокая ўкладзенасць катэгорый.');
      if (!current.parentId) break;
      current = byId.get(current.parentId);
      if (!current) throw new Error('Бацькоўская катэгорыя не знойдзена. Спачатку выпраўце сувязі.');
    }
  }
  if (!Array.isArray(category.prayerIds) || category.prayerIds.some((id) => typeof id !== 'string' || !id.trim())
    || new Set(category.prayerIds).size !== category.prayerIds.length) throw new Error('Некарэктныя ID асобных малітваў.');
  const publishedIds = new Set(prayers.map((p) => p.id));
  if (category.prayerIds.some((id) => !publishedIds.has(id))) throw new Error('Асобная малітва больш не апублікаваная. Прыбярыце яе са спіса.');
}

export function removeCategoryFromContent(content, id) {
  if (content.categories.some((c) => c.parentId === id)) throw new Error('Спачатку перанясіце або выдаліце падкатэгорыі.');
  content.categories = content.categories.filter((c) => c.id !== id);
  content.prayers = content.prayers.map((p) => {
    if (p.categoryId !== id && !(p.categoryIds || []).includes(id)) return p;
    const next = { ...p };
    if (next.categoryId === id) delete next.categoryId;
    if (next.categoryIds) next.categoryIds = next.categoryIds.filter((value) => value !== id);
    return next;
  });
}

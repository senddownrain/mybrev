import { LITURGICAL_DAYS_COLLECTION, LITURGICAL_PROPER_TEXTS_COLLECTION } from '../constants/days.js';
import { isSparseDayDocument } from '../constants/officeFields.js';

/** Match the public resolver: published Propers take precedence over legacy days. */
export async function loadEditorDocument(id, readDocument) {
  const [baseId, choice = ''] = id.split('--');
  // Do not fall back on permission/network errors: that could edit an unused copy.
  const proper = await readDocument(LITURGICAL_PROPER_TEXTS_COLLECTION, baseId);
  if (proper && !proper._obsolete && isSparseDayDocument(proper)) {
    return { collection: LITURGICAL_PROPER_TEXTS_COLLECTION, id: baseId, data: proper, choice };
  }
  const day = await readDocument(LITURGICAL_DAYS_COLLECTION, id);
  if (!day) throw new Error('Літургічны дзень не знойдзены.');
  return { collection: LITURGICAL_DAYS_COLLECTION, id, data: day, choice: '' };
}

/** Compare exact stored HTML, including whitespace, after a server read. */
export function verifyEditorWrite(saved, set, remove = []) {
  if (!saved) throw new Error('Кантрольнае чытанне: дакумент не знойдзены.');
  const canonical = (value) => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
    return value;
  };
  const different = Object.keys(set).filter((key) => JSON.stringify(canonical(saved[key])) !== JSON.stringify(canonical(set[key])));
  different.push(...remove.filter((key) => Object.hasOwn(saved, key)));
  if (different.length) throw new Error(`Кантрольнае чытанне: не супадаюць палі ${different.join(', ')}.`);
}

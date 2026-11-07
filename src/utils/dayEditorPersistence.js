import { LITURGICAL_DAYS_COLLECTION, LITURGICAL_PROPER_TEXTS_COLLECTION } from '../constants/days.js';
import { isSparseDayDocument } from '../constants/officeFields.js';
import { isObsoleteDocument } from './liturgicalDayResolution.js';

/** Match the public resolver: a published Proper precedes legacy days copies. */
export async function loadDayEditorDocument(id, read) {
  const [baseId, choice = ''] = id.split('--');
  const published = (data) => isSparseDayDocument(data) && !isObsoleteDocument(data);
  const exact = await read(LITURGICAL_PROPER_TEXTS_COLLECTION, id);
  if (published(exact)) {
    return { collection: LITURGICAL_PROPER_TEXTS_COLLECTION, id, data: exact, choice: '' };
  }
  if (choice) {
    const proper = await read(LITURGICAL_PROPER_TEXTS_COLLECTION, baseId);
    // A suffix may be a real diocesan identity, rather than a Common choice.
    if (published(proper) && (choice === 'day' || proper._templates?.includes(choice))) {
      return { collection: LITURGICAL_PROPER_TEXTS_COLLECTION, id: baseId, data: proper, choice };
    }
  }
  const day = await read(LITURGICAL_DAYS_COLLECTION, id);
  if (day) return { collection: LITURGICAL_DAYS_COLLECTION, id, data: day, choice: '' };
  throw new Error('Літургічны дзень не знойдзены.');
}

function comparable(value) {
  if (Array.isArray(value)) return value.map(comparable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, comparable(value[key])]));
  }
  return value;
}

/** Compare exact strings, including whitespace; Firestore map order is irrelevant. */
export function verifyDayEditorWrite(data, { path, set, remove = [] }) {
  if (!data) throw new Error(`Не пацверджана захаванне: ${path}`);
  const mismatches = Object.keys(set).filter((field) => (
    JSON.stringify(comparable(data[field])) !== JSON.stringify(comparable(set[field]))
  ));
  mismatches.push(...remove.filter((field) => Object.hasOwn(data, field)));
  if (mismatches.length) throw new Error(`Не пацверджана захаванне: ${path} (${mismatches.join(', ')})`);
}

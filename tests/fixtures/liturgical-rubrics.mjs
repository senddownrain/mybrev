// Use the repository's public common texts, including every stored seasonal
// override. No Firestore access or copied liturgical content is needed.
import fs from 'node:fs';

const directory = new URL('../../patchs/feasts/common-texts/', import.meta.url);
export const commons = Object.fromEntries(fs.readdirSync(directory)
  .filter(name => name.endsWith('.json') && name !== 'manifest.json')
  .sort()
  .map(name => [name.slice(0, -5), JSON.parse(fs.readFileSync(new URL(name, directory), 'utf8'))]));

export function fieldsOf(document, path = '') {
  return Object.entries(document).flatMap(([key, value]) => {
    const fieldPath = path ? `${path}.${key}` : key;
    if (value && typeof value === 'object') return fieldsOf(value, fieldPath);
    return typeof value === 'string' && value.trim() ? [{ key, path: fieldPath, html: value }] : [];
  });
}

export const isShortReading = key => /^(?:laudes|vesper1?|sext[123])R$/u.test(key);
export const shortReadingFields = Object.entries(commons).flatMap(([id, document]) =>
  fieldsOf(document).filter(field => isShortReading(field.key)).map(field => ({ id, ...field })));

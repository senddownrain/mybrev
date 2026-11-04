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

export const officeReadingFields = Object.entries(commons).flatMap(([id, document]) =>
  fieldsOf(document).filter(field => /^officeOfReadingsR[12]$/u.test(field.key)).map(field => ({ id, ...field })));

// Inventory candidates independently of the renderer's reference grammar.
// The corpus stores these captions in standalone paragraphs with no replies.
export const responsoryReferenceParagraphs = [...shortReadingFields, ...officeReadingFields].flatMap(field =>
  field.html.match(/<p\b[^>]*>[\s\S]*?<\/p>/giu)?.filter(html => {
    const text = html.replace(/<[^>]*>/gu, '').replace(/&nbsp;|&#0*32;|&#x0*20;/giu, ' ').trim();
    return /^(?:Кароткі\s+)?рэспансорый\s*\S/iu.test(text)
      && !/^(?:Кароткі\s+)?рэспансорый$/iu.test(text);
  }).map(html => ({ ...field, html })) || []);

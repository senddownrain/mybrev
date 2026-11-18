import { parse } from 'node-html-parser';

// Display-only Belarusian conclusion for collects addressed to the Father.
// The short form in the approved 18 November source ends with "Праз Пана нашага."
// Do not change Firestore, other prayer endings, or already complete collects.
export const FULL_OFFICE_COLLECT_CONCLUSION =
  'Праз Пана нашага Езуса Хрыста, Твайго Сына, які з Табою жыве і валадарыць у еднасці Духа Святога, Бог, праз усе вякі вечныя. Амэн.';

const shortAtEnd = /Праз\s+Пана\s+нашага\.\s*$/u;
// Accept inline typography closing tags, but only at the END of a prayer paragraph.
const shortHtmlAtEnd = /Праз(?:\s|&nbsp;|&#0*160;|&#x0*a0;)+Пана(?:\s|&nbsp;|&#0*160;|&#x0*a0;)+нашага\.(?=(?:\s*<\/(?:span|font|b|strong|i|em|a)>)*\s*$)/iu;
const plainText = node => node.text.replace(/\u00a0/gu, ' ').replace(/\s+/gu, ' ').trim();

export function expandOfficeCollectConclusion(value) {
  const source = String(value || '');
  if (!source.includes('Праз') || !source.includes('Пана')) return source;
  if (!source.includes('<')) return source.replace(shortAtEnd, FULL_OFFICE_COLLECT_CONCLUSION);

  const root = parse(source);
  let changed = false;
  // Work on individual prayer paragraphs, not across variant delimiters.
  const blocks = root.querySelectorAll('p, div')
    .filter(node => !node.querySelector('p, div'));
  for (const block of blocks) {
    if (!shortAtEnd.test(plainText(block))) continue;
    const next = block.innerHTML.replace(shortHtmlAtEnd, FULL_OFFICE_COLLECT_CONCLUSION);
    if (next !== block.innerHTML) {
      block.innerHTML = next;
      changed = true;
    }
  }
  return changed ? root.toString() : source;
}

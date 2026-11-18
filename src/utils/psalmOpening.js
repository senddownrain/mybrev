import { parse } from 'node-html-parser';

// A display-only concession for an antiphon that is the ENTIRE opening
// psalm half-verse. Never remove a merely similar beginning or alter a source.
const normalizeWords = (text) => String(text || '')
  .replace(/&nbsp;|&#160;/giu, ' ')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim()
  .toLocaleLowerCase();

function precedingText(paragraph, marker) {
  let current = marker;
  let text = '';
  while (current !== paragraph) {
    const parent = current.parentNode;
    if (!parent) return '';
    const index = parent.childNodes.indexOf(current);
    text = parent.childNodes.slice(0, index).map((node) => node.textContent).join('') + text;
    current = parent;
  }
  return text;
}

/**
 * When the selected antiphon exactly echoes a whole first half-verse ending
 * at † or *, show the continuation once. The HTML passed to this function
 * must already be the selected psalm alternative, not the entire source.
 */
export function omitEchoedPsalmOpening(psalmHtml, selectedAntiphonHtml) {
  if (!selectedAntiphonHtml) return psalmHtml;
  const root = parse(String(psalmHtml || ''));
  const paragraph = root.querySelector('p[data-psalm-strophe]');
  const marker = paragraph?.querySelector('.psalm-marker');
  if (!marker || !['†', '*'].includes(marker.text.trim())) return psalmHtml;

  const antiphonText = parse(String(selectedAntiphonHtml)).text
    .replace(/^\s*(?:[1-9]\s*)?ант\.\s*/iu, '');
  const opening = precedingText(paragraph, marker).replace(/^\s*\d+[.)]\s*/u, '');
  if (!normalizeWords(antiphonText) || normalizeWords(antiphonText) !== normalizeWords(opening)) {
    return psalmHtml;
  }

  // Remove preceding siblings at each nesting level, preserving all following
  // inline markup (bold/italic) and subsequent strophes untouched.
  let current = marker;
  while (current !== paragraph) {
    const parent = current.parentNode;
    if (!parent) return psalmHtml;
    for (const sibling of parent.childNodes.slice(0, parent.childNodes.indexOf(current))) {
      parent.removeChild(sibling);
    }
    current = parent;
  }
  marker.parentNode.removeChild(marker);
  paragraph.innerHTML = paragraph.innerHTML
    .replace(/<(em|i|span|b|strong)(?:\s[^>]*)?><\/\1>/giu, '')
    .replace(/^((?:<[^>]+>)*)(?:\s|&nbsp;)+/iu, '$1');
  if (!normalizeWords(paragraph.text) && root.querySelectorAll('p[data-psalm-strophe]').length > 1) {
    paragraph.remove();
  }
  return root.innerHTML;
}

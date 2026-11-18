import { parse } from 'node-html-parser';

// Display-only omission of an EXACTLY echoed opening half-verse or complete
// first psalm verse. Never remove a merely similar beginning or alter a source.
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
 * When the selected antiphon exactly echoes the first half-verse or the entire
 * first verse, show the continuation once. The HTML passed to this function
 * must already be the selected psalm alternative, not the entire source.
 */
export function omitEchoedPsalmOpening(psalmHtml, selectedAntiphonHtml) {
  if (!selectedAntiphonHtml) return psalmHtml;
  const root = parse(String(psalmHtml || ''));
  const strophes = root.querySelectorAll('p[data-psalm-strophe]');
  const paragraph = strophes[0];
  const antiphonText = parse(String(selectedAntiphonHtml)).text
    .replace(/^\s*(?:[1-9]\s*)?ант\.\s*/iu, '');
  const antiphonWords = normalizeWords(antiphonText);

  // Some antiphons reproduce the ENTIRE first verse (both parts separated
  // by *), not merely the first half-verse. Omit that whole repeated strophe
  // and keep † immediately before the beginning of the NEXT verse.
  // Never do this for a partial match or if there is no following verse.
  const fullOpening = paragraph?.text.replace(/^\s*\d+[.)]\s*/u, '');
  if (antiphonWords && antiphonWords === normalizeWords(fullOpening) && strophes[1]) {
    const next = strophes[1];
    const nextMarker = next.querySelector('.psalm-marker');
    const existingLeadingDagger = nextMarker?.text.trim() === '†'
      && !normalizeWords(precedingText(next, nextMarker).replace(/^\s*\d+[.)]\s*/u, ''));
    if (existingLeadingDagger) {
      nextMarker.classList.add('psalm-opening-flexa');
    } else {
      next.innerHTML = '<span class="psalm-marker psalm-opening-flexa">†</span>&nbsp;' + next.innerHTML;
    }
    // Prevent a source space or <br> from orphaning the special leading †.
    // Other † and * signs retain the reader's selected break behavior.
    next.innerHTML = next.innerHTML
      .replace(/^((?:<[^>]+>)*)(?:\s|&nbsp;)+/iu, '$1')
      .replace(/(<span\b[^>]*\bpsalm-opening-flexa\b[^>]*>†<\/span>(?:<\/(?:em|i|b|strong|span|font)>)*)(?:[ \t\r\n]|&nbsp;)*/iu, '$1&nbsp;');
    paragraph.remove();
    return root.innerHTML;
  }

  // Preserve the existing half-verse behavior for antiphons that reproduce
  // only the words before the first † or *.
  const marker = paragraph?.querySelector('.psalm-marker');
  if (!marker || !['†', '*'].includes(marker.text.trim())) return psalmHtml;

  const opening = precedingText(paragraph, marker).replace(/^\s*\d+[.)]\s*/u, '');
  if (!antiphonWords || antiphonWords !== normalizeWords(opening)) {
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
  // The antiphon already supplied the first half-verse. Retain a dagger
  // at the *start* of its continuation, rather than deleting the cadence.
  // This is the ONLY dagger that bypasses forced psalmody line breaks.
  marker.textContent = '†';
  marker.classList.add('psalm-opening-flexa');
  paragraph.innerHTML = paragraph.innerHTML
    .replace(/<(em|i|span|b|strong)(?:\s[^>]*)?><\/\1>/giu, '')
    .replace(/^((?:<[^>]+>)*)(?:\s|&nbsp;)+/iu, '$1')
    // Keep the leading † with the following word on a narrow screen.
    .replace(/(<span\b[^>]*\bpsalm-opening-flexa\b[^>]*>†<\/span>(?:<\/(?:em|i|b|strong|span|font)>)*)(?:[ \t\r\n]|&nbsp;)*/iu, '$1&nbsp;');
  if (!normalizeWords(paragraph.text) && root.querySelectorAll('p[data-psalm-strophe]').length > 1) {
    paragraph.remove();
  }
  return root.innerHTML;
}

/**
 * Adds the liturgical cross to an opening antiphon only if its complete text
 * replaces the first psalm half-verse or entire first verse. Closing antiphons are not
 * modified; no source, alternatives or Firestore fields are changed.
 */
export function addOpeningAntiphonFlexa(html) {
  if (!html) return html;
  const root = parse(String(html));
  const target = root.querySelectorAll('p').at(-1) || root;
  const visible = target.text.trim();
  if (!visible || /†\s*$/u.test(visible)) return html;
  target.innerHTML = `${target.innerHTML} <span class="psalm-antiphon-flexa">†</span>`;
  return root.innerHTML;
}

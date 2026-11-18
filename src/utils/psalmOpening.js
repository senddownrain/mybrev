import { parse } from 'node-html-parser';
import { liturgicalText } from './liturgicalSourceHtml.js';

const antiphonLabel = /^(?:[1-9]\s*)?ант\.\s*/iu;
const verseNumber = /^\s*\d+[.)]\s*/u;
const leadingSpace = /^(?:\s|&nbsp;|&#0*160;|&#x0*a0;)+/iu;
const normalizeWords = (text) => text.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLocaleLowerCase('be');
const textOf = (node) => liturgicalText(node?.innerHTML);
const isDoxology = (node) => /^(?:Хвала Айцу|Хвала Отцу|Як была спрадвеку)(?:\s|[,.]|$)/iu.test(textOf(node));
const isPsalmParagraph = (node) => node?.rawTagName === 'p'
  && !node.hasAttribute('data-liturgical-heading')
  && !node.hasAttribute('data-liturgical-subheading')
  && !antiphonLabel.test(textOf(node));

function precedingText(paragraph, marker) {
  let current = marker;
  let html = '';
  while (current !== paragraph) {
    const parent = current.parentNode;
    const index = parent.childNodes.indexOf(current);
    html = parent.childNodes.slice(0, index).join('') + html;
    current = parent;
  }
  return liturgicalText(html).replace(verseNumber, '');
}

function followingParagraph(paragraph) {
  let next = paragraph.nextElementSibling;
  while (next?.rawTagName === 'p' && !textOf(next)) next = next.nextElementSibling;
  return next;
}

function trimLeadingSpace(nodes) {
  for (const node of nodes) {
    if (node.nodeType === 3) {
      node.rawText = node.rawText.replace(leadingSpace, '');
      if (node.text.trim()) return true;
    } else if (node.rawTagName !== 'br' && trimLeadingSpace([...node.childNodes])) {
      return true;
    }
    node.remove();
  }
  return false;
}

function placeOpeningDagger(paragraph, cadence) {
  const markers = paragraph.querySelectorAll('.psalm-marker');
  const firstMarker = markers[0] === cadence && cadence?.text.trim() === '*' ? markers[1] : markers[0];
  const leadingDagger = firstMarker?.text.trim() === '†'
    && !precedingText(paragraph, firstMarker).replace(/^\s*\*?\s*$/u, '');
  if (leadingDagger && cadence && firstMarker !== cadence) {
    cadence.remove();
    trimLeadingSpace([...paragraph.childNodes]);
  }

  let marker = leadingDagger ? firstMarker : cadence;
  if (!marker) {
    trimLeadingSpace([...paragraph.childNodes]);
    paragraph.insertAdjacentHTML('afterbegin', '<span class="psalm-marker">†</span>');
    marker = paragraph.firstChild;
  }
  marker.classList.add('psalm-opening-flexa');
  marker.set_content('†');
  // Trim source breaks and spaces even when the sign is inside inline markup.
  for (let node = marker; node !== paragraph; node = node.parentNode) {
    const siblings = node.parentNode.childNodes;
    if (trimLeadingSpace(siblings.slice(siblings.indexOf(node) + 1))) break;
  }
  marker.insertAdjacentHTML('afterend', '&nbsp;');
  paragraph.setAttribute('data-psalm-strophe', '');
}

/** Keep a fully echoed opening verse and omit an echoed first hemistich. */
export function formatPsalmOpening(psalmHtml, selectedAntiphonHtml) {
  const antiphon = normalizeWords(liturgicalText(selectedAntiphonHtml).replace(antiphonLabel, ''));
  if (!antiphon) return psalmHtml;

  const root = parse(String(psalmHtml || ''));
  const paragraph = root.querySelectorAll('p[data-psalm-strophe]').find(isPsalmParagraph);
  const cadence = paragraph?.querySelector('.psalm-marker');
  if (!cadence) return psalmHtml;

  const firstHalf = normalizeWords(precedingText(paragraph, cadence));
  if (!firstHalf) return psalmHtml;
  const opening = normalizeWords(textOf(paragraph).replace(verseNumber, ''));
  const next = followingParagraph(paragraph);
  // Some sources put the unmarked second half in its own paragraph.
  const splitHalf = firstHalf === opening && isPsalmParagraph(next)
    && !next.querySelector('.psalm-marker') && /[*†]$/u.test(textOf(paragraph))
    && !isDoxology(next);
  const wholeVerse = splitHalf ? `${opening} ${normalizeWords(textOf(next))}` : opening;

  if (wholeVerse !== firstHalf && antiphon === wholeVerse) {
    const following = followingParagraph(splitHalf ? next : paragraph);
    const standaloneDagger = textOf(following) === '†' ? following : null;
    const continuation = standaloneDagger ? followingParagraph(standaloneDagger) : following;
    if (!isPsalmParagraph(continuation) || isDoxology(continuation)) return psalmHtml;
    placeOpeningDagger(continuation);
    standaloneDagger?.remove();
    return root.innerHTML;
  }

  if (antiphon !== firstHalf) return psalmHtml;
  if (splitHalf) {
    placeOpeningDagger(next);
    paragraph.remove();
  } else {
    if (opening === firstHalf) return psalmHtml;
    // Keep the markup of the continuation, including the cadence wrapper.
    for (let node = cadence; node !== paragraph; node = node.parentNode) {
      const siblings = node.parentNode.childNodes;
      siblings.slice(0, siblings.indexOf(node)).forEach((sibling) => sibling.remove());
    }
    placeOpeningDagger(paragraph, cadence);
  }
  return root.innerHTML;
}

/**
 * Adds the liturgical cross to an opening antiphon only if its complete text
 * matches the opening verse or its first half. Closing antiphons keep their source text.
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

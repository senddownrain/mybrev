import { parse } from 'node-html-parser';

// Display-only annotations. Database/source HTML and its editorial hashes stay intact.
const heading = /^(КАРОТКАЕ ЧЫТАННЕ|ПЕРШАЕ ЧЫТАННЕ|ДРУГОЕ ЧЫТАННЕ|КАРОТКІ РЭСПАНСОРЫЙ|РЭСПАНСОРЫЙ|ЧЫТАННЕ)(?:\s+(.+))?$/iu;
const textOf = (html) => parse(html).text.replace(/\u00a0/gu, ' ').replace(/\s+/gu, ' ').trim();
const escape = (text) => text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');
const isReference = (text) => /^\(?\s*(?:пар\.\s*)?(?:[1-3]\s*)?\p{L}[\p{L}\s.]*\s+\d+[,:][\s\S]*\)?$/iu.test(text);

// Keep inline formatting balanced when a source stores several replies inside
// one coloured span. Only existing line boundaries are split; no words/replies
// or asterisks are combined or expanded.
function linesOf(node) {
  if (node.nodeType === 3) return [node.toString()];
  if (node.rawTagName === 'br') return ['', ''];
  const lines = [''];
  for (const child of node.childNodes) {
    const parts = linesOf(child);
    lines[lines.length - 1] += parts[0];
    lines.push(...parts.slice(1));
  }
  if (['p', 'div'].includes(node.rawTagName)) return lines;
  const attrs = node.rawAttrs ? ` ${node.rawAttrs}` : '';
  return lines.map(line => `<${node.rawTagName}${attrs}>${line}</${node.rawTagName}>`);
}

export function formatOfficeReadingPresentation(html) {
  let source = String(html || '');
  let root = parse(source);
  if (root.childNodes.some(node => node.rawTagName === 'br')) {
    source = `<div>${source}</div>`;
    root = parse(source);
  }
  const edits = [];
  for (const node of root.querySelectorAll('p, div')) {
    if (node.querySelector('p, div') || !node.querySelector('br')) continue;
    const lines = linesOf(node);
    if (!lines.some(line => heading.test(textOf(line)) || /^[КН]\.\s/u.test(textOf(line)))) continue;
    edits.push({ start: node.range[0], end: node.range[1], value: lines.filter(line => textOf(line))
      .map(line => `<${node.rawTagName}${node.rawAttrs ? ` ${node.rawAttrs}` : ''}>${line}</${node.rawTagName}>`).join('\n') });
  }
  source = edits.sort((a,b) => b.start-a.start).reduce((value, edit) => value.slice(0,edit.start)+edit.value+value.slice(edit.end),source);
  root = parse(source);
  let responsory = false;
  for (const node of root.querySelectorAll('p, div')) {
    if (node.querySelector('p, div')) continue;
    const text = textOf(node.innerHTML);
    const match = heading.exec(text);
    if (match && (!match[2] || isReference(match[2]))) {
      node.removeAttribute('data-liturgical-subheading');
      node.setAttribute('data-liturgical-heading', '');
      node.innerHTML = `<span data-office-label>${escape(match[1])}</span>${match[2] ? ` <span data-office-reference>${escape(match[2])}</span>` : ''}`;
      responsory = /РЭСПАНСОРЫЙ/iu.test(match[1]);
      continue;
    }
    if (isReference(text) && (responsory || node.hasAttribute('data-liturgical-subheading'))) {
      node.setAttribute('data-office-reference', '');
      continue;
    }
    if (/^[КН]\.\s/u.test(text) || (responsory && /^(?:Хвала Айцу|Хвала Отцу|І цяпер|Як было)/iu.test(text))) {
      responsory = true;
      node.setAttribute('data-office-response', '');
      // Source colour/font wrappers remain; the speaker colour follows the theme.
      if (!node.querySelector('[data-office-speaker]')) node.innerHTML = node.innerHTML.replace(/(^|>)(\s*[КН]\.)(?=\s|<|&nbsp;)/u, '$1<span data-office-speaker>$2</span>');
    } else if (text) {
      responsory = false;
    } else if (responsory) {
      node.setAttribute('data-office-response-gap', '');
    }
  }
  return root.toString();
}

import { parse } from 'node-html-parser';

// Display-only expansion of literal repeats within one responsory.
// Never fetch a different reading, guess missing words, or alter source data.
const WORD = /[\p{L}\p{N}]+(?:[’'ʼ][\p{L}\p{N}]+)*/gu;
const SPEAKER = /^\s*([КН])\.\s*/u;
const escapeHtml = value => value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');
const visible = node => node?.text?.replace(/\u00a0/gu, ' ').replace(/\s+/gu, ' ').trim() || '';
const role = node => SPEAKER.exec(visible(node))?.[1] || '';
const body = node => visible(node).replace(SPEAKER, '');
const words = value => [...value.matchAll(WORD)].map(match => ({ text: match[0], end: match.index + match[0].length }));
// Belarusian unstressed initial Ў/ў becomes У/у at the beginning of a new answer.
// Permit this alternation ONLY in the first word; never normalize it elsewhere.
const comparable = (word, index) => {
  const lower = word.toLocaleLowerCase('be');
  return index === 0 ? lower.replace(/^ў/u, 'у') : lower;
};
function expandReply(target, expected) {
  if (role(target) !== 'Н') return false;
  const existing = body(target);
  const actualWords = words(existing), expectedWords = words(expected);
  if (!actualWords.length || actualWords.length >= expectedWords.length) return false;
  if (!actualWords.every((word, index) => comparable(word.text, index) === comparable(expectedWords[index].text, index))) return false;
  const suffix = expected.slice(expectedWords[actualWords.length - 1].end);
  if (!/\p{L}/u.test(suffix) || !/^\s/u.test(suffix)) return false;
  // Keep the existing speaker, casing (including initial У), and inline markup.
  // Replace only terminal abbreviation punctuation, then append the source tail.
  target.innerHTML = target.innerHTML.replace(
    /[.!?…]+(?=(?:\s*<\/(?:span|font|strong|b|em|i|a)>)*\s*$)/iu, '',
  ) + escapeHtml(suffix);
  return true;
}
function next(node) { return node?.nextElementSibling || null; }
function plainTail(node) {
  const opening = body(node);
  if ((opening.match(/\*/gu) || []).length !== 1) return null;
  const tail = opening.slice(opening.indexOf('*') + 1).trim();
  if (tail) return { text: tail, next: next(node) };
  const continuation = next(node);
  if (!continuation || !['p', 'div'].includes(continuation.rawTagName)
      || continuation.querySelector('p, div') || role(continuation)
      || /^(?:Рэспансорый|Кароткі|Першае|Другое|Або)/iu.test(visible(continuation))) return null;
  return { text: visible(continuation), next: next(continuation) };
}
function isTurn(node, speaker) {
  return node && ['p', 'div'].includes(node.rawTagName) && !node.querySelector('p, div')
    && role(node) === speaker;
}
export function expandOfficeResponsoryRepeats(html) {
  const source = String(html || '');
  const root = parse(source);
  let changed = false;
  for (const opening of root.querySelectorAll('p, div')) {
    if (opening.querySelector('p, div')) continue;
    if (role(opening) === 'Н') {
      // Office of Readings: Н. full response * repeated tail / К. verse / Н. abbreviated tail.
      const tail = plainTail(opening);
      const verse = tail?.next, repeated = next(verse);
      if (tail && isTurn(verse, 'К') && isTurn(repeated, 'Н')
          && verse.parentNode === opening.parentNode && repeated.parentNode === opening.parentNode) {
        changed = expandReply(repeated, tail.text) || changed;
      }
    } else if (role(opening) === 'К') {
      // Short responsory: К. response * tail / Н. response / К. verse / Н. tail /
      // К. doxology / Н. response. Do not modify the doxology.
      const tail = plainTail(opening);
      const first = tail?.next, verse = next(first), second = next(verse),
        doxology = next(second), last = next(doxology);
      if (tail && [first, verse, second, doxology, last].every(n => n?.parentNode === opening.parentNode)
          && isTurn(first, 'Н') && isTurn(verse, 'К') && isTurn(second, 'Н')
          && isTurn(doxology, 'К') && isTurn(last, 'Н')
          && /^Хвала Айцу/u.test(body(doxology))) {
        const full = body(opening);
        changed = expandReply(first, full) || changed;
        changed = expandReply(second, tail.text) || changed;
        changed = expandReply(last, full) || changed;
      }
    }
  }
  return changed ? root.toString() : source;
}

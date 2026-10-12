/**
 * Lossless-parse check: every word of the source article must be in the
 * parsed sets (and nothing may be invented). Markup words that the parser
 * turns into structure (section headings, «Рэфрэн:», «Гэта слова Божае.»,
 * «Акламацыя:», set headers) are not counted.
 */
import { headingOf, isSetHeader, tokenizeLectionaryHtml, parseLectionaryPage } from '../../liturgy/lib/lectionary-parser.mjs';
import { normalizeText } from './compare.mjs';

const STRUCTURE = new Set(['рэфрэн', 'рэфран', 'акламацыя', 'або', 'альбо']);
const MARKERS = /(^|\s)(Ев|Е|Л|І|I)\.(?=\s|$)/gu;
const tokens = (text) => normalizeText(text).replace(MARKERS, '$1').toLowerCase().replace(/[^\p{L}\p{N}']+/gu, ' ').split(' ').filter(Boolean);

function collect(value, into) {
  if (value === null || value === undefined) return;
  if (typeof value === 'string') { into.push(...tokens(value)); return; }
  if (Array.isArray(value)) { value.forEach((item) => collect(item, into)); return; }
  if (typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => {
      if (['kind', 'role', 'label', 'cycle', 'year', 'type', 'legend', 'conclusion', 'acclamation', 'form', 'sourceLabel'].includes(key)) return;
      collect(item, into);
    });
  }
}

const count = (words) => words.reduce((map, word) => map.set(word, (map.get(word) || 0) + 1), new Map());

export function parseFidelity(html) {
  const lines = tokenizeLectionaryHtml(html);
  const source = [];
  const refrains = new Set();
  for (const line of lines) {
    const heading = headingOf(line);
    if (heading) { if (heading.bible) source.push(...tokens(heading.bible)); continue; }
    if (/^Гэта слова (Божае|Пана)\.?$/u.test(line.text)) continue;
    if (/^Год\s+[IІ]{1,2}$/u.test(line.text)) continue;
    if (/^[а-яa-z]$/u.test(line.text) && !line.bold && !line.italic) continue;
    if (/^\d\.\s.*імша/iu.test(line.text) || /^(\d\.\s+)?Год\s+[АВСABC]\.?$/u.test(line.text) || /^(Секцыя па перакладзе|і афіцыйных дакументаў)/u.test(line.text) || isSetHeader(line) || (line.bold && /^(Першая|Другая|Трэцяя)\s+Імша$/u.test(line.text)) || /^(Акламацыя:|Пераклад здзейснены|Адноўлена|Абноўлена)/u.test(line.text)) continue;
    const refrain = /^Рэфр[эа]н:?\s*(.+)$/u.exec(line.text);
    if (refrain) { const key = tokens(refrain[1]).join(' '); if (refrains.has(key)) continue; refrains.add(key); }
    source.push(...tokens(line.text));
  }
  const parsedWords = [];
  const parsed = parseLectionaryPage(html);
  const repeated = parsed.warnings.filter((warning) => /repeats the conclusion/.test(warning)).length;

  collect(parsed.sets, parsedWords);
  const src = count(source.filter((word) => !STRUCTURE.has(word)));
  const out = count(parsedWords.filter((word) => !STRUCTURE.has(word)));
  const dropped = [];
  const extra = [];
  if (repeated) for (const word of ['гэта', 'слова']) src.set(word, Math.max(0, (src.get(word) || 0) - repeated));
  if (repeated) for (const word of ['божае', 'пана']) if ((src.get(word) || 0) - (out.get(word) || 0) === repeated) src.set(word, out.get(word) || 0);
  for (const [word, n] of src) if ((out.get(word) || 0) < n) dropped.push([word, n - (out.get(word) || 0)]);
  for (const [word, n] of out) if ((src.get(word) || 0) < n) extra.push([word, n - (src.get(word) || 0)]);
  return {
    sourceWords: source.length,
    droppedWords: dropped.reduce((sum, [, n]) => sum + n, 0),
    extraWords: extra.reduce((sum, [, n]) => sum + n, 0),
    dropped: dropped.slice(0, 12), extra: extra.slice(0, 12),
  };
}

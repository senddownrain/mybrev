/**
 * «(Велікодны перыяд Аллелюя)» — an editorial order printed after ONE element
 * (an antiphon, a versicle line …): in the Easter season that element gets
 * Alleluia. It is never a string to display and never a global replacement.
 *
 * Forms of the added Alleluia (all measured on the printed Easter texts of the
 * volumes themselves):
 *   antiphon, invitatory antiphon, canticle antiphon:  «…текст, / аллелюя.»  (rule `alleluia-v1`;
 *       26 Easter antiphons of Volumes II/III print exactly this)
 *   К./Н. versicle line, Н. line of a responsory:      «…текст, аллелюя.»    (rule `alleluia-v1-versicle`;
 *       the Н. lines of the Easter responsories printed in Volume II, e.g. «Н. Апосталы з вялікай моцаю давалі
 *       сведчанне …, * і ўсе яны мелі вялікую ласку, аллелюя.», end exactly so. Accepted by the editor, NR-001)
 *   text that ends with «!» / «?»:                      «…Пане Магуццяў! / аллелюя.» (rule `alleluia-v1-exclaim`,
 *       one element in the three volumes: church-dedication.officeOfReadingsAnt2; the mark is kept)
 * A «†» printed after the annotation belongs to the psalmody that follows (the first line of the psalm
 * starts with «†»), not to the antiphon: it is dropped (NR-002).
 * The short response of a responsory («Н. Яна выбрала.») is a repetition of the first words and is not
 * annotated by the volumes, so it does not receive Alleluia either.
 */
import { ALLELUIA_ANNOTATION, normalizeForCompare } from './volume.mjs';
import { red } from './html.mjs';

export const ALLELUIA_RULE = 'alleluia-v1';
export const ALLELUIA_VERSICLE_RULE = 'alleluia-v1-versicle';
export const ALLELUIA_EXCLAIM_RULE = 'alleluia-v1-exclaim';

export const hasAnnotation = (text) => ALLELUIA_ANNOTATION.test(text);
/** The element without the annotation; a «†» printed after the annotation is not part of the element (NR-002). */
export const stripAnnotationText = (text) => text.replace(/(\(\s*Велікодны\s+перыяд\s+Аллелюя\s*\)\.?)\s*†\s*$/u, '$1').replace(ALLELUIA_ANNOTATION, '').replace(/\s+$/, '');

const endsWithAlleluia = (text) => /[Аа]ллелюя\.?\s*$/u.test(text);

/** @returns {'antiphon'|'versicle'} */
export function elementKind(text) {
  return /^(К\.|Н\.)\s/u.test(text.trim()) ? 'versicle' : 'antiphon';
}

/**
 * Add Alleluia to the plain text of one element.
 * @returns {{ ok: boolean, text?: string, rule?: string, reason?: string, dropped?: string }}
 */
export function addAlleluiaToText(rawText) {
  const text = stripAnnotationText(rawText).trim();
  let rest = rawText.replace(/^[\s\S]*?\(\s*Велікодны\s+перыяд\s+Аллелюя\s*\)\.?\s*/u, '').trim();
  let dropped;
  if (rest === '†') { dropped = rest; rest = ''; }
  if (rest) return { ok: false, reason: `text after the annotation: «${rest}»` };
  const done = (result) => ({ ...result, ...(dropped ? { dropped } : {}) });
  if (endsWithAlleluia(text)) return done({ ok: true, text, rule: 'already-has-alleluia' });
  const exclaim = /[!?]$/.test(text);
  const body = exclaim ? text : text.replace(/\.$/, '');
  if (elementKind(text) === 'versicle') {
    if (exclaim) return { ok: false, reason: 'versicle line ends with «!» or «?» (the form of the added Alleluia is not attested)' };
    return done({ ok: true, text: `${body}, аллелюя.`, rule: ALLELUIA_VERSICLE_RULE });
  }
  if (exclaim) return done({ ok: true, text: `${body} / аллелюя.`, rule: ALLELUIA_EXCLAIM_RULE });
  return done({ ok: true, text: `${body}, / аллелюя.`, rule: ALLELUIA_RULE });
}

/**
 * Same transformation on a stored HTML block (`<p>…</p>`): the last «.» of the
 * visible text becomes «, / аллелюя.» (the `/` as a red rubric mark) for an
 * antiphon, «, аллелюя.» for a К./Н. line; an antiphon that ends with «!» / «?»
 * keeps the mark: «Пане Магуццяў! / аллелюя.».
 */
export function addAlleluiaToBlockHtml(rawBlockHtml, kind, { dropDagger = false } = {}) {
  // NR-002: a «†» printed after the annotation belongs to the psalmody, not to the antiphon.
  const blockHtml = dropDagger ? rawBlockHtml.replace(/\s*<span[^>]*>\s*†\s*<\/span>(\s*)(<\/p>\s*)$/u, '$1$2') : rawBlockHtml;
  if (/[Аа]ллелюя\.?\s*(<[^>]*>|\s)*<\/p>\s*$/u.test(blockHtml)) return { ok: true, html: blockHtml, rule: 'already-has-alleluia' };
  // the last visible «.» / «!» / «?» of the paragraph (it may sit alone inside a red span)
  const match = /(<span[^>]*>)?([.!?])((?:\s|<[^>]*>|&nbsp;)*)(<\/p>\s*)$/u.exec(blockHtml);
  if (!match) return { ok: false, reason: 'the block does not end with a full stop' };
  const [, open, mark, rawTail, close] = match;
  let tail = rawTail;
  if (open) tail = tail.replace('</span>', '');
  if (mark !== '.') {
    if (kind === 'versicle') return { ok: false, reason: 'versicle line ends with «!» or «?»' };
    return { ok: true, html: `${blockHtml.slice(0, match.index)}${mark} ${red('/')} аллелюя.${tail}${close}`, rule: ALLELUIA_EXCLAIM_RULE };
  }
  const insert = kind === 'versicle' ? ', аллелюя.' : `, ${red('/')} аллелюя.`;
  return { ok: true, html: `${blockHtml.slice(0, match.index)}${insert}${tail}${close}`, rule: kind === 'versicle' ? ALLELUIA_VERSICLE_RULE : ALLELUIA_RULE };
}

/** Remove the Alleluia that is printed inside an antiphon («…, / аллелюя.» → «….»); Lent text has none. */
export function removeAlleluiaFromBlockHtml(blockHtml) {
  const re = /,?\s*(?:<span[^>]*>\s*\/\s*<\/span>|\/)?\s*[Аа]ллелюя\.((?:\s|<span[^>]*>\s*<\/span>|&nbsp;)*)(<\/p>\s*)$/u;
  const match = re.exec(blockHtml);
  if (!match) return { ok: false, reason: 'the block does not end with an Alleluia' };
  return { ok: true, html: `${blockHtml.slice(0, match.index)}.${match[1]}${match[2]}` };
}

/** Token similarity (0..1) between two texts, tolerant to editorial wording differences. */
export function similarity(a, b) {
  const ta = normalizeForCompare(a).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const tb = normalizeForCompare(b).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (!ta.length || !tb.length) return 0;
  // LCS over tokens
  const dp = Array.from({ length: ta.length + 1 }, () => new Array(tb.length + 1).fill(0));
  for (let i = 1; i <= ta.length; i += 1) for (let j = 1; j <= tb.length; j += 1) {
    dp[i][j] = ta[i - 1] === tb[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  }
  return (2 * dp[ta.length][tb.length]) / (ta.length + tb.length);
}

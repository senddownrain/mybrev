/**
 * «(Велікодны перыяд Аллелюя)» — an editorial order printed after ONE element
 * (an antiphon, a versicle line …): in the Easter season that element gets
 * Alleluia. It is never a string to display and never a global replacement.
 *
 * Form of the added Alleluia (rule `alleluia-v1`), measured on the printed
 * Easter antiphons of the volumes themselves (Vol. II/III print 26 antiphons
 * with Alleluia built in; every one ends «…, / аллелюя.»):
 *   antiphon, invitatory antiphon, canticle antiphon:  «…текст, / аллелюя.»
 * For the K./Н. lines of a versicle there is NO printed example of the
 * Easter form in the corpus; the rule `alleluia-v1-versicle` («…, аллелюя.»)
 * is therefore reported as an editorial rule, never as verified text.
 */
import { ALLELUIA_ANNOTATION, normalizeForCompare } from './volume.mjs';
import { red } from './html.mjs';

export const ALLELUIA_RULE = 'alleluia-v1';
export const ALLELUIA_VERSICLE_RULE = 'alleluia-v1-versicle';

export const hasAnnotation = (text) => ALLELUIA_ANNOTATION.test(text);
export const stripAnnotationText = (text) => text.replace(ALLELUIA_ANNOTATION, '').replace(/\s+$/, '');

const endsWithAlleluia = (text) => /[Аа]ллелюя\.?\s*$/u.test(text);

/** @returns {'antiphon'|'versicle'} */
export function elementKind(text) {
  return /^(К\.|Н\.)\s/u.test(text.trim()) ? 'versicle' : 'antiphon';
}

/**
 * Add Alleluia to the plain text of one element.
 * @returns {{ ok: boolean, text?: string, rule?: string, reason?: string }}
 */
export function addAlleluiaToText(rawText) {
  const text = stripAnnotationText(rawText).trim();
  const rest = rawText.replace(/^[\s\S]*?\(\s*Велікодны\s+перыяд\s+Аллелюя\s*\)\.?\s*/u, '');
  if (rest.trim()) return { ok: false, reason: `text after the annotation: «${rest.trim()}»` };
  if (endsWithAlleluia(text)) return { ok: true, text, rule: 'already-has-alleluia' };
  if (/[!?]$/.test(text)) return { ok: false, reason: 'element ends with «!» or «?» (form of the added Alleluia is not attested)' };
  const body = text.replace(/\.$/, '');
  if (elementKind(text) === 'versicle') {
    return { ok: false, unverified: true, rule: ALLELUIA_VERSICLE_RULE, proposal: `${body}, аллелюя.`, reason: 'versicle/responsory line: the Easter form with Alleluia is not printed anywhere in the three volumes (proposed «…, аллелюя.»)' };
  }
  return { ok: true, text: `${body}, / аллелюя.`, rule: ALLELUIA_RULE };
}

/**
 * Same transformation on a stored HTML block (`<p>…</p>`): the last «.» of the
 * visible text becomes «, / аллелюя.» (the `/` as a red rubric mark).
 */
export function addAlleluiaToBlockHtml(blockHtml, kind) {
  if (/[Аа]ллелюя\.?\s*(<[^>]*>|\s)*<\/p>\s*$/u.test(blockHtml)) return { ok: true, html: blockHtml, rule: 'already-has-alleluia' };
  // the last visible «.» of the paragraph; trailing empty/space-only spans are kept after it
  const match = /\.((?:\s|<span[^>]*>\s*<\/span>|<span[^>]*>\s+<\/span>|&nbsp;)*)(<\/p>\s*)$/u.exec(blockHtml);
  if (!match) return { ok: false, reason: 'the block does not end with a full stop' };
  const insert = kind === 'versicle' ? ', аллелюя.' : `, ${red('/')} аллелюя.`;
  return { ok: true, html: `${blockHtml.slice(0, match.index)}${insert}${match[1]}${match[2]}`, rule: kind === 'versicle' ? ALLELUIA_VERSICLE_RULE : ALLELUIA_RULE };
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

/**
 * Whole-section comparison of the three volumes:
 *
 *     Common → hour → field → text / source / rubric / season
 *
 * A seasonal volume (I: Advent + Christmas, II: Lent + Easter) prints the
 * COMPLETE text of every field of a Common. A missing local season marker does
 * NOT mean that the text equals the Ordinary Time text of Volume III: the two
 * texts are compared here, token by token, and the difference is classified:
 *
 *   orthography   1  same words, only typography / punctuation / rubric marks
 *   lexical       2  same text, a few words differ (editorial wording of one text)
 *   different     3  another reading / psalm / canticle / hymn / prayer / antiphon / responsory
 *   structure     4  another composition: fewer alternatives ("subset"), extra elements
 *                    ("superset"), or only a cross-reference printed in one volume
 *   seasonal      5  difference conditioned by an explicit season rubric (decided elsewhere)
 *   unresolved    6  cannot be decided automatically
 *
 * The comparison is volume-to-volume (same parser on both sides), so the way the
 * stored base merges alternatives or sections never produces a false difference.
 */
import { normalizeForCompare } from './volume.mjs';

export const DIFFERENCE_CLASSES = Object.freeze({
  orthography: { number: 1, title: 'чистая орфография / типографика' },
  lexical: { number: 2, title: 'существенное лексическое отличие одного текста' },
  different: { number: 3, title: 'другое чтение / псалом / кантик / гимн / молитва / антифон / респонсорий' },
  structure: { number: 4, title: 'иной состав, последовательность либо количество элементов' },
  seasonal: { number: 5, title: 'явно обусловленная сезоном вариация' },
  unresolved: { number: 6, title: 'действительно неразрешённый случай' },
});

const APOSTROPHES = /['’‘`´ʼ]/g;
/** «с. 1017», «с. 1616 або с. 1616», «с. 945, а замест … с. 830»: page references of the printed volume are not text. */
const PAGE_REFERENCE = /(?:^|\s)с\.\s*\d+(?:\s*(?:або|і|,)\s*(?:с\.\s*)?\d+)*/giu;

/** Word tokens of a text: punctuation, case, apostrophes, rubric marks and page references are not words. */
export function tokensOf(text) {
  return normalizeForCompare(String(text || '').replace(PAGE_REFERENCE, ' ')).replace(APOSTROPHES, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** Length of the longest common subsequence of two token lists. */
export function lcsLength(a, b) {
  if (!a.length || !b.length) return 0;
  let previous = new Uint32Array(b.length + 1);
  let current = new Uint32Array(b.length + 1);
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = a[i - 1] === b[j - 1] ? previous[j - 1] + 1 : Math.max(previous[j], current[j - 1]);
    }
    [previous, current] = [current, previous];
  }
  return previous[b.length];
}

/** Word-level edit script (LCS based): [{ op: '=' | '-' | '+', token }] from `a` to `b`. */
export function tokenDiff(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const script = [];
  let i = 0; let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { script.push({ op: '=', token: a[i] }); i += 1; j += 1; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { script.push({ op: '-', token: a[i] }); i += 1; }
    else { script.push({ op: '+', token: b[j] }); j += 1; }
  }
  while (i < a.length) { script.push({ op: '-', token: a[i] }); i += 1; }
  while (j < b.length) { script.push({ op: '+', token: b[j] }); j += 1; }
  return script;
}

/** Differing words as `{ ordinary, volume }` pairs: `a` is the Ordinary Time text, `b` the seasonal volume's (for the ledger). */
export function wordChanges(a, b, limit = 12) {
  const script = tokenDiff(a, b);
  const changes = [];
  let k = 0;
  while (k < script.length) {
    if (script[k].op === '=') { k += 1; continue; }
    const removed = []; const added = [];
    while (k < script.length && script[k].op !== '=') { (script[k].op === '-' ? removed : added).push(script[k].token); k += 1; }
    changes.push({ ordinary: removed.join(' '), volume: added.join(' ') });
    if (changes.length >= limit) break;
  }
  return changes;
}

const REFERENCE_LINE = /(?:з\s+Уласных\s+тэкстаў|з\s+Ютрані|з\s+ІІ\s+Нешпараў|як\s+ва\s|як\s+у\s|Агульных\s+тэкстаў|Выбіраюцца|с\.\s*\d)/iu;

/**
 * A unit that prints a cross-reference instead of a text («Другое чытанне з
 * Уласных тэкстаў пра святых.», «Выбіраюцца найбольш адпаведныя тэксты …»).
 */
export function isReferenceOnly(lineTexts) {
  const body = lineTexts.map((t) => t.trim()).filter((t) => t && !/^(Першае чытанне|Другое чытанне|Гімн|Малітва)$/iu.test(t));
  if (!body.length) return true;
  const words = body.join(' ').split(/\s+/).length;
  return words <= 40 && body.every((line) => REFERENCE_LINE.test(line));
}

/** Parts of a text between the К./Н. labels («К. … Н. …»), labels dropped. */
function labelledSegments(text) {
  return String(text || '').replace(PAGE_REFERENCE, ' ').split(/(?:^|\s)[КН]\.(?=\s)/u).map((part) => part.trim()).filter(Boolean).slice(0, 64);
}

/** Edit runs between the Ordinary text `b` and the volume text `a`. */
function editRuns(ordinary, volume) {
  const script = tokenDiff(ordinary, volume);
  const runs = [];
  let k = 0;
  while (k < script.length) {
    if (script[k].op === '=') { k += 1; continue; }
    const removed = []; const added = [];
    while (k < script.length && script[k].op !== '=') { (script[k].op === '-' ? removed : added).push(script[k].token); k += 1; }
    runs.push({ ordinary: removed, volume: added });
  }
  return runs;
}

/**
 * @param {string} volumeText  comparable text of the seasonal volume (fields.comparableText)
 * @param {string} ordinaryText comparable text of Volume III
 * @returns {{ class: keyof typeof DIFFERENCE_CLASSES, relation: string, minor?: boolean, coverage: {volume:number, ordinary:number}, tokens: {volume:number, ordinary:number}, changes?: object[] }}
 *
 * relation:
 *   equal | same-words                         class 1
 *   same-text-words-differ (minor: true|false)   class 2  (a handful of substituted words / a reworded passage)
 *   passage-only-in-volume | passage-only-in-ordinary   class 4  (a verse / sentence is printed by one volume only)
 *   subset-of-ordinary                          class 4  (the volume prints fewer alternatives / elements)
 *   superset-of-ordinary | volume-only | ordinary-only   class 4
 *   other-text                                  class 3
 */
export function classifyDifference(volumeText, ordinaryText) {
  const a = tokensOf(volumeText);
  const b = tokensOf(ordinaryText);
  const common = lcsLength(a, b);
  const coverage = { volume: a.length ? common / a.length : 0, ordinary: b.length ? common / b.length : 0 };
  const tokens = { volume: a.length, ordinary: b.length };
  const result = (cls, relation, extra = {}) => ({ class: cls, relation, coverage, tokens, ...extra });
  if (!a.length && !b.length) return result('orthography', 'equal');
  if (!a.length || !b.length) return result('structure', a.length ? 'volume-only' : 'ordinary-only');
  if (common === a.length && common === b.length) return result('orthography', 'same-words');
  // К./Н. lines (versicles, responsories): a pair whose line is replaced by another sentence is another text,
  // however many words the rest of the field shares.
  const ra = labelledSegments(volumeText);
  const rb = labelledSegments(ordinaryText);
  if (ra.length >= 2 && ra.length === rb.length) {
    const worst = ra.reduce((min, seg, i) => {
      const x = tokensOf(seg); const y = tokensOf(rb[i]);
      if (Math.min(x.length, y.length) < 3) return min;
      const l = lcsLength(x, y);
      return Math.min(min, (2 * l) / (x.length + y.length));
    }, 1);
    if (worst < 0.5) return result('different', 'other-text', { replacedLine: true });
  }
  const edits = a.length + b.length - 2 * common;
  const longest = Math.max(a.length, b.length);
  const lowest = Math.min(coverage.volume, coverage.ordinary);
  // the two texts have about the same length and most words in common: one text in two wordings
  const similarLength = Math.max(a.length, b.length) <= 1.25 * Math.min(a.length, b.length);
  // (a short antiphon or versicle with one or two words substituted has a low share of common words and is still one text)
  const fewWordsChanged = longest <= 16 && edits <= 4 && Math.min(a.length, b.length) >= 5;
  if ((lowest >= 0.8 && similarLength) || fewWordsChanged) {
    const runs = editRuns(b, a);
    const changes = runs.slice(0, 12).map((run) => ({ ordinary: run.ordinary.join(' '), volume: run.volume.join(' ') }));
    const passageOnlyVolume = runs.find((run) => !run.ordinary.length && run.volume.length >= 6);
    const passageOnlyOrdinary = runs.find((run) => !run.volume.length && run.ordinary.length >= 6);
    if (passageOnlyVolume) return result('structure', 'passage-only-in-volume', { changes });
    if (passageOnlyOrdinary) return result('structure', 'passage-only-in-ordinary', { changes });
    const changed = runs.reduce((sum, run) => sum + Math.max(run.ordinary.length, run.volume.length), 0);
    return result('lexical', 'same-text-words-differ', { minor: runs.length <= 3 && changed <= 6, changes, runs: runs.length, changedWords: changed });
  }
  // the volume prints fewer elements than Volume III (alternatives, Saturday memorial …), none of them new
  if (coverage.volume >= 0.9) return result('structure', 'subset-of-ordinary', { changes: wordChanges(b, a, 6) });
  // the volume prints everything of Volume III and more
  if (coverage.ordinary >= 0.9) return result('structure', 'superset-of-ordinary');
  return result('different', 'other-text');
}

// Canonical structured blocks/runs (parser schema mybrev-extraction-v1) -> `mybrev-markdown` v1.
// Words are never changed; only the markup that the current renderer understands is added:
// paragraphs with single line breaks, `##…` headings, **bold**, _italic_, `:::rubric`, K./S./N. labels,
// ordered lists and /prayer/<id> links. No raw HTML is ever produced.
import { normalizeTitleKey } from '../../../src/utils/prayerDraftModel.mjs';

export const RED = '#ed008c';
const LINE_TYPES = new Set(['invocation', 'response', 'petition', 'verse', 'dialogue']);

/** Latin look-alikes inside Cyrillic words (typesetting slips such as «Iмені»). */
export function fixLatinInCyrillic(text) {
  return text.replace(/[IiAaOoEeCcPpXxHKMTBy]/g, (ch, offset, whole) => {
    const around = `${whole[offset - 1] || ''}${whole[offset + 1] || ''}`;
    return /[А-Яа-яЁёІіЎў]/.test(around) && !/[A-Za-z]/.test(around) ? ({ I: 'І', i: 'і', A: 'А', a: 'а', O: 'О', o: 'о', E: 'Е', e: 'е', C: 'С', c: 'с', P: 'Р', p: 'р', X: 'Х', x: 'х', H: 'Н', K: 'К', M: 'М', T: 'Т', B: 'В', y: 'у' }[ch]) : ch;
  });
}

// Numbered lines (`1. text`) stay real ordered lists: the reader shows the numbers and the editor
// shows no stray backslashes. Only markers that would change meaning without being list numbers are escaped.
export function escapeMd(text, { lineStart = false } = {}) {
  let out = text.replace(/\\/g, '\\\\').replace(/([*_`[\]<>])/g, '\\$1').replace(/&(?=#?\w+;)/g, '\\&');
  if (lineStart) out = out.replace(/^(\s*)([#+-])(?=\s|$)/, '$1\\$2');
  return out;
}

function mergeRuns(runs) {
  const merged = [];
  for (const run of runs) {
    const key = JSON.stringify([run.bold === true, run.italic === true, run.color === RED]);
    const last = merged.at(-1);
    if (last && last.key === key) last.text += run.text;
    else merged.push({ key, text: run.text, bold: run.bold === true, italic: run.italic === true, red: run.color === RED });
  }
  return merged;
}

// Markers hug the words: leading/trailing spaces and punctuation stay outside, otherwise CommonMark
// flanking rules reject the emphasis (e.g. `(word**) N.**`). Backslash escapes count as one unit.
function wrap(text, mark) {
  const match = text.match(/^((?:\\.|[^\p{L}\p{N}\\])*)([\s\S]*?)((?:\\.|[^\p{L}\p{N}\\])*)$/u);
  return match && match[2] ? `${match[1]}${mark}${match[2]}${mark}${match[3]}` : text;
}

/**
 * Inline markup of one block. `redAsBold`: red runs of a mixed block become bold (a legacy label wrapper
 * the reader already understands). In rubric blocks colour is implied by the rubric itself.
 */
export function runsToMarkdown(runs, { redAsBold = false, ignoreRed = false } = {}) {
  const merged = mergeRuns(runs);
  let out = '';
  merged.forEach((run, index) => {
    let piece = escapeMd(run.text.replace(/\t/g, ' '), { lineStart: index === 0 });
    const bold = run.bold || (redAsBold && run.red && !ignoreRed);
    const styled = (bold || run.italic) && /[\p{L}\p{N}]/u.test(run.text);
    // CommonMark cannot emphasise inside a word: a lone styled letter in a word is a typesetting slip
    // (flagged by the parser), so it stays plain instead of leaking underscores.
    const prev = merged[index - 1]?.text.slice(-1) || ''; const next = merged[index + 1]?.text[0] || '';
    const insideWord = (/[\p{L}\p{N}]/u.test(prev) && /^[\p{L}\p{N}]/u.test(run.text)) || (/[\p{L}\p{N}]$/u.test(run.text) && /[\p{L}\p{N}]/u.test(next));
    if (styled && !insideWord) {
      if (run.italic && bold) piece = wrap(wrap(piece, '_'), '**');
      else if (run.italic) piece = wrap(piece, '_');
      else piece = wrap(piece, '**');
    }
    out += piece;
  });
  return out;
}

const isRedOnly = (runs) => runs.length > 0 && runs.every((run) => run.color === RED || !run.text.trim());
const hasRed = (runs) => runs.some((run) => run.color === RED && run.text.trim());

/**
 * @param {object} entry canonical entry (blocks)
 * @param {{ title?: string, resolveLink?: (targetEntryId: string) => string|null }} options
 * @returns {{ markdown: string, stats: object, flags: string[] }}
 */
export function entryToMarkdown(entry, { title = entry.title, resolveLink = () => null } = {}) {
  const parts = []; // { kind, lines }
  const stats = { blocks: 0, rubrics: 0, mixedRed: 0, links: 0, unresolvedLinks: 0, droppedTitle: 0 };
  const flags = [];
  const refs = new Map((entry.crossReferences || []).filter((ref) => ref.targetEntryId).map((ref) => [ref.refTitle, ref]));
  const titleKeys = new Set([normalizeTitleKey(title), normalizeTitleKey(entry.sourcePrintedHeading)]);
  let separate = true;
  for (const block of entry.blocks) {
    stats.blocks += 1;
    const runs = block.runs?.length ? block.runs : [{ text: block.text, color: '#231f20' }];
    const space = block.semantic?.spaceBefore === true;
    if (block.type === 'heading' || block.type === 'day') {
      if (stats.blocks <= 3 && block.type === 'heading' && titleKeys.has(normalizeTitleKey(block.text))) { stats.droppedTitle += 1; continue; }
      const level = Math.min(Math.max(block.semantic?.level || 2, 1) + (block.semantic?.level === 1 ? 1 : 0), 6);
      parts.push({ kind: 'heading', lines: [`${'#'.repeat(Math.max(level, 2))} ${runsToMarkdown(runs.map((run) => ({ ...run, bold: false })), { ignoreRed: true })}`] });
      separate = true; continue;
    }
    if (block.type === 'separator') { parts.push({ kind: 'hr', lines: ['***'] }); separate = true; continue; }
    if (block.type === 'rubric' || isRedOnly(runs) && !['speaker', 'reading', 'refrain', 'option'].includes(block.type)) {
      stats.rubrics += 1;
      parts.push({ kind: 'rubric', lines: [':::rubric', runsToMarkdown(runs, { ignoreRed: true }).replace(/\n/g, '\n'), ':::'] });
      separate = true; continue;
    }
    let line;
    if (block.type === 'link_reference' || block.type === 'list_item' && block.text.match(/\(с\.\s*\d+\)/)) {
      line = linkedLine(block, refs, resolveLink, stats);
    } else if (block.type === 'reading') {
      const [label, ...rest] = block.text.split('\t');
      line = `**${escapeMd(label.trim())}** ${escapeMd(rest.join(' ').trim())}`.trim();
    } else if (block.type === 'footnote') {
      line = runsToMarkdown(runs).replace(/^\\?\*/, '\\*');
    } else if (block.type === 'speaker') {
      line = `**${escapeMd(block.text.trim())}**`;
    } else if (block.type === 'option') {
      line = `**${escapeMd(block.text.trim())}**`;
    } else {
      const mixed = hasRed(runs) && !isRedOnly(runs);
      if (mixed) stats.mixedRed += 1;
      line = runsToMarkdown(runs, { redAsBold: mixed });
    }
    if (block.type === 'refrain' && isRedOnly(runs)) line = `**${escapeMd(block.text.trim())}**`;
    const merge = LINE_TYPES.has(block.type) && !space && !separate && parts.at(-1)?.kind === 'lines';
    if (merge) parts.at(-1).lines.push(line);
    else parts.push({ kind: LINE_TYPES.has(block.type) ? 'lines' : 'para', lines: [line] });
    separate = !LINE_TYPES.has(block.type);
  }
  const markdown = parts.map((part) => part.lines.join('\n')).join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  return { markdown, stats, flags };
}

function linkedLine(block, refs, resolveLink, stats) {
  const text = block.text;
  const refTitle = block.semantic?.refTitle || [...refs.keys()].find((key) => text.includes(key));
  const ref = refTitle && refs.get(refTitle);
  const target = ref ? resolveLink(ref.targetEntryId) : null;
  if (ref && target) {
    stats.links += 1;
    const [before, after] = text.split(refTitle);
    const trailing = (after || '').replace(/^\s*\(с\.\s*\d+\)/, '');
    return `${escapeMd(before || '', { lineStart: true })}[${escapeMd(refTitle)}](/prayer/${target})${escapeMd(trailing)}`;
  }
  stats.unresolvedLinks += 1;
  return runsToMarkdown(block.runs, { redAsBold: false });
}

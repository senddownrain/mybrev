/**
 * HTML helpers for the `common-texts` fields: a tiny serializer in the
 * project's style (red rubrics are `<span style="color: #ff0000;">`) and a
 * canonical form used to compare rendered text with stored HTML.
 */
import { parse } from 'node-html-parser';

export const RED_STYLE = 'color: #ff0000;';
export const red = (text) => `<span style="${RED_STYLE}">${text}</span>`;

export const escapeHtml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const ALIGN = { center: ' style="text-align: center;"', justify: ' style="text-align: justify;"', none: '' };
export const paragraph = (inner, align = 'none') => `<p${ALIGN[align] ?? ''}>${inner}</p>`;
export const HR = '<hr />';

/** Rubric marks inside running text: `*`, `†`, a lone `/` and the placeholder `N.` become red. */
export function markInline(text, { names = false } = {}) {
  let out = escapeHtml(text);
  out = out.replace(/(^|\s)([*†])(?=\s|$)/g, (m, lead, mark) => `${lead}${red(mark)}`);
  out = out.replace(/(^|\s)\/(?=\s|$)/g, (m, lead) => `${lead}${red('/')}`);
  out = out.replace(/(^|\s)(К\.|Н\.)(?=\s|$)/g, (m, lead, mark) => `${lead}${red(mark)}`);
  if (names) out = out.replace(/(^|[\s(])(N\.)(?=[\s,.;:)]|$)/g, (m, lead, n) => `${lead}${red(n)}`);
  return out;
}

/** Canonical form of an HTML fragment: blocks of styled text, insensitive to span splitting. */
export function canonicalHtml(html, { align = true } = {}) {
  const root = parse(`<div>${html}</div>`).firstChild;
  const blocks = [];
  const pushRuns = (node, state, runs) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === 3) { runs.push({ t: child.rawText.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'), ...state }); return; }
      const tag = (child.rawTagName || '').toLowerCase();
      if (tag === 'br') { runs.push({ t: '\n', ...state }); return; }
      const style = child.getAttribute?.('style') || '';
      const next = { ...state };
      if (/#ff0000/i.test(style)) next.red = true;
      if (tag === 'em' || tag === 'i') next.em = true;
      if (tag === 'strong' || tag === 'b') next.strong = true;
      pushRuns(child, next, runs);
    });
  };
  root.childNodes.forEach((node) => {
    if (node.nodeType === 3) { if (node.rawText.trim()) blocks.push({ tag: 'text', runs: [{ t: node.rawText }] }); return; }
    const tag = (node.rawTagName || '').toLowerCase();
    if (tag === 'hr') { blocks.push({ tag: 'hr' }); return; }
    const style = node.getAttribute?.('style') || '';
    const alignValue = /center/.test(style) ? 'c' : /justify/.test(style) ? 'j' : '';
    const runs = [];
    pushRuns(node, {}, runs);
    blocks.push({ tag, align: alignValue, runs });
  });
  return blocks.map((block) => {
    if (block.tag === 'hr') return '---';
    // merge runs by style, then normalise whitespace
    const merged = [];
    block.runs.forEach((run) => {
      const last = merged[merged.length - 1];
      const key = `${run.red ? 1 : 0}${run.em ? 1 : 0}${run.strong ? 1 : 0}`;
      if (last && last.key === key) last.t += run.t; else merged.push({ key, red: run.red, em: run.em, strong: run.strong, t: run.t });
    });
    let text = merged.map((run) => {
      const t = run.t.replace(/[ \t\r]+/g, ' ');
      if (!t.trim()) return t.includes('\n') ? '\n' : ' ';
      let wrapped = t.trim();
      if (run.red) wrapped = `⟦${wrapped}⟧`;
      if (run.em) wrapped = `⟨${wrapped}⟩`;
      return `${t.startsWith(' ') ? ' ' : ''}${wrapped}${t.endsWith(' ') ? ' ' : ''}`;
    }).join('');
    text = text.replace(/⟧\s*⟦/g, '⟧ ⟦').replace(/ *\n */g, '\n').replace(/ +/g, ' ').trim();
    // adjacent red runs separated by a single space collapse into one red run
    text = text.replace(/⟧ ⟦/g, ' ');
    return `${align ? block.align : ''}|${text}`;
  }).join('\n¶\n');
}

/** Plain text of an HTML fragment (tags removed, <br>/<p> as spaces). */
export function htmlToPlain(html) {
  return String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<hr\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

/** Split an HTML fragment into top-level blocks (strings), preserving the source markup. */
export function splitBlocks(html) {
  const blocks = [];
  const re = /<p[^>]*>[\s\S]*?<\/p>|<hr\s*\/?>|<div[^>]*>[\s\S]*?<\/div>/gi;
  let match;
  while ((match = re.exec(html))) blocks.push(match[0]);
  return blocks;
}

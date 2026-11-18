import { parse } from 'node-html-parser';

export const liturgicalText = (html) => parse(String(html || '').replace(/<br\s*\/?>|<\/p>/giu, ' ')).text
  .replace(/[\s\u00a0\u2000-\u200b\u202f]+/gu, ' ').trim();
const label = /^(?:[123]\s*)?ант\.\s*/iu;
const antiphonText = (html) => liturgicalText(html).replace(label, '');
const escapeHtml = (text) => text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');
const red = (text) => `<span style="color: #ff0000;">${text}</span>`;

/** Remove only an entire closing paragraph whose words equal the dedicated
 * antiphon. A label alone is never evidence. Distinct alternative antiphons
 * and their internally owned repeats stay intact for manual review. */
export function removeMatchingPsalmAntiphons(html, antiphon) {
  const source = String(html || '');
  const antRoot = parse(String(antiphon || ''));
  const antParagraphs = antRoot.querySelectorAll('p');
  const texts = new Set((antParagraphs.length ? antParagraphs : [antRoot])
    .map((node) => antiphonText(node.toString())).filter(Boolean));
  if (texts.size !== 1) return source;
  const expected = [...texts][0];
  const root = parse(source);
  const removals = [];
  const visit = (container) => {
    const elements = container.childNodes.filter((node) => node.nodeType === 1);
    // Each structured alternative owns its own ending. Shared suffixes can
    // contain rubrics and must never be guessed at.
    elements.filter((node) => node.hasAttribute('data-alternative-title')).forEach(visit);
    // A legacy <hr> choice also owns its ending; only its final p qualifies.
    elements.forEach((node, index) => {
      if (node.rawTagName !== 'p' || (elements[index + 1] && elements[index + 1].rawTagName !== 'hr')) return;
      if (!label.test(liturgicalText(node.toString()))) return;
      if (antiphonText(node.toString()) !== expected) return;
      removals.push(node.range);
    });
  };
  visit(root);
  // DOM serialization rewrites <br /> to <br>. Retain every untouched byte,
  // including the doxology markup used by the established migration audit.
  return removals.sort((a, b) => b[0] - a[0])
    .reduce((text, [start, end]) => text.slice(0, start) + text.slice(end), source);
}

/** Typography/structure only. Never expands an abbreviated liturgical reply.
 * Kept shared by source maintenance, seasonal generation and legacy display. */
export function normalizeReadingHtml(html) {
  const source = String(html || '');
  let root = parse(source);
  const edits = [];
  const applyEdits = (value) => edits.sort((a,b) => b.start-a.start)
    .reduce((text, edit) => text.slice(0,edit.start)+edit.value+text.slice(edit.end), value);
  // Split existing line boundaries while keeping inline tags balanced, even
  // if one span surrounds several lines. Never colour a reading body as part
  // of the heading merely because the book put it in the same paragraph.
  const inlineLines = (node) => {
    if (node.nodeType === 3) return [node.toString()];
    if (node.rawTagName === 'br') return ['', ''];
    const lines = [''];
    for (const child of node.childNodes) {
      const parts = inlineLines(child);
      lines[lines.length - 1] += parts[0];
      lines.push(...parts.slice(1));
    }
    if (node.rawTagName === 'p') return lines;
    const attrs = node.rawAttrs ? ` ${node.rawAttrs}` : '';
    return lines.map(line => `<${node.rawTagName}${attrs}>${line}</${node.rawTagName}>`);
  };
  for (const paragraph of root.querySelectorAll('p')) {
    if (!paragraph.querySelector('br')) continue;
    if (!/^(?:Кароткае\s+чытанне|Кароткі\s+рэспансорый|Рэспансорый|[КН]\.\s)/iu.test(liturgicalText(paragraph.innerHTML))) continue;
    const attrs = paragraph.rawAttrs ? ` ${paragraph.rawAttrs}` : '';
    edits.push({ start: paragraph.range[0], end: paragraph.range[1], value: inlineLines(paragraph).filter(line => liturgicalText(line))
      .map(line => `<p${attrs}>${line}</p>`).join('\n') });
  }
  const withLines = applyEdits(source);
  edits.length = 0;
  root = parse(withLines);
  for (const paragraph of root.querySelectorAll('p')) {
    const text = liturgicalText(paragraph.innerHTML);
    const heading = /^(Кароткае\s+чытанне|Кароткі\s+рэспансорый)(.*)$/iu.exec(text);
    if (heading) {
      const title = heading[1].toLocaleUpperCase('be');
      const reference = heading[2].trim();
      if (heading[1] === title && (!reference || /^\s/u.test(heading[2]))) continue;
      const inner = red(`${title}${reference ? ` ${escapeHtml(reference)}` : ''}`);
      if (paragraph.innerHTML !== inner) {
        const attrs = paragraph.rawAttrs ? ` ${paragraph.rawAttrs}` : '';
        edits.push({start:paragraph.range[0],end:paragraph.range[1],value:`<p${attrs}>${inner}</p>`});
      }
      continue;
    }
    if (!/^[КН]\.\s/u.test(text)) continue;
    const lines = text.split(/\s+(?=[КН](?:\.|(?=\s))\s)/u);
    // A single already separated paragraph keeps its inline markup intact.
    if (lines.length < 2) continue;
    const attrs = paragraph.rawAttrs ? ` ${paragraph.rawAttrs}` : '';
    const rendered = lines.map((line) => {
      const match = /^([КН])\.?\s+(.+)$/u.exec(line);
      if (!match) return null;
      const body = escapeHtml(match[2]).replace(/\*/gu, () => red('*'));
      return `<p${attrs}>${red(`${match[1]}.`)} ${body}</p>`;
    });
    if (rendered.some((line) => line === null)) continue;
    edits.push({start:paragraph.range[0],end:paragraph.range[1],value:rendered.join('\n')});
  }
  return applyEdits(withLines);
}

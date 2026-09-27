// Minimal, dependency-free HTML line scanner used by the Compendium importer.
// It turns the article body into "lines" (split on <br> and block boundaries)
// while tracking bold/italic state, so that bold question headers that span a
// stray <br> (e.g. "<b><br>473. …</b>") are still recognised.

const ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", laquo: '«', raquo: '»',
  mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', bdquo: '„',
};

export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[body.toLowerCase()] ?? match;
  });
}

const BLOCK_TAGS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'li', 'ul', 'ol', 'table', 'tr', 'td']);

/**
 * @returns {{ text: string, segments: {text: string, bold: boolean, italic: boolean}[], blankBefore: boolean }[]}
 */
export function scanLines(html) {
  const lines = [];
  let segments = [];
  let bold = 0;
  let italic = 0;
  let blankRun = 0;
  const flush = () => {
    const text = segments.map((segment) => segment.text).join('').replace(/\s+/g, ' ').trim();
    if (!text) { blankRun++; segments = []; return; }
    lines.push({ text, segments: mergeSegments(segments), blankBefore: blankRun > 0 });
    blankRun = 0;
    segments = [];
  };
  const tagPattern = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z0-9]+)\b[^>]*>/g;
  let cursor = 0;
  let match;
  while ((match = tagPattern.exec(html))) {
    if (match.index > cursor) pushText(html.slice(cursor, match.index));
    cursor = tagPattern.lastIndex;
    if (!match[2]) continue;
    const closing = match[1] === '/';
    const tag = match[2].toLowerCase();
    if (tag === 'br') flush();
    else if (tag === 'b' || tag === 'strong') bold = Math.max(0, bold + (closing ? -1 : 1));
    else if (tag === 'i' || tag === 'em') italic = Math.max(0, italic + (closing ? -1 : 1));
    else if (BLOCK_TAGS.has(tag)) { flush(); if (!closing && tag !== 'div') blankRun++; }
  }
  if (cursor < html.length) pushText(html.slice(cursor));
  flush();
  return lines;

  function pushText(raw) {
    const text = decodeEntities(raw.replace(/[\r\n\t]+/g, ' '));
    if (text) segments.push({ text, bold: bold > 0, italic: italic > 0 });
  }
}

function mergeSegments(segments) {
  const merged = [];
  for (const segment of segments) {
    const last = merged[merged.length - 1];
    if (last && last.bold === segment.bold && last.italic === segment.italic) last.text += segment.text;
    else merged.push({ ...segment });
  }
  // Normalise whitespace at line edges and inside segments.
  const out = merged.map((segment) => ({ ...segment, text: segment.text.replace(/\s+/g, ' ') }));
  if (out.length) {
    out[0].text = out[0].text.replace(/^\s+/, '');
    out[out.length - 1].text = out[out.length - 1].text.replace(/\s+$/, '');
  }
  return out.filter((segment) => segment.text);
}

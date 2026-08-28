/**
 * The asterisk marks the middle of a psalm verse. Source texts often contain
 * a legacy <br> immediately after it; in the reading layout both halves of
 * the verse should remain on the same line and wrap naturally.
 */
export function removeBreakAfterAsterisk(html) {
  return String(html || '').replace(
    /((?:\*|&#0*42;|&ast;)(?:\s|&nbsp;)*(?:<\/(?:span|font|strong|b|em|i)>\s*)*)(?:<br\s*\/?>\s*)+/giu,
    '$1 ',
  );
}

const ASTERISK_PATTERN = /(?:\*|&#0*42;|&ast;)/iu;
const PSALM_MARKER_PATTERN = /(?:\*|&#0*42;|&ast;|†|&#0*8224;|&dagger;)/giu;
const PARAGRAPH_PATTERN = /<p\b([^>]*)>([\s\S]*?)<\/p>/giu;
const BREAK_PATTERN = /(<br\s*\/?>)/giu;
const TRAILING_ANTIPHON_PATTERN = /<p\b[^>]*>(?=(?:\s|&nbsp;|<[^>]+>)*(?:\d+\s*)?Ант\.)[\s\S]*?<\/p>\s*$/iu;

/**
 * Highlight the psalmody cadence signs without changing the source text.
 * Splitting around tags keeps any existing inline markup intact.
 */
export function markPsalmCadenceSigns(html) {
  return String(html || '')
    .split(/(<[^>]*>)/u)
    .map((part) => (
      part.startsWith('<')
        ? part
        : part.replace(PSALM_MARKER_PATTERN, '<span class="psalm-marker">$&</span>')
    ))
    .join('');
}

function markAsPsalmStrophe(attributes) {
  if (/\bdata-psalm-strophe(?:\s*=|\s|$)/iu.test(attributes)) return attributes;
  return `${attributes} data-psalm-strophe`;
}

function markAsLiturgicalSubheading(attributes) {
  if (/\bdata-liturgical-subheading(?:\s*=|\s|$)/iu.test(attributes)) return attributes;
  return `${attributes} data-liturgical-subheading`;
}

function isLiturgicalSubheading(attributes, content) {
  return /text-align\s*:\s*center/iu.test(attributes)
    || /color\s*:\s*(?:#ff0000|red)/iu.test(content)
    || /<(?:em|i|strong|b)\b/iu.test(content);
}

/**
 * Psalm and reading records may begin with one or two short red or italic
 * subtitles (reference, theme, or biblical quotation). They are metadata for
 * the following text, rather than part of the psalm or reading itself.
 */
export function markLeadingLiturgicalSubheadings(html) {
  let remaining = 2;
  let canMark = true;

  return String(html || '').replace(
    PARAGRAPH_PATTERN,
    (paragraph, attributes, content) => {
      if (!canMark || remaining === 0 || !isLiturgicalSubheading(attributes, content)) {
        canMark = false;
        return paragraph;
      }

      remaining -= 1;
      return `<p${markAsLiturgicalSubheading(attributes)}>${content}</p>`;
    },
  );
}

function splitPsalmParagraph(attributes, content) {
  if (!ASTERISK_PATTERN.test(content)) return `<p${attributes}>${content}</p>`;

  const parts = content.split(BREAK_PATTERN);
  const strophes = [];
  let current = '';

  for (const part of parts) {
    if (!part) continue;

    if (/^<br\s*\/?>$/iu.test(part) && ASTERISK_PATTERN.test(current)) {
      strophes.push(current);
      current = '';
    } else {
      current += part;
    }
  }

  if (current) strophes.push(current);

  const stropheAttributes = markAsPsalmStrophe(attributes);
  return strophes
    .filter((strophe) => strophe.trim())
    .map((strophe) => `<p${stropheAttributes}>${strophe}</p>`)
    .join('');
}

/**
 * Normalise legacy psalm HTML for display.
 *
 * Some older records keep every strophe in one paragraph and append the
 * repeated antiphon to the psalm itself. Psalmody renders antiphons from their
 * dedicated fields, so the embedded copy must not be displayed a second time.
 */
export function formatPsalmHtml(html, { stripEmbeddedAntiphon = false } = {}) {
  let formatted = String(html || '');

  if (stripEmbeddedAntiphon) {
    while (TRAILING_ANTIPHON_PATTERN.test(formatted)) {
      formatted = formatted.replace(TRAILING_ANTIPHON_PATTERN, '');
    }
  }

  const withStrophes = markPsalmCadenceSigns(removeBreakAfterAsterisk(formatted)).replace(
    PARAGRAPH_PATTERN,
    (_paragraph, attributes, content) => splitPsalmParagraph(attributes, content),
  );

  return markLeadingLiturgicalSubheadings(withStrophes);
}

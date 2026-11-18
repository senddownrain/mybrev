import { removeMatchingPsalmAntiphons } from './liturgicalSourceHtml.js';

// Antiphon labels are rubrics; never change the text of the antiphon itself.
const antiphonSpace = String.raw`(?:\s|&nbsp;|&#0*160;|&#x0*a0;)`;
const antiphonLabelStart = new RegExp(
  String.raw`^(${antiphonSpace}*)((?:[1-9]${antiphonSpace}*)?ант\.)(${antiphonSpace}*да${antiphonSpace}+[^:<\r\n]{1,80}:)?`,
  'iu',
);

/** Style the leading label only; retain the complete, original source HTML. */
export function markAntiphonLabel(html) {
  const source = String(html || '');
  const mark = (leadingText) => {
    const match = antiphonLabelStart.exec(leadingText);
    if (!match) return leadingText;
    const label = match[2] + (match[3] || '');
    return `${match[1]}<span class="ora-antiphon-label">${label}</span>${leadingText.slice(match[0].length)}`;
  };
  if (/<p\b/iu.test(source)) {
    return source.replace(
      /(<p\b[^>]*>)([^<]*)/giu,
      (_full, openingTag, leadingText) => openingTag + mark(leadingText),
    );
  }
  // Legacy plain-text antiphons do not always have a paragraph wrapper.
  return source.includes('<') ? source : mark(source);
}

/**
 * Cadence signs mark pauses inside a psalm verse. Source texts often contain
 * a legacy <br> immediately after them; in the reading layout the text should
 * remain on the same line and wrap naturally.
 */
export function removeBreakAfterPsalmCadenceSign(html) {
  return String(html || '').replace(
    /((?:\*|&#0*42;|&ast;|†|&#0*8224;|&#x0*2020;|&dagger;)(?:\s|&nbsp;)*(?:<\/(?:span|font|strong|b|em|i)>\s*)*)(?:<br\s*\/?>\s*)+/giu,
    '$1 ',
  );
}

// Kept for callers outside this repository that imported the old name.
export const removeBreakAfterAsterisk = removeBreakAfterPsalmCadenceSign;

const ASTERISK_PATTERN = /(?:\*|&#0*42;|&ast;)/iu;
const PSALM_MARKER_PATTERN = /(?:\*|&#0*42;|&ast;|†|&#0*8224;|&#x0*2020;|&dagger;)/giu;
const PARAGRAPH_PATTERN = /<p\b([^>]*)>([\s\S]*?)<\/p>/giu;
const BREAK_PATTERN = /(<br\s*\/?>)/giu;

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

function markAsLiturgicalHeading(attributes) {
  const withoutSubheading = attributes.replace(
    /\s+data-liturgical-subheading(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/giu,
    '',
  );
  if (/\bdata-liturgical-heading(?:\s*=|\s|$)/iu.test(withoutSubheading)) return withoutSubheading;
  return `${withoutSubheading} data-liturgical-heading`;
}

function visibleText(html) {
  return String(html || '')
    .replace(/<[^>]*>/gu, ' ')
    .replace(/&nbsp;|&#x0*20;/giu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function unwrapFullyStyledContent(content, tagPattern) {
  let remaining = String(content || '')
    .replace(/<br\s*\/?>/giu, '')
    .replace(/&nbsp;|&#x0*20;/giu, ' ')
    .trim();

  remaining = remaining.replace(tagPattern, '');
  return visibleText(remaining).length === 0;
}

function isLiturgicalSubheading(attributes, content) {
  if (/text-align\s*:\s*center/iu.test(attributes)) return true;

  const fullyEmphasized = unwrapFullyStyledContent(
    content,
    /<(?:em|i|strong|b)\b[^>]*>[\s\S]*?<\/(?:em|i|strong|b)>/giu,
  );
  if (fullyEmphasized) return true;

  return unwrapFullyStyledContent(
    content,
    /<(?:span|font)\b[^>]*(?:color\s*:\s*(?:#ff0000|red)|color\s*=\s*["']?red)[^>]*>[\s\S]*?<\/(?:span|font)>/giu,
  );
}

function isReadingHeading(content) {
  return /^(?:ПЕРШАЕ|ДРУГОЕ|КАРОТКАЕ)\s+ЧЫТАННЕ(?:\s|$)/iu.test(visibleText(content));
}

function isLectionSectionHeading(content) {
  return /^(?:ПЕРШАЕ|ДРУГОЕ)\s+ЧЫТАННЕ\s*$/iu.test(visibleText(content));
}

// These are section labels stored in the legacy short-reading HTML, not
// references or prose. Long/multiline paragraphs must not be styled as titles.
function isShortOfficeSectionHeading(content) {
  if (/<br\s*\/?>/iu.test(content)) return false;
  const text = visibleText(content);
  return /^(?:КАРОТКАЕ ЧЫТАННЕ|КАРОТКІ РЭСПАНСОРЫЙ)(?:\s|$)/iu.test(text)
    && text.length <= 85
    && !/[.!?]\s+\p{L}/u.test(text);
}

function escapePattern(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

const HTML_SPACE_PATTERN = '(?:\\s|&nbsp;|&#0*32;|&#x0*20;)*';

/**
 * The Office of Readings owns its first/second-reading labels in the page
 * structure. Older records often repeat the same label at the beginning of
 * their HTML, either in a standalone paragraph or before the source line.
 * Remove that legacy copy so the structural heading is displayed once.
 */
export function removeLectionSectionHeading(html, heading) {
  const expected = String(heading || '').trim();
  if (!expected) return String(html || '');

  const headingPattern = new RegExp(
    `^${HTML_SPACE_PATTERN}(?:<(?:span|font|strong|b|em|i)\\b[^>]*>${HTML_SPACE_PATTERN})*`
      + `${escapePattern(expected)}${HTML_SPACE_PATTERN}`
      + `(?:<\\/(?:span|font|strong|b|em|i)>${HTML_SPACE_PATTERN})*`
      + `(?:<br\\s*\\/?>${HTML_SPACE_PATTERN})?`,
    'iu',
  );

  return String(html || '').replace(
    PARAGRAPH_PATTERN,
    (paragraph, attributes, content) => {
      if (!visibleText(content).toLocaleLowerCase('be').startsWith(expected.toLocaleLowerCase('be'))) {
        return paragraph;
      }

      const withoutHeading = content.replace(headingPattern, '');
      if (withoutHeading === content) return paragraph;
      if (!visibleText(withoutHeading)) return '';
      return `<p${attributes}>${withoutHeading}</p>`;
    },
  );
}

function markInlineReadingReference(content) {
  return String(content || '').replace(
    /<span\b([^>]*)>(\s*\([^<]*\)\s*)<\/span>/giu,
    (span, attributes, reference) => {
      if (!/^(?:\s|&nbsp;)*\(/iu.test(reference)) return span;
      if (/\bdata-liturgical-reference(?:\s*=|\s|$)/iu.test(attributes)) return span;
      return `<span${attributes} data-liturgical-reference>${reference}</span>`;
    },
  );
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
      if (isLectionSectionHeading(content)) {
        return `<p${markAsLiturgicalHeading(attributes)}>${content}</p>`;
      }

      if (isShortOfficeSectionHeading(content)) {
        return `<p${markAsLiturgicalHeading(attributes)}>${markInlineReadingReference(content)}</p>`;
      }

      // Centred lines in the source are structural captions (psalm parts,
      // references, and themes), including captions after the first two
      // leading metadata paragraphs.
      if (/text-align\s*:\s*center/iu.test(attributes)) {
        if (canMark && remaining > 0) remaining -= 1;
        return `<p${markAsLiturgicalSubheading(attributes)}>${content}</p>`;
      }

      if (isReadingHeading(content)) {
        const markedContent = markInlineReadingReference(content);
        if (markedContent !== content) {
          return `<p${attributes}>${markedContent}</p>`;
        }
      }

      if (!canMark || remaining === 0 || !isLiturgicalSubheading(attributes, content)) {
        // A lection begins with a mixed-size heading (reading label plus book
        // or author), followed by its centred source/theme caption.
        if (!isReadingHeading(content)) canMark = false;
        return paragraph;
      }

      remaining -= 1;
      return `<p${markAsLiturgicalSubheading(attributes)}>${content}</p>`;
    },
  );
}

// Legacy HTML occasionally breaks before a very short, lower-case ending
// of the same psalm verse. Keep that ending in its stanza rather than
// creating a separate alternating strophe; other line breaks stay as-is.
function isShortPsalmTail(previous, rest) {
  if (/<br\s*\/?>/iu.test(rest)
    || /(?:\*|†|&ast;|&dagger;|&#0*42;|&#0*8224;|&#x0*2020;)/iu.test(rest)) return false;

  const text = visibleText(rest);
  return /^\p{Ll}/u.test(text)
    && text.split(/\s+/u).length <= 3
    && !/[.!?]$/u.test(visibleText(previous));
}

function splitPsalmParagraph(attributes, content) {
  if (!ASTERISK_PATTERN.test(content)) return `<p${attributes}>${content}</p>`;

  const parts = content.split(BREAK_PATTERN);
  const strophes = [];
  let current = '';

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (!part) continue;

    if (/^<br\s*\/?>$/iu.test(part) && ASTERISK_PATTERN.test(current)) {
      if (isShortPsalmTail(current, parts.slice(index + 1).join(''))) {
        current += ' ';
      } else {
        strophes.push(current);
        current = '';
      }
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
export function formatPsalmHtml(html, { stripEmbeddedAntiphon = false, antiphon = '' } = {}) {
  let formatted = String(html || '');

  if (stripEmbeddedAntiphon) {
    formatted = removeMatchingPsalmAntiphons(formatted, antiphon);
  }

  const withStrophes = markPsalmCadenceSigns(removeBreakAfterPsalmCadenceSign(formatted)).replace(
    PARAGRAPH_PATTERN,
    (_paragraph, attributes, content) => splitPsalmParagraph(attributes, content),
  );

  return markLeadingLiturgicalSubheadings(withStrophes);
}

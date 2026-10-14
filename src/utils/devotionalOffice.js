// Reader-only formatting profile for the five office-style devotions.
// Firestore prayer data and canonical Markdown remain unchanged.
// Detection by title is provisional until the five production document IDs are verified.

const normalize = (value = '') => String(value)
  .normalize('NFC')
  .toLocaleLowerCase('be')
  .replace(/[’‘\u0060]/g, "'")
  .replace(/[ё]/g, 'е')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export function devotionalOfficeProfile(title = '') {
  const name = normalize(title);
  const isLauds = /^(?:ютрань|утрань|утреня|утраня|ранішнія хвалы)(?: |$)/u.test(name);
  const isVespers = /^(?:нешпары|няшпоры|нишпоры|вечерня)(?: |$)/u.test(name);
  const isHours = /^(?:гадзінкі|годзінкі|годинки)(?: |$)/u.test(name);
  const forDead = /(?:^| )(?:памерлых|померлых|усопших)(?: |$)/u.test(name);
  const marian = /(?:^| )(?:маці|матери|марыі|марыя|марии|панны|дзевы|багародзіцы|богородицы|беззаганным|непорочном)(?: |$)/u.test(name);
  if (isLauds && forDead) return 'dead-lauds';
  if (isVespers && forDead) return 'dead-vespers';
  if (isLauds && marian) return 'marian-lauds';
  if (isVespers && marian) return 'marian-vespers';
  if (isHours && (marian || name === 'гадзінкі' || name === 'годзінкі')) return 'marian-little-hours';
  return null;
}

const MAJOR_HEADINGS = new Set([
  'псальмодыя', 'гімн', 'гимн', 'уводзіны', 'уступ', 'вступление',
  'кароткае чытанне', 'кароткі рэспансорый', 'короткое чтение',
  'короткий респонсорий', 'чытанне', 'рэспансорый', 'чтение', 'респонсорий',
  'евангельская песня', 'песня з евангелля', 'песня захарыі', 'песня марыі',
  'песня марыі магніфікат', 'просьбы', 'прашэнні', 'прошения',
  'ойча наш', 'малітва', 'молитва', 'заключная малітва',
  'благаслаўленне', 'благословение', 'заканчэнне', 'заключэнне',
  'хвалы', 'нешпары', 'ютрань',
]);

const EXTRA_HEADINGS = new Set([
  'дадатковыя тэксты', 'дадатковыя варыянты', 'іншыя варыянты',
  'альтэрнатыўныя тэксты', 'дополнительные тексты',
  'дополнительные варианты', 'другие варианты',
]);

const PSALM_HEADING = /^(?:псальм|псалом|пс)\s*\d+(?:\s*\([^)]*\))?(?:\s*[,:.].*)?$/iu;
const ALTERNATIVE_HEADING = /^(?:альбо|або|или|варыянт\s*\d+|вариант\s*\d+)\s*[:.]?$/iu;
// Match only the label: the antiphon wording must retain the reader's text colour.
const ANTIPHON_LABEL = /^(\s*)((?:\d{1,2}\s+ант\.?|ант\.?\s*\d{1,2}\.?|ант\.|антыфона\s*\d{1,2}\.?|ant\.?\s*\d{1,2}\.?))(?=\s|$)/iu;

const bareLine = (text) => String(text)
  .replace(/^[\s*_]+|[\s*_]+$/g, '')
  .trim();

function inlineTokenLike(reference, type, content) {
  const token = new reference.constructor(type, '', 0);
  token.content = content;
  return token;
}

function decorateAntiphons(token) {
  if (!token.children) return;
  const children = [];
  let startOfLine = true;
  token.children.forEach((child) => {
    if (child.type === 'softbreak' || child.type === 'hardbreak') {
      children.push(child);
      startOfLine = true;
      return;
    }
    if (child.type === 'text') {
      const match = startOfLine ? ANTIPHON_LABEL.exec(child.content) : null;
      if (match) {
        if (match[1]) children.push(inlineTokenLike(child, 'text', match[1]));
        children.push(inlineTokenLike(child, 'html_inline', '<span class="office-antiphon-label">'));
        children.push(inlineTokenLike(child, 'text', match[2]));
        children.push(inlineTokenLike(child, 'html_inline', '</span>'));
        if (child.content.slice(match[0].length)) {
          children.push(inlineTokenLike(child, 'text', child.content.slice(match[0].length)));
        }
      } else {
        children.push(child);
      }
      if (child.content.trim()) startOfLine = false;
      return;
    }
    children.push(child);
    // Inline emphasis markers may precede a label. They do not start a verse.
    if (!['strong_open', 'em_open', 'strong_close', 'em_close'].includes(child.type)) {
      startOfLine = false;
    }
  });
  token.children = children;
}

/** Adds presentation metadata to MarkdownIt tokens without changing their text. */
export function decorateDevotionalOfficeTokens(tokens) {
  let rubricDepth = 0;
  let headingDepth = 0;
  tokens.forEach((token, index) => {
    if (token.type === 'rubric_open') rubricDepth += 1;
    if (token.type === 'rubric_close') rubricDepth = Math.max(0, rubricDepth - 1);
    if (token.type === 'heading_open') {
      token.attrJoin('class', 'office-heading');
      headingDepth += 1;
    }
    if (token.type === 'heading_close') headingDepth = Math.max(0, headingDepth - 1);
    if (token.type === 'paragraph_open' && rubricDepth === 0) {
      const inline = tokens[index + 1];
      const end = tokens[index + 2];
      if (inline?.type === 'inline' && end?.type === 'paragraph_close') {
        const literal = bareLine(inline.content);
        const label = normalize(literal);
        if (EXTRA_HEADINGS.has(label)) {
          token.tag = 'h2';
          end.tag = 'h2';
          token.attrJoin('class', 'office-heading office-extra-heading');
        } else if (MAJOR_HEADINGS.has(label)) {
          token.tag = 'h2';
          end.tag = 'h2';
          token.attrJoin('class', 'office-heading');
        } else if (PSALM_HEADING.test(literal)) {
          token.tag = 'h3';
          end.tag = 'h3';
          token.attrJoin('class', 'office-psalm-heading');
        } else if (ALTERNATIVE_HEADING.test(literal)) {
          token.attrJoin('class', 'office-alternative-label');
        } else if (!inline.content.includes('\n') && ANTIPHON_LABEL.test(bareLine(inline.content))) {
          token.attrJoin('class', 'office-antiphon');
        }
      }
    }
    if (token.type === 'inline' && rubricDepth === 0 && headingDepth === 0) {
      decorateAntiphons(token);
    }
  });
  return tokens;
}

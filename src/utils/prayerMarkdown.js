import MarkdownIt from 'markdown-it';
import TurndownService from 'turndown';

export const PRAYER_TEXT_FORMAT = 'mybrev-markdown';
export const PRAYER_TEXT_FORMAT_VERSION = 1;

const RUBRIC_LINE_PATTERN = /^(?:Святар|Народ|Усе|Дыякан|Біскуп|Цэлебрант|Лектар|Псальміст|Кантар)\b[^.!?]*:$/i;
const RUBRIC_ACTOR_PATTERN = /(?:^|[^\p{L}])(?:святар|народ|усе|дыякан|біскуп|цэлебрант|лектар|псальміст|кантар|міністрант|пэнітэнт|вернікі|священник|диакон|епископ|чтец|псаломщик|верующие)(?=$|[^\p{L}])/iu;
const RUBRIC_ACTION_PATTERN = /(?:ўста(?:е|юць)|садзяц|кленчац|моляц|адказва|спява|прамаўля|чытае|каж[аыуе]|робіць|заахвочвае|просіць|акрапляе|уваходз|завяршае|маўчыць|пакланяецца|стаіць|бярэ|падае|благаслаўляе|садзіцца|стоят|садятся|кланяется|молится|отвечает|поет|говорит|читает|делает|призывает|просит|окропляет|благословляет)/iu;

function rubricPlugin(md) {
  md.block.ruler.before('fence', 'rubric', (state, startLine, endLine, silent) => {
    const start = state.bMarks[startLine] + state.tShift[startLine];
    const max = state.eMarks[startLine];
    if (state.src.slice(start, max).trim() !== ':::rubric') return false;

    let nextLine = startLine + 1;
    for (; nextLine < endLine; nextLine += 1) {
      const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
      const lineEnd = state.eMarks[nextLine];
      if (state.src.slice(lineStart, lineEnd).trim() === ':::') break;
    }

    if (nextLine >= endLine) return false;
    if (silent) return true;

    const open = state.push('rubric_open', 'aside', 1);
    open.block = true;
    open.map = [startLine, nextLine + 1];
    state.md.block.tokenize(state, startLine + 1, nextLine);
    const close = state.push('rubric_close', 'aside', -1);
    close.block = true;
    state.line = nextLine + 1;
    return true;
  });

  md.renderer.rules.rubric_open = () => '<aside class="prayer-rubric">\n';
  md.renderer.rules.rubric_close = () => '</aside>\n';
}

const markdown = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
  // Prayer and litany sources use intentional single line breaks for
  // invocations and responses. CommonMark soft breaks would collapse them.
  breaks: true,
}).use(rubricPlugin);

function createTurndown({ emphasisAsRubric = false } = {}) {
  const turndown = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '_',
    strongDelimiter: '**',
  });

  turndown.addRule('mybrev-rubric', {
    filter(node) {
      if (node.nodeName !== 'P') return false;
      let ancestor = node.parentNode;
      while (ancestor) {
        if (ancestor.nodeName === 'LI') return false;
        ancestor = ancestor.parentNode;
      }
      const className = node.getAttribute?.('class') || '';
      const text = (node.textContent || '').trim();
      const meaningfulChildren = Array.from(node.childNodes || [])
        .filter((child) => child.nodeType !== 3 || child.textContent.trim());
      const onlyEmphasis = meaningfulChildren.length === 1 && meaningfulChildren[0].nodeName === 'EM';
      return /(?:^|\s)(?:rubric|mass-rubric-line)(?:\s|$)/i.test(className)
        || onlyEmphasis
        || RUBRIC_LINE_PATTERN.test(text);
    },
    replacement(content, node) {
      const text = (node.textContent || content)
        .trim()
        .replace(/^[_*]+|[_*]+$/g, '')
        .trim();
      return text ? `\n\n:::rubric\n${text}\n:::\n\n` : '';
    },
  });

  if (emphasisAsRubric) {
    turndown.addRule('mybrev-inline-rubric', {
      filter(node) {
        if (node.nodeName !== 'EM') return false;
        let ancestor = node.parentNode;
        while (ancestor) {
          if (ancestor.nodeName === 'LI') return false;
          ancestor = ancestor.parentNode;
        }
        return true;
      },
      replacement(content, node) {
        const text = (node.textContent || content).trim();
        return text ? `\n\n:::rubric\n${text}\n:::\n\n` : '';
      },
    });
  }

  turndown.remove(['script', 'style', 'iframe', 'object']);
  return turndown;
}

export function normalizePrayerMarkdown(value = '') {
  return String(value)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/^#{1,6}\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function repairStandaloneStrongMarkers(lines) {
  const repaired = [];
  let changed = false;
  let index = 0;

  while (index < lines.length) {
    if (lines[index].trim() !== '**') {
      repaired.push(lines[index]);
      index += 1;
      continue;
    }

    const closingIndex = lines.findIndex((line, candidateIndex) => (
      candidateIndex > index && line.trim() === '**'
    ));
    const content = closingIndex > index ? lines.slice(index + 1, closingIndex) : [];
    const hasText = content.some((line) => line.trim());
    const containsList = content.some((line) => /^\s*(?:[-+*]|\d+[.)])\s+/.test(line));

    if (closingIndex === -1 || !hasText || containsList) {
      repaired.push(lines[index]);
      index += 1;
      continue;
    }

    let paragraphStart = -1;
    content.forEach((line, contentIndex) => {
      if (line.trim() && paragraphStart === -1) paragraphStart = contentIndex;
      const paragraphEnds = paragraphStart !== -1
        && (!line.trim() || contentIndex === content.length - 1);
      if (!paragraphEnds) return;

      const paragraphEnd = line.trim() ? contentIndex : contentIndex - 1;
      content[paragraphStart] = content[paragraphStart].replace(/^(\s*)/, '$1**');
      content[paragraphEnd] = `${content[paragraphEnd]}**`;
      paragraphStart = -1;
    });

    repaired.push(...content);
    changed = true;
    index = closingIndex + 1;
  }

  return { lines: repaired, changed };
}

export function autoFixPrayerMarkdown(value = '') {
  const original = String(value ?? '');
  const fixes = [];
  let source = original;

  if (looksLikeHtml(source)) {
    source = htmlToPrayerMarkdown(source);
    fixes.push('HTML пераўтвораны ў Markdown');
  }

  const cleaned = source
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[ \t]+$/gm, '');
  if (cleaned !== source) fixes.push('прыбраны службовыя прабелы і сімвалы');
  source = cleaned;

  const normalizedLines = source.split('\n').map((line) => {
    const trimmed = line.trim();

    if (/^:{2,3}\s*rubric\s*$/i.test(trimmed)) return ':::rubric';
    if (/^:{2,3}\s*$/.test(trimmed)) return ':::';

    return line
      .replace(/^(\s{0,3})(#{1,6})([^\s#])/, '$1$2 $3')
      .replace(/^(\s*)[•●▪◦]\s*/, '$1- ')
      .replace(/^(\s*)(\d+)[.)]\s*(?=\S)/, '$1$2. ');
  });
  if (normalizedLines.join('\n') !== source) fixes.push('выпраўлены загалоўкі, спісы і маркеры рубрык');

  const strongRepair = repairStandaloneStrongMarkers(normalizedLines);
  if (strongRepair.changed) fixes.push('выпраўлены парныя маркеры тлустага тэксту');

  const balancedLines = [];
  let rubricOpen = false;
  let rubricPairsFixed = false;

  strongRepair.lines.forEach((line) => {
    const marker = line.trim();
    if (marker === ':::rubric') {
      if (rubricOpen) {
        balancedLines.push(':::');
        rubricPairsFixed = true;
      }
      balancedLines.push(':::rubric');
      rubricOpen = true;
      return;
    }

    if (marker === ':::') {
      if (!rubricOpen) {
        rubricPairsFixed = true;
        return;
      }
      balancedLines.push(':::');
      rubricOpen = false;
      return;
    }

    balancedLines.push(line);
  });

  if (rubricOpen) {
    balancedLines.push(':::');
    rubricPairsFixed = true;
  }
  if (rubricPairsFixed) fixes.push('адноўлены пары рубрык');

  const markdown = normalizePrayerMarkdown(balancedLines.join('\n'));
  if (markdown !== balancedLines.join('\n')) fixes.push('нармалізаваны пустыя радкі');

  return {
    markdown,
    changed: markdown !== original,
    fixes: [...new Set(fixes)],
  };
}

function stripStandaloneEmphasis(value) {
  let result = value.trim();
  let changed = true;
  while (changed) {
    changed = false;
    if (result.startsWith('**') && result.endsWith('**') && result.length > 4) {
      result = result.slice(2, -2).trim();
      changed = true;
    } else if (result.startsWith('_') && result.endsWith('_') && result.length > 2) {
      result = result.slice(1, -1).trim();
      changed = true;
    }
  }
  return result;
}

function isRubricInstruction(line) {
  const text = stripStandaloneEmphasis(line);
  if (!text || text.length > 650 || /[«»]/u.test(text)) return false;
  // Abbreviated speaker labels introduce spoken text. They are styled inline
  // by the prayer view and must not turn an entire spoken line into a rubric.
  if (/^[СCЦН]\.:/u.test(text)) return false;
  if (!RUBRIC_ACTOR_PATTERN.test(text)) return false;

  return RUBRIC_ACTION_PATTERN.test(text);
}

/**
 * Promotes only high-confidence liturgical directions to MyBrev rubric blocks.
 * Biblical quotations, prayers, litany responses, and abbreviated speaker lines
 * are deliberately preserved as authored text.
 */
export function promotePrayerRubrics(value = '') {
  const source = normalizePrayerMarkdown(value);
  const lines = source.split('\n');
  const result = [];
  let rubricOpen = false;
  let rubricsAdded = 0;

  lines.forEach((line, index) => {
    const marker = line.trim();
    if (marker === ':::rubric') {
      rubricOpen = true;
      result.push(line);
      return;
    }
    if (marker === ':::') {
      rubricOpen = false;
      result.push(line);
      return;
    }
    if (rubricOpen || !isRubricInstruction(line)) {
      result.push(line);
      return;
    }

    if (result.length && result.at(-1).trim()) result.push('');
    result.push(':::rubric', stripStandaloneEmphasis(line), ':::');
    if (index < lines.length - 1 && lines[index + 1].trim()) result.push('');
    rubricsAdded += 1;
  });

  const markdown = normalizePrayerMarkdown(result.join('\n'));
  return { markdown, changed: markdown !== source, rubricsAdded };
}

export function looksLikeHtml(value = '') {
  return /<\/?[a-z][\s\S]*?>/i.test(String(value));
}

export function htmlToPrayerMarkdown(value = '', options = {}) {
  if (!value) return '';
  return normalizePrayerMarkdown(createTurndown(options).turndown(String(value)));
}

export function toPrayerMarkdown(value = '', format = '', options = {}) {
  if (!value) return '';
  if (format === PRAYER_TEXT_FORMAT) return normalizePrayerMarkdown(value);
  return looksLikeHtml(value) ? htmlToPrayerMarkdown(value, options) : normalizePrayerMarkdown(value);
}

export function renderPrayerMarkdown(value = '', format = '') {
  return markdown.render(toPrayerMarkdown(value, format));
}

/** Block tokens of a prayer text, for readers that map blocks to semantics. */
export function parsePrayerMarkdown(value = '', format = '') {
  return markdown.parse(toPrayerMarkdown(value, format), {});
}

/** Renders one inline Markdown fragment (no paragraph wrapper). */
export function renderPrayerInline(value = '') {
  return markdown.renderInline(String(value));
}

export function prayerMarkdownToPlainText(value = '', format = '') {
  const source = toPrayerMarkdown(value, format)
    .replace(/^:::rubric\s*$/gm, '')
    .replace(/^:::\s*$/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-+*]\s+/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_~`]+/g, '')
    .replace(/\n{3,}/g, '\n\n');
  return source.trim();
}

export function validatePrayerMarkdown(value = '') {
  const source = normalizePrayerMarkdown(value);
  const errors = [];
  let rubricOpen = false;

  source.split('\n').forEach((line, index) => {
    const marker = line.trim();
    if (marker === ':::rubric') {
      if (rubricOpen) errors.push({ line: index + 1, message: 'Рубрыка ўжо адкрыта.' });
      rubricOpen = true;
    } else if (marker === ':::') {
      if (!rubricOpen) errors.push({ line: index + 1, message: 'Лішняе закрыццё рубрыкі.' });
      rubricOpen = false;
    }
  });

  if (rubricOpen) errors.push({ line: source.split('\n').length, message: 'Закрыйце рубрыку радком :::.' });
  return errors;
}

export function prayerTextFields(markdownText) {
  return {
    text: normalizePrayerMarkdown(markdownText),
    textFormat: PRAYER_TEXT_FORMAT,
    textFormatVersion: PRAYER_TEXT_FORMAT_VERSION,
  };
}

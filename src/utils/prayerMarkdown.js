import MarkdownIt from 'markdown-it';
import TurndownService from 'turndown';

export const PRAYER_TEXT_FORMAT = 'mybrev-markdown';
export const PRAYER_TEXT_FORMAT_VERSION = 1;

const RUBRIC_LINE_PATTERN = /^(?:Святар|Народ|Усе|Дыякан|Біскуп|Цэлебрант|Лектар|Псальміст|Кантар)\b[^.!?]*:$/i;

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

  const balancedLines = [];
  let rubricOpen = false;
  let rubricPairsFixed = false;

  normalizedLines.forEach((line) => {
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

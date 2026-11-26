import MarkdownIt from 'markdown-it';
import TurndownService from 'turndown';
import { collectLegacyPrayerSpeakers, collectQuotedPrayerSpeakers, projectLegacyPrayerSpeakers, normalizePrayerLegacyMarkdown } from './prayerLegacyFormatting.js';

export const PRAYER_TEXT_FORMAT = 'mybrev-markdown';
export const PRAYER_TEXT_FORMAT_VERSION = 1;

// Cyrillic labels are distinct from their Latin lookalikes. V/R describe
// versicle/response, not an inferred priest/cantor identity.
export const PRAYER_SPEAKERS = Object.freeze({
  'К.': 'cantor', 'С.': 'priest', 'Н.': 'people', 'Д.': 'deacon',
  'Л.': 'reader', 'Ц.': 'celebrant', 'V.': 'versicle', 'R.': 'response',
  'Усе:': 'all', 'Цэлебрант:': 'celebrant',
});

export function prayerSpeakerPrefix(value) {
  const match = /^( {0,3})([КСНДЛЦVR]\.:?|Усе:|Цэлебрант:)(?=[ \t]+\S)/u.exec(value);
  if (!match) return null;
  const rest = value.slice(match[0].length).trim();
  // Initials and an unpunctuated surname are ambiguous, so leave them alone.
  if (match[2].includes('.') && (/^\p{Lu}\./u.test(rest) || /^\p{Lu}\p{Ll}+(?:\s+\p{Lu}\p{Ll}+)*$/u.test(rest))) return null;
  if (/^[КСНДЛЦ]/u.test(match[2]) && /^\p{Lu}[\p{Ll}\p{M}-]+(?:\s+\p{Lu}[\p{Ll}\p{M}-]+)*:/u.test(rest)
    && !/^(?:Молімся|Памолімся):/u.test(rest)) return null;
  return { from: match[1].length, to: match[0].length, label: match[2], role: PRAYER_SPEAKERS[match[2].replace(/\.:$/, '.')] };
}

/** Source ranges shared by the reader and CodeMirror; never rewrites input. */
export function prayerSpeakerRanges(source = '') {
  return [...collectLegacyPrayerSpeakers(source).map(({ from, to, label, role, line, kind }) => ({ from, to, label, role, line, kind })),
    ...collectQuotedPrayerSpeakers(source)].sort((a, b) => a.from - b.from);
}

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
        || (emphasisAsRubric && (onlyEmphasis || RUBRIC_LINE_PATTERN.test(text)));
    },
    replacement(content, node) {
      const text = emphasisAsRubric
        ? (node.textContent || content).trim().replace(/^[_*]+|[_*]+$/g, '').trim()
        : content.trim();
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
  if (parsePrayerMarkdown(original, PRAYER_TEXT_FORMAT).some((token) => ['fence', 'code_block'].includes(token.type))) {
    return { markdown: original, changed: false, fixes: [] };
  }
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
  if (/^[КСНДЛЦVRC]\.:?\s/u.test(text)) return false;
  if (!RUBRIC_ACTOR_PATTERN.test(text)) return false;

  return RUBRIC_ACTION_PATTERN.test(text);
}

/**
 * Promotes only high-confidence liturgical directions to MyBrev rubric blocks.
 * Biblical quotations, prayers, litany responses, and abbreviated speaker lines
 * are deliberately preserved as authored text.
 */
export function promotePrayerRubrics(value = '') {
  const tokens = parsePrayerMarkdown(value, PRAYER_TEXT_FORMAT);
  if (tokens.some((token) => ['fence', 'code_block'].includes(token.type))) {
    return { markdown: String(value), changed: false, rubricsAdded: 0 };
  }
  const excluded = new Set();
  for (const token of tokens) {
    if (['blockquote_open', 'heading_open', 'list_item_open'].includes(token.type) && token.map) {
      for (let line = token.map[0]; line < token.map[1]; line += 1) excluded.add(line);
    }
  }
  const source = String(value).replace(/\r\n?/g, '\n');
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
    if (rubricOpen || excluded.has(index) || !isRubricInstruction(line)) {
      result.push(line);
      return;
    }

    if (result.length && result.at(-1).trim()) result.push('');
    result.push(':::rubric', stripStandaloneEmphasis(line), ':::');
    if (index < lines.length - 1 && lines[index + 1].trim()) result.push('');
    rubricsAdded += 1;
  });

  const markdown = rubricsAdded ? normalizePrayerMarkdown(result.join('\n')) : source;
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
  const source = String(value).replace(/\r\n?/g, '\n');
  if (format === PRAYER_TEXT_FORMAT) return source;
  const knownHtml = format === 'html' || format === 'legacy-html' || options.emphasisAsRubric;
  const richRoot = /^\s*</.test(source) && markdown.parse(source, {})[0]?.type !== 'code_block';
  return looksLikeHtml(source) && (knownHtml || richRoot) ? htmlToPrayerMarkdown(source, options) : source;
}

export function renderPrayerMarkdown(value = '', format = '', { normalizeLegacy = true } = {}) {
  const markdownSource = toPrayerMarkdown(value, format);
  if (!normalizeLegacy) return markdown.render(markdownSource);
  const source = projectLegacyPrayerSpeakers(markdownSource);
  const eligible = new Map(prayerSpeakerRanges(source).map((range) => [range.line, range]));
  const tokens = markdown.parse(source, {});
  for (const token of tokens) {
    if (token.type !== 'inline') continue;
    let line = token.map[0] + 1;
    let start = true;
    const children = [];
    for (const child of token.children || []) {
      const prefix = start && child.type === 'text' ? eligible.get(line) : null;
      if (prefix) {
        const label = new child.constructor('html_inline', '', 0);
        label.content = `<span class="prayer-speaker" data-role="${prefix.role}">${markdown.utils.escapeHtml(prefix.label)}</span>`;
        children.push(label);
        child.content = child.content.replace(/^(?: {0,3})(?:[КСНДЛЦVR]\.:?|Усе:|Цэлебрант:)/u, '');
      }
      children.push(child);
      start = child.type === 'softbreak' || child.type === 'hardbreak';
      if (start) line += 1;
    }
    token.children = children;
  }
  return markdown.renderer.render(tokens, markdown.options, {});
}

/** Block tokens of a prayer text, for readers that map blocks to semantics. */
export function parsePrayerMarkdown(value = '', format = '', options = {}) {
  return markdown.parse(toPrayerMarkdown(value, format, options), {});
}

/** Renders one inline Markdown fragment (no paragraph wrapper). */
export function renderPrayerInline(value = '') {
  return markdown.renderInline(String(value));
}

export function prayerMarkdownToPlainText(value = '', format = '') {
  const inlineText = (tokens) => tokens.map((token) => {
    if (['softbreak', 'hardbreak'].includes(token.type)) return '\n';
    if (token.type === 'image') return inlineText(token.children || []);
    return token.nesting === 0 ? token.content : '';
  }).join('');
  return markdown.parse(toPrayerMarkdown(value, format), {})
    .filter((token) => ['inline', 'fence', 'code_block'].includes(token.type))
    .map((token) => token.type === 'inline' ? inlineText(token.children || []) : token.content.trimEnd())
    .join('\n\n').trim();
}

export function validatePrayerMarkdown(value = '') {
  const source = String(value).replace(/\r\n?/g, '\n');
  const errors = [];
  let rubricOpen = false;
  const protectedLines = new Set();
  for (const token of markdown.parse(source, {})) {
    if (['fence', 'code_block'].includes(token.type)) {
      for (let line = token.map[0]; line < token.map[1]; line += 1) protectedLines.add(line);
    }
  }

  source.split('\n').forEach((line, index) => {
    if (protectedLines.has(index)) return;
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

/** Warnings do not block saving an intentional quotation or legacy spelling. */
export function diagnosePrayerMarkdown(value = '') {
  const source = String(value);
  const findings = validatePrayerMarkdown(source).map((issue) => ({ ...issue, severity: 'manual', code: 'rubric-balance' }));
  const protectedLines = new Set();
  const tokens = markdown.parse(source, {});
  for (const token of tokens) {
    if (['fence', 'code_block'].includes(token.type)) {
      findings.push({ line: token.map[0] + 1, severity: 'manual', code: 'code', message: 'Код патрабуе ручной праверкі; аўтавыпраўленне адключана.' });
      for (let n = token.map[0]; n < token.map[1]; n += 1) protectedLines.add(n);
    }
  }
  const seen = new Set();
  source.split('\n').forEach((line, index) => {
    if (protectedLines.has(index)) return;
    const add = (code, message, severity = 'review') => findings.push({ line: index + 1, code, message, severity });
    if (/^\s*>/.test(line)) add('quotation', 'Цытата: праверце намер аўтара; знак > захоўваецца.');
    if (/^\s*[КСНДЛЦVR]\.:\s/u.test(line)) add('legacy-label', 'Спадчынная метка з двукроп’ем чытаецца без змены тэксту.');
    if (/^\s*[CKHNP]\.[ :]?/u.test(line)) add('ambiguous-label', 'Неадназначная лацінская літара або ініцыял; праверце ўдзельніка.', 'manual');
    if (looksLikeHtml(line)) add('html', 'HTML: праверце пераўтварэнне і захаванне зместу.');
    if (/^\s*[_*].+[_*]\s*$/.test(line)) add('emphasis', 'Вылучэнне не азначае рубрыку або адказ народу.');
    if (isRubricInstruction(line)) add('possible-rubric', 'Магчымая рубрыка: патрабуе праверкі па сэнсе.');
    if (/^\s*(?:#{1,6}\S|\*\*\s*$|:{2,3}\s+rubric)/.test(line)) add('markdown-marker', 'Праверце службовыя знакі Markdown.');
    if (/\]\(\s*(?:javascript|data):/i.test(line)) add('unsafe-link', 'Небяспечны адрас спасылкі заблакаваны чытачом.', 'manual');
    if (/\]\(\/prayer\/\s*\)/.test(line)) add('empty-link', 'У спасылцы няма ідэнтыфікатара малітвы.', 'manual');
    if (line.trim().length > 30 && seen.has(line.trim())) add('duplicate-line', 'Паўтор можа быць літургічнай формулай; не выдаляйце аўтаматычна.');
    seen.add(line.trim());
  });
  if (!source.trim()) findings.push({ line: 1, code: 'empty-text', severity: 'manual', message: 'Пустая моўная версія.' });
  return findings;
}

export function prayerTextFields(markdownText, { normalizeLegacy = true } = {}) {
  const source = String(markdownText).replace(/\r\n?/g, '\n');
  return {
    text: normalizeLegacy ? normalizePrayerLegacyMarkdown(source).markdown : source,
    textFormat: PRAYER_TEXT_FORMAT,
    textFormatVersion: PRAYER_TEXT_FORMAT_VERSION,
  };
}

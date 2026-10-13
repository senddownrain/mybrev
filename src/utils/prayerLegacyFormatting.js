import {
  parsePrayerMarkdown, prayerSpeakerPrefix, prayerMarkdownToPlainText,
  validatePrayerMarkdown, PRAYER_TEXT_FORMAT,
} from './prayerMarkdown.js';

export const PRAYER_NORMALIZATION_VERSION = 2;
export const AUTOMATIC_PRAYER_RULES = Object.freeze([
  'line-endings', 'speaker-label', 'speaker-line-emphasis', 'speaker-line-break', 'explicit-direction',
]);
export const PRAYER_RULE_LABELS = Object.freeze({
  'line-endings': 'Пераносы радкоў', 'speaker-label': 'Метка ўдзельніка',
  'speaker-line-emphasis': 'Вылучэнне меткі ўдзельніка', 'speaker-line-break': 'Метка і словы рэплікі на адным радку',
  'explicit-direction': 'Яўная літургічная рубрыка',
});
const EXACT_DIRECTIONS = new Set([
  'Усе ўстаюць.', 'Усе кленчаць.', 'Усе садзяцца.', 'Усе моляцца ў цішыні.',
  'Святар кажа:', 'Святар гаворыць:', 'Цэлебрант кажа:', 'Цэлебрант гаворыць:',
  'Народ адказвае:', 'Усе адказваюць:', 'Кантар спявае:', 'Дыякан кажа:', 'Лектар чытае:',
]);

function inlineText(tokens) {
  return tokens.map(token => token.type === 'softbreak' || token.type === 'hardbreak' ? '\n'
    : token.type === 'image' ? inlineText(token.children || []) : token.nesting === 0 ? token.content : '').join('');
}

/** Block eligibility comes from the parser; source regexes only locate a prefix inside an eligible block. */
export function prayerLegacyStructure(value = '') {
  const source = String(value).replace(/\r\n?/g, '\n');
  const lines = source.split('\n');
  const tokens = parsePrayerMarkdown(source, PRAYER_TEXT_FORMAT);
  const paragraphs = [];
  const quotes = [];
  const stack = [];
  for (const token of tokens) {
    if (token.type === 'blockquote_open' && token.map) quotes.push({ from: token.map[0], to: token.map[1] });
    if (token.nesting === 1) stack.push(token.type);
    if (token.type === 'inline' && stack.at(-1) === 'paragraph_open'
      && !stack.some(type => ['rubric_open', 'blockquote_open', 'list_item_open'].includes(type))) {
      paragraphs.push({ from: token.map[0], to: token.map[1], content: token.content, children: token.children || [] });
    }
    if (token.nesting === -1) stack.pop();
  }
  return { source, lines, tokens, paragraphs, quotes };
}

function validLabelMarkup(source, expected) {
  const token = parsePrayerMarkdown(source, PRAYER_TEXT_FORMAT).find(token => token.type === 'inline');
  return token && inlineText(token.children || []) === expected
    && token.children.every(child => ['text', 'em_open', 'em_close', 'strong_open', 'strong_close'].includes(child.type));
}

function namedAttribution(line) {
  return /^([*_]{0,6})[КСНДЛЦ]\.[ \t]+\p{Lu}[\p{Ll}\p{M}-]+(?:[ \t]+\p{Lu}[\p{Ll}\p{M}-]+)*:\1(?:\s|$)/u.test(line)
    && !/^[*_]*[КСНДЛЦ]\.[ \t]+(?:Молімся|Памолімся):/u.test(line);
}

/** Returns source positions, display projection and a separate canonical edit. No Latin lookalike aliases. */
export function legacySpeakerLine(line, { paragraph = null } = {}) {
  if (namedAttribution(line)) return null;
  const label = /^( {0,3})([*_]{0,6})([КСНДЛЦVR]\.:?|Усе:|Цэлебрант:)([*_]{0,6})(:)?(?=[ \t]+|$)/u.exec(line);
  if (label && !(label[3].endsWith(':') && label[5])) {
    const visible = label[3] + (label[5] || '');
    const raw = label[0].slice(label[1].length);
    if (validLabelMarkup(raw, visible)) {
      const body = line.slice(label[0].length).trimStart();
      const prefix = body ? prayerSpeakerPrefix(visible + ' ' + body) : null;
      if (body && !prefix) return null;
      return {
        label: visible, canonicalLabel: label[3].replace(/\.:$/, '.'), role: prefix?.role,
        fullLabel: /^(?:Усе|Цэлебрант):/.test(label[3]),
        kind: label[2] ? 'wrapped-label' : 'bare', standalone: !body,
        labelFrom: label[1].length + label[2].length,
        labelTo: label[5] ? label[0].length : label[1].length + label[2].length + label[3].length,
        display: label[1] + visible + line.slice(label[0].length),
        canonical: label[1] + label[3].replace(/\.:$/, '.') + line.slice(label[0].length),
      };
    }
  }
  const whole = /^( {0,3})(\*\*|__|\*|_)([КСНДЛЦVR]\.:?|Усе:|Цэлебрант:)([ \t]+)(.+)\2[ \t]*$/u.exec(line);
  if (!whole && paragraph?.content.includes('\n')) {
    const partial = /^( {0,3})(\*\*|__|\*|_)([КСНДЛЦVR]\.:?|Усе:|Цэлебрант:)([ \t]+)(\S.*)$/u.exec(line);
    const children = paragraph.children.filter(child => child.type !== 'text' || child.content);
    if (partial && paragraph.content.trimStart().startsWith(line.trimStart()) && paragraph.content.trimEnd().endsWith(partial[2])
      && /[.!?;:,…]$/.test(paragraph.content.trimEnd().slice(0, -partial[2].length))
      && ['strong_open', 'em_open'].includes(children[0]?.type) && children.at(-1)?.nesting === -1
      && prayerSpeakerPrefix(partial[3] + ' ' + partial[5])) {
      return { label: partial[3], canonicalLabel: partial[3].replace(/\.:$/, '.'), fullLabel: /^(?:Усе|Цэлебрант):/.test(partial[3]),
        role: prayerSpeakerPrefix(partial[3] + ' ' + partial[5]).role, kind: 'whole-line-emphasis', standalone: false,
        labelFrom: partial[1].length + partial[2].length, labelTo: partial[1].length + partial[2].length + partial[3].length,
        display: partial[1] + partial[3] + partial[4] + partial[2] + partial[5],
        canonical: partial[1] + partial[3].replace(/\.:$/, '.') + partial[4] + partial[2] + partial[5] };
    }
  }
  if (!whole || !/[.!?;:,…]$/.test(whole[5]) || !prayerSpeakerPrefix(whole[3] + ' ' + whole[5])) return null;
  const parsed = parsePrayerMarkdown(line, PRAYER_TEXT_FORMAT).find(token => token.type === 'inline');
  if (!parsed || !['strong_open', 'em_open'].includes(parsed.children.find(child => child.type !== 'text' || child.content)?.type)) return null;
  return {
    label: whole[3], canonicalLabel: whole[3].replace(/\.:$/, '.'), fullLabel: /^(?:Усе|Цэлебрант):/.test(whole[3]),
    role: prayerSpeakerPrefix(whole[3] + ' ' + whole[5]).role, kind: 'whole-line-emphasis', standalone: false,
    labelFrom: whole[1].length + whole[2].length, labelTo: whole[1].length + whole[2].length + whole[3].length,
    display: whole[1] + whole[3] + whole[4] + whole[2] + whole[5] + whole[2],
    canonical: whole[1] + whole[3].replace(/\.:$/, '.') + whole[4] + whole[2] + whole[5] + whole[2],
  };
}

export function collectLegacyPrayerSpeakers(value = '') {
  const structure = prayerLegacyStructure(value);
  const candidates = [];
  const offsets = [];
  let offset = 0;
  for (const line of structure.lines) { offsets.push(offset); offset += line.length + 1; }
  for (const paragraph of structure.paragraphs) {
    for (let index = paragraph.from; index < paragraph.to; index += 1) {
      const speaker = legacySpeakerLine(structure.lines[index], { paragraph });
      if (!speaker) continue;
      // Prefixes inside inline code/links are rejected by the markup validator.
      candidates.push({ ...speaker, line: index + 1, index, paragraph, from: offsets[index] + speaker.labelFrom, to: offsets[index] + speaker.labelTo });
    }
  }
  for (const speaker of candidates.filter(speaker => speaker.standalone)) {
    const body = structure.lines[speaker.index + 1];
    const parsed = body && prayerSpeakerPrefix(speaker.label + ' ' + body);
    const neighbour = candidates.some(other => other !== speaker && other.canonicalLabel !== speaker.canonicalLabel
      && other.paragraph === speaker.paragraph && Math.abs(other.index - speaker.index) <= 8);
    const ordinaryBody = body && !/^\s*(?:[>#`~]|:::|[-+*]\s|\d+[.)]\s)/.test(body) && !legacySpeakerLine(body);
    speaker.confirmed = Boolean(parsed && neighbour && ordinaryBody && speaker.index + 1 < speaker.paragraph.to);
    speaker.role = parsed?.role;
  }
  return candidates.filter(speaker => !speaker.standalone || speaker.confirmed);
}

/** Read compatibility: preserve visible punctuation and body emphasis, never change the stored string. */
export function explicitPrayerDirectionLines(value = '') {
  const structure = prayerLegacyStructure(value);
  return structure.paragraphs.filter(paragraph => paragraph.to - paragraph.from === 1 && EXACT_DIRECTIONS.has(inlineText(paragraph.children).trim()))
    .map(paragraph => paragraph.from + 1);
}

export function projectLegacyPrayerSpeakers(value = '') {
  const structure = prayerLegacyStructure(value);
  for (const speaker of collectLegacyPrayerSpeakers(structure.source)) {
    structure.lines[speaker.index] = speaker.display;
  }
  for (const paragraph of structure.paragraphs) {
    if (paragraph.to - paragraph.from === 1 && EXACT_DIRECTIONS.has(inlineText(paragraph.children).trim())) {
      structure.lines[paragraph.from] = ':::rubric\n' + structure.lines[paragraph.from] + '\n:::';
    }
  }
  return structure.lines.join('\n');
}

export function prayerContentEvidence(value = '') {
  const structure = prayerLegacyStructure(value);
  const plain = prayerMarkdownToPlainText(value, PRAYER_TEXT_FORMAT);
  const links = [];
  for (const token of structure.tokens) {
    for (const child of token.children || []) {
      if (['link_open', 'image'].includes(child.type)) links.push({ type: child.type, attrs: child.attrs, alt: child.type === 'image' ? child.content : undefined });
    }
  }
  return {
    words: plain.match(/[\p{L}\p{N}]+/gu) || [],
    punctuation: plain.replace(/(^|\n)(\s*[КСНДЛЦVR]\.):(?=\s|$)/gu, '$1$2').replace(/\s+/g, ' ').trim(),
    links,
    headings: structure.tokens.flatMap((token, index) => token.type === 'heading_open'
      ? [{ level: token.tag, text: inlineText(structure.tokens[index + 1]?.children || []) }] : []),
    quotes: structure.tokens.filter(token => token.type === 'blockquote_open').length,
  };
}

export function verifyPrayerNormalization(before, after) {
  const original = prayerContentEvidence(before);
  const result = prayerContentEvidence(after);
  const failures = [];
  for (const key of ['words', 'punctuation', 'links', 'headings', 'quotes']) {
    if (JSON.stringify(original[key]) !== JSON.stringify(result[key])) failures.push(key + '-changed');
  }
  if (validatePrayerMarkdown(after).length) failures.push('invalid-rubrics');
  return { passed: failures.length === 0, failures };
}

/** Automatic rules only. Assisted edits are independent proposals, not fed into the automatic output. */
export function normalizePrayerLegacyMarkdown(value = '', { rules = AUTOMATIC_PRAYER_RULES } = {}) {
  const original = String(value);
  const enabled = new Set(rules);
  for (const rule of enabled) if (!AUTOMATIC_PRAYER_RULES.includes(rule)) throw new Error('Unknown automatic rule: ' + rule);
  if (!enabled.has('line-endings') && /\r|^\uFEFF/.test(original)) {
    return { markdown: original, changed: false, operations: [], assisted: [{ group: 'line-ending-prerequisite', confidence: 1 }], manual: [], preservation: { passed: true, failures: [] } };
  }
  const source = enabled.has('line-endings') ? original.replace(/^\uFEFF+/, '').replace(/\r\n?/g, '\n') : original;
  const structure = prayerLegacyStructure(source);
  const speakers = collectLegacyPrayerSpeakers(source);
  const lines = [...structure.lines];
  const operations = [];
  const assisted = [];
  const manual = [];
  if (source !== original) operations.push({ rule: 'line-endings', confidence: 1 });
  const handled = new Set();
  const hasRomanSections = structure.lines.some(line => /^(?:\*\*|__)[IVXLCDM]+\.\s+[^.!?:]+(?:\*\*|__)$/.test(line) && !/^(?:\*\*|__)V\./.test(line));
  for (const speaker of speakers) {
    if (speaker.standalone && enabled.has('speaker-line-break')) {
      lines[speaker.index] = speaker.canonicalLabel + ' ' + structure.lines[speaker.index + 1].trimStart();
      lines[speaker.index + 1] = null;
      handled.add(speaker.index);
      operations.push({ rule: 'speaker-line-break', line: speaker.line, confidence: 1 });
    } else {
      const rule = speaker.kind === 'whole-line-emphasis' ? 'speaker-line-emphasis' : 'speaker-label';
      if (enabled.has(rule) && lines[speaker.index] !== speaker.canonical) {
        lines[speaker.index] = speaker.canonical;
        operations.push({ rule, line: speaker.line, confidence: 1 });
      }
      handled.add(speaker.index);
    }
  }
  for (const paragraph of structure.paragraphs) {
    const visible = inlineText(paragraph.children).trim();
    if (paragraph.to - paragraph.from === 1 && EXACT_DIRECTIONS.has(visible)) {
      if (enabled.has('explicit-direction')) {
        // Keep authored emphasis and words inside the rubric; do not strip it.
        lines[paragraph.from] = ':::rubric\n' + lines[paragraph.from] + '\n:::';
        operations.push({ rule: 'explicit-direction', line: paragraph.from + 1, confidence: 1 });
      }
    } else if (/^(?:Святар|Цэлебрант|Дыякан|Лектар|Кантар|Народ|Усе)(?:\s|,)/u.test(visible)
      && /(?:каж[ае]|гаворыць|адказвае|спявае|акрап|кленч|ўста|садзяц|чытае|моляцца)/u.test(visible)
      && !/[«»“”"]/.test(visible) && !paragraph.children.some(child => ['link_open', 'code_inline'].includes(child.type))) {
      assisted.push({ group: 'direction-paragraph', line: paragraph.from + 1, confidence: 0.9,
        fromLine: paragraph.from, toLine: paragraph.to, replacement: ':::rubric\n' + paragraph.content + '\n:::' });
    }
    for (let index = paragraph.from; index < paragraph.to; index += 1) {
      const line = structure.lines[index];
      if (handled.has(index)) continue;
      if (namedAttribution(line) || (hasRomanSections && /^(?:\*\*|__)V\.\s+[^.!?:]+(?:\*\*|__)$/.test(line))) continue;
      // Corpus-confirmed malformed import shape. The first '*' is literal in the AST;
      // correcting intent requires group approval, so it never enters automatic output.
      const joined = /^\*([КСНДЛЦVR]\.:?)[ \t]+(.+[,.!?])\*\*(Усе:)[ \t]+(.+[.!?])\*$/.exec(line);
      const parsedLine = parsePrayerMarkdown(line, PRAYER_TEXT_FORMAT).find(token => token.type === 'inline');
      if (joined && parsedLine?.children[0]?.type === 'text' && parsedLine.children[0].content.startsWith('*' + joined[1])
        && parsedLine.children.some(child => child.type === 'em_open')) {
        assisted.push({ group: 'joined-dialogue-import', line: index + 1, confidence: 0.95, fromLine: index, toLine: index + 1, speakerCount: 2,
          replacement: joined[1].replace(/\.:$/, '.') + ' _' + joined[2] + '_\n' + joined[3] + ' _' + joined[4] + '_',
          reason: 'Two explicit roles joined by malformed emphasis. Review the proposed line break and italic first utterance.' });
        continue;
      }
      const candidate = legacySpeakerLine(line);
      if (candidate?.standalone) assisted.push({ group: 'standalone-speaker', line: index + 1, confidence: 0.9, reason: 'No confirmed dialogue in the same paragraph.' });
      else if (/^\s*(?:[*_]{0,6})[CKHNP]\./u.test(line)) manual.push({ line: index + 1, reason: 'ambiguous-alphabet-or-initial' });
      else if (/^\s*(?:[*_]{0,6})[КСНДЛЦVR]\./u.test(line) && !candidate) {
        // Roman section numbers and initials are deliberately left unchanged.
        manual.push({ line: index + 1, reason: 'ambiguous-speaker-or-heading' });
      }
    }
  }
  const rubricErrors = validatePrayerMarkdown(original);
  if (rubricErrors.length) manual.push(...rubricErrors.map(error => ({ line: error.line, reason: 'invalid-rubrics' })));
  const candidate = lines.filter(line => line !== null).join('\n');
  const preservation = verifyPrayerNormalization(original, candidate);
  if (!preservation.passed) {
    manual.push({ reason: 'preservation-check-failed', failures: preservation.failures });
    return { markdown: original, changed: false, operations: [], assisted, manual, preservation, preservedQuotes: structure.quotes.length };
  }
  return { markdown: candidate, changed: candidate !== original, operations, assisted, manual, preservation, preservedQuotes: structure.quotes.length };
}

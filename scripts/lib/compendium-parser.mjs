// Deterministic parser for the Belarusian Compendium of the Catechism of the
// Catholic Church published on Catholic.by. Input: raw HTML of the index page
// and the four part pages. Output: the canonical dataset described in
// docs/compendium.md. No network, no clock: the same HTML always yields the
// same JSON.
import { createHash } from 'node:crypto';
import { scanLines, decodeEntities } from './compendium-html.mjs';

export const COMPENDIUM_SCHEMA_VERSION = 1;
export const COMPENDIUM_SOURCE_URL = 'https://catholic.by/3/lib/documents/kasciol/3963-kampendyj-katekhizisa-katalitskaga-kastsjola';
export const COMPENDIUM_SOURCE_ORIGIN = 'https://catholic.by';
export const COMPENDIUM_SOURCE_TITLE = 'Кампендый Катэхізіса Каталіцкага Касцёла';
export const COMPENDIUM_SOURCE_HOST = 'Catholic.by';
export const COMPENDIUM_QUESTION_COUNT = 598;

const ORDINALS = new Map([
  ['ПЕРШАЯ', 1], ['ПЕРШЫ', 1], ['ДРУГАЯ', 2], ['ДРУГІ', 2], ['ТРЭЦЯЯ', 3], ['ТРЭЦІ', 3],
  ['ЧАЦВЁРТАЯ', 4], ['ЧАЦВЕРТАЯ', 4], ['ЧАЦВЁРТЫ', 4],
]);
const LABEL_LINE = /^(ЧАСТКА|РАЗДЗЕЛ|ГЛАВА)\s+(\S+)$/u;
const REF_LINE = /^\d+(?:\s*[-–]\s*\d+)?(?:\s*,\s*\d+(?:\s*[-–]\s*\d+)?)*$/u;
const QUESTION_LINE = /^(\d{1,3})\.\s+(.+)$/u;
const ATTRIBUTION = /^(.*\S)\s*(\([^()]+\))\.?$/u;

// Latin letters that the source sometimes uses instead of Cyrillic lookalikes.
const LOOKALIKES = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', I: 'І', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У' };

/** Comparison key for headings (TOC vs body): case, lookalikes, dashes, spacing. */
export function headingKey(text) {
  return text
    .toUpperCase()
    .replace(/[ABCEHIKMOPTXY]/g, (letter) => LOOKALIKES[letter])
    .replace(/[–—-]/g, '—')
    .replace(/[’'ʼ]/g, '’')
    .replace(/\s*—\s*/g, ' — ')
    .replace(/\s+/g, ' ')
    .replace(/[\s:.]+$/u, '')
    .trim();
}

function ordinal(word) {
  const value = ORDINALS.get(headingKey(word));
  if (!value) throw new Error(`Unknown ordinal: ${word}`);
  return value;
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function articleHtml(html) {
  const start = html.search(/<div[^>]*itemprop="articleBody"[^>]*>/);
  if (start < 0) throw new Error('Article body not found in source page.');
  const end = html.indexOf('<div class="clr"></div>', start);
  if (end < 0) throw new Error('Article end marker not found in source page.');
  return html.slice(start, end);
}

/** Parse the index page: part links (official order) and copyright notices. */
export function parseIndexPage(html) {
  const article = articleHtml(html);
  const parts = [];
  const linkPattern = /<a\s+href="(\/3\/lib\/documents\/kasciol\/(\d+)-[^"]+)"\s*>([\s\S]*?)<\/a>/g;
  let match;
  while ((match = linkPattern.exec(article))) {
    const text = decodeEntities(match[3].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    const partMatch = text.match(/^(ЧАСТКА\s+(\S+))\s*[-–—]\s*(.+)$/u);
    if (!partMatch) continue;
    parts.push({
      number: ordinal(partMatch[2]),
      label: partMatch[1],
      title: partMatch[3],
      sourceUrl: `${COMPENDIUM_SOURCE_ORIGIN}${match[1]}`,
      sourcePageId: match[2],
    });
  }
  if (parts.map((part) => part.number).join(',') !== '1,2,3,4') {
    throw new Error(`Expected four parts in the index page, found: ${parts.map((part) => part.label).join(', ')}`);
  }
  const copyright = scanLines(article).map((line) => line.text).filter((text) => text.startsWith('©'));
  if (!copyright.length) throw new Error('Copyright notice not found in the index page.');
  return { parts, copyright };
}

/** Table of contents of a part page: every heading that the page links to. */
export function parseTableOfContents(article) {
  const entries = [];
  const pattern = /<a\s[^>]*href="#([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let match;
  while ((match = pattern.exec(article))) {
    const before = article.slice(0, match.index);
    const inBlockquote = before.lastIndexOf('<blockquote') > before.lastIndexOf('</blockquote>');
    const openItalic = Math.max(before.lastIndexOf('<i>'), before.lastIndexOf('<em>'));
    const closeItalic = Math.max(before.lastIndexOf('</i>'), before.lastIndexOf('</em>'));
    const text = decodeEntities(match[2].replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    if (!text) continue;
    entries.push({ anchor: match[1], text, inBlockquote, italic: openItalic > closeItalic || /<(i|em)>/.test(match[2]) });
  }
  return entries;
}

function classifyTocEntry(entry) {
  const label = entry.text.match(/^(РАЗДЗЕЛ|ГЛАВА)\s+(\S+?)(?::|\s|$)\s*(.*)$/iu);
  if (label) return { kind: label[1].toUpperCase() === 'РАЗДЗЕЛ' ? 'section' : 'chapter', title: label[3] };
  if (!entry.inBlockquote) return { kind: 'intro', title: entry.text };
  return { kind: entry.italic ? 'subtopic' : 'topic', title: entry.text };
}

function segmentsText(segments) {
  return segments.map((segment) => segment.text).join('');
}

function isQuestionLine(line) {
  return line.segments[0]?.bold && QUESTION_LINE.test(line.text);
}

function isCitationLine(line) {
  const match = line.text.match(ATTRIBUTION);
  if (!match || !line.segments[0]?.italic) return false;
  // Everything before the "(attribution)" must be italic.
  let consumed = 0;
  for (const segment of line.segments) {
    if (consumed >= match[1].length) break;
    if (!segment.italic && segment.text.trim() && consumed + segment.text.length <= match[1].length + 1) return false;
    consumed += segment.text.length;
  }
  return true;
}

function parseRefs(lines) {
  return lines.flatMap((text) => text.split(',').map((ref) => ref.replace(/\s*[-–]\s*/g, '-').trim()).filter(Boolean));
}

/** Plain text + emphasis ranges for a group of answer lines. */
function composeRichText(lines) {
  let text = '';
  const emphasis = [];
  lines.forEach((line, index) => {
    if (index > 0) text += line.blankBefore ? '\n\n' : '\n';
    for (const segment of line.segments) {
      const start = text.length;
      text += segment.text;
      const style = segment.italic ? 'italic' : segment.bold ? 'bold' : null;
      const trimmedStart = start + (segment.text.length - segment.text.trimStart().length);
      const trimmedEnd = start + segment.text.trimEnd().length;
      if (!style || trimmedEnd <= trimmedStart) continue;
      const previous = emphasis[emphasis.length - 1];
      if (previous && previous.style === style && /^\s*$/.test(text.slice(previous.end, trimmedStart))) previous.end = trimmedEnd;
      else emphasis.push({ start: trimmedStart, end: trimmedEnd, style });
    }
  });
  return { text, emphasis };
}

/**
 * Parse one part page. Returns ordered heading/question/citation events and
 * the list of unnumbered interstitial blocks that were intentionally skipped.
 */
export function parsePartPage(html, part) {
  const article = articleHtml(html);
  const toc = parseTableOfContents(article);
  // TOC links are removed from the body before scanning so that they are not
  // mistaken for headings; anchors (<a name>) disappear with the other tags.
  const body = article.replace(/<a\s[^>]*href="#[^"]*"[^>]*>[\s\S]*?<\/a>/g, '');
  const lines = scanLines(body);

  const topicKeys = new Map();
  for (const entry of toc) {
    const classified = classifyTocEntry(entry);
    if (classified.kind === 'section' || classified.kind === 'chapter') continue;
    const key = headingKey(classified.title);
    if (!topicKeys.has(key)) topicKeys.set(key, { ...classified, tocText: entry.text });
  }
  const matchedTopics = new Set();

  const events = [];
  const skipped = [];
  let state = 'heading';
  let question = null;
  let pendingRefs = [];
  let answerLines = [];
  let skipBlock = null;

  const closeQuestion = () => {
    if (!question) return;
    const { text, emphasis } = composeRichText(answerLines);
    if (!text.trim()) throw new Error(`Question ${question.number} has no answer.`);
    question.answer = text;
    if (emphasis.length) question.answerEmphasis = emphasis;
    events.push(question);
    question = null;
    answerLines = [];
  };
  const closeSkip = () => {
    if (skipBlock?.lines.length) skipped.push({ afterEvent: events.length, text: skipBlock.lines.join('\n') });
    skipBlock = null;
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];

    const label = line.text.match(LABEL_LINE);
    if (label && !isQuestionLine(line)) {
      const kind = { ЧАСТКА: 'part', РАЗДЗЕЛ: 'section', ГЛАВА: 'chapter' }[label[1]];
      const titleLines = [];
      while (lines[index + 1] && !lines[index + 1].blankBefore && !isQuestionLine(lines[index + 1])
        && !REF_LINE.test(lines[index + 1].text) && !LABEL_LINE.test(lines[index + 1].text)) {
        titleLines.push(lines[++index].text);
      }
      // Part 3, section II, chapter I: the chapter title follows after a blank line.
      if (!titleLines.length && lines[index + 1] && !isQuestionLine(lines[index + 1])) {
        titleLines.push(lines[++index].text);
        while (lines[index + 1] && !lines[index + 1].blankBefore && !isQuestionLine(lines[index + 1])
          && !REF_LINE.test(lines[index + 1].text) && !LABEL_LINE.test(lines[index + 1].text)) {
          titleLines.push(lines[++index].text);
        }
      }
      closeQuestion();
      closeSkip();
      if (pendingRefs.length) throw new Error(`Unattached references before a heading in part ${part.number}: ${pendingRefs.join(' ')}`);
      if (kind !== 'part') events.push({ type: kind, number: ordinal(label[2]), label: `${label[1]} ${label[2]}`, title: titleLines.join(' ') });
      state = 'heading';
      continue;
    }

    // Topic headings: the longest run of adjacent lines whose text matches a TOC entry.
    let topicMatch = null;
    if (!isQuestionLine(line) && !REF_LINE.test(line.text)) {
      let joined = '';
      for (let span = 0; span < 4 && lines[index + span]; span++) {
        if (span > 0 && lines[index + span].blankBefore) break;
        joined = span ? `${joined} ${lines[index + span].text}` : lines[index + span].text;
        const key = headingKey(joined);
        if (topicKeys.has(key) && !matchedTopics.has(key)) topicMatch = { key, span, text: joined };
      }
    }
    if (topicMatch) {
      closeQuestion();
      closeSkip();
      if (pendingRefs.length) throw new Error(`Unattached references before a heading in part ${part.number}: ${pendingRefs.join(' ')}`);
      matchedTopics.add(topicMatch.key);
      const entry = topicKeys.get(topicMatch.key);
      events.push({ type: entry.kind, title: topicMatch.text });
      index += topicMatch.span;
      state = 'heading';
      continue;
    }

    if (isQuestionLine(line)) {
      closeQuestion();
      closeSkip();
      const [, number, text] = line.text.match(QUESTION_LINE);
      let questionText = text;
      // A bold question can wrap onto the next line in a few places.
      while (lines[index + 1] && !lines[index + 1].blankBefore && lines[index + 1].segments.every((segment) => segment.bold)
        && !isQuestionLine(lines[index + 1]) && !REF_LINE.test(lines[index + 1].text)) {
        questionText += ` ${lines[++index].text}`;
      }
      question = { type: 'question', number: Number(number), question: questionText.trim(), cccRefs: [] };
      if (pendingRefs.length) throw new Error(`Unattached references before question ${number}: ${pendingRefs.join(' ')}`);
      state = 'refs';
      continue;
    }

    if (REF_LINE.test(line.text)) {
      if (state === 'refs') { question.cccRefs.push(...parseRefs([line.text])); continue; }
      // CCC references printed in front of a citation (the quotation follows).
      let next = index + 1;
      while (lines[next] && REF_LINE.test(lines[next].text)) next++;
      if (lines[next] && isCitationLine(lines[next])) {
        closeQuestion();
        closeSkip();
        pendingRefs.push(line.text);
        state = 'citation-refs';
        continue;
      }
    }

    if (isCitationLine(line) && (state !== 'refs')) {
      closeQuestion();
      closeSkip();
      events.push({ type: 'citation', text: line.text, cccRefs: parseRefs(pendingRefs) });
      pendingRefs = [];
      state = 'after-citation';
      continue;
    }

    if (state === 'refs' || state === 'answer') {
      answerLines.push(line);
      state = 'answer';
      continue;
    }

    // Unnumbered text between a heading and the next question (creeds, the
    // Decalogue tables, the Lord's Prayer, the list of the seven sacraments).
    if (!skipBlock) skipBlock = { lines: [] };
    skipBlock.lines.push(segmentsText(line.segments).trim());
  }
  closeQuestion();
  closeSkip();

  const structuralKeys = new Set(events.filter((event) => event.type === 'section' || event.type === 'chapter').map((event) => headingKey(event.title)));
  const missingTopics = [...topicKeys.keys()]
    .filter((key) => !matchedTopics.has(key) && !structuralKeys.has(key))
    .map((key) => topicKeys.get(key).tocText);
  return { part, events, skipped, toc, missingTopics };
}

function pad(number) {
  return String(number).padStart(3, '0');
}

/** Build the canonical dataset from parsed parts. */
export function buildCompendium({ index, parts: parsedParts, previous = null }) {
  const units = [];
  const parts = [];
  const skippedBlocks = [];
  const unmatchedTocEntries = [];
  let questionOrder = 0;

  for (const parsed of parsedParts) {
    const { part } = parsed;
    const partId = `p${part.number}`;
    const partNode = { id: partId, number: part.number, label: part.label, title: part.title, sourceUrl: part.sourceUrl, sections: [] };
    parts.push(partNode);
    parsed.missingTopics.forEach((title) => unmatchedTocEntries.push({ part: part.number, title }));
    parsed.skipped.forEach((block) => skippedBlocks.push({ part: part.number, text: block.text }));

    let section = null;
    let chapter = null;
    let unit = null;
    let topic = null;
    let subtopicTitle = null;
    let lastQuestion = null;
    let pendingLeadCitations = [];

    const openUnit = () => {
      const chapterNumber = chapter?.number ?? null;
      const id = `${partId}-s${section?.number ?? 0}-${chapterNumber ? `ch${chapterNumber}` : 'intro'}`;
      unit = {
        id,
        order: units.length + 1,
        partId,
        partNumber: part.number,
        partLabel: part.label,
        partTitle: part.title,
        sectionNumber: section?.number ?? null,
        sectionLabel: section?.label ?? null,
        sectionTitle: section?.title ?? null,
        chapterNumber,
        chapterLabel: chapter?.label ?? null,
        chapterTitle: chapter?.title ?? null,
        title: chapter?.title ?? section?.title ?? part.title,
        firstQuestion: null,
        lastQuestion: null,
        leadCitations: [],
        topics: [],
        questions: [],
      };
      units.push(unit);
      return unit;
    };
    const ensureUnit = () => unit || openUnit();
    const startTopic = (title, italic) => {
      const target = ensureUnit();
      topic = { id: `${target.id}-t${target.topics.length + 1}`, order: target.topics.length + 1, title, italic: Boolean(italic), firstQuestion: null, lastQuestion: null, leadCitations: [] };
      target.topics.push(topic);
      subtopicTitle = null;
      lastQuestion = null;
    };

    for (const event of parsed.events) {
      if (event.type === 'section') {
        section = { number: event.number, label: event.label, title: event.title, id: `${partId}-s${event.number}` };
        partNode.sections.push({ id: section.id, number: section.number, label: section.label, title: section.title, chapters: [] });
        chapter = null; unit = null; topic = null; subtopicTitle = null; lastQuestion = null;
      } else if (event.type === 'chapter') {
        chapter = { number: event.number, label: event.label, title: event.title };
        const sectionNode = partNode.sections[partNode.sections.length - 1];
        if (!sectionNode) throw new Error(`Chapter before section in part ${part.number}.`);
        sectionNode.chapters.push({ id: `${partId}-s${section.number}-ch${chapter.number}`, number: chapter.number, label: chapter.label, title: chapter.title });
        unit = null; topic = null; subtopicTitle = null; lastQuestion = null;
      } else if (event.type === 'topic' || event.type === 'intro') {
        startTopic(event.title, false);
      } else if (event.type === 'subtopic') {
        // Italic TOC entries nest under the current article when there is one.
        if (topic && !topic.italic) { subtopicTitle = event.title; lastQuestion = null; }
        else startTopic(event.title, true);
      } else if (event.type === 'citation') {
        const citation = { text: event.text, cccRefs: event.cccRefs };
        if (lastQuestion) (lastQuestion.citations ||= []).push(citation);
        else pendingLeadCitations.push(citation);
      } else if (event.type === 'question') {
        const target = ensureUnit();
        if (pendingLeadCitations.length) {
          (topic || target).leadCitations.push(...pendingLeadCitations);
          pendingLeadCitations = [];
        }
        questionOrder += 1;
        const item = {
          id: `q${pad(event.number)}`,
          number: event.number,
          order: questionOrder,
          question: event.question,
          answer: event.answer,
          cccRefs: event.cccRefs,
          topicId: topic?.id ?? null,
          topicTitle: topic?.title ?? null,
          subtopicTitle,
        };
        if (event.answerEmphasis) item.answerEmphasis = event.answerEmphasis;
        target.questions.push(item);
        target.firstQuestion ??= item.number;
        target.lastQuestion = item.number;
        if (topic) { topic.firstQuestion ??= item.number; topic.lastQuestion = item.number; }
        lastQuestion = item;
      }
    }
    if (pendingLeadCitations.length) throw new Error(`Dangling citation at the end of part ${part.number}.`);
  }

  // Headings that only introduce unnumbered text (e.g. "ОЙЧА НАШ" followed by
  // the prayer itself) carry no questions; they are not part of the dataset.
  for (const unit of units) {
    const emptyTopics = unit.topics.filter((topic) => topic.firstQuestion === null);
    if (emptyTopics.some((topic) => topic.leadCitations.length)) throw new Error(`Citation under an empty topic in ${unit.id}.`);
    // An empty heading directly followed by further headings (e.g. "ЦЭЛЕБРАЦЫЯ
    // ЛІТУРГІІ КАСЦЁЛА" before "Хто цэлебруе?") is kept as the next topic's parentTitle.
    let parentTitle = null;
    const kept = [];
    for (const topic of unit.topics) {
      if (topic.firstQuestion === null) { parentTitle = topic.title; continue; }
      kept.push(parentTitle ? { ...topic, parentTitle } : topic);
      parentTitle = null;
    }
    if (parentTitle) throw new Error(`Empty heading at the end of ${unit.id}: ${parentTitle}`);
    const renamed = new Map();
    unit.topics = kept.map((topic, index) => {
      const id = `${unit.id}-t${index + 1}`;
      renamed.set(topic.id, id);
      return { ...topic, id, order: index + 1 };
    });
    for (const question of unit.questions) {
      if (question.topicId) question.topicId = renamed.get(question.topicId);
    }
    for (const topic of unit.topics) {
      if (!topic.leadCitations.length) delete topic.leadCitations;
      delete topic.italic;
    }
    if (!unit.leadCitations.length) delete unit.leadCitations;
  }
  const nonEmptyUnits = units.filter((unit) => unit.questions.length);
  nonEmptyUnits.forEach((unit, index) => { unit.order = index + 1; });
  const unitIds = new Set(nonEmptyUnits.map((unit) => unit.id));
  for (const part of parts) {
    for (const section of part.sections) {
      section.chapters = section.chapters.filter((chapter) => unitIds.has(chapter.id));
    }
  }

  const content = { parts, units: nonEmptyUnits };
  const checksum = sha256(JSON.stringify(content));
  const previousMeta = previous?.meta;
  const unchanged = previousMeta?.checksum === checksum;
  const contentVersion = unchanged ? previousMeta.contentVersion : (previousMeta?.contentVersion ?? 0) + 1;
  const meta = {
    id: 'compendium',
    title: COMPENDIUM_SOURCE_TITLE,
    language: 'be',
    schemaVersion: COMPENDIUM_SCHEMA_VERSION,
    contentVersion,
    questionCount: nonEmptyUnits.reduce((sum, unit) => sum + unit.questions.length, 0),
    unitCount: nonEmptyUnits.length,
    unitIds: nonEmptyUnits.map((unit) => unit.id),
    sourceTitle: COMPENDIUM_SOURCE_TITLE,
    sourceUrl: COMPENDIUM_SOURCE_URL,
    sourceHost: COMPENDIUM_SOURCE_HOST,
    sourcePages: parts.map((part) => part.sourceUrl),
    copyright: index.copyright,
    checksum,
    updatedAt: unchanged ? previousMeta.updatedAt : null,
  };
  return { dataset: { meta, ...content }, report: { skippedBlocks, unmatchedTocEntries } };
}

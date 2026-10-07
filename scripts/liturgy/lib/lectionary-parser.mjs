/**
 * Catholic.by Lectionary page parser.
 *
 * Not «regex over the page»: the article body is tokenized into visual lines
 * that keep their typography (bold / italic / alignment / paragraph), and a
 * small state machine reads the Lectionary layout:
 *
 *   centred «Імша …» / «ПРАЦЭСІЯ …» line   → a new Mass reading set
 *   bold «ПЕРШАЕ ЧЫТАННЕ», «2 РЭСПАНСАРЫЙНЫ ПСАЛЬМ», «ЭПІСТАЛА», «СЕКВЕНЦЫЯ»,
 *   «СПЕЎ ПЕРАД ЕВАНГЕЛЛЕМ», «ЕВАНГЕЛЛЕ Ў ГОД А» → a section (cycle-specific)
 *   right-aligned line → citation; italic line → summary or rubric;
 *   bold «Чытанне …» → liturgical title; «Гэта слова …» → end of a reading;
 *   bold «Ев.», «Е.», «І.», «Л.» inside the Gospel → role-marked Passion.
 *
 * The result is validated semantically (`validateParsedPage`) before it may
 * be imported. Pure (no network): pages come from checked-in fixtures.
 */
import { parse } from 'node-html-parser';
import { PASSION_MARKER_ROLES } from '../../../src/utils/massReadingSets.js';

export const PARSER_ID = 'catholicby-lectionary@1';

/** The article body of a Catholic.by page (new site and old.catholic.by). */
export function extractArticleBody(html) {
  const root = parse(String(html || ''), { comment: false });
  const node = root.querySelector('[itemprop="articleBody"]')
    || root.querySelector('div.article')
    // old.catholic.by: the second `table.contentpaneopen` holds the text.
    || root.querySelectorAll('table.contentpaneopen').find((table) => /ЧЫТАННЕ|ЕВАНГЕЛЛЕ/u.test(table.text));
  return node ? node.innerHTML : '';
}

const BLOCK_TAGS = new Set(['p', 'div', 'table', 'tr', 'td', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'center']);
const SKIP_CLASSES = ['divider', 'article_seperator_news'];

function decodeEntities(text) {
  return String(text)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, '\'')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

/**
 * Linear stream of the page: one entry per visual line.
 * { text, segments: [{ text, b, i }], bold, italic, align, para, anchors }
 */
export function tokenizeLectionaryHtml(html) {
  const root = parse(String(html || ''), { comment: false });
  const lines = [];
  let segments = [];
  let anchors = [];
  let para = 0;
  let lineAlign = null;

  const flush = () => {
    const text = segments.map((segment) => segment.text).join('').replace(/\s+/g, ' ').trim();
    if (text) {
      const meaningful = segments.filter((segment) => segment.text.trim());
      lines.push({
        text,
        segments: meaningful.map((segment) => ({ ...segment, text: segment.text.replace(/\s+/g, ' ') })),
        bold: meaningful.every((segment) => segment.b),
        italic: meaningful.every((segment) => segment.i),
        align: lineAlign,
        para,
        anchors,
      });
      anchors = [];
    }
    segments = [];
    lineAlign = null;
  };
  const breakParagraph = () => {
    flush();
    para += 1;
  };

  const walk = (node, style) => {
    if (node.nodeType === 3) {
      const text = decodeEntities(node.rawText);
      if (text) {
        if (!segments.some((segment) => segment.text.trim()) && text.trim()) lineAlign = style.align;
        segments.push({ text, b: style.b, i: style.i });
      }
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = String(node.rawTagName || '').toLowerCase();
    const classes = String(node.getAttribute?.('class') || '').split(/\s+/);
    // A section divider («а» in a span) ends the line: a heading follows it.
    if (tag === 'span' && classes.some((name) => SKIP_CLASSES.includes(name))) { flush(); return; }
    if (tag === 'script' || tag === 'style') return;
    if (tag === 'br') { flush(); return; }
    if (tag === 'a' && node.getAttribute('id')) anchors.push(node.getAttribute('id'));
    if (tag === 'a' && node.getAttribute('name')) anchors.push(node.getAttribute('name'));
    const align = String(node.getAttribute?.('align') || '').toLowerCase()
      || (/text-align:\s*(center|right)/i.exec(node.getAttribute?.('style') || '')?.[1] || '').toLowerCase();
    const next = {
      b: style.b || tag === 'b' || tag === 'strong',
      i: style.i || tag === 'i' || tag === 'em',
      align: (tag === 'center' ? 'center' : align) || style.align,
    };
    const block = BLOCK_TAGS.has(tag);
    if (block) breakParagraph();
    node.childNodes.forEach((child) => walk(child, next));
    if (block) breakParagraph();
  };
  root.childNodes.forEach((child) => walk(child, { b: false, i: false, align: null }));
  flush();
  return lines;
}

// ── Page → structured sets ───────────────────────────────────────────────────

const ORDINALS = ['ПЕРШАЕ', 'ДРУГОЕ', 'ТРЭЦЯЕ', 'ЧАЦВЁРТАЕ', 'ПЯТАЕ', 'ШОСТАЕ', 'СЁМАЕ'];
const CYCLE_LETTERS = { А: 'A', A: 'A', В: 'B', B: 'B', С: 'C', C: 'C' };
const EMBEDDED_HEADING = /^(.*?\S)\s+((?:\d\s+)?РЭСПАНСАРЫЙНЫ ПСАЛЬМ|(?:ПЕРШАЕ|ДРУГОЕ) ЧЫТАННЕ|СПЕЎ ПЕРАД ЕВАНГЕЛЛЕМ|СЕКВЕНЦЫЯ|ЕВАНГЕЛЛЕ(?: Ў ГОД [АВСABC])?)$/u;
const CONCLUSION = /^Гэта слова (Божае|Пана)\.?$/u;
const FOOTER = /^Пераклад здзейснены/u;
const SITE_FOOTER = /^(Адноўлена|Абноўлена)\s+\d/u;
const READING_TITLE = /^\+?\s*(Чытанне|Пачатак|Заканчэнне|Мука Пана)/u;

/** Section heading of a line: { kind, role, cycle?, label } or null. */
export function headingOf(line) {
  const value = line.text.replace(/\s+/g, ' ').trim();
  if (!line.bold && !EMBEDDED_HEADING.test(`x ${value}`)) return null;
  const upper = value.toUpperCase();
  if (upper !== value) return null;
  const reading = new RegExp(`^(${ORDINALS.join('|')}) ЧЫТАННЕ$`, 'u').exec(value);
  if (reading) {
    const number = ORDINALS.indexOf(reading[1]) + 1;
    return { kind: 'reading', role: `reading${number}`, label: value };
  }
  if (value === 'ЭПІСТАЛА') return { kind: 'reading', role: 'epistle', label: value };
  const psalm = /^(?:(\d)\s+)?РЭСПАНСАРЫЙНЫ ПСАЛЬМ$/u.exec(value);
  if (psalm) return { kind: 'psalm', role: psalm[1] ? `psalm${psalm[1]}` : 'psalm', label: value };
  if (value === 'СПЕЎ ПЕРАД ЕВАНГЕЛЛЕМ') return { kind: 'acclamation', role: 'alleluia', label: value };
  if (value === 'СЕКВЕНЦЫЯ') return { kind: 'sequence', role: 'sequence', label: value };
  const gospel = /^ЕВАНГЕЛЛЕ(?: Ў ГОД ([АВСABC]))?$/u.exec(value);
  if (gospel) return { kind: 'gospel', role: 'gospel', label: value, ...(gospel[1] ? { cycle: CYCLE_LETTERS[gospel[1]] } : {}) };
  return null;
}

const isSetHeader = (line) => line.align === 'center' && /імша|працэсія/iu.test(line.text) && line.text.length < 80;
const isRight = (line) => line.align === 'right';
const isRefrainMarker = (line) => /^Рэфрэн:?$/u.test(line.text);
/** A rubric line: starts in italic, no plain text («Чытаецца калекта і гімн «Хвала…»» quotes the hymn in bold). */
const mostlyItalic = (line) => line.italic || (line.segments[0]?.i && line.segments.every((segment) => segment.i || segment.b));
const boldPrefix = (line) => (line.segments[0]?.b ? line.segments[0].text.trim() : '');

/** Split «Гэта слова Божае СПЕЎ ПЕРАД ЕВАНГЕЛЛЕМ» (a heading glued to a line). */
function splitEmbeddedHeadings(lines) {
  return lines.flatMap((line) => {
    if (line.bold) return [line];
    const match = EMBEDDED_HEADING.exec(line.text);
    if (!match) return [line];
    return [
      { ...line, text: match[1], segments: [{ text: match[1], b: false, i: false }] },
      { ...line, text: match[2], segments: [{ text: match[2], b: true, i: false }], bold: true, italic: false },
    ];
  });
}

/** Paragraph text: lines of one source paragraph joined by «\n», paragraphs by «\n\n». */
function paragraphsText(lines) {
  const paragraphs = [];
  let current = null;
  for (const line of lines) {
    if (!current || current.para !== line.para) {
      current = { para: line.para, lines: [] };
      paragraphs.push(current);
    }
    current.lines.push(line.text);
  }
  return paragraphs.map((paragraph) => paragraph.lines.join('\n')).join('\n\n');
}

function hasPassionMarkers(lines) {
  return lines.some((line) => line.segments.some((segment) => segment.b && PASSION_MARKER_ROLES[segment.text.trim()]));
}

/** Role-marked Passion: headings, rubrics and paragraphs of role runs. */
function parsePassion(lines) {
  const blocks = [];
  let role = 'narrator';
  let paragraph = null;
  for (const line of lines) {
    if (line.bold && line.italic) {
      blocks.push({ type: 'rubric', text: line.text });
      paragraph = null;
      continue;
    }
    if (line.italic) {
      blocks.push({ type: 'heading', text: line.text });
      paragraph = null;
      continue;
    }
    if (!paragraph || paragraph.para !== line.para) {
      paragraph = { type: 'paragraph', para: line.para, runs: [] };
      blocks.push(paragraph);
    } else if (paragraph.runs.length) {
      paragraph.runs[paragraph.runs.length - 1].text += '\n';
    }
    for (const segment of line.segments) {
      const marker = segment.b ? PASSION_MARKER_ROLES[segment.text.trim()] : null;
      if (marker) {
        role = marker;
        paragraph.runs.push({ role, text: '' });
        continue;
      }
      const last = paragraph.runs[paragraph.runs.length - 1];
      if (last && last.role === role) last.text += segment.text;
      else paragraph.runs.push({ role, text: segment.text });
    }
  }
  return {
    blocks: blocks.map((block) => (block.type === 'paragraph'
      ? { type: 'paragraph', runs: block.runs.map((run) => ({ role: run.role, text: run.text.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim() })).filter((run) => run.text) }
      : block)),
  };
}

function parseReadingLike(heading, lines, warnings) {
  const section = { kind: heading.kind, role: heading.role, label: heading.label, ...(heading.cycle ? { cycle: heading.cycle } : {}) };
  const body = [];
  const rubrics = [];
  let target = section;
  let conclusion = '';
  let afterConclusion = false;
  for (const line of lines) {
    if (afterConclusion) {
      rubrics.push(line.text);
      continue;
    }
    if (isRight(line)) {
      if (!target.bible) target.bible = line.text;
      else warnings.push(`${heading.label}: extra citation «${line.text}»`);
      continue;
    }
    if (/^або:?$/iu.test(line.text) || (boldPrefix(line) && /^або:?$/iu.test(boldPrefix(line)) && line.text.length < 8)) {
      target = { };
      (section.alternatives ||= []).push(target);
      target._body = [];
      continue;
    }
    const bucket = target === section ? body : target._body;
    if (!bucket.length && !target.title && line.italic && !target.comment) { target.comment = line.text; continue; }
    if (!bucket.length && line.bold && READING_TITLE.test(line.text) && !target.title) { target.title = line.text; continue; }
    if (CONCLUSION.test(line.text)) { conclusion = line.text.replace(/\.?$/, '.'); afterConclusion = true; continue; }
    if (/^Не гаворыцца/u.test(line.text)) { rubrics.push(line.text); continue; }
    bucket.push(line);
  }
  if (hasPassionMarkers(body)) {
    // Rubrics inside the Passion («Усе становяцца на калені…») keep their place.
    section.passion = parsePassion(body);
    section.text = '';
  } else {
    rubrics.unshift(...body.filter((line) => line.bold && line.italic).map((line) => line.text));
    section.text = paragraphsText(body.filter((line) => !(line.bold && line.italic)));
  }
  (section.alternatives || []).forEach((alternative) => {
    alternative.text = paragraphsText(alternative._body);
    delete alternative._body;
  });
  section.conclusion = conclusion;
  if (rubrics.length) section.rubrics = rubrics;
  return section;
}

function parsePsalm(heading, lines, warnings) {
  const section = { kind: 'psalm', role: heading.role, label: heading.label, bible: '', chorus: '', verses: [] };
  let verse = null;
  const closeVerse = () => {
    if (verse?.length) section.verses.push(verse.map((line) => line.text).join('\n'));
    verse = null;
  };
  for (const line of lines) {
    if (isRight(line)) {
      if (!section.bible) section.bible = line.text;
      else warnings.push(`${heading.label}: extra citation «${line.text}»`);
      continue;
    }
    if (isRefrainMarker(line)) { closeVerse(); continue; }
    const refrain = /^Рэфрэн:\s*(.+)$/u.exec(line.text);
    if (refrain) {
      closeVerse();
      if (!section.chorus) section.chorus = refrain[1].trim();
      continue;
    }
    const alternative = /^Або:\s*(.+)$/u.exec(line.text);
    if (alternative && section.chorus && !section.verses.length && !verse) {
      section.altChorus = alternative[1].trim();
      continue;
    }
    // A whole italic line in a psalm is a rubric of the liturgy (Easter Vigil:
    // «Чытаецца калекта і гімн…»), not a strophe.
    if (mostlyItalic(line) && !/^\d/.test(line.text)) { closeVerse(); (section.trailingRubrics ||= []).push(line.text); continue; }
    if (verse && verse[verse.length - 1].para !== line.para) closeVerse();
    (verse ||= []).push(line);
  }
  closeVerse();
  return section;
}

function parseAcclamation(heading, lines) {
  const section = { kind: 'acclamation', role: 'alleluia', label: heading.label, acclamation: '', bible: '', verse: '' };
  const verse = [];
  const trailing = [];
  let closed = false;
  for (const line of lines) {
    const acclamation = /^Акламацыя:\s*(.+)$/u.exec(line.text);
    if (closed) { trailing.push(line); continue; }
    if (acclamation) {
      if (!section.acclamation) section.acclamation = acclamation[1].trim();
      else closed = true;
      continue;
    }
    if (isRight(line)) { if (!section.bible) section.bible = line.text; continue; }
    verse.push(line);
  }
  section.verse = verse.map((line) => line.text).join('\n');
  return { section, trailing };
}

/** Rubrics after the acclamation (Palm Sunday: how the Passion is read, the role legend). */
function rubricSections(lines) {
  const out = [];
  const legend = [];
  for (const line of lines) {
    if (/^(Ев|Е|І|I|Л)\.\s+—/u.test(line.text)) legend.push(line.text);
    else out.push({ kind: 'rubric', text: line.text });
  }
  if (legend.length) out.push({ kind: 'rubric', text: legend.join('\n'), legend: true });
  return out;
}

/**
 * @returns {{ sets: Array<{ sourceLabel, note?, sections }>, warnings: string[], translationNote?: string }}
 */
export function parseLectionaryPage(html) {
  const warnings = [];
  const lines = splitEmbeddedHeadings(tokenizeLectionaryHtml(html));
  const sets = [];
  let set = null;
  let heading = null;
  let buffer = [];
  let translationNote = '';
  const ensureSet = () => {
    if (!set) {
      set = { sourceLabel: '', sections: [] };
      sets.push(set);
    }
    return set;
  };
  const flushSection = () => {
    if (!heading) {
      // Text before the first section: page rubrics (Easter Vigil).
      const rubrics = buffer.filter((line) => line.italic && line.text.length > 40);
      if (rubrics.length) ensureSet().sections.push(...rubrics.map((line) => ({ kind: 'rubric', text: line.text })));
      buffer = [];
      return;
    }
    const target = ensureSet();
    if (heading.kind === 'psalm') {
      const { trailingRubrics = [], ...psalm } = parsePsalm(heading, buffer, warnings);
      target.sections.push(psalm, ...trailingRubrics.map((value) => ({ kind: 'rubric', text: value })));
    }
    else if (heading.kind === 'acclamation') {
      const { section, trailing } = parseAcclamation(heading, buffer);
      target.sections.push(section, ...rubricSections(trailing));
    } else if (heading.kind === 'sequence') {
      target.sections.push({ kind: 'sequence', role: 'sequence', label: heading.label, text: paragraphsText(buffer.filter((line) => !line.italic)) });
    } else {
      const section = parseReadingLike(heading, buffer, warnings);
      const { rubrics } = section;
      if (rubrics?.length && heading.kind === 'reading' && section.conclusion) {
        // Italic lines after «Гэта слова Божае.» are rubrics of the liturgy
        // (Easter Vigil: «Чытаецца калекта…»), not of this reading.
        delete section.rubrics;
        target.sections.push(section, ...rubrics.map((value) => ({ kind: 'rubric', text: value })));
      } else if (rubrics?.length && !section.conclusion) {
        section.conclusion = '';
        target.sections.push(section);
      } else {
        delete section.rubrics;
        target.sections.push(section, ...(rubrics || []).map((value) => ({ kind: 'rubric', text: value })));
      }
    }
    buffer = [];
  };

  for (const line of lines) {
    if (FOOTER.test(line.text)) { translationNote = line.text; continue; }
    if (SITE_FOOTER.test(line.text)) continue;
    if (isSetHeader(line)) {
      flushSection();
      heading = null;
      set = { sourceLabel: line.text.replace(/\.$/, ''), sections: [] };
      sets.push(set);
      continue;
    }
    if (line.align === 'center' && line.italic && set && !set.sections.length && !heading) {
      set.note = [set.note, line.text].filter(Boolean).join(' ');
      continue;
    }
    // Table of contents («1. Імша ў вігілію.») before the first set.
    if (!heading && !sets.length && /^\d\.\s.*імша/iu.test(line.text)) continue;
    const next = headingOf(line);
    if (next) {
      flushSection();
      heading = next;
      continue;
    }
    buffer.push(line);
  }
  flushSection();
  return { sets, warnings, ...(translationNote ? { translationNote } : {}) };
}

/**
 * Semantic checks of a parsed page: every reading/Gospel has a citation and
 * text (or a role-marked Passion), every psalm a refrain and verses, no
 * Lectionary heading or conclusion leaked into a text.
 */
export function validateParsedPage(page) {
  const errors = [];
  if (!page.sets.length) errors.push('no reading set');
  page.sets.forEach((set, setIndex) => {
    const at = `set ${setIndex + 1}${set.sourceLabel ? ` («${set.sourceLabel}»)` : ''}`;
    if (!set.sections.some((section) => section.kind === 'gospel')) errors.push(`${at}: no Gospel`);
    set.sections.forEach((section) => {
      const name = `${at} ${section.label || section.kind}${section.cycle ? ` ${section.cycle}` : ''}`;
      if (['reading', 'gospel'].includes(section.kind)) {
        if (!section.bible) errors.push(`${name}: no citation`);
        if (!section.text && !section.passion?.blocks?.length) errors.push(`${name}: no text`);
        if (!section.title) errors.push(`${name}: no liturgical title`);
        if (/ЧЫТАННЕ|ЕВАНГЕЛЛЕ|РЭСПАНСАРЫЙНЫ|Гэта слова (Божае|Пана)/u.test(section.text || '')) errors.push(`${name}: heading or conclusion inside the text`);
      }
      if (section.kind === 'psalm') {
        if (!section.bible) errors.push(`${name}: no citation`);
        if (!section.chorus) errors.push(`${name}: no refrain`);
        if (!section.verses.length) errors.push(`${name}: no verses`);
      }
      if (section.kind === 'acclamation' && !section.acclamation) errors.push(`${name}: no acclamation`);
      if (section.kind === 'sequence' && !section.text) errors.push(`${name}: empty`);
    });
  });
  return errors;
}

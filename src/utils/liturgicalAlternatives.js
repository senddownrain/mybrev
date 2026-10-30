import { parse } from 'node-html-parser';
import { removeBreakAfterPsalmCadenceSign } from './liturgicalHtml.js';

const MAX_TITLE_LENGTH = 56;
// A reading's title is a work or Scripture reference, longer than a hymn's first verse.
const MAX_READING_TITLE_LENGTH = 84;
const ALTERNATIVE_MARKER = /^\s*А\s*бо(?:\s+(?:інш(?:ае|ая|ыя)|яшчэ))?\s*:/iu;
// Readings only: «Або іншае, пра святую, якая жыла ў сужэнстве:» and «Іншае, пра святую …:» also open a new choice.
const READING_QUALIFIED_MARKER = /^\s*(?:А\s*бо\s+)?Інш(?:ае|ая|ыя)\s*,[^:]{1,100}:\s*$/iu;
// D-1: the volumes print «Выбіраюцца найбольш адпаведныя тэксты … з Агульных тэкстаў …, с. N» instead of a text.
// It is the rubric of the choice, not a reading: the reader shows it as a note above the readings.
const READING_REFERENCE = /^\s*Выбіраюцца\s+найбольш\s+адпаведныя/iu;
// Category headings in the common texts use "Пра", "За" or "Для". Treating
// every "У …:" paragraph as a heading also caught the narrative Scripture
// phrase "У тыя дні:" and split the Holy Innocents reading in two.
const CATEGORY_MARKER = /^\s*(?:Пра|За|Для)\s+[^:]{1,72}\s*:/iu;
const INSTRUCTION_MARKER = /^(?:Калі\s+няма\s+ўласнай|Чытаецца\s+на\s+выбар|На\s+выбар)\b/iu;
const REPEATED_SECTION_MARKER = /^(?:Кароткае\s+чытанне|Гімн)\b/iu;
const GOSPEL_CYCLE_MARKER = /^Год\s+([АAВBСC])\s*:/iu;

function textOf(value) {
  return parse(String(value || '')).text
    .replace(/&nbsp;|&#x0*20;/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function directElements(root) {
  return root.childNodes.filter((node) => node.nodeType === 1);
}

function isMarkerText(text) {
  return ALTERNATIVE_MARKER.test(text)
    || READING_QUALIFIED_MARKER.test(text)
    || READING_REFERENCE.test(text)
    || CATEGORY_MARKER.test(text)
    || INSTRUCTION_MARKER.test(text);
}

function isAlternativeBoundary(element, kind) {
  if (element.rawTagName !== 'p') return false;
  const text = textOf(element.toString());
  if (kind === 'office-reading' && (READING_QUALIFIED_MARKER.test(text) || READING_REFERENCE.test(text))) return true;
  // Scripture verses beginning "Пра ...:" are not alternative-category headings.
  // Keep genuine explicit alternatives (<hr>, "Або:") available for psalms.
  return ALTERNATIVE_MARKER.test(text)
    || INSTRUCTION_MARKER.test(text)
    || (kind !== 'psalm' && CATEGORY_MARKER.test(text));
}

function splitAtRules(root, kind) {
  const nodes = [...root.childNodes];
  const hasRule = nodes.some((node) => node.nodeType === 1 && node.rawTagName === 'hr');
  const repeatedMarkers = new Map();
  if (!hasRule) {
    nodes.forEach((node) => {
      if (node.nodeType !== 1 || node.rawTagName !== 'p') return;
      const marker = textOf(node.toString()).match(REPEATED_SECTION_MARKER)?.[0]?.toLowerCase();
      if (marker) repeatedMarkers.set(marker, (repeatedMarkers.get(marker) || 0) + 1);
    });
  }

  const groups = [[]];
  nodes.forEach((node) => {
    if (node.nodeType === 1 && node.rawTagName === 'hr') {
      if (groups.at(-1).length) groups.push([]);
      return;
    }
    const marker = node.nodeType === 1 && node.rawTagName === 'p'
      ? textOf(node.toString()).match(REPEATED_SECTION_MARKER)?.[0]?.toLowerCase()
      : '';
    const startsNewGroup = !hasRule && groups.at(-1).length && (
      (node.nodeType === 1 && isAlternativeBoundary(node, kind))
      || (marker && repeatedMarkers.get(marker) > 1)
    );
    if (startsNewGroup) groups.push([]);
    groups.at(-1).push(node.toString());
  });
  return groups.map((group) => group.join('\n').trim()).filter(Boolean);
}

function structuredAlternatives(root) {
  const blocks = directElements(root).filter((element) => element.hasAttribute('data-alternative-title'));
  if (blocks.length < 2) return null;

  const suffixBlocks = directElements(root).filter((element) => element.hasAttribute('data-alternative-suffix'));
  const suffixHtml = suffixBlocks.map((element) => element.innerHTML.trim()).join('\n');
  [...blocks, ...suffixBlocks].forEach((element) => element.remove());
  const sharedHtml = root.innerHTML.trim();
  return blocks.map((block) => ({
    explicitTitle: block.getAttribute('data-alternative-title') || '',
    html: [sharedHtml, block.innerHTML.trim(), suffixHtml].filter(Boolean).join('\n'),
  }));
}

function gospelCycleAlternatives(root) {
  const shared = [];
  const options = [];
  let current = null;

  directElements(root).forEach((element) => {
    if (element.rawTagName !== 'p') {
      const html = element.toString();
      if (current) current.parts.push(html);
      else shared.push(html);
      return;
    }

    const attributes = element.rawAttrs ? ` ${element.rawAttrs}` : '';
    const lines = element.innerHTML.split(/<br\s*\/?>/giu).filter((line) => textOf(line));
    lines.forEach((line) => {
      const text = textOf(line);
      const cycle = text.match(GOSPEL_CYCLE_MARKER);
      const html = `<p${attributes}>${line.trim()}</p>`;
      if (cycle) {
        current = {
          explicitTitle: `Год ${cycle[1].toLocaleUpperCase('be')}`,
          parts: [html],
        };
        options.push(current);
      } else if (current) {
        current.parts.push(html);
      } else {
        shared.push(html);
      }
    });
  });

  if (options.length < 2) return null;
  const sharedHtml = shared.join('\n');
  return options.map((option) => ({
    explicitTitle: option.explicitTitle,
    html: [sharedHtml, ...option.parts].filter(Boolean).join('\n'),
  }));
}

function substantiveText(html) {
  const root = parse(String(html || ''));
  const paragraphs = root.querySelectorAll('p');
  const content = paragraphs
    .map((paragraph) => textOf(paragraph.toString()))
    .map((text) => text
      .replace(ALTERNATIVE_MARKER, '')
      .replace(CATEGORY_MARKER, '')
      .replace(/^(?:Калі\s+няма\s+ўласнай|Чытаецца\s+на\s+выбар|На\s+выбар)[^:]{0,160}:\s*/iu, '')
      .replace(/^\d{1,2}[.)]\s*/u, '')
      .trim())
    .filter(Boolean);
  return (content.length ? content.join(' ') : textOf(html))
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('be');
}

function uniqueOptions(options) {
  const seen = new Set();
  return options.filter((option) => {
    const key = substantiveText(option.html);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function shorten(value, maxLength = MAX_TITLE_LENGTH) {
  const text = String(value || '').replace(/\s+/g, ' ').trim().replace(/\s*[:.;,–—-]+$/u, '');
  if (text.length <= maxLength) return text;
  const contentLength = Math.max(1, maxLength - 1);
  const slice = text.slice(0, contentLength + 1);
  const boundary = slice.lastIndexOf(' ');
  return `${slice.slice(0, boundary > 28 ? boundary : contentLength).trim()}…`;
}

function paragraphTexts(html) {
  const root = parse(String(html || ''));
  const paragraphs = root.querySelectorAll('p');
  return (paragraphs.length ? paragraphs : [root])
    .map((paragraph) => textOf(paragraph.toString()))
    .filter(Boolean);
}

function firstVerseLine(html) {
  const withLines = String(html || '').replace(/<br\s*\/?\s*>/giu, '\n');
  return textOf(withLines.split('\n').find((line) => {
    const text = textOf(line);
    return text && !/^(?:Гімн|А\s*бо|Пра\s+[^:]+):?$/iu.test(text);
  }) || '');
}

function categoryTitle(paragraphs) {
  for (const paragraph of paragraphs.slice(0, 3)) {
    const match = paragraph.match(CATEGORY_MARKER);
    if (match) return shorten(match[0].replace(/\s*:\s*$/u, ''));
  }
  return '';
}

const SECTION_HEADING = /^(?:Першае|Другое)\s+чытанне$/iu;
const AUTHOR_LINE = /^(?:св\.|бл\.|Св\.|Бл\.)\s/u;
const looksLikeReference = (text) => text.length <= 90 && /\d/u.test(text) && !/^\(|[A-Za-z]{3}/u.test(text)
  && (/(?:пар\.|[А-ЯЁІЎ][а-яёіў]{0,5})\s*\d/u.test(text) || /\p{L}\.?\s*\d{1,3}\s*[,:–-]\s*\d/u.test(text));
// The source HTML sometimes glues the book and the chapter («Прыпавесцяў31, 10-31»).
const spaceBookAndNumber = (text) => text.replace(/([а-яёіўА-ЯЁІЎ.])(\d)/gu, '$1 $2');

function readingTitle(paragraphs, { office = false } = {}) {
  for (const paragraph of paragraphs.slice(0, 4)) {
    const match = paragraph.match(/Кароткае\s+чытанне\s+(.{1,42})$/iu);
    if (match) return shorten(match[1]);
  }
  const body = paragraphs
    // «Або іншае: Казанне св. Аўгустына» keeps its title after the marker; a bare marker is dropped.
    .map((text) => text.replace(ALTERNATIVE_MARKER, '').trim())
    .filter((text) => text && !READING_QUALIFIED_MARKER.test(text) && !READING_REFERENCE.test(text) && !SECTION_HEADING.test(text)
      && !(CATEGORY_MARKER.test(text) && /:\s*$/u.test(text)));
  const limit = office ? MAX_READING_TITLE_LENGTH : MAX_TITLE_LENGTH;
  // A Patristic or magisterial text: its title line followed by the author line («св. Яна Хрызастома, біскупа»).
  if (office && body[0] && !/\d/u.test(body[0]) && AUTHOR_LINE.test(body[1] || '') && !/\d/u.test(body[1])) {
    return shorten(`${body[0]} ${body[1]}`, limit);
  }
  for (let index = 0; index < Math.min(body.length, 4); index += 1) {
    const paragraph = body[index];
    if (!looksLikeReference(paragraph)) continue;
    // «Першае пасланне» / «св. апостала Пятра 3, 1-6» are two paragraphs of one title.
    const previous = body[index - 1];
    const joined = index > 0 && previous.length <= 40 && !/\d/u.test(previous) ? `${previous} ${paragraph}` : paragraph;
    return shorten(spaceBookAndNumber(joined.replace(/^(?:Першае|Другое)\s+чытанне\s*/iu, '')), limit);
  }
  if (office && body[0] && !/^\(/u.test(body[0])) return shorten(body[0].replace(/\s*\([^)]*\)\s*$/u, ''), limit);
  return '';
}

function optionTitle(option, index, kind) {
  if (option.explicitTitle) return shorten(option.explicitTitle);
  const paragraphs = paragraphTexts(option.html);
  const category = categoryTitle(paragraphs);
  if (kind === 'office-reading') {
    // The reading itself names the choice; the category («Пра святога, які жыў у сужэнстве») only qualifies it.
    const reading = readingTitle(paragraphs, { office: true });
    if (reading) return shorten(category ? `${reading} · ${category.charAt(0).toLocaleLowerCase('be')}${category.slice(1)}` : reading, MAX_READING_TITLE_LENGTH);
  }
  if (category) return category;

  if (kind === 'reading' || kind === 'office-reading') {
    const reference = readingTitle(paragraphs, { office: kind === 'office-reading' });
    if (reference) return reference;
  }
  if (kind === 'hymn') {
    const firstLine = firstVerseLine(option.html);
    if (firstLine) return shorten(firstLine);
  }
  if (kind === 'marian-antiphon') {
    const firstLine = firstVerseLine(option.html);
    if (firstLine) return shorten(firstLine);
  }
  if (kind === 'prayer' || paragraphs.some((text) => INSTRUCTION_MARKER.test(text))) {
    return `Варыянт ${index + 1}`;
  }

  const usable = paragraphs.find((text) => !isMarkerText(text) && !/^(?:Гімн|Кароткае чытанне)$/iu.test(text));
  if (usable && usable.length <= MAX_TITLE_LENGTH) return shorten(usable);
  return `Варыянт ${index + 1}`;
}

/**
 * A group that is only the responsory variant «Пра законніцу: Пс 45 (44), 2 / Н. … / К. … / Н. …» printed after the
 * reading (religious R1). It is a variant of the reading's responsory, not a second reading, so it must not be a choice.
 */
function isResponsoryVariant(html) {
  const paragraphs = paragraphTexts(html);
  if (!paragraphs.length || paragraphs.length > 6) return false;
  const text = paragraphs.join(' ');
  return /^Пра\s+[^:]{1,60}:\s*\p{L}{1,6}\s*\d/u.test(paragraphs[0]) && /(?:^|\s)Н\.\s/u.test(text) && /(?:^|\s)К\.\s/u.test(text) && text.length < 700;
}

/** A group that holds only the volume's «Выбіраюцца найбольш адпаведныя тэксты …» sentence (no reading text). */
function isReadingReference(html) {
  const paragraphs = paragraphTexts(html);
  return paragraphs.length > 0 && paragraphs.length <= 2 && READING_REFERENCE.test(paragraphs[0]);
}

export function hasLiturgicalAlternatives(html) {
  return getLiturgicalAlternatives(html).length > 1;
}

/**
 * Readings of an Office as the reader shows them: the volume's reference sentence(s) as a note and the
 * legal readings to choose from. Nothing is added or reworded; with no real choice `options` has one item.
 * A text that is only a reference keeps it as the single option (the old behaviour).
 */
export function getReadingChoices(html) {
  const all = getLiturgicalAlternatives(html, 'office-reading');
  const notes = all.filter((option) => option.reference);
  const options = all.filter((option) => !option.reference);
  return options.length ? { notes, options } : { notes: [], options: all.map(({ reference, ...rest }) => (void reference, rest)) };
}

export function getLiturgicalAlternatives(html, kind = 'generic') {
  const source = String(html || '').trim();
  if (!source) return [];
  const root = parse(source);
  const structured = kind === 'gospel-antiphon'
    ? gospelCycleAlternatives(root) || structuredAlternatives(root)
    : structuredAlternatives(root);
  const split = structured || splitAtRules(root, kind).map((optionHtml) => ({ html: optionHtml }));
  // Office readings: a responsory variant stays with the reading it follows, in the printed order.
  const rawOptions = kind === 'office-reading'
    ? split.reduce((list, option) => {
      if (list.length && isResponsoryVariant(option.html)) list[list.length - 1] = { ...list.at(-1), html: `${list.at(-1).html}\n<hr />\n${option.html}` };
      else list.push(option);
      return list;
    }, [])
    : split;
  const options = uniqueOptions(rawOptions).map((option, index) => {
    const reference = kind === 'office-reading' && isReadingReference(option.html);
    return {
      html: removeBreakAfterPsalmCadenceSign(option.html),
      title: reference ? 'Адсылка' : optionTitle(option, index, kind),
      ...(reference ? { reference: true } : {}),
    };
  });
  const titleCounts = new Map();
  options.forEach((option) => {
    const count = (titleCounts.get(option.title) || 0) + 1;
    titleCounts.set(option.title, count);
    if (count > 1) option.title = shorten(`${option.title} · ${count}`);
  });
  return options.length ? options : [{ html: removeBreakAfterPsalmCadenceSign(source), title: 'Варыянт 1' }];
}

export function formatIntercessions(html) {
  const sourceRoot = parse(String(html || ''));
  const normalizedHtml = sourceRoot.childNodes.flatMap((node) => {
    if (node.nodeType !== 1 || node.rawTagName !== 'p' || !node.querySelector('br')) {
      return [node.toString()];
    }

    return node.innerHTML
      .split(/<br\s*\/?\s*>/giu)
      .filter((line) => textOf(line))
      .map((line) => {
        const paragraph = parse(node.toString()).querySelector('p');
        paragraph.innerHTML = line;
        return paragraph.toString();
      });
  }).join('\n');
  const root = parse(normalizedHtml);
  const paragraphs = root.querySelectorAll('p');
  if (!paragraphs.length) return String(html || '');

  let refrainIndex = paragraphs.findIndex((paragraph, index) => (
    index < 3 && Boolean(paragraph.querySelector('em'))
  ));
  if (refrainIndex < 0) {
    refrainIndex = paragraphs.findIndex((paragraph, index) => {
      if (index < 1 || index > 3) return false;
      const previous = textOf(paragraphs[index - 1].toString());
      const current = textOf(paragraph.toString());
      return /:\s*$/u.test(previous) && current.length > 0 && current.length <= 120;
    });
  }
  const anchor = refrainIndex >= 0 ? refrainIndex : Math.min(1, paragraphs.length - 1);
  const introIndex = Math.max(0, anchor - 1);
  const refrainText = textOf(paragraphs[anchor].toString());
  let separateLineIndex = 0;
  paragraphs.forEach((paragraph, index) => {
    if (index === introIndex) paragraph.classList.add('intercessions__intro');
    if (index === anchor) paragraph.classList.add('intercessions__refrain');
    if (index > anchor) {
      const paragraphText = textOf(paragraph.toString());
      if (/^Ойча\s+наш\.?$/iu.test(paragraphText)) {
        paragraph.classList.add('intercessions__conclusion');
      } else if (paragraphText === refrainText) {
        paragraph.classList.add('intercessions__refrain', 'intercessions__refrain--repeat');
      } else {
        separateLineIndex += 1;
        const className = separateLineIndex % 2 === 1
          ? 'intercessions__petition'
          : 'intercessions__response';
        paragraph.classList.add(className);
        if (className === 'intercessions__response') {
          paragraph.innerHTML = paragraph.innerHTML.replace(
            /^\s*(?:<span\b[^>]*>\s*)?(?:–|&ndash;|—|-)(?:\s*<\/span>)?\s*(?:&nbsp;|&#x0*20;|\s)*/iu,
            '<span class="intercessions__marker">–</span>&nbsp;',
          );
        }
      }
    }
  });
  return root.innerHTML;
}

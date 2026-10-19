import { parsePrayerMarkdown, renderPrayerMarkdown, toPrayerMarkdown } from './prayerMarkdown.js';

// Confirmed by the owner-approved five-document read-only audit on 2026-10-17.
// The reader also checks each document's structure before selecting a profile.
export const DEVOTIONAL_OFFICE_PROFILES = Object.freeze({
  'mybrev-devotion-office-for-dead-laudes': 'laudes',
  'mybrev-devotion-office-for-dead-vesper': 'vesper',
  'mybrev-devotion-blessed-virgin-mary-laudes': 'laudes',
  'mybrev-devotion-blessed-virgin-mary-vesper': 'vesper',
  'catholicby-yearcycle-100116': 'gadzinki',
});

const DEAD_IDS = new Set([
  'mybrev-devotion-office-for-dead-laudes',
  'mybrev-devotion-office-for-dead-vesper',
]);
const MARY_IDS = new Set([
  'mybrev-devotion-blessed-virgin-mary-laudes',
  'mybrev-devotion-blessed-virgin-mary-vesper',
]);

export const DEVOTIONAL_DEAD_INTENTIONS = Object.freeze([
  { label: 'За аднаго памерлага', hymn: null, prayer: null },
  { label: 'За адну памерлую', hymn: 'Гімн — За адну памерлую', prayer: null },
  { label: 'За некалькіх', hymn: 'Гімн — За некалькіх', prayer: 'Малітва — За некалькіх' },
  { label: 'За братоў, блізкіх і дабрадзеяў', hymn: 'Гімн — За некалькіх', prayer: 'Малітва — За братоў, блізкіх і дабрадзеяў' },
]);

export function devotionalDeadIntentions(prayerId) {
  return DEAD_IDS.has(prayerId) ? DEVOTIONAL_DEAD_INTENTIONS : [];
}

function sourceChoice(section, title, label) {
  const index = section.alternatives?.findIndex(option => option.title === title) ?? -1;
  return index < 0 ? null : { label, sourceIndex: index + 1 };
}

/** Only published, meaningfully different choices are exposed in the reader. */
export function devotionalOfficeChoices(prayerId, section) {
  if (!MARY_IDS.has(prayerId)) return [];
  if (section.type === 'intercessions') {
    const label = prayerId.endsWith('laudes')
      ? 'Аб чысціні і нябеснай славе' : 'Аб сям’і і тых, хто ў патрэбе';
    const other = sourceChoice(section, 'Просьбы — Варыянт 2', label);
    return other ? [{ label: prayerId.endsWith('laudes') ? 'Аб жыцці ў Хрысце' : 'Аб Касцёле і збаўленні', sourceIndex: 0 }, other] : [];
  }
  if (section.type === 'prayer') {
    const themes = [
      ['Малітва — Варыянт 2', 'Аб прабачэнні'],
      ['Малітва — Варыянт 3', 'Аб выпраўленні жыцця'],
      ['Малітва — Варыянт 4', 'Аб абароне'],
      ['Малітва — Варыянт 5', 'Аб Божай ласцы'],
    ];
    const options = themes.map(([title, label]) => sourceChoice(section, title, label));
    return options.every(Boolean) ? [{ label: 'Агульная', sourceIndex: 0 }, ...options] : [];
  }
  return [];
}

export function devotionalDeadSelection(section, intention) {
  if (!intention || !['hymn', 'prayer'].includes(section.type)) return null;
  const title = intention[section.type];
  const choice = title ? sourceChoice(section, title, '') : null;
  if (title && !choice) return null;
  const blocks = choice ? devotionalSelectedBlocks(section, choice.sourceIndex) : section.blocks;
  const label = section.type === 'hymn'
    ? (title ? title.slice('Гімн — '.length) : 'За аднаго памерлага')
    : (title ? title.slice('Малітва — '.length) : 'За аднаго памерлага або адну памерлую — 1');
  const labelIndex = section.type === 'hymn' ? blocks.length - 2 : 1;
  const editorial = blocks[labelIndex];
  if (editorial?.kind !== 'text' || editorial.source.trim() !== label + ':'
    || editorial.span[1] - editorial.span[0] !== 1) return blocks;
  return blocks.filter((_block, index) => index !== labelIndex);
}

export const GADZINKI_PARTS = Object.freeze([
  'Ютрань', 'Першая гадзіна', 'Трэцяя гадзіна', 'Шостая гадзіна',
  'Дзевятая гадзіна', 'Нешпары', 'Напрыканцы дня', 'Ахвяраванне Гадзінак',
]);

const SPACE = '[\\s\\u00a0\\u2000-\\u200a\\u202f]';
const ANTIPHON = new RegExp(`^((?:[1-3]${SPACE}*)?Ант\\.(?:${SPACE}+да${SPACE}+песні${SPACE}+(?:Захарыі|Марыі))?:?)(${SPACE}*)([\\s\\S]*)$`, 'iu');
const PSALM_TITLE = /^(Псальм|Песня)\s+(.+)$/iu;
const READING = /^Кароткае\s+чытанне(?:\s+(.+))?$/iu;
const RESPONSE = /^Кароткі\s+рэспансорый$/iu;
const SECTION = /^(?:пачатак|уступ|гімн|псальмодыя|кароткае чытанне(?: і рэспансорый)?|кароткі рэспансорый|песня з евангелля|песня захарыі(?: \(лк .+\))?|песня марыі(?: \(лк .+\))?|просьбы|ойча наш|малітва|заканчэнне|завяршэнне|благаслаўленне|адпуст|іншыя варыянты частак гадзіны)$/iu;
const OFFICE_PARTS = Object.freeze([
  'Пачатак', 'Гімн', 'Псальмодыя', 'Кароткае чытанне і рэспансорый',
  null, 'Просьбы', 'Ойча наш', 'Малітва', 'Завяршэнне',
  'Іншыя варыянты частак Гадзіны',
]);

function unmark(value) {
  return String(value).replace(/^(?:\*\*|__)([\s\S]*)(?:\*\*|__)$/u, '$1').trim();
}

function blockKind(text, heading = false, rubric = false) {
  const plain = unmark(text).replace(/\s+/gu, ' ').trim();
  if (rubric) return 'rubric';
  if (heading && SECTION.test(plain)) return 'section';
  if (ANTIPHON.test(plain)) return 'antiphon';
  if (PSALM_TITLE.test(plain)) return 'psalmTitle';
  if (READING.test(plain)) return 'readingTitle';
  if (RESPONSE.test(plain)) return 'responseTitle';
  if (heading) return 'heading';
  return 'text';
}

function paragraphBlocks(sourceText, startLine, rubric) {
  const rows = sourceText.split('\n');
  const runs = [];
  let run = null;
  rows.forEach((row, offset) => {
    const kind = blockKind(row, false, rubric);
    const boundary = kind !== 'text' && kind !== 'rubric';
    if (boundary || !run || ['antiphon', 'psalmTitle', 'readingTitle', 'responseTitle'].includes(run.kind)) {
      run = { kind, rows: [], start: startLine + offset };
      runs.push(run);
    }
    run.rows.push(row);
  });
  return runs.map(({ kind, rows: content, start }) => ({
    kind,
    text: content.join('\n'),
    source: content.join('\n'),
    span: [start, start + content.length],
    level: null,
  }));
}

/** Markdown block AST with exact source spans. Unknown blocks remain text. */
export function devotionalSourceBlocks(value, format = '') {
  const source = toPrayerMarkdown(value, format);
  const lines = source.split('\n');
  const blocks = [];
  let headingLevel = 0;
  let rubric = false;
  for (const token of parsePrayerMarkdown(source, 'mybrev-markdown')) {
    if (token.type === 'heading_open') headingLevel = Number(token.tag.slice(1));
    else if (token.type === 'heading_close') headingLevel = 0;
    else if (token.type === 'rubric_open') rubric = true;
    else if (token.type === 'rubric_close') rubric = false;
    else if (token.type === 'hr') {
      blocks.push({ kind: 'separator', source: lines.slice(...token.map).join('\n'), span: token.map });
    } else if (token.type === 'inline' && token.content.trim()) {
      const sourceText = lines.slice(...token.map).join('\n');
      if (!headingLevel && sourceText.includes('\n')) {
        blocks.push(...paragraphBlocks(sourceText, token.map[0], rubric));
      } else {
        blocks.push({
          kind: blockKind(token.content, headingLevel > 0, rubric),
          text: token.content,
          source: sourceText,
          span: token.map,
          level: headingLevel || null,
        });
      }
    }
  }
  return blocks;
}

function officeSections(profile, blocks) {
  const headings = blocks.filter(block => block.level === 2).map(block => unmark(block.text));
  const canticle = profile === 'laudes'
    ? /^Песня Захарыі \(Лк 1, 68[–-]79\)$/u
    : /^Песня Марыі \(Лк 1, 46[–-]55\)$/u;
  return headings.length === OFFICE_PARTS.length
    && headings.every((heading, index) => index === 4
      ? canticle.test(heading) : heading === OFFICE_PARTS[index])
    && blocks.some(block => block.kind === 'antiphon')
    && blocks.some(block => block.kind === 'psalmTitle');
}

function gadzinkiSections(blocks) {
  const headings = blocks.filter(block => block.level === 2).map(block => unmark(block.text));
  return headings.length === GADZINKI_PARTS.length
    && headings.every((heading, index) => heading === GADZINKI_PARTS[index]);
}

/** Strict ID plus observed section order; mismatch falls back to the regular reader. */
export function devotionalOfficeProfile(prayer, value, format = '', explicitProfile = null) {
  const profile = explicitProfile || DEVOTIONAL_OFFICE_PROFILES[prayer?.id];
  if (!profile) return null;
  const blocks = devotionalSourceBlocks(value, format);
  if (profile === 'gadzinki') return gadzinkiSections(blocks) ? profile : null;
  return officeSections(profile, blocks) ? profile : null;
}

function sectionType(block) {
  const title = unmark(block.text).toLocaleLowerCase('be');
  if (title === 'пачатак') return 'intro';
  if (title === 'ойча наш') return 'ourFather';
  if (title.includes('псальмодыя')) return 'psalmody';
  if (title.includes('гімн')) return 'hymn';
  if (title.includes('чытанне')) return 'reading';
  if (title.includes('рэспансорый')) return 'responsory';
  if (title.includes('песня')) return 'canticle';
  if (title.includes('просьбы')) return 'intercessions';
  if (title.includes('малітва')) return 'prayer';
  if (title.includes('завяршэнне') || title.includes('заканчэнне') || title.includes('благаслаўленне') || title.includes('адпуст')) return 'ending';
  if (title.includes('іншыя варыянты')) return 'alternatives';
  return 'other';
}

function alternativeTarget(title) {
  const prefix = title.split(' — ')[0].toLocaleLowerCase('be');
  if (prefix === 'гімн') return 'hymn';
  if (prefix === 'трэці псальм') return 'psalmody';
  if (prefix === 'чытанне і рэспансорый') return 'reading';
  if (prefix === 'антыфона да песні захарыі' || prefix === 'антыфона да песні марыі') return 'canticle';
  if (prefix === 'просьбы') return 'intercessions';
  if (prefix === 'малітва') return 'prayer';
  return null;
}

function attachAlternatives(sections) {
  const source = sections.find(section => section.type === 'alternatives');
  if (!source) return;
  const original = source.blocks.slice(1);
  source.blocks = source.blocks.slice(0, 1);
  const options = [];
  let option = null;
  for (const block of original) {
    if (block.level === 3) {
      option = { title: unmark(block.text), blocks: [block] };
      options.push(option);
    } else if (option) option.blocks.push(block);
    else source.blocks.push(block);
  }
  for (const candidate of options) {
    const targetType = alternativeTarget(candidate.title);
    const target = sections.find(section => section.type === targetType);
    if (target) {
      target.alternatives ||= [];
      target.alternatives.push(candidate);
    } else source.blocks.push(...candidate.blocks);
  }
}

/** Pure presentation document. Every source block appears in exactly one section. */
export function buildDevotionalOfficeDocument(value, format = '', profile) {
  const blocks = devotionalSourceBlocks(value, format);
  const sections = [];
  let current = { id: 'office-intro', title: '', type: 'intro', blocks: [] };
  sections.push(current);
  for (const block of blocks) {
    const newPart = block.level === 2;
    if (newPart) {
      current = {
        id: `office-section-${sections.length}`,
        title: unmark(block.text),
        type: profile === 'gadzinki' ? 'gadzinkiPart' : sectionType(block),
        blocks: [block],
      };
      sections.push(current);
    } else current.blocks.push(block);
  }
  if (profile !== 'gadzinki') attachAlternatives(sections);
  return { profile, sections: sections.filter(section => section.blocks.length), sourceBlockCount: blocks.length };
}

export function devotionalBlockHtml(block) {
  return renderPrayerMarkdown(block.source, 'mybrev-markdown');
}

const OFFICE_SPEAKER = '(?:Кантар:|Мол[іi]мся:|[КНС](?:\\.:|\\.|:))';
const OFFICE_SPEAKER_LINE = new RegExp(
  '(<p\\b[^>]*>|<br\\s*\\/?>)(\\s*)(?:<strong>(' + OFFICE_SPEAKER
    + ')<\\/strong>|(' + OFFICE_SPEAKER + '))(?=\\s|&nbsp;|<|$)',
  'giu',
);

/** Mark only response labels at the start of a rendered Markdown line. */
export function devotionalSpeakerHtml(block) {
  const rendered = devotionalBlockHtml(block).replace(
    /<span class="prayer-speaker" data-role="[^"]+">/giu,
    span => span.replace('>', ' data-office-speaker>'),
  );
  return rendered.replace(
    OFFICE_SPEAKER_LINE,
    (_match, start, space, strongLabel, plainLabel) => start + space
      + '<span data-office-speaker>' + (strongLabel || plainLabel) + '</span>',
  );
}

export function devotionalHeading(section, profile) {
  if (profile === 'gadzinki') return { title: section.title, caption: '' };
  const titles = {
    intro: profile === 'laudes' ? 'Ютрань' : 'Нешпары',
    hymn: 'Гімн',
    psalmody: 'Псальмодыя',
    canticle: 'Песня з Евангелля',
    intercessions: 'Просьбы',
    prayer: 'Малітва',
  };
  return { title: titles[section.type] || '', caption: section.type === 'canticle' ? section.title : '' };
}

function hasPsalmCadence(block) {
  return /(?:\\\*|\*|†)/u.test(block.source);
}

function psalmMetadataCount(blocks, titleIndex) {
  const first = blocks[titleIndex + 1];
  const second = blocks[titleIndex + 2];
  const third = blocks[titleIndex + 3];
  if (first?.kind !== 'text' || hasPsalmCadence(first)) return 0;
  // A theme followed by an italic epigraph and a marked first verse is
  // metadata. An isolated italic epigraph has the same structural role.
  if (/^_[\s\S]+_$/u.test(first.source.trim()) && second?.kind === 'text' && hasPsalmCadence(second)) return 1;
  if (second?.kind === 'text' && /^_[\s\S]+_$/u.test(second.source.trim())
    && third?.kind === 'text' && hasPsalmCadence(third)) return 2;
  return 0;
}

export function devotionalSubheadingHtml(block) {
  return devotionalBlockHtml(block).replace(/^<p(?=[\s>])/iu, '<p data-liturgical-subheading');
}

export function devotionalAntiphon(block) {
  const match = ANTIPHON.exec(unmark(block.text));
  return match ? { label: match[1], gap: match[2], text: match[3] } : null;
}

export function devotionalReadingHeading(value) {
  if (/^Кароткае чытанне і рэспансорый$/iu.test(unmark(value))) return null;
  const match = READING.exec(unmark(value));
  return match ? { label: 'Кароткае чытанне', reference: match[1] || '' } : null;
}

export function devotionalPsalmHeading(block) {
  const match = PSALM_TITLE.exec(unmark(block.text));
  return match ? { workType: match[1], reference: match[2] } : null;
}

/** Keep one PsalmText instance per contiguous psalm/canticle body. */
export function devotionalDisplayItems(section) {
  if (!['psalmody', 'canticle'].includes(section.type)) return section.blocks;
  const items = [];
  let inWork = false;
  let metadataRemaining = 0;
  for (const [index, block] of section.blocks.entries()) {
    if (block.kind === 'antiphon') inWork = false;
    if (block.kind === 'psalmTitle') {
      inWork = true;
      metadataRemaining = psalmMetadataCount(section.blocks, index);
    }
    if (metadataRemaining && block.kind === 'text') {
      items.push({ ...block, kind: 'psalmMeta' });
      metadataRemaining -= 1;
      continue;
    }
    const canGroup = block.kind === 'text' && (inWork || section.type === 'canticle');
    const previous = items.at(-1);
    if (canGroup && previous?.kind === 'psalmBody') {
      previous.blocks.push(block);
      previous.source += `\n\n${block.source}`;
      previous.span[1] = block.span[1];
    } else if (canGroup) {
      items.push({ kind: 'psalmBody', blocks: [block], source: block.source, span: [...block.span] });
    } else items.push(block);
  }
  return items;
}

/** Select only the spoken blocks for one complete liturgical configuration. */
export function devotionalSelectedBlocks(section, selected = 0) {
  const option = section.alternatives?.[selected - 1];
  if (!option) return section.blocks;
  const body = option.blocks.slice(1);
  if (!body.length) return section.blocks;
  if (section.type === 'psalmody') {
    const thirdStart = section.blocks.findIndex(block => block.kind === 'antiphon'
      && /^3\s*ант\./iu.test(block.text));
    return thirdStart < 0 ? section.blocks : [...section.blocks.slice(0, thirdStart), ...body];
  }
  if (section.type === 'canticle') {
    const optionText = body.map(block => block.text).join('\n');
    return section.blocks.map(block => {
      if (block.kind !== 'antiphon') return block;
      const antiphon = devotionalAntiphon(block);
      return antiphon ? {
        ...block,
        text: `${antiphon.label}${antiphon.gap}${optionText}`,
        source: body.map(part => part.source).join('\n\n'),
        span: [...body[0].span],
        derivedFrom: body.map(part => part.span),
      } : block;
    });
  }
  if (section.type === 'reading'
    && section.blocks[1]?.source === body[0]?.source
    && section.blocks[2]?.source === body[1]?.source) {
    return [...section.blocks.slice(0, 3), ...body.slice(2)];
  }
  return [section.blocks[0], ...body];
}

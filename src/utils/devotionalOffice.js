import { parsePrayerMarkdown, renderPrayerMarkdown, toPrayerMarkdown } from './prayerMarkdown.js';

// These identities come from the import plan, not a current Firestore export.
// The reader also checks the document's structure before selecting a profile.
export const DEVOTIONAL_OFFICE_PROFILES = Object.freeze({
  'mybrev-devotion-office-for-dead-laudes': 'laudes',
  'mybrev-devotion-office-for-dead-vesper': 'vesper',
  'mybrev-devotion-blessed-virgin-mary-laudes': 'laudes',
  'mybrev-devotion-blessed-virgin-mary-vesper': 'vesper',
});

export const GADZINKI_PARTS = Object.freeze([
  'Ютрань', 'Першая гадзіна', 'Трэцяя гадзіна', 'Шостая гадзіна',
  'Дзевятая гадзіна', 'Нешпары', 'Напрыканцы дня', 'Ахвяраванне Гадзінак',
]);

const SPACE = '[\\s\\u00a0\\u2000-\\u200a\\u202f]';
const ANTIPHON = new RegExp(`^((?:[1-3]${SPACE}*)?Ант\\.(?:${SPACE}+да${SPACE}+песні${SPACE}+(?:Захарыі|Марыі))?:?)(${SPACE}*)([\\s\\S]*)$`, 'iu');
const PSALM_TITLE = /^(Псальм|Песня)\s+(.+)$/iu;
const READING = /^Кароткае\s+чытанне(?:\s+(.+))?$/iu;
const RESPONSE = /^Кароткі\s+рэспансорый$/iu;
const SECTION = /^(?:пачатак|уступ|гімн|псальмодыя|кароткае чытанне|кароткі рэспансорый|песня з евангелля|песня захарыі|песня марыі|просьбы|ойча наш|малітва|заканчэнне|благаслаўленне|адпуст)$/iu;

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
    if (boundary || !run || ['readingTitle', 'responseTitle'].includes(run.kind)) {
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

function expectedHour(profile, blocks) {
  const expected = profile === 'laudes' ? 'Ютрань' : 'Нешпары';
  return blocks.some(block => block.level && unmark(block.text).toLocaleLowerCase('be') === expected.toLocaleLowerCase('be'));
}

function gadzinkiSections(blocks) {
  const headings = blocks.filter(block => block.level === 2).map(block => unmark(block.text));
  return headings.length === GADZINKI_PARTS.length
    && headings.every((heading, index) => heading === GADZINKI_PARTS[index]);
}

/**
 * A deliberately strict gate. Until the fifth ID and live parity are known,
 * Gadzinki can be supplied only by an explicit caller profile (local preview).
 */
export function devotionalOfficeProfile(prayer, value, format = '', explicitProfile = null) {
  const profile = explicitProfile || DEVOTIONAL_OFFICE_PROFILES[prayer?.id];
  if (!profile) return null;
  const blocks = devotionalSourceBlocks(value, format);
  if (profile === 'gadzinki') return gadzinkiSections(blocks) ? profile : null;
  return expectedHour(profile, blocks)
    && blocks.some(block => block.kind === 'antiphon')
    && blocks.some(block => block.kind === 'psalmTitle') ? profile : null;
}

function sectionType(block) {
  const title = unmark(block.text).toLocaleLowerCase('be');
  if (title.includes('псальмодыя')) return 'psalmody';
  if (title.includes('гімн')) return 'hymn';
  if (title.includes('чытанне')) return 'reading';
  if (title.includes('рэспансорый')) return 'responsory';
  if (title.includes('песня')) return 'canticle';
  if (title.includes('просьбы')) return 'intercessions';
  if (title.includes('малітва')) return 'prayer';
  if (title.includes('заканчэнне') || title.includes('благаслаўленне') || title.includes('адпуст')) return 'ending';
  return 'other';
}

/** Pure presentation document. Every source block appears in exactly one section. */
export function buildDevotionalOfficeDocument(value, format = '', profile) {
  const blocks = devotionalSourceBlocks(value, format);
  const sections = [];
  let current = { id: 'office-intro', title: '', type: 'intro', blocks: [] };
  sections.push(current);
  for (const block of blocks) {
    const newPart = profile === 'gadzinki'
      ? block.level === 2
      : ['section', 'readingTitle', 'responseTitle'].includes(block.kind);
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
  return { profile, sections: sections.filter(section => section.blocks.length), sourceBlockCount: blocks.length };
}

export function devotionalBlockHtml(block) {
  return renderPrayerMarkdown(block.source, 'mybrev-markdown');
}

export function devotionalAntiphon(block) {
  const match = ANTIPHON.exec(unmark(block.text));
  return match ? { label: match[1], gap: match[2], text: match[3] } : null;
}

export function devotionalReadingHeading(value) {
  const match = READING.exec(unmark(value));
  return match ? { label: 'Кароткае чытанне', reference: match[1] || '' } : null;
}

export function devotionalPsalmHeading(block) {
  const match = PSALM_TITLE.exec(unmark(block.text));
  return match ? { workType: match[1], reference: match[2] } : null;
}

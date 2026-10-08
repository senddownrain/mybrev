const ALTERNATIVE_IDS = new Set([
  '12-09-holy-name-mary-minsk-mohilev-pinsk',
  '16-11-our-lady-mother-mercy-minsk-mohilev-pinsk',
]);
const PASSION_IDS = new Set(['feast-palmsunday--A', 'feast-palmsunday--B', 'feast-palmsunday--C']);

export const STRUCTURAL_READING_IDS = [
  ...ALTERNATIVE_IDS,
  '25-01-conversion-saint-paul',
  'feast-eastersunday',
  ...PASSION_IDS,
  'feast-pentecost',
];

function requireParts(value, count, id) {
  const parts = String(value ?? '').split('\n\n');
  if (parts.length !== count) throw new Error(`${id}: expected ${count} paragraphs, found ${parts.length}`);
  return parts;
}

function alternativeReading(document) {
  const parts = requireParts(document.reading1?.text, 8, document.id);
  if (parts[3] !== 'альбо' || !/^Гал\s+4,\s*4–7$/u.test(parts[4])
    || !parts[1].startsWith('Чытанне Паслання') || !parts[6].startsWith('Чытанне Паслання')) {
    throw new Error(`${document.id}: alternative reading markers differ from the reviewed source`);
  }
  return { reading1: {
    ...document.reading1,
    comment: parts[0], title: parts[1], text: parts[2],
    alternatives: [{ bible: parts[4], comment: parts[5], title: parts[6],
      text: parts[7].replace(/^Браты:Калі/u, 'Браты: Калі') }],
  } };
}

function conversionReading(document) {
  const value = document.reading1?.text;
  if (typeof value !== 'string' || !value.endsWith('\n\nа\n\nАбо:')) {
    throw new Error(`${document.id}: trailing alternative markers differ from the reviewed source`);
  }
  return { reading1: { ...document.reading1, text: value.slice(0, -'\n\nа\n\nАбо:'.length).replace(/\n\n/gu, '\n') } };
}

function easterSequence(document) {
  const marker = '\n\nа СЕКВЕНЦЫЯ\n\n';
  const value = document.reading2?.text;
  if (typeof value !== 'string' || value.split(marker).length !== 2) {
    throw new Error(`${document.id}: Easter sequence marker differs from the reviewed source`);
  }
  const [reading, sequence] = value.split(marker);
  return { reading2: { ...document.reading2, text: reading }, sequence: { text: sequence } };
}

function pentecostSequence(document) {
  const marker = '\n\n1. Божа, Дух Святы';
  const value = document.reading2?.text;
  if (typeof value !== 'string' || value.split(marker).length !== 2) {
    throw new Error(`${document.id}: Pentecost sequence marker differs from the reviewed source`);
  }
  const [reading, continuation] = value.split(marker);
  return { reading2: { ...document.reading2, text: reading.replace(/\n\n/gu, '\n') },
    sequence: { text: `1. Божа, Дух Святы${continuation}` } };
}

function passionGospel(document) {
  const parts = String(document.gospel?.text ?? '').split('\n\n');
  if (!/^ЕВАНГЕЛЛЕ Ў ГОД [АВCС]$/u.test(parts[0])
    || parts.at(-1) !== 'Гэта слова Пана.' || parts.length < 10) {
    throw new Error(`${document.id}: Passion framing differs from the reviewed source`);
  }
  const body = parts.slice(1, -1);
  const italicLines = body.filter((part) => part.length < 100 && !part.includes('\n'));
  if (italicLines.length < 5 || italicLines.length > 7) {
    throw new Error(`${document.id}: unexpected Passion heading count: ${italicLines.length}`);
  }
  return { gospel: {
    ...document.gospel,
    comment: null,
    text: body.join('\n'),
    italicLines,
  } };
}

export function structuralReadingPatch(document) {
  if (ALTERNATIVE_IDS.has(document.id)) return alternativeReading(document);
  if (document.id === '25-01-conversion-saint-paul') return conversionReading(document);
  if (document.id === 'feast-eastersunday') return easterSequence(document);
  if (document.id === 'feast-pentecost') return pentecostSequence(document);
  if (PASSION_IDS.has(document.id)) return passionGospel(document);
  return null;
}
import { inspectReadingText } from '../../src/utils/readingTextNormalization.js';


const READING_FIELDS = ['reading1', 'reading2', 'reading3', 'reading4', 'reading5', 'reading6', 'reading7', 'gospel'];
const EMBEDDED_GOSPEL_TITLE = /^\+ Чытанне святога Евангелля паводле .+\.?$/u;

export function proseReadingPatch(document) {
  if (STRUCTURAL_READING_IDS.includes(document.id)) return null;
  const patch = {};
  for (const field of READING_FIELDS) {
    const section = document[field];
    if (inspectReadingText(section?.text).kind !== 'review') continue;
    const paragraphs = section.text.split(/\r?\n(?:[ \t]*\r?\n)+/u);
    let title = section.title;
    if (field === 'gospel' && EMBEDDED_GOSPEL_TITLE.test(paragraphs[0])) {
      title = paragraphs.shift();
    }
    while (/^(?:а|альбо)$/iu.test(paragraphs.at(-1)?.trim() ?? '')) paragraphs.pop();
    const opening = paragraphs[0] ?? '';
    const preserveOpening = opening.length <= 45 && /:\s*$/u.test(opening);
    const text = paragraphs.join('\n');
    patch[field] = { ...section, title, text: preserveOpening
      ? text.replace(/\n/u, '\n\n') : text };
  }
  return Object.keys(patch).length ? patch : null;
}

// A targeted read found these records already partly cleaned after the old snapshot.
// Keep their current titles and sequences; finish only the reviewed spacing/headings.
export function reviewedReadingPatch(document) {
  const compact = (value) => {
    const parts = value.split(/\r?\n(?:[ \t]*\r?\n)+/u);
    while (/^(?:а|альбо)$/iu.test(parts.at(-1)?.trim() ?? '')) parts.pop();
    const intro = parts[0].length <= 45 && /:\s*$/u.test(parts[0]);
    return parts.map((part, index) => `${index ? (index === 1 && intro ? '\n\n' : '\n') : ''}${part}`).join('');
  };
  if (PASSION_IDS.has(document.id)) {
    if (document.gospel?.title !== 'Мука Пана нашага Езуса Хрыста.') throw new Error('Unexpected reviewed Passion title');
    const parts = document.gospel.text.split('\n\n');
    const italicLines = parts.filter((part) => part.length < 100 && !part.includes('\n'));
    if (italicLines.length < 5 || italicLines.length > 7) throw new Error('Unexpected reviewed Passion headings');
    return { gospel: { ...document.gospel, text: parts.join('\n'), italicLines } };
  }
  if (document.id === 'feast-eastersunday') {
    if (!document.sequence?.text || document.reading2.text.includes('СЕКВЕНЦЫЯ')) throw new Error('Unexpected reviewed Easter sequence');
    return null;
  }
  const field = document.id === 'feast-pentecost' ? 'reading2'
    : /^holyweek-w1-d7--[ABC]-vigil$/u.test(document.id) ? 'reading3' : null;
  if (!field) throw new Error(`Unsupported reviewed document: ${document.id}`);
  return { [field]: { ...document[field], text: compact(document[field].text) } };
}

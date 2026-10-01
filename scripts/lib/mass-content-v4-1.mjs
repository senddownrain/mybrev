// Holy Mass V4.1: translate only the Russian service lines in the Latin variant.
// Keep the Latin liturgical text, its punctuation, markup and line breaks intact.
import { createHash } from 'node:crypto';

export const LATIN_MASS_ID = 'zdro66KYVuQ9p2KbqizD';
export const LATIN_MASS_FIELDS = Object.freeze(['textVersions.be', 'textVersions.la', 'textVersions.ru']);

export const LATIN_MASS_SERVICE_REPLACEMENTS = Object.freeze([
  ['ЧИН МЕССЫ НА ЛАТИНСКОМ ЯЗЫКЕ', 'ПАРАДАК СВЯТОЙ ІМШЫ НА ЛАЦІНСКАЙ МОВЕ'],
  ['Исповедание веры', 'Вызнанне веры'],
  ['Вторая Евхаристическая молитва', 'II эўхарыстычная малітва'],
  ['Или:', 'Альбо:'],
  ['После чтения:', 'Пасля чытання:'],
  ['(После чтения)', '(Пасля чытання)'],
  ['Евангелие:', 'Евангелле:'],
  ['(молитва из Миссала)', '(малітва з Імшала)'],
]);

export const LATIN_MASS_MAJOR_HEADINGS = Object.freeze([
  'Уступныя абрады', 'Літургія слова', 'Эўхарыстычная літургія',
  'Абрад Камуніі', 'Заключныя абрады',
]);

const replacements = new Map(LATIN_MASS_SERVICE_REPLACEMENTS);
const approvedCyrillic = new Set([
  ...LATIN_MASS_MAJOR_HEADINGS,
  ...LATIN_MASS_SERVICE_REPLACEMENTS.flat(),
]);
const approvedAfter = new Set([
  ...LATIN_MASS_MAJOR_HEADINGS,
  ...LATIN_MASS_SERVICE_REPLACEMENTS.map(([, after]) => after),
]);
const stripHeading = (line) => line.replace(/^#{2,4} /, '');
const hasCyrillic = (line) => /[\u0400-\u052f]/u.test(line);
export const sha256 = (value) => createHash('sha256').update(value, 'utf8').digest('hex');

function assertFiveMajorHeadings(text) {
  const actual = text.split('\n').filter((line) => line.startsWith('## ')).map((line) => line.slice(3));
  if (JSON.stringify(actual) !== JSON.stringify(LATIN_MASS_MAJOR_HEADINGS)) {
    throw new Error(`Latin Mass must have exactly five V4 major headings in order; found: ${actual.join(', ')}`);
  }
}

function assertKnownCyrillic(text, allowed) {
  text.split('\n').forEach((line, index) => {
    const phrase = stripHeading(line);
    if (hasCyrillic(phrase) && !allowed.has(phrase)) {
      throw new Error(`Unreviewed Cyrillic service text on line ${index + 1}: ${phrase}`);
    }
  });
}

/** Replace exact service lines only. No normalization of Latin or whitespace. */
export function normalizeLatinMassServiceText(text) {
  if (typeof text !== 'string') throw new Error('Latin Mass text must be a string.');
  assertFiveMajorHeadings(text);
  assertKnownCyrillic(text, approvedCyrillic);
  const counts = Object.fromEntries(LATIN_MASS_SERVICE_REPLACEMENTS.map(([before]) => [before, 0]));
  const after = text.split('\n').map((line) => {
    const heading = line.match(/^(#{2,4} )/u)?.[1] || '';
    const phrase = line.slice(heading.length);
    if (!replacements.has(phrase)) return line;
    counts[phrase] += 1;
    return heading + replacements.get(phrase);
  }).join('\n');
  assertLatinMassV41Change(text, after);
  return { text: after, changed: after !== text, counts };
}

/** Reject every change other than the explicit old → new whole-line replacements. */
export function assertLatinMassV41Change(before, after) {
  assertFiveMajorHeadings(before);
  assertFiveMajorHeadings(after);
  assertKnownCyrillic(before, approvedCyrillic);
  assertKnownCyrillic(after, approvedAfter);
  const oldLines = before.split('\n');
  const newLines = after.split('\n');
  if (oldLines.length !== newLines.length) throw new Error('Latin Mass line count changed.');
  oldLines.forEach((line, index) => {
    const heading = line.match(/^(#{2,4} )/u)?.[1] || '';
    const phrase = line.slice(heading.length);
    const expected = heading + (replacements.get(phrase) || phrase);
    if (newLines[index] !== expected) {
      throw new Error(`Unapproved Latin Mass change on line ${index + 1}.`);
    }
  });
}

export function planLatinMassV41(snapshot) {
  if (!snapshot?.exists) throw new Error(`prayers/${LATIN_MASS_ID} is missing.`);
  const data = snapshot.data || {};
  const paths = Object.keys(data.textVersions || {})
    .filter((key) => typeof data.textVersions[key] === 'string')
    .sort().map((key) => `textVersions.${key}`);
  if (JSON.stringify(paths) !== JSON.stringify(LATIN_MASS_FIELDS)) {
    throw new Error(`Unexpected Latin Mass text fields: ${paths.join(', ') || 'none'}`);
  }
  if (Object.hasOwn(data, 'text')) throw new Error('Unexpected top-level Latin Mass text field.');
  const originals = paths.map((path) => data.textVersions[path.split('.')[1]]);
  if (!originals.every((value) => value === originals[0])) {
    throw new Error('Latin Mass textVersions differ; review each version before migrating.');
  }
  const texts = {};
  const fields = paths.map((fieldPath) => {
    const before = data.textVersions[fieldPath.split('.')[1]];
    const result = normalizeLatinMassServiceText(before);
    texts[fieldPath] = { before, after: result.text };
    return {
      path: fieldPath,
      changed: result.changed,
      beforeSha256: sha256(before),
      afterSha256: sha256(result.text),
      counts: result.counts,
    };
  });
  return {
    id: LATIN_MASS_ID,
    status: fields.some((field) => field.changed) ? 'update' : 'unchanged',
    updateTime: snapshot.updateTime || null,
    fields,
    texts,
  };
}

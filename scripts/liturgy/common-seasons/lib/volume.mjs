/**
 * Offline reader and structural parser of the three printed volumes of the
 * Liturgy of the Hours (Belarusian): I Advent + Christmas, II Lent + Easter,
 * III Ordinary Time. The UTF-8 files are plain text made from the original
 * `.doc` files (no translation, only soft hyphens removed).
 *
 * The parser recognises STRUCTURE (Common → Hour → component) from the layout
 * of the book, never a free-text search for a season word:
 *
 *   «АГУЛЬНЫЯ ТЭКСТЫ …»            Common
 *   І НЕШПАРЫ / ЗАКЛІК / ГАДЗІНА ЧЫТАННЯЎ / ЮТРАНЬ / МАЛІТВА НА ПРАЦЯГУ ДНЯ / ІІ НЕШПАРЫ
 *   Гімн / Псальмодыя / N ант. / Псальм|Песня / Кароткае чытанне / К. Н. …   components
 *   «У Вялікі пост:», «У Велікодны перыяд:», «У перыяд Адвэнту:» …          seasonal branches
 *
 * Output: for every Common an ordered list of component UNITS, each unit with
 * its text lines (original line numbers kept) and the seasonal branches found
 * inside it. Mapping of a unit to a `common-texts` field is done in `fields.mjs`.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

export const VOLUMES = Object.freeze({
  I: { id: 'I', file: '01_advent_christmas_utf8.txt', title: 'Том I: Адвэнт + перыяд Нараджэння Пана', seasons: ['advent', 'christmas'] },
  II: { id: 'II', file: '02_lent_easter_utf8.txt', title: 'Том II: Вялікі пост + Велікодны перыяд', seasons: ['lent', 'easter'] },
  III: { id: 'III', file: '03_ordinary_utf8.txt', title: 'Том III: Звычайны перыяд (базавы корпус)', seasons: ['ordinary'] },
});

const SOFT_HYPHEN = /\u00ad/g;

/** Read a volume: [{ n, text }] with 1-based ORIGINAL line numbers (blank lines kept). */
export function readVolume(filePath) {
  const buffer = fs.readFileSync(filePath);
  const raw = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).map((line, index) => ({
    n: index + 1,
    text: line.replace(SOFT_HYPHEN, '').replace(/[\u00a0\u2007\u202f]/g, ' ').replace(/[ ]+$/g, '').replace(/^[ ]+/g, ''),
  }));
  return { lines, sha256: crypto.createHash('sha256').update(buffer).digest('hex'), bytes: buffer.length };
}

/** Comparison key: layout and typography are not content. */
export function normalizeForCompare(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[\u00a0\u2007\u202f\u00ad\u200b]/g, ' ')
    .replace(/[’‘`´ʼ]/g, "'")
    .replace(/[«»„“”"]/g, '"')
    .replace(/[\u2013\u2014\u2212\u2012]/g, '-')
    .replace(/(?!\p{L})i(?!\p{L})/gu, 'і')
    .replace(/(?<=[А-Яа-яЁёІіЎў])i|i(?=[А-Яа-яЁёІіЎў])/g, 'і')
    .replace(/(?<=[А-Яа-яЁёІіЎў])I|I(?=[А-Яа-яЁёІіЎў])/g, 'І')
    .replace(/(^|\s)[•-]\s+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('be');
}

export const sha1 = (value) => crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 16);

export const COMMON_BY_HEADING = [
  [/ПАСВЯЧЭННЕ\s*КАСЦЁЛА/, 'church-dedication'],
  [/НАЙСВЯЦЕЙШУЮ\s*ПАННУ/, 'blessed-virgin-mary'],
  [/АПОСТАЛАЎ/, 'apostles'],
  [/АДНАГО\s*МУЧАНІКА/, 'martyr-one'],
  [/НЕКАЛЬКІХ\s*МУЧАНІКАЎ/, 'martyrs-many'],
  [/МУЧАНІКАЎ/, 'martyrs-many'],
  [/ПАСТЫРАЎ/, 'pastors'],
  [/ДОКТАРАЎ/, 'doctors-of-church'],
  [/ПАННАЎ/, 'virgins'],
  [/СВЯТЫХ\s*МУЖЧЫН/, 'holy-men'],
  [/СВЯТЫХ\s*ЖАНЧЫН/, 'holy-women'],
  [/ЗАКОННІКАЎ/, 'religious'],
  [/МІЛАСЭРНАСЦІ/, 'works-of-mercy'],
  [/ВЫХАВАЦЕЛЯЎ/, 'educators'],
];

export const HOUR_BY_HEADING = new Map([
  ['І НЕШПАРЫ', 'vespers1'],
  ['ЗАКЛІК', 'invitatory'],
  ['ГАДЗІНА ЧЫТАННЯЎ', 'officeOfReadings'],
  ['ЮТРАНЬ', 'laudes'],
  ['МАЛІТВА НА ПРАЦЯГУ ДНЯ', 'daytime'],
  ['ІІ НЕШПАРЫ', 'vespers2'],
]);

const SEASON_WORDS = [
  [/^У\s+Вялікі\s+пост(?!\p{L})/iu, 'lent'],
  [/^У\s+Велікодны\s+перыяд(?!\p{L})/iu, 'easter'],
  [/^У\s+перыяд\s+Адвэнту(?!\p{L})/iu, 'advent'],
  [/^У\s+перыяд\s+Нараджэння\s+Пана(?!\p{L})/iu, 'christmas'],
];

const upper = (value) => String(value || '').toLocaleUpperCase('be').replace(/\s+/g, ' ').trim();

/**
 * A seasonal branch marker line. Forms in the volumes:
 *   «У Вялікі пост:»                          (own line, optional colon)
 *   «У Вялікі пост: \t1 П 5, 10-11»           (own line followed by a tab + reference)
 *   «Пра Папу ці біскупа, у Вялікі пост:»     (Common alternative + season)
 *   «1 ант. у Велікодны перыяд: …»            (inline labelled antiphon — handled in the unit scanner)
 */
export function seasonMarker(text) {
  const line = text.trim();
  for (const [pattern, season] of SEASON_WORDS) {
    const match = pattern.exec(line);
    if (!match) continue;
    const rest = line.slice(match[0].length).replace(/^:/, '');
    return { season, rest: rest.replace(/^[\s\t]+/, ''), prefix: '' };
  }
  const withPrefix = /^(Пра [^:]{3,80}?),\s*у\s+(Вялікі пост|Велікодны перыяд)\s*:\s*$/i.exec(line);
  if (withPrefix) return { season: /Вялікі/i.test(withPrefix[2]) ? 'lent' : 'easter', rest: '', prefix: withPrefix[1] };
  return null;
}

/** Inline label of an antiphon: «1 ант. у Вялікі пост: …», «Ант. у Велікодны перыяд: …». */
export function inlineSeasonLabel(text) {
  const match = /^((?:[123]\s+)?[Аа]нт\.)\s+у\s+(Вялікі пост|Велікодны перыяд)\s*:\s*(.*)$/.exec(text.trim());
  if (!match) return null;
  return { head: match[1], season: /Вялікі/i.test(match[2]) ? 'lent' : 'easter', body: match[3] };
}

export const ALLELUIA_ANNOTATION = /\s*\(\s*Велікодны\s+перыяд\s+Аллелюя\s*\)\.?/;

/** Classify one line of an Hour of a Common. */
export function classifyLine(text) {
  const t = text.trim();
  if (!t) return { kind: 'blank' };
  const U = upper(t.replace(/:$/, ''));
  if (HOUR_BY_HEADING.has(U)) return { kind: 'hour', hour: HOUR_BY_HEADING.get(U) };
  if (/^АГУЛЬНЫЯ\s*ТЭКСТЫ/.test(U)) return { kind: 'commonHeading' };
  if (t === t.toLocaleUpperCase('be') && /^(ПРА\s+(НЕКАЛЬКІХ\s+МУЧАНІКАЎ|АДНАГО\s+МУЧАНІКА))$/.test(U)) return { kind: 'commonHeading', continuation: true };
  if (/^Гімн$/i.test(t)) return { kind: 'hymn' };
  if (/^(Ва ўрачыстасці і святы\s*[–-]\s*)?гімн\s+Цябе,\s*Бога/i.test(t)) return { kind: 'teDeum' };
  // A reference line («Гімн з ІІ Нешпараў, с. 1147.», «Гімн з Уласных тэкстаў пра святых.»), never a verse
  // that merely begins with the word «Гімн» («Гімн пастыру сёння спяваем.», «Гімн хвалы Табе хай будзе,»).
  if (/^Гімн(?!\p{L})/iu.test(t) && t.length < 140 && (/с\.\s*\d/u.test(t) || /[Уу]ласных\s+тэкстаў/u.test(t) || /^Гімн[\s.,]*(?:як|з)\s/iu.test(t))) return { kind: 'hymnRef' };
  if (/^Псальмодыя$/i.test(t)) return { kind: 'psalmody' };
  const label = inlineSeasonLabel(t);
  if (label && /^[123]/.test(label.head)) return { kind: 'ant', index: Number(label.head[0]), season: label.season, label };
  if (label) return { kind: 'antRepeat', season: label.season, label };
  let m = /^([123])\s+ант\./i.exec(t);
  if (m) return { kind: 'ant', index: Number(m[1]) };
  if (/^Ант\.\s+да\s+песні\s+(Марыі|Захарыі)(?!\p{L})/iu.test(t)) return { kind: 'canticleAnt', which: /Марыі/i.test(t) ? 'mag' : 'ben' };
  if (/^Ант\./i.test(t)) return { kind: 'antRepeat' };
  if (/^Псальмы\s+і\s+песня\s+з\s+нядзелі/i.test(t) || /^Псальм\s+Закліку/i.test(t)) return { kind: 'psalmRef' };
  if (/^(Псальм|Песня)(?!\p{L})/u.test(t)) return { kind: 'psalmTitle' };
  if (/^(І|ІІ|ІІІ|IV|V)\s*\(\d+\s*[-–]\s*\d+\)\s*$/u.test(t)) return { kind: 'psalmPart' };
  if (/^Кароткае\s+чытанне(?!\p{L})/u.test(t)) return { kind: 'shortReading' };
  if (/^Кароткі\s+рэспансорый(?!\p{L})/u.test(t)) return { kind: 'shortResponsory' };
  if (/^Рэспансорый(?!\p{L})/u.test(t)) return { kind: 'responsory' };
  if (/^Першае\s+чытанне(?!\p{L})/u.test(t)) return { kind: 'reading1' };
  if (/^Другое\s+чытанне(?!\p{L})/u.test(t)) return { kind: 'reading2' };
  if (/^Просьбы$/i.test(t)) return { kind: 'intercessions' };
  if (/^Малітва$/i.test(t)) return { kind: 'prayer' };
  if (/^Малітва\s+(перад\s+поўднем|апоўдні|пасля\s+поўдня)$/i.test(t)) {
    return { kind: 'daytimeHour', which: /перад/i.test(t) ? 'sext1' : /апоўдні/i.test(t) ? 'sext2' : 'sext3' };
  }
  if (/^Малітва\s+(з|як)(?!\p{L})/iu.test(t) || /^Малітва,\s*як/i.test(t)) return { kind: 'prayerRef' };
  const season = seasonMarker(t);
  if (season) return { kind: 'season', ...season };
  if (/^Або(\s+іншае|\s+іншыя)?\s*:/i.test(t)) return { kind: 'or' };
  if (/^К\.\s/.test(t) || /^Н\.\s/.test(t)) return { kind: 'versicle' };
  return { kind: 'text' };
}

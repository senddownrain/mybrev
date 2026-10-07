/**
 * Reader of a saved day page of the Belarusian Liturgy of the Hours viewer
 * (lh.catholic.by/showalldates). Pure: HTML in, structured hours out.
 *
 * A page carries one CALENDAR DATE, not one Office: when the next day has
 * I Vespers and outranks the current day, the Vespers section already
 * belongs to that celebration (its own heading names it and says
 * «І нешпары»). `sourceIdentityOf(page, hour)` therefore answers per hour,
 * and a field import must never take a Vespers field from a page whose
 * Vespers identity differs from the daytime identity.
 *
 * Field values are the source paragraphs, unchanged (the same HTML the
 * MyBrev `days` documents were imported from); only whitespace between
 * paragraphs is normalized.
 */

/** Section comments of the page → hour key. */
export const LH_SECTIONS = Object.freeze([
  ['Zaklik', 'invitatory'],
  ['Chas Chteniy', 'officeOfReadings'],
  ['Utrenya', 'lauds'],
  ['MPD 1', 'terce'],
  ['MPD 2', 'sext'],
  ['MPD 3', 'none'],
  ['Neshpary', 'vespers'],
  ['Kampleta', 'compline'],
]);

/** Hour key → MyBrev field prefix. */
const PREFIX = Object.freeze({
  officeOfReadings: 'officeOfReadings', lauds: 'laudes', terce: 'sext1', sext: 'sext2', none: 'sext3', vespers: 'vesper',
});

const RED = /color:\s*#ff0000/i;

const ENTITIES = Object.freeze({
  nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', ldquo: '“', rdquo: '”', bdquo: '„',
  lsquo: '‘', rsquo: '’', sbquo: '‚', dagger: '†', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', shy: '',
});

/** Entities → characters (the sources mix both spellings). */
export const decodeEntities = (text) => String(text ?? '')
  .replace(/&#(\d+);/g, (match, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (match, code) => String.fromCodePoint(parseInt(code, 16)))
  .replace(/&([a-z]+);/gi, (match, name) => (name.toLowerCase() in ENTITIES ? ENTITIES[name.toLowerCase()] : match));

/** Plain text of an HTML value (for comparisons; never for storage). */
export const plain = (html) => decodeEntities(String(html ?? '').replace(/<[^>]*>/g, ' '))
  .replace(/\u00ad/g, '')
  .replace(/[\s\u00a0]+/g, ' ')
  .trim();

/** Text of the red spans of a paragraph (rubrics, headings, markers). */
function redText(html) {
  const parts = [];
  const pattern = /<span[^>]*style="[^"]*color:\s*#ff0000[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;
  let match;
  while ((match = pattern.exec(html))) parts.push(plain(match[1]));
  return parts.filter(Boolean).join(' ').trim();
}

/** Top-level blocks (`<p>` / `<div>`) of a section, in order. */
function blocksOf(html) {
  const blocks = [];
  const pattern = /<(p|div)\b[^>]*>[\s\S]*?<\/\1>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const raw = match[0].trim();
    const text = plain(raw);
    if (!text) continue;
    blocks.push({ html: raw, text, red: redText(raw), isRedOnly: RED.test(raw) && plain(raw.replace(/<span[^>]*color:\s*#ff0000[^>]*>[\s\S]*?<\/span>/gi, '')) === '' });
  }
  return blocks;
}

function sectionHtml(html, name) {
  const start = html.match(new RegExp(`<!--\\s*Text ${name} Start\\s*-->`));
  const end = html.match(new RegExp(`<!--\\s*Text ${name} End\\s*-->`));
  if (!start || !end || end.index < start.index) return '';
  return html.slice(start.index + start[0].length, end.index);
}

/** «Серада - 7 чэрвеня 2023 / ІХ звычайны тыдзень / І тыдзень псалтыра» */
function parseDateHeader(html) {
  const match = html.match(/<div class="date">([\s\S]*?)<\/div>/i);
  if (!match) return null;
  const lines = match[1].split(/<br\s*\/?>|<\/?(?:p|div|h\d)[^>]*>/i).map(plain).filter(Boolean);
  const months = ['студзеня', 'лютага', 'сакавіка', 'красавіка', 'мая', 'чэрвеня', 'ліпеня', 'жніўня', 'верасня', 'кастрычніка', 'лістапада', 'снежня'];
  const dateLine = lines.find((line) => /\d{4}/.test(line)) || '';
  const dm = dateLine.match(/(\d{1,2})\s+(\S+)\s+(\d{4})/);
  const month = dm ? months.indexOf(dm[2].toLocaleLowerCase('be')) + 1 : 0;
  const iso = dm && month ? `${dm[3]}-${String(month).padStart(2, '0')}-${dm[1].padStart(2, '0')}` : null;
  return { date: iso, weekday: dateLine.split(/\s+-\s+/)[0] || '', lines };
}

const RANK_WORDS = /^(урачыстасць|свята|успамін|абавязковы ўспамін|неабавязковы ўспамін)$/iu;

/** Heading of an hour: plain «ЮТРАНЬ», or «<celebration> / <rank> / І нешпары». */
function parseHourHeading(block) {
  if (!block || !/^<div/i.test(block.html)) return { heading: '', celebration: null };
  const lines = block.html.split(/<br\s*\/?>/i).map(plain).filter(Boolean);
  const hourLine = lines[lines.length - 1] || '';
  if (lines.length < 2) return { heading: hourLine, celebration: null };
  const rank = lines.find((line) => RANK_WORDS.test(line)) || '';
  const title = lines.filter((line) => line !== rank && line !== hourLine).join(' ');
  return {
    heading: hourLine,
    celebration: { title, rank, firstVespers: /^і\s+нешпары$/iu.test(hourLine) },
  };
}

/**
 * @returns {{ header: object, hours: Record<string, { heading: string, celebration: object|null, blocks: object[] }> }}
 */
export function parseLhPage(html) {
  const header = parseDateHeader(html);
  const hours = {};
  LH_SECTIONS.forEach(([name, key]) => {
    const blocks = blocksOf(sectionHtml(html, name));
    if (!blocks.length) return;
    const headingBlock = /^<div/i.test(blocks[0].html) ? blocks[0] : null;
    const { heading, celebration } = parseHourHeading(headingBlock);
    hours[key] = { heading, celebration, blocks: headingBlock ? blocks.slice(1) : blocks };
  });
  // The celebration of the day (feast pages): the lines of the date header
  // after the date, without the psalter week.
  const dayLines = (header?.lines || []).slice(1).filter((line) => !/тыдзень псалтыра$/iu.test(line));
  const rank = dayLines.find((line) => RANK_WORDS.test(line)) || '';
  const title = dayLines.find((line) => line !== rank) || '';
  return { header: { ...header, title, rank }, hours };
}

/**
 * Liturgical identity an hour of the page belongs to: the day of the header,
 * unless the hour has its own celebration heading (I Vespers of tomorrow).
 */
export function sourceIdentityOf(page, hour) {
  const own = page.hours[hour]?.celebration;
  if (own?.title) {
    return { title: own.title, rank: own.rank, firstVespers: own.firstVespers, date: page.header?.date || null, ownHeading: true };
  }
  return { title: page.header?.title || '', rank: page.header?.rank || '', firstVespers: false, date: page.header?.date || null, ownHeading: false };
}

/** Is every hour of the page one Office (no I Vespers of another celebration)? */
export function hoursWithForeignIdentity(page) {
  const base = sourceIdentityOf(page, 'lauds');
  return Object.keys(page.hours).filter((hour) => {
    const identity = sourceIdentityOf(page, hour);
    return identity.ownHeading && identity.title !== base.title;
  });
}

// ---------------------------------------------------------------- fields --

const isHeading = (block, pattern) => block.isRedOnly && pattern.test(block.red);
const HYMN = /^гімн$/iu;
const PSALMODY = /^псальмодыя$/iu;
const READING1 = /^першае чытанне/iu;
const READING2 = /^другое чытанне/iu;
const PRAYER = /^малітва$/iu;
const INTERCESSIONS = /^просьбы$/iu;
const GOSPEL_CANTICLE = /^песня з евангелля$/iu;
const ANTIPHON = /^(?:(\d)\s*)?ант\.?(?!\s*да песні)/iu;
const RUBRIC_FONT = /font-size:\s*15px/i;
const DOXOLOGY_END = /на векі вечныя\.?\s*амэн\.?$/iu;
const CLOSING = /^(?:к\.\s*благаславім пана|пан з вамі|няхай пан благаславіць нас)/iu;

const join = (blocks) => blocks.map((block) => block.html).join('\n');

function antiphonNumber(block) {
  if (/да песні/iu.test(block.red)) return null;
  const match = block.red.match(/^(\d)?\s*ант\./iu);
  if (!match || !/^(\d\s*)?ант\./iu.test(block.text)) return null;
  return match[1] ? Number(match[1]) : 1;
}

/** Psalmody: antiphons + psalm units (a unit ends with the doxology). */
function psalmody(blocks) {
  const antiphons = [];
  const psalms = [];
  let current = null;
  const flush = () => { if (current?.length) psalms.push(current); current = null; };
  blocks.forEach((block) => {
    const number = antiphonNumber(block);
    if (number) {
      flush();
      if (!antiphons.some((item) => item.number === number && item.text === block.text)) antiphons.push({ number, text: block.text, html: block.html });
      return;
    }
    current = current || [];
    current.push(block);
    if (DOXOLOGY_END.test(block.text)) flush();
  });
  flush();
  return { antiphons, psalms };
}

function indexOf(blocks, predicate, from = 0) {
  for (let index = from; index < blocks.length; index += 1) if (predicate(blocks[index])) return index;
  return -1;
}

/** Content between a heading and the next red-only heading / closing rubric. */
function after(blocks, start, stop) {
  if (start < 0) return [];
  const result = [];
  for (let index = start + 1; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (stop(block)) break;
    result.push(block);
  }
  return result;
}

const isRubric = (block) => block.isRedOnly && RUBRIC_FONT.test(block.html);
const endOfText = (block) => block.isRedOnly || isRubric(block) || CLOSING.test(block.text);

/**
 * MyBrev fields of one hour.
 * @param {string} hour  key of `LH_SECTIONS`
 * @param {object[]} blocks
 */
export function fieldsOfHour(hour, blocks) {
  const fields = {};
  if (hour === 'invitatory') {
    const antiphon = blocks.find((block) => /^ант\./iu.test(block.red));
    if (antiphon) fields.invitatoriumAnt = antiphon.html;
    return fields;
  }
  const prefix = PREFIX[hour];
  if (!prefix) return fields;

  const hymnAt = indexOf(blocks, (block) => isHeading(block, HYMN));
  const psalmodyAt = indexOf(blocks, (block) => isHeading(block, PSALMODY));
  if (hymnAt >= 0) {
    const hymn = after(blocks, hymnAt, (block) => block.isRedOnly);
    if (hymn.length) fields[`${prefix}Hymn`] = join(hymn);
  }
  // Psalmody runs to the versicle (Office of Readings), the short reading or
  // the first reading.
  const psalmodyEnd = indexOf(blocks, (block) => /^кароткае чытанне/iu.test(block.red)
    || READING1.test(block.red) || (hour === 'officeOfReadings' && /^к\./iu.test(block.red) && !antiphonNumber(block) && !/ант\./iu.test(block.red)), psalmodyAt + 1);
  if (psalmodyAt >= 0) {
    const { antiphons, psalms } = psalmody(blocks.slice(psalmodyAt + 1, psalmodyEnd < 0 ? undefined : psalmodyEnd));
    antiphons.slice(0, 3).forEach((item, index) => { fields[`${prefix}Ant${index + 1}`] = item.html; });
    psalms.slice(0, 3).forEach((units, index) => { fields[`${prefix}Ps${index + 1}`] = join(units); });
  }

  if (hour === 'officeOfReadings') {
    const r1 = indexOf(blocks, (block) => READING1.test(block.red));
    const r2 = indexOf(blocks, (block) => READING2.test(block.red), r1 + 1);
    const teDeum = indexOf(blocks, (block) => isHeading(block, HYMN), r2 + 1);
    const prayer = indexOf(blocks, (block) => isHeading(block, PRAYER), r2 + 1);
    if (psalmodyEnd >= 0 && /^к\./iu.test(blocks[psalmodyEnd].red)) fields.officeOfReadingsVers = blocks[psalmodyEnd].html;
    if (r1 >= 0 && r2 > r1) fields.officeOfReadingsR1 = join(blocks.slice(r1, r2));
    const r2End = [teDeum, prayer].filter((index) => index > r2).sort((a, b) => a - b)[0];
    if (r2 >= 0) fields.officeOfReadingsR2 = join(blocks.slice(r2, r2End ?? blocks.length).filter((block) => block.text));
    fields.officeOfReadingsTeDeum = teDeum > r2 && r2 >= 0;
    if (prayer >= 0) fields.officeOfReadingsPr = join(after(blocks, prayer, endOfText));
    return fields;
  }

  const shortReading = indexOf(blocks, (block) => /^кароткае чытанне/iu.test(block.red));
  const canticle = indexOf(blocks, (block) => isHeading(block, GOSPEL_CANTICLE));
  const intercessions = indexOf(blocks, (block) => isHeading(block, INTERCESSIONS));
  const prayer = indexOf(blocks, (block) => isHeading(block, PRAYER));
  if (shortReading >= 0) {
    const end = [canticle, intercessions, prayer].filter((index) => index > shortReading).sort((a, b) => a - b)[0];
    fields[`${prefix}R`] = join(blocks.slice(shortReading, end ?? blocks.length));
  }
  if (canticle >= 0) {
    const antiphon = blocks[canticle + 1];
    if (antiphon && /ант\. да песні/iu.test(antiphon.red)) fields[`${prefix}${hour === 'lauds' ? 'AntBen' : 'AntMag'}`] = antiphon.html;
  }
  if (intercessions >= 0) {
    // «Ойча наш.» closes the intercessions in the book; MyBrev renders it itself.
    const items = after(blocks, intercessions, (block) => isHeading(block, PRAYER)).filter((block) => !/^ойча наш\.?$/iu.test(block.text));
    fields[`${prefix}Inter`] = join(items);
  }
  if (prayer >= 0) fields[`${prefix}Pr`] = join(after(blocks, prayer, endOfText));
  return fields;
}

/**
 * Every MyBrev field of the page, grouped by the source identity it belongs
 * to. `fields` holds only the hours of the page's own day; hours with a
 * foreign identity (I Vespers of tomorrow) are under `foreign`.
 */
export function extractPageFields(page) {
  const fields = {};
  const foreign = [];
  Object.entries(page.hours).forEach(([hour, { blocks }]) => {
    const identity = sourceIdentityOf(page, hour);
    const hourFields = fieldsOfHour(hour, blocks);
    if (hoursWithForeignIdentity(page).includes(hour)) {
      // I Vespers of another celebration → its vesper1* fields, kept apart.
      const renamed = Object.fromEntries(Object.entries(hourFields).map(([key, value]) => [key.replace(/^vesper/, identity.firstVespers ? 'vesper1' : 'vesper'), value]));
      foreign.push({ hour, identity, fields: renamed });
      return;
    }
    Object.assign(fields, hourFields);
  });
  return { identity: sourceIdentityOf(page, 'lauds'), fields, foreign };
}


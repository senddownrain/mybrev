/**
 * Mapping of structural units (units.mjs) onto the `common-texts` fields
 * (src/constants/officeFields.js) and plain-text views used for comparison.
 */
import { ALLELUIA_ANNOTATION, normalizeForCompare } from './volume.mjs';

const HOUR_PREFIX = { vespers1: 'vesper1', vespers2: 'vesper', laudes: 'laudes', officeOfReadings: 'officeOfReadings' };

/** @returns {string|null} field name, or null for units that carry no field text (refs, Te Deum flag). */
export function fieldOfUnit(unit) {
  const prefix = HOUR_PREFIX[unit.hour];
  if (unit.hour === 'invitatory') return unit.kind === 'ant' ? 'invitatoriumAnt' : null;
  if (unit.hour === 'daytime') {
    const sext = unit.sub;
    if (!sext) return null;
    if (unit.kind === 'ant') return `${sext}Ant1`;
    if (unit.kind === 'shortReading') return `${sext}R`;
    if (unit.kind === 'prayer') return `${sext}Pr`;
    return null;
  }
  if (!prefix) return null;
  switch (unit.kind) {
    case 'hymn': return `${prefix}Hymn`;
    case 'ant': return `${prefix}Ant${unit.index}`;
    case 'psalm': return `${prefix}Ps${unit.index}`;
    case 'shortReading': return `${prefix}R`;
    case 'canticleAnt': return unit.key === 'ben' ? 'laudesAntBen' : `${prefix}AntMag`;
    case 'intercessions': return `${prefix}Inter`;
    case 'prayer': return `${prefix}Pr`;
    case 'versicle': return 'officeOfReadingsVers';
    case 'reading1': return 'officeOfReadingsR1';
    case 'reading2': return 'officeOfReadingsR2';
    default: return null;
  }
}

const SPEECH_NOTE = /^Пры\s+спеве\s+наступнай/u;
const DASH_ONLY = /^[-–—_=\s]{5,}$/;
const HEADING_ONLY = /^(Гімн|Малітва)$/iu;

/** Order notes the way the project's HTML keeps them: «Пры спеве наступнай песні …» follows the title. */
function withNotes(lines, notes) {
  if (!notes?.length) return lines;
  const after = notes.filter((item) => SPEECH_NOTE.test(item.text));
  const before = notes.filter((item) => !SPEECH_NOTE.test(item.text));
  if (!lines.length) return [...before, ...after];
  return [...before, lines[0], ...after, ...lines.slice(1)];
}

/** Lines of a unit as they are read in `season` (null = the unit has branches, but none for this season). */
export function unitLines(unit, season = null, { withRepeats = true, raw = false, notes = true } = {}) {
  let lines;
  if (unit.branches.length) {
    const branch = unit.branches.find((item) => item.season === season);
    if (!branch) return null;
    lines = [...unit.lines, ...withNotes(branch.lines, notes ? branch.noteBefore : null), ...(withRepeats ? (branch.repeats || []) : [])];
  } else lines = withNotes([...unit.lines], notes ? unit.noteBefore : null);
  if (unit.suffix) lines.push(...unit.suffix);
  // «Кароткае чытанне» + a branch that starts with a tabbed reference («У Вялікі пост: \t1 П 5, 10-11»).
  if (unit.kind === 'shortReading' && unit.branches.length && lines.length > 1 && lines[0].text && /^Кароткае чытанне\s*$/u.test(lines[0].text.trim())) {
    const refLine = lines.find((line) => line.tabbed);
    if (refLine) {
      const rest = lines.filter((line) => line !== refLine);
      rest[0] = { ...rest[0], text: `${rest[0].text.trim()}\t${refLine.text}` };
      lines = rest;
    }
  }
  if (withRepeats && unit.repeats?.length) lines.push(...unit.repeats.filter((item) => !item.season || item.season === season));
  if (raw) return lines;
  return lines.filter((line, index) => !(index === 0 && HEADING_ONLY.test(line.text.trim())) && !DASH_ONLY.test(line.text));
}

export const stripAnnotation = (text) => text.replace(ALLELUIA_ANNOTATION, '').replace(/\s+$/, '');

/** Plain text of a unit for comparison with a base field (annotations removed, labels of branches ignored). */
export function unitPlain(unit, season = null, options = {}) {
  const lines = unitLines(unit, season, options);
  if (!lines) return null;
  const text = lines.map((line) => {
    let value = stripAnnotation(line.text);
    // Labelled antiphon: «1 ант. у Вялікі пост:» → «1 ант.»
    value = value.replace(/^((?:[123]\s+)?[Аа]нт\.)\s+у\s+(?:Вялікі пост|Велікодны перыяд)\s*:/u, '$1');
    return value.replace(/\t+/g, ' ');
  }).join(' ');
  return normalizeForCompare(text);
}

/**
 * Units of one Common grouped by target field. Several units on one field
 * (alternative readings, the Saturday memorial of Our Lady) are kept in book
 * order; the caller decides how to compare or merge them.
 */
export function fieldsOfCommon(common) {
  const fields = new Map();
  common.order.forEach((unit) => {
    const field = fieldOfUnit(unit);
    if (!field) return;
    if (!fields.has(field)) fields.set(field, []);
    fields.get(field).push(unit);
  });
  return fields;
}

/** Units that apply in `season`: shared units and the ones of a seasonal BLOCK of that season. */
export const unitsForSeason = (units, season) => units.filter((unit) => !unit.season || unit.season === season);

/** Seasons for which a field has block-level or branch-level text. */
export const seasonsOfUnits = (units) => [...new Set(units.flatMap((unit) => [unit.season, ...unit.branches.map((item) => item.season)]).filter(Boolean))];

/** Plain text of every unit of a field in book order, with the section heading of the Saturday memorial. */
export function fieldPlain(allUnits, season = null, options = {}) {
  const parts = [];
  let sawSection = false;
  const units = unitsForSeason(allUnits, season);
  for (const unit of units) {
    const lines = unitLines(unit, season, options);
    if (!lines) return null;
    if (unit.section !== 'main' && !sawSection && unit.sectionHeading) { parts.push(unit.sectionHeading.text); sawSection = true; }
    parts.push(lines.filter((line) => !CROSS_REFERENCE_LINE.test(line.text.trim())).map((line) => stripAnnotation(line.text)
      .replace(/^((?:[123]\s+)?[Аа]нт\.)\s+у\s+(?:Вялікі пост|Велікодны перыяд)\s*:/u, '$1').replace(/\t+/g, ' ')).join(' '));
  }
  return normalizeForCompare(parts.join(' '));
}

/**
 * Text of a field as the comparison between the volumes sees it: every active unit in book order,
 * seasonal rubrics and the Easter annotation removed, notes of the book («У дадатковай псальмодыі …»,
 * «Калі ніжэйпададзены псальм …») and section headings left out. `null` = the field has branches, none for `season`.
 */
/** «Пра некалькіх: ..., с. 1589.» — the book points to another page instead of printing a text. */
const CROSS_REFERENCE_LINE = /^[^:]{2,40}:\s*(?:\.{2,}|…)\s*,?\s*с\.\s*\d+/u;

export function comparableText(allUnits, season = null) {
  const parts = [];
  for (const unit of unitsForSeason(allUnits, season)) {
    const lines = unitLines(unit, season, { notes: false });
    if (!lines) return null;
    parts.push(lines.filter((line) => !CROSS_REFERENCE_LINE.test(line.text.trim())).map((line) => stripAnnotation(line.text)
      .replace(/^((?:[123]\s+)?[Аа]нт\.)\s+у\s+(?:Вялікі пост|Велікодны перыяд)\s*:/u, '$1').replace(/\t+/g, ' ')).join(' '));
  }
  return parts.join(' ');
}

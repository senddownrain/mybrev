/**
 * Unit scanner: volume lines → Commons → Hours → component units with
 * seasonal branches. Pure structure; no field mapping, no HTML.
 */
import {
  ALLELUIA_ANNOTATION, COMMON_BY_HEADING, classifyLine,
} from './volume.mjs';

const upper = (value) => String(value || '').toLocaleUpperCase('be').replace(/\s+/g, ' ').trim();

/** The index of antiphons to the Canticles etc. closes the main corpus of every volume. */
export function findIndexStart(lines) {
  for (let i = 0; i < lines.length; i += 1) {
    const text = upper(lines[i].text.replace(/\s+/g, ''));
    if (/^АНТЫФОНЫ(ДА|$)/.test(text) && /ПЕСНІ/.test(upper(`${lines[i].text} ${lines[i + 1]?.text || ''}`))) return i;
  }
  return lines.length;
}

function commonIdOf(headingText) {
  const text = upper(headingText);
  const match = COMMON_BY_HEADING.find(([pattern]) => pattern.test(text));
  return match ? match[1] : null;
}

const isHeadingLike = (text) => {
  const t = text.trim();
  if (!t || t.length > 90) return false;
  const letters = t.replace(/[^A-Za-zА-Яа-яЁёІіЎў]/g, '');
  return letters.length > 3 && letters === letters.toLocaleUpperCase('be') && !/^(І|ІІ)\s+НЕШПАРЫ$/.test(upper(t));
};

/** Which unit kinds start a new unit. */
const BOUNDARY = new Set([
  'hymn', 'hymnRef', 'teDeum', 'psalmody', 'ant', 'canticleAnt', 'psalmTitle', 'psalmRef', 'shortReading',
  'reading1', 'reading2', 'intercessions', 'prayer', 'prayerRef', 'daytimeHour',
]);

/**
 * @returns {{ commons: Map<string, object>, issues: object[], indexStart: number }}
 */
export function scanVolume(lines) {
  const end = findIndexStart(lines);
  const commons = new Map();
  const issues = [];
  let common = null;
  let hour = null;
  let sub = null; // daytime sub-hour
  let unit = null;
  let psalmIndex = 0;
  let pendingNote = [];
  let labelledAnt = {};
  let section = null;
  let blockSeason = null;

  const ensureCommon = (id, line) => {
    if (!commons.has(id)) commons.set(id, { id, startLine: line.n, preamble: [], hours: {}, order: [] });
    return commons.get(id);
  };
  const flush = () => { unit = null; };

  const open = (kind, key, line, extra = {}) => {
    const hourKey = hour === 'daytime' ? `daytime.${sub || 'sext?'}` : hour;
    const record = {
      id: `${hourKey}.${key}`,
      hour,
      sub,
      kind,
      key,
      startLine: line.n,
      section: section ? section.name : 'main',
      season: blockSeason,
      sectionHeading: section ? section.heading : null,
      lines: [],
      branches: [],
      repeats: [],
      annotations: 0,
      ...extra,
    };
    common.hours[hour] ||= [];
    common.hours[hour].push(record);
    common.order.push(record);
    unit = record;
    return record;
  };

  for (let i = 0; i < end; i += 1) {
    const line = lines[i];
    const info = classifyLine(line.text);

    if (info.kind === 'commonHeading') {
      // Gather up to two following heading lines (split headings).
      let text = line.text;
      let skip = 0;
      for (let k = 1; k <= 2 && i + k < end; k += 1) {
        const next = lines[i + k].text;
        if (!next.trim()) { skip += 1; continue; }
        if ((isHeadingLike(next) || (next.trim().length < 70 && /^(ЯКІЯ|ПРА|НА)\s/u.test(upper(next)) && !/[.:]$/.test(next.trim()))) && !classifyLine(next).hour) { text += ` ${next}`; skip += 1; } else break;
      }
      const id = commonIdOf(text);
      i += skip;
      flush();
      hour = null;
      sub = null;
      psalmIndex = 0;
      section = null;
      blockSeason = null;
      if (id) common = ensureCommon(id, line);
      else common = null;
      continue;
    }
    if (common && /^УСПАМІН\s+НАЙСВ/u.test(upper(line.text))) {
      section = { name: 'saturday', heading: line };
      flush();
      hour = null;
      continue;
    }
    if (info.kind === 'hour') {
      hour = info.hour;
      blockSeason = null;
      sub = null;
      psalmIndex = 0;
      pendingNote = [];
      flush();
      if (common) { common.hours[hour] ||= []; }
      continue;
    }
    if (!common) continue;
    if (!hour) {
      if (line.text.trim()) common.preamble.push({ n: line.n, text: line.text });
      continue;
    }

    if (info.kind === 'daytimeHour') {
      sub = info.which;
      psalmIndex = 0;
      flush();
      continue;
    }

    // Context-dependent «Ант.»: the antiphon of the invitatory / of a daytime
    // hour, otherwise the repeat after a psalm.
    if (info.kind === 'antRepeat' && !info.season && (hour === 'invitatory' || hour === 'daytime')) {
      open('ant', 'ant', line, { text: line.text });
      unit.lines.push({ n: line.n, text: line.text });
      if (pendingNote.length && hour !== 'daytime') { unit.noteBefore = pendingNote; pendingNote = []; }
      continue;
    }
    if (info.kind === 'antRepeat') {
      if (unit && unit.kind === 'psalm' && unit.openBranch) (unit.openBranch.repeats ||= []).push({ n: line.n, text: line.text, season: info.season || null });
      else if (unit && (unit.kind === 'psalm' || unit.kind === 'psalmRef' || unit.kind === 'ant')) unit.repeats.push({ n: line.n, text: line.text, season: info.season || null });
      else if (unit) unit.lines.push({ n: line.n, text: line.text });
      continue;
    }

    if (info.kind === 'ant') {
      psalmIndex = info.index;
      if (info.season) {
        const entry = { n: line.n, text: `${info.label.head} ${info.label.body}` };
        if (labelledAnt.unit && labelledAnt.unit.index === info.index && labelledAnt.unit.hour === hour) {
          unit = labelledAnt.unit;
          // «1 ант. у Велікодны перыяд: …» after «1 ант. у Вялікі пост: …».
          const branch = { season: info.season, lines: [entry] };
          unit.branches.push(branch);
          unit.openBranch = branch;
          if (labelledAnt.awaitingPsalm) labelledAnt.sharedPsalm = true; // no psalm between the two labels
          labelledAnt.awaitingPsalm = true;
          labelledAnt.season = info.season;
          continue;
        }
        const record = open('ant', `ant${info.index}`, line, { index: info.index, labelled: true });
        const branch = { season: info.season, lines: [entry] };
        record.branches.push(branch);
        record.openBranch = branch;
        Object.assign(labelledAnt, { unit: record, awaitingPsalm: true, sharedPsalm: false, season: info.season });
        continue;
      }
      labelledAnt = {};
      const record = open('ant', `ant${info.index}`, line, { index: info.index });
      record.lines.push({ n: line.n, text: line.text });
      continue;
    }

    if (info.kind === 'canticleAnt') {
      open('canticleAnt', info.which, line);
      unit.lines.push({ n: line.n, text: line.text });
      continue;
    }
    if (info.kind === 'psalmTitle' || info.kind === 'psalmRef' || info.kind === 'psalmPart') {
      if (info.kind === 'psalmPart' && unit && unit.kind === 'psalm' && unit.index === psalmIndex) { unit.lines.push({ n: line.n, text: line.text }); continue; }
      if (info.kind === 'psalmTitle' && unit && unit.kind === 'psalm' && unit.index === psalmIndex && !unit.repeats.length && !unit.branchPsalm) {
        // A second title of the same index (a split psalm, e.g. Ps 119) stays in the same unit.
        unit.lines.push({ n: line.n, text: line.text });
        continue;
      }
      const index = psalmIndex || 1;
      const owner = labelledAnt.unit && labelledAnt.awaitingPsalm && !labelledAnt.sharedPsalm && info.kind === 'psalmTitle';
      if (owner) {
        // The psalm/canticle belongs to the labelled antiphon: a seasonal branch of the psalm.
        let psalmUnit = common.hours[hour].find((item) => item.kind === 'psalm' && item.index === index && item.branchPsalm);
        if (!psalmUnit) {
          psalmUnit = open('psalm', `ps${index}`, line, { index, branchPsalm: true });
        } else { unit = psalmUnit; }
        const branch = { season: labelledAnt.season, lines: [{ n: line.n, text: line.text }, ...(labelledAnt.note || [])] };
        labelledAnt.note = [];
        if (pendingNote.length) { branch.noteBefore = pendingNote; pendingNote = []; }
        psalmUnit.branches.push(branch);
        psalmUnit.openBranch = branch;
        labelledAnt.awaitingPsalm = false;
        continue;
      }
      open(info.kind === 'psalmRef' ? 'psalmRef' : 'psalm', `ps${info.kind === 'psalmRef' ? 'ref' : index}`, line, { index });
      unit.lines.push({ n: line.n, text: line.text });
      if (pendingNote.length) { unit.noteBefore = pendingNote; pendingNote = []; }
      continue;
    }
    if (info.kind === 'hymn' || info.kind === 'hymnRef' || info.kind === 'teDeum') {
      open(info.kind === 'hymn' ? 'hymn' : info.kind, info.kind === 'hymn' ? 'hymn' : info.kind, line);
      unit.lines.push({ n: line.n, text: line.text });
      continue;
    }
    if (info.kind === 'psalmody') { flush(); continue; }
    if (info.kind === 'shortReading') {
      open('shortReading', 'reading', line);
      unit.lines.push({ n: line.n, text: line.text });
      if (pendingNote.length) { unit.noteBefore = pendingNote; pendingNote = []; }
      continue;
    }
    if (info.kind === 'reading1' || info.kind === 'reading2') {
      open(info.kind, info.kind === 'reading1' ? 'reading1' : 'reading2', line);
      unit.lines.push({ n: line.n, text: line.text });
      continue;
    }
    if (info.kind === 'intercessions') { open('intercessions', 'inter', line); unit.lines.push({ n: line.n, text: line.text }); continue; }
    if (info.kind === 'prayer') { open('prayer', 'prayer', line); unit.lines.push({ n: line.n, text: line.text }); continue; }
    if (info.kind === 'prayerRef') { open('prayerRef', 'prayerRef', line); unit.lines.push({ n: line.n, text: line.text }); continue; }

    // K./N. pair between the psalmody and the First Reading of the Office of Readings.
    if (info.kind === 'versicle' && hour === 'officeOfReadings' && unit && ['psalm', 'ant', 'versicle'].includes(unit.kind)) {
      if (unit.kind !== 'versicle') open('versicle', 'vers', line);
      unit.lines.push({ n: line.n, text: line.text });
      continue;
    }

    // Everything else belongs to the current unit.
    if (!unit) {
      if (line.text.trim() && hour === 'daytime' && !sub) { pendingNote.push({ n: line.n, text: line.text }); continue; }
      if (line.text.trim() && hour === 'daytime' && sub) { pendingNote.push({ n: line.n, text: line.text }); continue; }
      if (line.text.trim()) issues.push({ type: 'orphan-line', common: common.id, hour, line: line.n, text: line.text.slice(0, 100) });
      continue;
    }
    if (info.kind === 'season') {
      // A marker directly followed by a new component (a whole block: reading, canticle antiphon,
      // intercessions, prayer …) opens a seasonal BLOCK: every unit up to the next marker belongs to it.
      let j = i + 1;
      while (j < end && !lines[j].text.trim()) j += 1;
      const nextKind = j < end ? classifyLine(lines[j].text).kind : 'text';
      if (['shortReading', 'canticleAnt', 'intercessions', 'prayer', 'hymn'].includes(nextKind)) {
        blockSeason = info.season;
        flush();
        continue;
      }
      beginBranch(unit, info, line);
      continue;
    }
    if (unit.kind === 'ant' && !unit.labelled && info.kind === 'text' && hour !== 'invitatory' && line.text.trim()) {
      // A note printed between an antiphon and the next component (it opens that component).
      pendingNote.push({ n: line.n, text: line.text });
      continue;
    }
    if (unit.kind === 'ant' && unit.labelled && info.kind === 'text' && labelledAnt.awaitingPsalm) {
      // A note printed between the labelled antiphon and its psalm («Пры спеве наступнай песні Аллелюя …»).
      (labelledAnt.note ||= []).push({ n: line.n, text: line.text });
      continue;
    }
    feed(unit, info, line);
  }
  for (const item of commons.values()) {
    for (const record of item.order) {
      const all = [...record.lines, ...record.branches.flatMap((b) => [...b.lines, ...(b.repeats || [])]), ...(record.suffix || []), ...record.repeats];
      record.annotations = all.filter((l) => ALLELUIA_ANNOTATION.test(l.text)).length;
      delete record.openBranch;
    }
  }
  return { commons, issues, indexStart: end };
}

function beginBranch(unit, info, line) {
  const branch = { season: info.season, prefix: info.prefix || '', lines: [], markerLine: line.n };
  if (info.rest) branch.lines.push({ n: line.n, text: info.rest, tabbed: true });
  unit.branches.push(branch);
  unit.openBranch = branch;
}

function feed(unit, info, line) {
  const entry = { n: line.n, text: line.text };
  const shortLike = unit.kind === 'shortReading' || unit.kind === 'prayer' || unit.kind === 'hymn';
  if (unit.openBranch) {
    // A short reading's seasonal branch ends where the shared K./N. responsory starts.
    if (unit.kind === 'shortReading' && (info.kind === 'versicle' || info.kind === 'shortResponsory')) {
      const textLines = unit.openBranch.lines.filter((l) => l.text.trim() && !/^К\.|^Н\./.test(l.text)).length;
      const inResponsoryBranch = unit.openBranch.lines.some((l) => /^К\.|^Н\./.test(l.text)) || unit.responsoryHeading;
      if (textLines > 0 && !inResponsoryBranch) {
        unit.openBranch = null;
        unit.suffix ||= [];
        unit.suffix.push(entry);
        return;
      }
    }
    unit.openBranch.lines.push(entry);
    return;
  }
  if (unit.suffix) { unit.suffix.push(entry); return; }
  if (info.kind === 'shortResponsory') unit.responsoryHeading = true;
  unit.lines.push(entry);
  void shortLike;
}

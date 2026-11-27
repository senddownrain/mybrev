/**
 * Novena Tracker V1 — shared definition builder and day resolver (contract 1.1).
 * Pure functions, no I/O. The Dart resolver must match resolveDay() exactly
 * (see NOVENA_TRACKER_V1_SPEC.md §3 and contract/fixtures).
 */
export const NOVENA_SCHEMA_VERSION = 1;
/** Found by review, not by the parser: publication waits for an editor. */
export const NEEDS_REVIEW = { zvkoIQoxh7ilXp7oUjFg: 'review:closing-after-day-9-may-belong-to-every-day' };
export const EXCLUDED = { v4g6eUqZvze29v5vq4o1: 'Пампейская навэнна: 54 дня, вне V1' };

const HEADING = /^(?:(#{1,6})\s+\S.*|\*\*(?!Молімся)[^*]{1,140}\*\*)\s*$/;
const level = (line) => { const m = HEADING.exec(line); return m ? (m[1] ? m[1].length : 7) : 0; };
const lines = (text) => String(text || '').replace(/\r\n/g, '\n').split('\n');
const norm = (s) => String(s).toLowerCase().replace(/­/g, '').replace(/i/g, 'і').replace(/[#*_\\.:«»"()]/g, ' ').replace(/\s+/g, ' ').trim();
/** Headings a `section` block can point at (editor helper, not part of the contract). */
export function headingsOf(text) {
  const seen = new Map();
  return lines(text).filter((line) => level(line)).map((line) => {
    const heading = line.trim();
    seen.set(heading, (seen.get(heading) || 0) + 1);
    return { heading, occurrence: seen.get(heading) };
  });
}
const ORD = ['перш', 'друг', 'трэц', 'чацв', 'пят', 'шост', 'с[её]м', 'восьм', '(?:дзяв|дзев)'];
export function dayNumberOfHeading(line) {
  if (!level(line)) return 0;
  const t = norm(line);
  const digit = /^(?:дзень ([1-9])|([1-9]) дзень)(?:\s|$)/.exec(t);
  if (digit) return Number(digit[1] || digit[2]);
  const i = ORD.findIndex((o) => new RegExp(`^(?:${o}\\S* дзень|дзень ${o}\\S*)(?:\\s|$)`).test(t));
  return i + 1;
}

/** Lines [start, end) of the n-th heading line equal to `heading`. */
export function sectionRange(text, heading, occurrence = 1) {
  const all = lines(text);
  let seen = 0;
  for (let i = 0; i < all.length; i += 1) {
    if (all[i].trim() !== heading || (seen += 1) !== occurrence) continue;
    const own = level(all[i]) || 7;
    let end = i + 1;
    while (end < all.length && !(level(all[end]) && level(all[end]) <= own)) end += 1;
    return [i, end];
  }
  return null;
}
export const sectionText = (text, heading, occurrence = 1) => {
  const range = sectionRange(text, heading, occurrence);
  return range ? lines(text).slice(...range).join('\n').trim() : null;
};

const isPublic = (p) => p && p.priestOnly !== true && p.effectivePriestOnly !== true;

/**
 * Block → { kind, title, markdown, collapsible, prayerId } or throws.
 * `prayers` is a Map id → public prayer.
 */
function resolveBlock(block, prayers) {
  if (block.type === 'inline') return { kind: block.kind || 'text', title: null, markdown: block.text, collapsible: false, prayerId: null };
  const prayer = prayers.get(block.prayerId);
  if (!isPublic(prayer)) throw new Error(`missing-or-closed-prayer:${block.prayerId}`);
  if (block.type === 'prayer') return { kind: 'prayer', title: prayer.title, markdown: String(prayer.text).trim(), collapsible: true, prayerId: prayer.id };
  if (block.type === 'section') {
    const markdown = sectionText(prayer.text, block.heading, block.occurrence || 1);
    if (markdown == null) throw new Error(`missing-section:${block.prayerId}:${block.heading}`);
    return { kind: 'section', title: null, markdown, collapsible: false, prayerId: prayer.id };
  }
  throw new Error(`unknown-block:${block.type}`);
}

/** The whole text order of one day (1-based). */
export function resolveDay(definition, dayNumber, prayers) {
  const day = definition.days.find((d) => d.number === dayNumber);
  if (!day) throw new Error(`missing-day:${dayNumber}`);
  const out = [];
  for (const block of definition.template) {
    if (block.type === 'daySection') for (const own of day.blocks) out.push(resolveBlock(own, prayers));
    else out.push(resolveBlock(block, prayers));
  }
  return out;
}

export function validateDefinition(definition, prayers) {
  const errors = [];
  const d = definition || {};
  if (d.schemaVersion !== NOVENA_SCHEMA_VERSION) errors.push('schemaVersion');
  if (!d.novenaId || !d.sourcePrayerId) errors.push('ids');
  if (!isPublic(prayers.get(d.sourcePrayerId))) errors.push('source-prayer-missing-or-closed');
  if (!Number.isInteger(d.durationDays) || d.durationDays < 1 || d.durationDays > 31) errors.push('durationDays');
  if (!Number.isInteger(d.contentVersion) || d.contentVersion < 1) errors.push('contentVersion');
  if (!Array.isArray(d.template) || !d.template.length) errors.push('template-empty');
  if (!Array.isArray(d.days) || d.days.length !== d.durationDays || d.days.some((x, i) => x.number !== i + 1)) errors.push('days');
  if (!errors.length) {
    for (const day of d.days) {
      try {
        if (!resolveDay(d, day.number, prayers).some((b) => b.markdown.trim())) errors.push(`day-empty:${day.number}`);
      } catch (error) { errors.push(error.message); }
    }
  }
  return [...new Set(errors)];
}

/** Build a definition from the source prayer's own «Парадак навэнны». */
export function buildDefinition(prayer, prayers) {
  const all = lines(prayer.text);
  const blockers = [];
  const covered = new Set();
  const cover = (a, b) => { for (let i = a; i < b; i += 1) covered.add(i); };
  const headings = all.map((line, i) => ({ i, line: line.trim() })).filter((h) => level(h.line));
  const occurrenceOf = (h) => headings.filter((x) => x.line === h.line && x.i <= h.i).length;
  const sectionBlock = (h) => {
    const occurrence = occurrenceOf(h);
    cover(...sectionRange(prayer.text, h.line, occurrence));
    return { type: 'section', prayerId: prayer.id, heading: h.line, occurrence };
  };
  const dayHeadings = headings.filter((h) => dayNumberOfHeading(h.line));
  const dayNumbers = dayHeadings.map((h) => dayNumberOfHeading(h.line));
  const hasDays = dayHeadings.length > 0;
  if (hasDays && dayNumbers.join() !== '1,2,3,4,5,6,7,8,9') blockers.push(`day-headings:${dayNumbers.join(',')}`);

  // The order list: «Парадак навэнны» followed by numbered lines.
  const orderAt = all.findIndex((l) => /Парадак навэнны/.test(l));
  const items = [];
  if (orderAt >= 0) {
    covered.add(orderAt);
    if (all[orderAt - 1]?.startsWith(':::')) covered.add(orderAt - 1);
    for (let i = orderAt + 1; i < all.length; i += 1) {
      const t = all[i].trim();
      if (!t || t === ':::') { covered.add(i); continue; }
      const m = /^\d+\\?\.\s+(.*)$/.exec(t);
      if (!m) break;
      items.push(m[1].trim()); covered.add(i);
    }
  }

  const template = [];
  for (const item of items) {
    const link = /\]\(\/prayer\/([^)]+)\)/.exec(item);
    const page = /\(с\.\s*\d+\)/.test(item);
    if (page) {
      blockers.push(`unlinked-reference:${item}`);
      template.push({ type: 'inline', kind: 'rubric', text: item });
    } else if (link) {
      if (isPublic(prayers.get(link[1]))) template.push({ type: 'prayer', prayerId: link[1] });
      else blockers.push(`missing-or-closed-prayer:${link[1]}`);
    } else if (/на вызначаны дзень/i.test(item)) {
      template.push({ type: 'daySection' });
    } else if (/^(_|Заклік)/.test(item)) {
      template.push({ type: 'inline', kind: 'text', text: item });
    } else {
      const wanted = norm(item);
      const found = headings.find((h) => !dayNumberOfHeading(h.line) && (norm(h.line) === wanted || wanted.startsWith(`${norm(h.line)} `)));
      if (found) template.push(sectionBlock(found));
      else blockers.push(`order-item-without-section:${item}`);
    }
  }

  if (!items.length) {
    // Two unambiguous shapes without a stated order; anything else needs an editor.
    const after = headings.find((h) => norm(h.line) === 'пасля малітвы кожнага дня');
    const daily = headings.find((h) => norm(h.line) === 'штодзённыя малітвы');
    if (hasDays && after) template.push({ type: 'daySection' }, sectionBlock(after));
    else if (!hasDays && daily) template.push(sectionBlock(daily));
    else {
      blockers.push('no-stated-order');
      if (hasDays) template.push({ type: 'daySection' });
      else template.push({ type: 'prayer', prayerId: prayer.id });
    }
  }
  if (hasDays && !template.some((b) => b.type === 'daySection')) blockers.push('order-has-no-day-item');
  if (!hasDays && template.some((b) => b.type === 'daySection')) blockers.push('order-expects-days-but-none');

  const days = Array.from({ length: 9 }, (_, n) => {
    const h = dayHeadings.find((x) => dayNumberOfHeading(x.line) === n + 1);
    return { number: n + 1, blocks: h ? [sectionBlock(h)] : [] };
  });

  // Anything outside the order and the days: a rubric before the first heading
  // is kept in place; other leftovers block publication.
  const firstHeading = headings[0]?.i ?? all.length;
  const preamble = all.slice(0, firstHeading).filter((l, i) => !covered.has(i)).join('\n').trim();
  if (preamble && !(template.length === 1 && template[0].type === 'prayer')) {
    template.unshift({ type: 'inline', kind: 'rubric', text: preamble.replace(/^:::rubric\n?|\n?:::$/g, '').trim() });
    cover(0, firstHeading);
  }
  const leftover = all.map((l, i) => ({ l: l.trim(), i })).filter((x) => x.l && x.l !== ':::' && !covered.has(x.i));
  const selfWhole = template.some((b) => b.type === 'prayer' && b.prayerId === prayer.id);
  if (leftover.length && !selfWhole) blockers.push(`uncovered-lines:${leftover.length}:${leftover[0].l.slice(0, 80)}`);

  if (NEEDS_REVIEW[prayer.id]) blockers.push(NEEDS_REVIEW[prayer.id]);

  const definition = {
    schemaVersion: NOVENA_SCHEMA_VERSION,
    novenaId: prayer.id,
    sourcePrayerId: prayer.id,
    title: prayer.title,
    contentVersion: 1,
    durationDays: 9,
    status: 'draft',
    trackerEnabled: false,
    template,
    days,
  };
  const errors = validateDefinition(definition, prayers);
  return { definition, blockers: [...new Set([...blockers, ...errors])] };
}

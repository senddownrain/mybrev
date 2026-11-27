/**
 * Novena Tracker V1 — shared definition builder and day resolver (contract 1.2).
 * Pure functions, no I/O. The Dart resolver must match resolveDay() exactly
 * (see NOVENA_TRACKER_V1_SPEC.md §3 and contract/fixtures).
 */
export const NOVENA_SCHEMA_VERSION = 1;
export const EXCLUDED = { v4g6eUqZvze29v5vq4o1: 'Пампейская навэнна: 54 дня, вне V1' };

const HEADING = /^(?:(#{1,6})\s+\S.*|\*\*(?!Молімся)[^*]{1,140}\*\*)\s*$/;
const level = (line) => { const m = HEADING.exec(line); return m ? (m[1] ? m[1].length : 7) : 0; };
const lines = (text) => String(text || '').replace(/\r\n/g, '\n').split('\n');
const norm = (s) => String(s).toLowerCase().replace(/­/g, '').replace(/i/g, 'і').replace(/[#*_\\.:«»"()]/g, ' ').replace(/\s+/g, ' ').trim();
const ORD = ['перш', 'друг', 'трэц', 'чацв', 'пят', 'шост', 'с[её]м', 'восьм', '(?:дзяв|дзев)'];
export function dayNumberOfHeading(line) {
  if (!level(line)) return 0;
  const t = norm(line);
  const digit = /^(?:дзень ([1-9])|([1-9]) дзень)(?:\s|$)/.exec(t);
  if (digit) return Number(digit[1] || digit[2]);
  const i = ORD.findIndex((o) => new RegExp(`^(?:${o}\\S* дзень|дзень ${o}\\S*)(?:\\s|$)`).test(t));
  return i + 1;
}

/** Headings a `section` block can point at (editor helper, not part of the contract). */
export function headingsOf(text) {
  const seen = new Map();
  return lines(text).filter((line) => level(line)).map((line) => {
    const heading = line.trim();
    seen.set(heading, (seen.get(heading) || 0) + 1);
    return { heading, occurrence: seen.get(heading) };
  });
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

/**
 * Owner's decisions of 2026-11-27 for novenas whose source does not say enough
 * for the parser (NOVENA_BLOCKED_DECISIONS.md, groups A–D). Source texts are
 * never edited. A decision that no longer fits its source throws → blocked.
 */
const LORETO = 'd_cn_5746a9036180a067';
const MERCY_LITANY = 'kibOzcwhAfunlGfNYnVz';
const MERCY_CHAPLET = 'YIhZBel5S4BDSIke4MKP';
const BOBOLA_LITANY = 'cn_df409141d8f4f0f2';

const need = (value, what) => {
  if (value == null || value === false) throw new Error(`decision-outdated:${what}`);
  return value;
};
const section = (prayer, heading) => {
  need(sectionRange(prayer.text, heading), heading);
  return { type: 'section', prayerId: prayer.id, heading, occurrence: 1 };
};
const dayHeading = (prayer, n) => need(lines(prayer.text).map((l) => l.trim()).find((l) => dayNumberOfHeading(l) === n), `day-${n}`);
const daysOf = (prayer, extra = () => []) => Array.from({ length: 9 }, (_, i) => ({
  number: i + 1, blocks: [section(prayer, dayHeading(prayer, i + 1)), ...extra(i + 1)],
}));
const noDays = () => Array.from({ length: 9 }, (_, i) => ({ number: i + 1, blocks: [] }));
const inline = (text) => ({ type: 'inline', kind: 'text', text: need(text?.trim() || null, 'inline') });
/** Source text from the first line starting with `from` up to the line starting with `to` (or the end). */
const excerpt = (text, from, to) => {
  const all = lines(text);
  const start = all.findIndex((l) => l.trim().startsWith(from));
  need(start >= 0, from);
  const end = to ? all.findIndex((l, i) => i > start && l.trim().startsWith(to)) : all.length;
  need(end > start, to);
  return all.slice(start, end).join('\n').trim();
};

/** The order list stays; a page reference becomes the prayer it names. */
const linkPage = (reference, blocks) => (prayer, built) => {
  const at = built.template.findIndex((b) => b.type === 'inline' && b.kind === 'rubric' && b.text.includes(reference));
  need(at >= 0, reference);
  const template = [...built.template];
  template.splice(at, 1, ...blocks);
  return { template, days: built.days };
};
const loreto = linkPage('(с. 28)', [{ type: 'prayer', prayerId: LORETO }]);
const daysOnly = (prayer) => ({ template: [{ type: 'daySection' }], days: daysOf(prayer) });

export const DECISIONS = {
  // A: a page number instead of a link.
  cn_38e44fcd858f9423: loreto,
  cn_6eb6dc8550aca59d: loreto,
  cn_9b5ac6e852892d96: loreto,
  cn_71fcef6576ae8b20: linkPage('(с. 603)', [
    { type: 'prayer', prayerId: MERCY_LITANY },
    { type: 'inline', kind: 'rubric', text: 'або' },
    { type: 'prayer', prayerId: MERCY_CHAPLET },
  ]),
  // B: the order is clear from the text itself.
  Hu99bIb4R7v3mINaNtbT: daysOnly,
  SZpGwrPMFSiOONOagPL8: daysOnly,
  XMJCWmBqkteNID7PxGeC: daysOnly,
  BwaAAX6vNeZ7EFbCEJW8: (prayer) => ({ template: [{ type: 'prayer', prayerId: prayer.id }], days: noDays() }),
  // C: a repeated text the book abbreviates is shown in full every day.
  b9F5qGGznu8z0v3jlLM3: (prayer) => {
    const full = excerpt(prayer.text, 'Пане Божа Усемагутны, праз', '**Дзень другі**');
    return {
      template: [{ type: 'daySection' }],
      days: daysOf(prayer, (n) => (n >= 3 ? [inline(full)] : [])),
    };
  },
  'import-10-navenna-za-pamerlykh-z-bl-a-hanaratam': (prayer) => {
    const chaplet = excerpt(prayer.text, '_Вяночак за канаючых і памерлых (', '**Другі дзень');
    return {
      template: [section(prayer, '**Уступная малітва**'), { type: 'daySection' }, section(prayer, '**Малітва на заканчэнне**')],
      days: daysOf(prayer, (n) => (n >= 2 ? [inline(chaplet)] : [])),
    };
  },
  // D: the common parts are read every day.
  VhXYtz8MrvCYftvbIInu: (prayer) => ({
    template: [section(prayer, '**Уступная малітва**'), { type: 'daySection' }], days: daysOf(prayer),
  }),
  zvkoIQoxh7ilXp7oUjFg: (prayer, built) => {
    // Only what follows day 9: the same versicle also occurs earlier.
    const last = need(sectionText(prayer.text, dayHeading(prayer, 9)), 'day-9');
    const closing = excerpt(last, 'К. Пане, Твой святы Провід');
    return {
      template: built.template,
      days: built.days.map((d) => (d.number < 9 ? { ...d, blocks: [...d.blocks, inline(closing)] } : d)),
    };
  },
  d_bd_ab47a646f2736a83: (prayer) => ({
    template: [
      { type: 'daySection' },
      { type: 'prayer', prayerId: BOBOLA_LITANY },
      // Not a section: its heading level would run on into the following days.
      inline(excerpt(prayer.text, '### Малітва на кожны дзень навэнны', '#### ДРУГІ ДЗЕНЬ')),
    ],
    days: daysOf(prayer),
  }),
};

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
  const decide = DECISIONS[prayer.id];
  if (decide) {
    try {
      Object.assign(definition, decide(prayer, definition));
      blockers.length = 0;
    } catch (error) { blockers.push(error.message); }
  }
  const errors = validateDefinition(definition, prayers);
  return { definition, blockers: [...new Set([...blockers, ...errors])] };
}

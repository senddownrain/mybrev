/**
 * Seasonal analysis of the Commons: three volumes × stored `common-texts`.
 * Produces the Common × Hour × Field × Season matrix and the PROPOSED sparse
 * `_seasonalVariants` (nothing is written here; see the CLI).
 *
 * Pipeline of one (field, season) cell, carrier-first: the stored HTML of the
 * Common is the carrier; only the seasonal part is rendered from the volume.
 *   A  explicit branch / block (У Вялікі пост: … / У Велікодны перыяд: …)
 *   B  seasonal repeat of the antiphon after a shared psalm («Ант. у Вялікі пост: …»)
 *   C  «(Велікодны перыяд Аллелюя)» after one element (Easter only)
 *   D  the stored text has an Alleluia built in, the Lent volume prints none
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { VOLUMES, normalizeForCompare, readVolume } from './volume.mjs';
import { scanVolume } from './units.mjs';
import {
  comparableText, fieldsOfCommon, unitLines, unitsForSeason,
} from './fields.mjs';
import { DIFFERENCE_CLASSES, classifyDifference, isReferenceOnly } from './compare.mjs';
import {
  escapeHtml, harmonizeAlignment, htmlToPlain, paragraph, splitBlocks,
} from './html.mjs';
import {
  renderUnitLines, renderVersicles, renderShortReading, renderAntiphonParagraph,
} from './render.mjs';
import {
  addAlleluiaToText, addAlleluiaToBlockHtml, removeAlleluiaFromBlockHtml, elementKind, hasAnnotation, similarity, stripAnnotationText,
} from './alleluia.mjs';
import { OFFICE_CONTENT_FIELDS } from '../../../../src/constants/officeFields.js';
import { DOXOLOGY_HTML } from '../../lib/psalmody-doxology.mjs';

export const SEASON_VOLUME = Object.freeze({ advent: 'I', christmas: 'I', lent: 'II', easter: 'II' });
export const SEASONS = Object.freeze(['advent', 'christmas', 'lent', 'easter']);

/**
 * D-1: fields where the seasonal volumes print only a CROSS-REFERENCE («Выбіраюцца найбольш адпаведныя тэксты … з Агульных
 * тэкстаў пра святых мужчын») and Volume III prints the same reference followed by one more legal reading («Або іншае»).
 * The reference is the set of legal choices: the season keeps the stored text (the reference and the extra reading) and
 * takes the volume's own sentence of the reference.
 */
export const REFERENCE_SET_FIELDS = Object.freeze(new Set(['holy-women.officeOfReadingsR2']));
const REFERENCE_SENTENCE = /^Выбіраюцца\s+найбольш\s+адпаведныя/u;

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');

/** Obvious misprints of the printed volumes, corrected with a report line (never silently). */
export const SOURCE_TYPO_FIXES = Object.freeze([
  { id: 'alleyuya', pattern: /([Аа])ллеюя/gu, replacement: '$1ллелюя', note: 'misprint «аллеюя» (every other occurrence reads «аллелюя»)' },
]);

export function fixSourceTypos(text, onFix) {
  let out = text;
  SOURCE_TYPO_FIXES.forEach((fix) => {
    fix.pattern.lastIndex = 0;
    if (fix.pattern.test(out)) { fix.pattern.lastIndex = 0; out = out.replace(fix.pattern, fix.replacement); onFix?.(fix); }
    fix.pattern.lastIndex = 0;
  });
  return out;
}

export function loadCorpus({ sourcesDir, commonDir }) {
  const volumes = {};
  Object.values(VOLUMES).forEach((meta) => {
    const read = readVolume(path.join(sourcesDir, meta.file));
    const scanned = scanVolume(read.lines);
    const commons = new Map();
    scanned.commons.forEach((common, id) => commons.set(id, { common, fields: fieldsOfCommon(common) }));
    volumes[meta.id] = { ...meta, ...read, commons, issues: scanned.issues, indexStart: scanned.indexStart };
  });
  const manifest = JSON.parse(fs.readFileSync(path.join(commonDir, 'manifest.json'), 'utf8'));
  const base = new Map();
  manifest.sections.forEach((section) => {
    const id = section.file.replace(/\.json$/, '');
    base.set(id, JSON.parse(fs.readFileSync(path.join(commonDir, section.file), 'utf8')));
  });
  return { volumes, manifest, base };
}

export const hourOfField = (field) => {
  if (field === 'invitatoriumAnt') return 'invitatory';
  const match = /^(vesper1|vesper|officeOfReadings|laudes|sext[123])/.exec(field);
  return match ? match[1] : '';
};

const stripHeading = (text) => text.replace(/^(першае чытанне|другое чытанне|просьбы|малітва|гімн) /, '');
const withoutDoxology = (value) => String(value || '').replaceAll(DOXOLOGY_HTML, '');
const psalmComparison = (value) => plainOf(withoutDoxology(value));
const plainOf = (value) => stripHeading(normalizeForCompare(Array.isArray(value) ? value.join(' ') : value));

const lineRange = (units) => {
  const numbers = units.flatMap((u) => [u.startLine, ...u.lines.map((l) => l.n), ...u.branches.flatMap((b) => b.lines.map((l) => l.n)), ...(u.suffix || []).map((l) => l.n)]);
  return numbers.length ? [Math.min(...numbers), Math.max(...numbers)] : [null, null];
};

/** Stored value (string | string[]) → blocks with the array element they belong to. */
function toBlocks(value) {
  const items = Array.isArray(value) ? value : [value];
  return { isArray: Array.isArray(value), blocks: items.flatMap((item, elem) => splitBlocks(item).map((html) => ({ html, elem }))), count: items.length };
}
function fromBlocks({ isArray, blocks, count }) {
  if (!isArray) return blocks.map((b) => b.html).join('\n');
  const out = Array.from({ length: count }, () => []);
  blocks.forEach((b) => out[Math.min(b.elem, count - 1)].push(b.html));
  return out.map((items) => items.join('\n'));
}

/** Lines of the units in `season`, Alleluia annotation resolved; unresolved ones are reported. */
function seasonLines(units, season, ctx) {
  const out = [];
  unitsForSeason(units, season).forEach((unit) => {
    const lines = unitLines(unit, season, { withRepeats: true });
    if (!lines) return;
    lines.forEach((line) => {
      let text = line.text;
      if (hasAnnotation(text)) {
        if (season === 'easter') {
          const res = addAlleluiaToText(text);
          if (res.ok) { ctx.alleluia.push({ line: line.n, rule: res.rule, before: stripAnnotationText(text), after: res.text, ...(res.dropped ? { dropped: res.dropped } : {}) }); text = res.text; }
          else {
            ctx.problems.push({ line: line.n, reason: res.reason, text: stripAnnotationText(text).slice(0, 100) });
            text = stripAnnotationText(text);
          }
        } else text = stripAnnotationText(text);
      }
      out.push({ ...line, text: fixSourceTypos(text, (fix) => ctx.typos.add(fix.id)) });
    });
  });
  return out;
}

const baseHasHeading = (html) => /^<p[^>]*>(?:<span[^>]*>)?\s*(Першае|Другое) чытанне/u.test(html || '');

/** A. Explicit seasonal branch/block. Returns replacement blocks. */
function stepExplicit({ units, season, base, ctx }) {
  const active = unitsForSeason(units, season);
  if (!active.length) return { fail: 'no unit of the volume carries this season' };
  const kinds = [...new Set(active.map((u) => u.kind))];
  if (kinds.length !== 1) return { fail: `mixed units: ${kinds.join(',')}` };
  const kind = kinds[0];
  const lines = seasonLines(units, season, ctx);
  if (!lines.length) return { fail: 'empty seasonal text' };
  const baseHtml = base ? fromBlocks(base).toString() : '';
  const baseText = Array.isArray(fromBlocks(base || { isArray: false, blocks: [] })) ? '' : (base ? base.blocks.map((b) => b.html).join('\n') : '');
  void baseHtml;

  if (kind === 'shortReading') {
    const unit = active[0];
    const onlyResponsory = active.length === 1 && unit.branches.length && unit.branches.every((b) => b.lines.every((l) => /^(К\.|Н\.)\s/u.test(l.text)));
    if (onlyResponsory && base) {
      const blocks = base.blocks;
      const headingIndex = blocks.findIndex((b) => /Кароткі\s+рэспансорый/u.test(htmlToPlain(b.html)));
      if (headingIndex < 0) return { fail: 'stored short reading has no «Кароткі рэспансорый» block' };
      const branch = unit.branches.find((b) => b.season === season);
      const respLines = lines.filter((l) => branch.lines.some((bl) => bl.n === l.n));
      const align = /text-align: justify/.test(blocks[headingIndex].html) ? 'justify' : 'none';
      const html = renderVersicles(respLines, { align });
      const prefixPlain = normalizeForCompare(unit.lines.map((l) => l.text).join(' ')).replace(/\s*кароткі рэспансорый.*$/u, '');
      const storedPlain = normalizeForCompare(blocks.slice(0, headingIndex).map((b) => htmlToPlain(b.html)).join(' '));
      return {
        blocks: [...blocks.slice(0, headingIndex + 1), ...splitBlocks(html).map((h) => ({ html: h, elem: blocks[headingIndex].elem }))],
        method: 'carrier+render', carrierSimilarity: similarity(prefixPlain, storedPlain), kind,
      };
    }
    // The note of the book about the supplementary psalmody (with the page of THAT volume) is not part of the
    // reading: where the stored text keeps it (without the page) it stays the stored one.
    const NOTE = /^У дадатковай псальмодыі/u;
    const storedNote = base?.blocks.find((b, i) => i === 0 && NOTE.test(htmlToPlain(b.html).trim()));
    const bodyLines = lines.filter((l) => !NOTE.test(l.text.trim()));
    const rendered = splitBlocks(renderShortReading(bodyLines)).map((html) => ({ html, elem: 0 }));
    const aligned = base ? harmonizeAlignment(rendered.map((b) => b.html), base.blocks.map((b) => b.html)).map((html) => ({ html, elem: 0 })) : rendered;
    return { blocks: [...(storedNote ? [{ html: storedNote.html, elem: 0 }] : []), ...aligned], method: 'render', kind };
  }
  if (kind === 'psalm' && base && active.length === 1) {
    // Same psalm as the stored one, only the closing antiphon differs: keep the stored psalm HTML.
    const repeats = lines.filter((l) => /^Ант\./u.test(l.text.trim()));
    const body = lines.filter((l) => !/^Ант\./u.test(l.text.trim()));
    const storedBlocks = base.blocks;
    const antIndex = storedBlocks.map((b, i) => [b, i]).filter(([b]) => /^Ант\./u.test(htmlToPlain(b.html).trim())).map(([, i]) => i).pop();
    const bodyPlain = normalizeForCompare(body.map((l) => l.text).join(' '));
    const storedBody = normalizeForCompare(withoutDoxology(storedBlocks.filter((b, i) => i !== antIndex).map((b) => b.html).join('\n')));
    if (antIndex !== undefined && repeats.length === 1 && similarity(bodyPlain, storedBody) >= 0.95) {
      const out = [...storedBlocks];
      out[antIndex] = { html: renderAntiphonParagraph(repeats[0].text), elem: storedBlocks[antIndex].elem };
      return { blocks: out, method: 'carrier+repeat', kind };
    }
  }
  const options = {};
  if (kind === 'reading1' || kind === 'reading2') {
    options.heading = base ? baseHasHeading(baseText) : true;
    const titled = base?.blocks.find((b) => /<em>/.test(b.html));
    if (titled && /text-align:\s*justify/.test(titled.html)) options.titleAlign = 'justify';
  }
  const html = renderUnitLines(active[0], lines, options);
  if (html == null) {
    // Kinds without a renderer (intercessions): usable only when the volume repeats the stored text.
    const volPlain = normalizeForCompare(lines.map((l) => l.text).join(' '));
    const storedPlain = base ? normalizeForCompare(base.blocks.map((b) => htmlToPlain(b.html)).join(' ')) : '';
    if (base && similarity(volPlain, storedPlain) >= 0.9) return { blocks: base.blocks, method: 'carrier-equal', kind };
    return { fail: `no renderer for ${kind} and the text differs from the stored one` };
  }
  const rendered = splitBlocks(html);
  const aligned = base && ['versicle', 'prayer', 'reading1', 'reading2'].includes(kind) ? harmonizeAlignment(rendered, base.blocks.map((b) => b.html)) : rendered;
  return { blocks: aligned.map((h) => ({ html: h, elem: 0 })), method: 'render', kind };
}

/** B. «Ант. у Вялікі пост: …» after a psalm that both seasons share. */
function stepRepeats({ units, season, state, ctx }) {
  const labelled = unitsForSeason(units, season).flatMap((u) => u.branches.length ? [] : u.repeats.filter((r) => r.season === season));
  if (!labelled.length) return false;
  if (!state.base) { ctx.problems.push({ reason: 'no stored psalm to carry the seasonal antiphon' }); return false; }
  const antIndex = [...state.base.blocks].map((b, i) => [b, i]).filter(([b]) => /^Ант\./u.test(htmlToPlain(b.html).trim())).map(([, i]) => i).pop();
  if (antIndex === undefined) { ctx.problems.push({ reason: 'stored psalm has no closing «Ант.» block' }); return false; }
  const text = fixSourceTypos(labelled[0].text.replace(/^Ант\.\s+у\s+(?:Вялікі пост|Велікодны перыяд)\s*:/u, 'Ант.'));
  const resolved = hasAnnotation(text) ? (season === 'easter' ? addAlleluiaToText(text) : { ok: true, text: stripAnnotationText(text) }) : { ok: true, text };
  if (!resolved.ok) { ctx.problems.push({ reason: resolved.reason, text: text.slice(0, 90) }); return false; }
  if (hasAnnotation(text) && season === 'easter') ctx.alleluia.push({ line: labelled[0].n, rule: resolved.rule, before: stripAnnotationText(text), after: resolved.text });
  state.base.blocks[antIndex] = { html: renderAntiphonParagraph(resolved.text), elem: state.base.blocks[antIndex].elem };
  state.methods.add('carrier+repeat');
  return true;
}

/** C. Alleluia after annotated elements (Easter). */
function stepAnnotations({ units, season, state, ctx, handledByRender }) {
  if (season !== 'easter') return false;
  const annotated = unitsForSeason(units, season).flatMap((u) => unitLines(u, season, { withRepeats: true }) || []).filter((l) => hasAnnotation(l.text));
  if (!annotated.length) return false;
  if (handledByRender) return false; // the explicit text was rendered with the annotation already resolved
  if (!state.base) { ctx.problems.push({ reason: 'no stored base field to carry the Alleluia', text: stripAnnotationText(annotated[0].text).slice(0, 90) }); return false; }
  const used = new Set();
  let changed = false;
  annotated.forEach((line) => {
    const element = stripAnnotationText(line.text).replace(/\t+/g, ' ');
    let best = -1; let bestScore = 0;
    state.base.blocks.forEach((block, index) => {
      if (/^<hr/i.test(block.html) || used.has(index)) return;
      const plain = htmlToPlain(block.html).replace(/\s+/g, ' ').trim();
      if (!plain) return;
      const labelOf = (t) => (/^([123])\s+ант\./iu.exec(t.trim()) || [])[1];
      if (labelOf(element) && labelOf(plain) && labelOf(element) !== labelOf(plain)) return;
      const score = similarity(element, plain);
      if (score > bestScore) { bestScore = score; best = index; }
    });
    if (best < 0 || bestScore < 0.7) { ctx.problems.push({ line: line.n, reason: `no stored block matches the annotated element (best similarity ${bestScore.toFixed(2)})`, text: element.slice(0, 90) }); return; }
    const res = addAlleluiaToText(line.text);
    if (!res.ok) { ctx.problems.push({ line: line.n, reason: res.reason, text: element.slice(0, 90) }); return; }
    const kind = elementKind(element);
    const edited = addAlleluiaToBlockHtml(state.base.blocks[best].html, kind, { dropDagger: res.dropped === '†' });
    if (!edited.ok) { ctx.problems.push({ line: line.n, reason: edited.reason, text: element.slice(0, 90) }); return; }
    used.add(best);
    if (bestScore < 0.85) ctx.problems.push({ line: line.n, reason: `low-confidence match (similarity ${bestScore.toFixed(2)}) between the annotated element and the stored block; applied, please verify`, text: element.slice(0, 90), lowConfidence: true });
    if (edited.html !== state.base.blocks[best].html) { state.base.blocks[best] = { html: edited.html, elem: state.base.blocks[best].elem }; changed = true; ctx.rules.add(edited.rule); state.methods.add('carrier+alleluia'); }
    ctx.alleluia.push({ line: line.n, rule: edited.rule, before: element, after: res.text, similarity: Number(bestScore.toFixed(2)), ...(edited.html === state.base.blocks[best].html && edited.rule === 'already-has-alleluia' ? { already: true } : {}), ...(res.dropped ? { dropped: res.dropped } : {}) });
  });
  return changed;
}

/** D. The stored antiphon carries an Alleluia, the Lent volume prints none. */
function stepRemoveAlleluia({ units, season, state, ctx }) {
  if (season !== 'lent' || !state.base) return false;
  const lines = unitsForSeason(units, season).flatMap((u) => unitLines(u, season, { withRepeats: true }) || []);
  let changed = false;
  state.base.blocks.forEach((block, index) => {
    const plain = htmlToPlain(block.html).replace(/\s+/g, ' ').trim();
    if (!/[Аа]ллелюя\.?\s*$/u.test(plain)) return;
    const counterpart = lines.map((l) => ({ l, score: similarity(stripAnnotationText(l.text), plain) })).sort((a, b) => b.score - a.score)[0];
    if (!counterpart || counterpart.score < 0.75) return;
    if (/[Аа]ллелюя\.?\s*$/u.test(stripAnnotationText(counterpart.l.text))) return;
    const res = removeAlleluiaFromBlockHtml(block.html);
    if (!res.ok) { ctx.problems.push({ line: counterpart.l.n, reason: res.reason }); return; }
    state.base.blocks[index] = { html: res.html, elem: block.elem };
    state.methods.add('carrier-alleluia-removed');
    changed = true;
  });
  return changed;
}

/**
 * @returns {{ matrix: object[], variants: Map<string, object>, review: object[], notes: object }}
 */
export function analyzeCorpus(corpus) {
  const matrix = [];
  const review = [];
  const variants = new Map();
  const typos = new Map();
  const alleluia = [];

  for (const [commonId, baseDoc] of corpus.base) {
    const perSeason = {};
    const volFields = (volId) => corpus.volumes[volId].commons.get(commonId)?.fields || new Map();
    const fieldNames = new Set([
      ...OFFICE_CONTENT_FIELDS.filter((f) => typeof baseDoc[f] === 'string' || Array.isArray(baseDoc[f])),
      ...volFields('I').keys(), ...volFields('II').keys(), ...volFields('III').keys(),
    ]);
    for (const field of fieldNames) {
      if (field === 'officeOfReadingsTeDeum') continue;
      const baseValue = baseDoc[field];
      const hasBaseText = (typeof baseValue === 'string' && /</.test(baseValue)) || (Array.isArray(baseValue) && baseValue.some((v) => /</.test(v)));
      for (const season of SEASONS) {
        const volId = SEASON_VOLUME[season];
        const units = volFields(volId).get(field) || [];
        const cell = {
          common: commonId, field, hour: hourOfField(field), season, volume: volId,
          category: 'ordinary_base', status: 'inherit', relation: 'n/a', source: null,
        };
        matrix.push(cell);
        if (!units.length) {
          cell.category = hasBaseText ? 'missing_source' : 'ordinary_base';
          cell.note = hasBaseText ? 'the volume does not print this field (the stored base is inherited)' : 'neither the volume nor the stored base carry text';
          continue;
        }
        const active = unitsForSeason(units, season);
        const [first, last] = lineRange(active);
        cell.source = { volume: volId, lines: [first, last], units: active.map((u) => u.id) };
        const explicit = active.some((u) => u.season === season || u.branches.some((b) => b.season === season));
        const repeatExplicit = active.some((u) => !u.branches.length && u.repeats.some((r) => r.season === season));
        const annotated = season === 'easter' && active.some((u) => u.annotations > 0);
        const lentAlleluia = season === 'lent' && hasBaseText && !explicit && !repeatExplicit;

        // The whole section of the seasonal volume against the whole section of Volume III (never the other way
        // round through a search for a marker): a missing local marker does not make the two texts equal.
        const ordUnits = volFields('III').get(field) || [];
        let cmp = null;
        let referenceOnly = false;
        if (!explicit && !repeatExplicit) {
          const volumeText = comparableText(units, season);
          if (volumeText !== null) {
            const ordinaryText = ordUnits.length ? comparableText(ordUnits, null) : '';
            cmp = classifyDifference(volumeText, ordinaryText);
            cmp.exact = normalizeForCompare(volumeText) === normalizeForCompare(ordinaryText);
            referenceOnly = isReferenceOnly(active.flatMap((u) => unitLines(u, season, { notes: false }) || []).map((l) => l.text));
            cmp.knSwap = cmp.class === 'lexical' && normalizeForCompare(swapLabels(volumeText)) === normalizeForCompare(ordinaryText);
          }
        }
        // The seasonal volume is the source of truth for its own seasons (decision D-4): wherever it prints a text
        // that differs in wording or composition from Volume III (not merely in spelling / typography, and not a
        // К./Н. label swap of the base), the season takes the volume's own edition as a whole-field variant.
        const seasonalEdition = Boolean(cmp) && !referenceOnly && !cmp.knSwap && !cmp.exact
          && (cmp.class === 'lexical' || ['subset-of-ordinary', 'passage-only-in-volume', 'passage-only-in-ordinary'].includes(cmp.relation));
        const wholeField = Boolean(cmp) && !referenceOnly && (cmp.class === 'different' || ['superset-of-ordinary', 'volume-only'].includes(cmp.relation) || seasonalEdition);
        if (cmp) cell.difference = describeDifference(cmp, { referenceOnly });

        const ctx = { problems: [], typos: new Set(), rules: new Set(), alleluia: [] };
        const state = { base: hasBaseText ? toBlocks(baseValue) : null, methods: new Set() };
        let touched = false;
        let renderedExplicit = false;
        if (explicit || wholeField) {
          cell.category = explicit ? 'seasonal_explicit' : 'seasonal_whole_field';
          const result = stepExplicit({ units, season, base: state.base, ctx });
          if (result.fail && seasonalEdition && !explicit) {
            // The volume's own edition of a plain (unmarked) field cannot be rendered (no renderer for this kind of
            // text): the base stays and the exact difference stays on record, it is not hidden as «equal».
            classifyPlainCell(cell, { cmp, referenceOnly, hasBaseText });
            cell.resolution = 'edition-unbuildable-kept-base';
            cell.note = `the volume's own wording could not be rendered (${result.fail}); the stored text is kept`;
            continue;
          }
          if (result.fail) {
            cell.status = 'review'; cell.note = result.fail;
            review.push({ type: explicit ? 'explicit-unbuildable' : 'whole-field-unbuildable', common: commonId, field, season, reason: result.fail, source: cell.source });
            continue;
          }
          // A volume that prints its alternatives as one text must not leave empty trailing elements of the stored
          // array (the base lists three alternatives, the volume one): the array is as long as what is printed.
          const printedCount = result.blocks.reduce((max, block) => Math.max(max, block.elem + 1), 1);
          state.base = { isArray: state.base?.isArray || false, count: state.base?.isArray ? Math.min(state.base.count, printedCount) : (state.base?.count || 1), blocks: result.blocks };
          state.methods.add(result.method);
          renderedExplicit = true; touched = true;
          cell.kind = result.kind;
          if (result.carrierSimilarity !== undefined && result.carrierSimilarity < 0.9) {
            review.push({ type: 'carrier-differs', common: commonId, field, season, reason: `the reading before the responsory differs from the stored text (similarity ${result.carrierSimilarity.toFixed(2)})`, source: cell.source });
          }
        }
        if (repeatExplicit) { cell.category = 'seasonal_explicit'; touched = stepRepeats({ units, season, state, ctx }) || touched; }
        if (annotated) {
          cell.category = 'seasonal_explicit';
          touched = stepAnnotations({ units, season, state, ctx, handledByRender: renderedExplicit }) || touched;
        }
        if (lentAlleluia) touched = stepRemoveAlleluia({ units, season, state, ctx }) || touched;
        ctx.typos.forEach((id) => typos.set(id, (typos.get(id) || 0) + 1));

        ctx.problems.forEach((problem) => review.push({ type: 'element-unresolved', common: commonId, field, season, ...problem, source: cell.source }));
        ctx.alleluia.forEach((item) => alleluia.push({ common: commonId, field, season, ...item }));

        if (!touched && annotated && ctx.alleluia.length && !ctx.problems.length && ctx.alleluia.every((item) => item.already)) {
          cell.status = 'inherit'; cell.relation = 'same';
          cell.note = 'the stored base text already carries the Alleluia that the annotation asks for (nothing to add)';
          continue;
        }
        if (!touched) {
          if (cell.category === 'seasonal_explicit') { cell.status = 'review'; cell.note = 'seasonal mark present but no change could be derived (see needs_review)'; continue; }
          if (!cmp) { cell.category = 'missing_source'; cell.relation = 'n/a'; cell.note = 'no comparable text for this season'; continue; }
          if (referenceOnly && hasBaseText && REFERENCE_SET_FIELDS.has(`${commonId}.${field}`)) {
            const sentence = active.flatMap((u) => unitLines(u, season, { notes: false }) || []).map((l) => l.text.trim()).find((t) => REFERENCE_SENTENCE.test(t));
            const target = sentence ? state.base.blocks.findIndex((b) => REFERENCE_SENTENCE.test(htmlToPlain(b.html).replace(/\s+/g, ' ').trim())) : -1;
            if (target >= 0) {
              state.base.blocks[target] = { html: paragraph(escapeHtml(sentence), 'justify'), elem: state.base.blocks[target].elem };
              const finalValue = fromBlocks(state.base);
              cell.category = 'seasonal_reference_set'; cell.status = 'variant'; cell.relation = 'differs'; cell.kind = 'reading2';
              cell.resolution = 'reference-set-of-variants'; cell.method = 'reference-set'; cell.rules = [];
              cell.note = 'the volume prints only the cross-reference; the season shows the volume\'s own sentence of it together with the further legal reading that Volume III prints («Або іншае»), nothing else is added';
              cell.sourceHash = sha(JSON.stringify(sentence));
              (perSeason[season] ||= {})[field] = { value: finalValue, equalsBase: false, method: cell.method, kind: cell.kind, rules: [], volume: volId, lines: cell.source.lines, hash: sha(JSON.stringify(finalValue)), partial: false };
              continue;
            }
          }
          classifyPlainCell(cell, { cmp, referenceOnly, hasBaseText });
          continue;
        }
        const value0 = fromBlocks(state.base);
        const value = value0;
        const countAlleluia = (v) => (normalizeForCompare(Array.isArray(v) ? v.join(' ') : v).match(/аллелюя/gu) || []).length;
        // (not for the volume's own edition: a text that differs in wording from Volume III is the season's text, D-4)
        const compareValue = cell.kind === 'psalm' ? psalmComparison : plainOf;
        const nearEqual = hasBaseText && !seasonalEdition && ['psalm', 'reading1', 'reading2'].includes(cell.kind) && similarity(compareValue(value), compareValue(baseValue)) >= 0.97
          && countAlleluia(value) === countAlleluia(baseValue);
        const equal = hasBaseText && (compareValue(value) === compareValue(baseValue) || nearEqual);
        if (equal && nearEqual) cell.editorialNote = 'equal to the stored base up to editorial wording';
        cell.method = [...state.methods].join('+');
        cell.rules = [...ctx.rules];
        if (equal && (!explicit || state.methods.has('carrier-equal'))) {
          cell.relation = 'same'; cell.note = 'the seasonal text equals the stored base (not duplicated)';
          if (seasonalEdition) cell.resolution = 'edition-equals-base';
          continue;
        }
        const equalsBase = Boolean(equal);
        const finalValue = equalsBase ? baseValue : value0;
        cell.relation = equalsBase ? 'same' : (hasBaseText ? 'differs' : 'absent');
        if (equalsBase) cell.note = 'explicit seasonal text of the volume equals the stored base; stored explicitly so the season does not depend on the base';
        cell.status = ctx.problems.some((p) => !p.lowConfidence) ? 'variant-partial' : 'variant';
        if (cmp) cell.resolution = wholeField ? (seasonalEdition ? 'seasonal-edition-variant' : 'whole-field-variant') : (cmp.relation === 'same-words' || cmp.relation === 'equal' ? 'variant-carrier-same-text' : 'variant-carrier-wording-kept');
        cell.sourceHash = sha(active.map((u) => (unitLines(u, season, { raw: true }) || []).map((l) => l.text).join('\n')).join('\n'));
        (perSeason[season] ||= {})[field] = {
          value: finalValue, equalsBase, method: cell.method, kind: cell.kind || 'annotated', rules: cell.rules, volume: volId, lines: cell.source.lines, hash: sha(JSON.stringify(finalValue)), partial: cell.status === 'variant-partial',
        };
      }
    }
    variants.set(commonId, perSeason);
  }
  propagateReferences({ corpus, matrix, variants });
  completeReferenceSets({ matrix, variants, corpus });
  completeReferenceReadings({ matrix, variants, corpus });
  propagateInheritance({ corpus, matrix, variants });
  markSeasonalVolumeAgreement({ corpus, matrix });
  return { matrix, variants, review, alleluia, typos };
}

/** Swap the К./Н. labels of a text (a base defect shows up as an exact swap). */
export const swapLabels = (text) => text.replace(/(^|\s)([КН])\.(?=\s)/gu, (m, lead, l) => `${lead}${l === 'К' ? 'Н' : 'К'}.`);

const round = (value) => Math.round(value * 1000) / 1000;

/** Serializable description of a comparison for the matrix / report. */
export function describeDifference(cmp, { referenceOnly = false } = {}) {
  const base = DIFFERENCE_CLASSES[referenceOnly ? 'structure' : cmp.class];
  return {
    class: base.number,
    className: referenceOnly ? 'structure' : cmp.class,
    relation: referenceOnly ? 'cross-reference-only' : cmp.relation,
    ...(cmp.minor !== undefined ? { minor: cmp.minor } : {}),
    ...(cmp.knSwap ? { knSwap: true } : {}),
    ...(cmp.exact ? { identical: true } : {}),
    coverage: { volume: round(cmp.coverage.volume), ordinary: round(cmp.coverage.ordinary) },
    tokens: cmp.tokens,
    ...(cmp.changes?.length ? { changes: cmp.changes.slice(0, 8) } : {}),
  };
}

/**
 * A cell with no seasonal evidence and no whole-field variant: the plain difference between the
 * seasonal volume and Volume III is classified (six classes) and the resolution is recorded.
 */
function classifyPlainCell(cell, { cmp, referenceOnly, hasBaseText }) {
  if (!hasBaseText) { cell.category = 'missing_source'; cell.relation = 'absent'; cell.note = 'the stored base has no text for this field'; return; }
  if (cmp.exact) { cell.category = 'ordinary_base'; cell.relation = 'same'; return; }
  cell.category = 'editorial_difference';
  cell.relation = 'differs';
  const d = cell.difference;
  if (referenceOnly) { cell.resolution = 'kept-base-cross-reference'; cell.note = 'the volume prints only a cross-reference where Volume III prints the text'; return; }
  if (cmp.knSwap) { cell.resolution = 'base-correction-kn'; cell.note = 'К./Н. labels are reversed in Volume III (the seasonal volume prints them correctly)'; return; }
  switch (d.className) {
    case 'orthography': cell.resolution = 'kept-base-typographic'; break;
    case 'lexical': cell.resolution = d.minor ? 'kept-base-minor-wording' : 'kept-base-substantial-wording'; break;
    case 'structure':
      cell.resolution = d.relation === 'subset-of-ordinary' ? 'kept-base-subset' : (/^passage/.test(d.relation) ? 'disputed-passage' : 'kept-base-structure');
      break;
    default: cell.resolution = 'unresolved';
  }
}

/** Commons that print «Усё з Агульных тэкстаў пра …, за выключэннем наступнага» take every other field from the parent of the SAME volume. */
export const COMMON_INHERITANCE = Object.freeze([{ child: 'doctors-of-church', parent: 'pastors', preamble: /Усё\s+з\s+Агульных\s+тэкстаў\s+пра\s+пастыраў/u }]);

/**
 * The child Common does not print a field (its section says «Усё з Агульных тэкстаў пра <parent>, за
 * выключэннем наступнага»), the stored child copies the parent's text, so the parent's seasonal text of the
 * same volume is the child's seasonal text. Only where the stored child equals the stored parent.
 */
function propagateInheritance({ corpus, matrix, variants }) {
  for (const { child, parent } of COMMON_INHERITANCE) {
    const childBase = corpus.base.get(child);
    const parentBase = corpus.base.get(parent);
    if (!childBase || !parentBase) continue;
    for (const season of SEASONS) {
      const volume = corpus.volumes[SEASON_VOLUME[season]];
      const printed = volume.commons.get(child)?.fields || new Map();
      const parentVariants = variants.get(parent)?.[season] || {};
      for (const [field, parentVariant] of Object.entries(parentVariants)) {
        if (printed.has(field) || (variants.get(child)?.[season] || {})[field]) continue;
        const a = childBase[field];
        const b = parentBase[field];
        if (!a || typeof a !== typeof b || plainOf(a) !== plainOf(b)) continue;
        const { from, ...inherited } = parentVariant;
        void from;
        (variants.get(child)[season] ||= {})[field] = { ...inherited, method: `inherit:${parent}`, inheritedFrom: parent };
        const cell = matrix.find((c) => c.common === child && c.field === field && c.season === season);
        if (cell) {
          cell.category = 'seasonal_inherited'; cell.status = 'variant'; cell.method = `inherit:${parent}`;
          cell.note = `the ${child} section of the volume prints «Усё з Агульных тэкстаў пра пастыраў»; ${parent}.${field} (${season}) applies`;
          cell.source = { volume: SEASON_VOLUME[season], lines: parentVariant.lines, units: [`${parent}.${field}`] };
        }
      }
    }
  }
}

/** Does the other seasonal volume print the same words as this one? (I = II ≠ III points at Volume III, not at the season.) */
function markSeasonalVolumeAgreement({ corpus, matrix }) {
  const cache = new Map();
  const textOf = (volId, commonId, field, season) => {
    const key = `${volId}|${commonId}|${field}`;
    if (!cache.has(key)) {
      const units = corpus.volumes[volId].commons.get(commonId)?.fields.get(field);
      cache.set(key, units ? comparableText(units, season) : null);
    }
    return cache.get(key);
  };
  matrix.filter((c) => c.difference && c.difference.className !== 'orthography').forEach((cell) => {
    const otherVolume = cell.volume === 'I' ? 'II' : 'I';
    const otherSeason = cell.volume === 'I' ? 'lent' : 'advent';
    const mine = textOf(cell.volume, cell.common, cell.field, cell.season);
    const other = textOf(otherVolume, cell.common, cell.field, otherSeason);
    if (mine === null || other === null) return;
    const agreement = classifyDifference(mine, other);
    cell.difference.sameAsOtherSeasonalVolume = agreement.class === 'orthography' || (agreement.class === 'lexical' && agreement.minor === true);
  });
}

/**
 * The volumes print «Гімн з ІІ Нешпараў» (I Vespers) and «Малітва з Ютрані»
 * (Office of Readings, Daytime Prayer) instead of a text. The stored Commons
 * keep a copy of that text, so a seasonal variant of the source field must be
 * copied to the target field, but only where the stored target equals the
 * stored source (otherwise the copy would invent a relation).
 */
export const REFERENCE_PAIRS = Object.freeze([
  { target: 'vesper1Hymn', source: 'vesperHymn', hour: 'vespers1', kind: 'hymnRef' },
  { target: 'officeOfReadingsPr', source: 'laudesPr', hour: 'officeOfReadings', kind: 'prayerRef' },
  { target: 'sext1Pr', source: 'laudesPr', hour: 'daytime', kind: 'prayerRef' },
  { target: 'sext2Pr', source: 'laudesPr', hour: 'daytime', kind: 'prayerRef' },
  { target: 'sext3Pr', source: 'laudesPr', hour: 'daytime', kind: 'prayerRef' },
]);

/**
 * D-1 (PR #132 verification A2): Volumes I and II print for the second reading of a holy woman ONLY the reference
 * «Выбіраюцца найбольш адпаведныя тэксты з ліку тых, што былі пададзены ў Агульных тэкстах пра святых мужчын, с. N»
 * (the Pius XII address belongs to Volume III only; nothing in I/II justifies it there). The legal set is therefore the
 * reference sentence followed by the texts of the Common of holy men of the SAME season volume (their own seasonal edition,
 * or the stored base where that Common has no variant), so the user can read the permitted choices without any automatic
 * substitution.
 */
function completeReferenceSets({ matrix, variants, corpus }) {
  const SOURCE = { common: 'holy-men', field: 'officeOfReadingsR2' };
  for (const season of SEASONS) {
    const own = variants.get('holy-women')?.[season]?.officeOfReadingsR2;
    if (!own || own.method !== 'reference-set') continue;
    const sentenceBlock = (Array.isArray(own.value) ? own.value.join('\n') : own.value).split('\n').find((b) => REFERENCE_SENTENCE.test(htmlToPlain(b).replace(/\s+/g, ' ').trim()));
    const menValue = variants.get(SOURCE.common)?.[season]?.[SOURCE.field]?.value ?? corpus.base.get(SOURCE.common)?.[SOURCE.field];
    if (!sentenceBlock || !menValue) continue;
    const joined = [sentenceBlock, '<hr />', Array.isArray(menValue) ? menValue.join('\n') : menValue].join('\n');
    own.value = joined; own.hash = sha(JSON.stringify(joined));
    const cell = matrix.find((c) => c.common === 'holy-women' && c.field === 'officeOfReadingsR2' && c.season === season);
    if (cell) cell.note = 'the volume prints only the cross-reference to the Common of holy men; the season shows the volume\'s sentence followed by the texts of that Common of the same volume (the legal set, read-only choice); the Pius XII address is Volume III only';
  }
}

/**
 * D-1, owner decision 2026-10-24: the first reading of a holy woman prints the same reference («Выбіраюцца найбольш
 * адпаведныя тэксты …, с. N») followed by the readings specific to a holy woman. The season's text is the volume's own text
 * of the field (rendered as printed); the legal set the reference points to, the first readings of the Common of holy men
 * of the SAME volume, is inserted right after the reference sentence, exactly where Volume III's base now has them.
 * Nothing else is added or reworded.
 */
function completeReferenceReadings({ matrix, variants, corpus }) {
  const SOURCE = { common: 'holy-men', field: 'officeOfReadingsR1' };
  for (const season of SEASONS) {
    const own = variants.get('holy-women')?.[season]?.officeOfReadingsR1;
    if (!own) continue;
    const blocks = (Array.isArray(own.value) ? own.value.join('\n') : own.value).split('\n');
    const at = blocks.findIndex((b) => REFERENCE_SENTENCE.test(htmlToPlain(b).replace(/\s+/g, ' ').trim()));
    const menValue = variants.get(SOURCE.common)?.[season]?.[SOURCE.field]?.value ?? corpus.base.get(SOURCE.common)?.[SOURCE.field];
    if (at < 0 || !menValue || blocks.some((b) => /<hr\s*\/?>/u.test(b))) continue;
    // Once the field has a rule (<hr />) the reader splits only at rules, so every further printed alternative gets its own.
    const tail = [];
    blocks.slice(at + 1).forEach((block) => {
      if (/^(?:Або\s+)?Інш(?:ае|ая|ыя)\s*,/iu.test(htmlToPlain(block).replace(/\s+/g, ' ').trim()) && tail.length && tail.at(-1) !== '<hr />') tail.push('<hr />');
      tail.push(block);
    });
    const joined = [...blocks.slice(0, at + 1), '<hr />', (Array.isArray(menValue) ? menValue.join('\n') : menValue).trim(), '<hr />', ...tail].join('\n');
    own.value = joined; own.hash = sha(JSON.stringify(joined)); own.method = `${own.method}+reference-set`;
    const cell = matrix.find((c) => c.common === 'holy-women' && c.field === SOURCE.field && c.season === season);
    if (cell) cell.method = own.method;
    if (cell) cell.note = `${cell.note ? `${cell.note}; ` : ''}the reference sentence is followed by the first readings of the Common of holy men of the same volume (the legal set, D-1), then the readings specific to a holy woman as printed`;
  }
}

function propagateReferences({ corpus, matrix, variants }) {
  for (const [commonId, baseDoc] of corpus.base) {
    for (const season of SEASONS) {
      const common = corpus.volumes[SEASON_VOLUME[season]].commons.get(commonId)?.common;
      const seasonal = variants.get(commonId)?.[season] || {};
      for (const pair of REFERENCE_PAIRS) {
        const sourceVariant = seasonal[pair.source];
        const targetBase = baseDoc[pair.target];
        const sourceBase = baseDoc[pair.source];
        if (!sourceVariant || typeof targetBase !== typeof sourceBase || !targetBase) continue;
        const cell = matrix.find((c) => c.common === commonId && c.field === pair.target && c.season === season);
        const refUnit = (common?.hours[pair.hour] || []).find((u) => u.kind === pair.kind);
        if (!refUnit) continue;
        // The volume's reference means the whole source hymn/prayer; a stored target that is the source minus its closing
        // doxology (martyrs-many.vesper1Hymn lacks «Каб мы заўсёды Цябе праслаўлялі. Амэн.») is the same text.
        const targetPlain = plainOf(targetBase);
        const sourcePlain = plainOf(sourceBase);
        const sameText = targetPlain === sourcePlain || (targetPlain.length > 200 && sourcePlain.startsWith(targetPlain));
        if (!sameText) { if (cell) { cell.status = 'review'; cell.note = `the volume refers to ${pair.source}, but the stored ${pair.target} differs from the stored ${pair.source}`; } continue; }
        (variants.get(commonId)[season] ||= {})[pair.target] = {
          ...sourceVariant, method: 'structural-ref', kind: 'ref', from: pair.source, rules: [],
        };
        if (cell) { cell.category = 'seasonal_structural'; cell.status = 'variant'; cell.method = 'structural-ref'; cell.note = `volume line ${refUnit.startLine}: reference to ${pair.source}`; cell.source = { volume: SEASON_VOLUME[season], lines: [refUnit.startLine, refUnit.startLine], units: [refUnit.id] }; }
      }
    }
  }
}

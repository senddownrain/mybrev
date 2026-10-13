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
  fieldsOfCommon, fieldPlain, unitLines, unitsForSeason,
} from './fields.mjs';
import {
  htmlToPlain, splitBlocks,
} from './html.mjs';
import {
  renderUnitLines, renderVersicles, renderShortReading, renderAntiphonParagraph,
} from './render.mjs';
import {
  addAlleluiaToText, addAlleluiaToBlockHtml, removeAlleluiaFromBlockHtml, elementKind, hasAnnotation, similarity, stripAnnotationText,
} from './alleluia.mjs';
import { OFFICE_CONTENT_FIELDS } from '../../../../src/constants/officeFields.js';

export const SEASON_VOLUME = Object.freeze({ advent: 'I', christmas: 'I', lent: 'II', easter: 'II' });
export const SEASONS = Object.freeze(['advent', 'christmas', 'lent', 'easter']);

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
          if (res.ok) text = res.text;
          else {
            ctx.problems.push({ line: line.n, reason: res.reason, text: stripAnnotationText(text).slice(0, 100), unverified: res.unverified, proposal: res.proposal, rule: res.rule });
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
    return { blocks: splitBlocks(renderShortReading(lines)).map((html) => ({ html, elem: 0 })), method: 'render', kind };
  }
  if (kind === 'psalm' && base && active.length === 1) {
    // Same psalm as the stored one, only the closing antiphon differs: keep the stored psalm HTML.
    const repeats = lines.filter((l) => /^Ант\./u.test(l.text.trim()));
    const body = lines.filter((l) => !/^Ант\./u.test(l.text.trim()));
    const storedBlocks = base.blocks;
    const antIndex = storedBlocks.map((b, i) => [b, i]).filter(([b]) => /^Ант\./u.test(htmlToPlain(b.html).trim())).map(([, i]) => i).pop();
    const bodyPlain = normalizeForCompare(body.map((l) => l.text).join(' '));
    const storedBody = normalizeForCompare(storedBlocks.filter((b, i) => i !== antIndex).map((b) => htmlToPlain(b.html)).join(' '));
    if (antIndex !== undefined && repeats.length === 1 && similarity(bodyPlain, storedBody) >= 0.95) {
      const out = [...storedBlocks];
      out[antIndex] = { html: renderAntiphonParagraph(repeats[0].text), elem: storedBlocks[antIndex].elem };
      return { blocks: out, method: 'carrier+repeat', kind };
    }
  }
  const options = {};
  if (kind === 'reading1' || kind === 'reading2') options.heading = base ? baseHasHeading(baseText) : true;
  const html = renderUnitLines(active[0], lines, options);
  if (html == null) {
    // Kinds without a renderer (intercessions): usable only when the volume repeats the stored text.
    const volPlain = normalizeForCompare(lines.map((l) => l.text).join(' '));
    const storedPlain = base ? normalizeForCompare(base.blocks.map((b) => htmlToPlain(b.html)).join(' ')) : '';
    if (base && similarity(volPlain, storedPlain) >= 0.9) return { blocks: base.blocks, method: 'carrier-equal', kind };
    return { fail: `no renderer for ${kind} and the text differs from the stored one` };
  }
  return { blocks: splitBlocks(html).map((h) => ({ html: h, elem: 0 })), method: 'render', kind };
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
    if (!res.ok) { ctx.problems.push({ line: line.n, reason: res.reason, text: element.slice(0, 90), unverified: res.unverified, proposal: res.proposal, rule: res.rule }); return; }
    const kind = elementKind(element);
    const edited = addAlleluiaToBlockHtml(state.base.blocks[best].html, kind);
    if (!edited.ok) { ctx.problems.push({ line: line.n, reason: edited.reason, text: element.slice(0, 90) }); return; }
    used.add(best);
    if (bestScore < 0.85) ctx.problems.push({ line: line.n, reason: `low-confidence match (similarity ${bestScore.toFixed(2)}) between the annotated element and the stored block; applied, please verify`, text: element.slice(0, 90), lowConfidence: true });
    if (edited.html !== state.base.blocks[best].html) { state.base.blocks[best] = { html: edited.html, elem: state.base.blocks[best].elem }; changed = true; ctx.rules.add(edited.rule); state.methods.add('carrier+alleluia'); }
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
  const unverified = [];

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

        const ctx = { problems: [], typos: new Set(), rules: new Set() };
        const state = { base: hasBaseText ? toBlocks(baseValue) : null, methods: new Set() };
        let touched = false;
        let renderedExplicit = false;
        if (explicit) {
          cell.category = 'seasonal_explicit';
          const result = stepExplicit({ units, season, base: state.base, ctx });
          if (result.fail) {
            cell.status = 'review'; cell.note = result.fail;
            review.push({ type: 'explicit-unbuildable', common: commonId, field, season, reason: result.fail, source: cell.source });
            continue;
          }
          state.base = { isArray: state.base?.isArray || false, count: state.base?.count || 1, blocks: result.blocks };
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

        ctx.problems.forEach((problem) => {
          if (problem.unverified) unverified.push({ common: commonId, field, season, line: problem.line, proposal: problem.proposal, text: problem.text, rule: problem.rule });
          else review.push({ type: 'element-unresolved', common: commonId, field, season, ...problem, source: cell.source });
        });

        if (!touched) {
          // No seasonal evidence applied: classify the plain difference with the stored base.
          const a = fieldPlain(units, season);
          const b = hasBaseText ? plainOf(baseValue) : null;
          const a2 = a === null ? null : stripHeading(a);
          if (b === null) { cell.category = 'missing_source'; cell.relation = 'absent'; cell.note = 'the stored base has no text for this field'; continue; }
          if (cell.category === 'seasonal_explicit') { cell.status = 'review'; cell.note = 'seasonal mark present but no change could be derived (see needs_review)'; continue; }
          cell.relation = a2 === b ? 'same' : 'differs';
          cell.category = a2 === b ? 'ordinary_base' : 'editorial_difference';
          if (a2 !== b) {
            let i = 0; while (i < a2.length && a2[i] === b[i]) i += 1;
            cell.diff = { volume: a2.slice(Math.max(0, i - 40), i + 80), stored: b.slice(Math.max(0, i - 40), i + 80), at: i };
            const swap = (t) => t.replace(/(^|\s)([кн])\./gu, (m, lead, l) => `${lead}${l === 'к' ? 'н' : 'к'}.`);
            if (a2 && swap(a2) === b) { cell.note = 'К./Н. labels are swapped in the stored base (the volume of the season prints them correctly)'; cell.knSwap = true; }
          }
          continue;
        }
        const value0 = fromBlocks(state.base);
        const value = value0;
        const countAlleluia = (v) => (normalizeForCompare(Array.isArray(v) ? v.join(' ') : v).match(/аллелюя/gu) || []).length;
        const nearEqual = hasBaseText && ['psalm', 'reading1', 'reading2'].includes(cell.kind) && similarity(plainOf(value), plainOf(baseValue)) >= 0.97
          && countAlleluia(value) === countAlleluia(baseValue);
        const equal = hasBaseText && (plainOf(value) === plainOf(baseValue) || nearEqual);
        if (equal && nearEqual) cell.editorialNote = 'equal to the stored base up to editorial wording';
        cell.method = [...state.methods].join('+');
        cell.rules = [...ctx.rules];
        if (equal && (!explicit || state.methods.has('carrier-equal'))) { cell.relation = 'same'; cell.note = 'the seasonal text equals the stored base (not duplicated)'; continue; }
        const equalsBase = Boolean(equal);
        const finalValue = equalsBase ? baseValue : value0;
        cell.relation = equalsBase ? 'same' : (hasBaseText ? 'differs' : 'absent');
        if (equalsBase) cell.note = 'explicit seasonal text of the volume equals the stored base; stored explicitly so the season does not depend on the base';
        cell.status = ctx.problems.some((p) => !p.unverified && !p.lowConfidence) ? 'variant-partial' : 'variant';
        cell.sourceHash = sha(active.map((u) => (unitLines(u, season, { raw: true }) || []).map((l) => l.text).join('\n')).join('\n'));
        (perSeason[season] ||= {})[field] = {
          value: finalValue, equalsBase, method: cell.method, kind: cell.kind || 'annotated', rules: cell.rules, volume: volId, lines: cell.source.lines, hash: sha(JSON.stringify(finalValue)), partial: cell.status === 'variant-partial',
        };
      }
    }
    variants.set(commonId, perSeason);
  }
  propagateReferences({ corpus, matrix, variants });
  return { matrix, variants, review, unverified, typos };
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
        if (plainOf(targetBase) !== plainOf(sourceBase)) { if (cell) { cell.status = 'review'; cell.note = `the volume refers to ${pair.source}, but the stored ${pair.target} differs from the stored ${pair.source}`; } continue; }
        (variants.get(commonId)[season] ||= {})[pair.target] = {
          ...sourceVariant, method: 'structural-ref', kind: 'ref', from: pair.source, rules: [],
        };
        if (cell) { cell.category = 'seasonal_structural'; cell.status = 'variant'; cell.method = 'structural-ref'; cell.note = `volume line ${refUnit.startLine}: reference to ${pair.source}`; cell.source = { volume: SEASON_VOLUME[season], lines: [refUnit.startLine, refUnit.startLine], units: [refUnit.id] }; }
      }
    }
  }
}

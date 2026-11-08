/** Offline, field-aware GILH 123–125 audit. Edits use source offsets: Scripture,
 * antiphons, attributes and alternative wrappers are never reserialized. */
import { createHash } from 'node:crypto';
import { parse } from 'node-html-parser';
import { classifyField } from './field-audit.mjs';
import { getLiturgicalAlternatives } from '../../../src/utils/liturgicalAlternatives.js';

export const DOXOLOGY_HTML = '<p>Хвала Айцу і Сыну, <span style="color: #ff0000;">*</span><br />і Духу Святому.</p>\n<p>Як была спрадвеку, цяпер і заўсёды, <span style="color: #ff0000;">*</span><br />і на векі вечныя. Амэн.</p>';
export const psalmField = field => /^(?:officeOfReadings|laudes|sext[123]|vesper1?|comp|invitatorium)Ps\d+$/u.test(field);
export const sha256 = text => createHash('sha256').update(text).digest('hex');
export const plain = html => parse(String(html || '').replace(/<br\s*\/?>/gi, ' ')).text.replace(/\s+/gu, ' ').trim();
const prayerText = html => plain(html).replace(/(?:\(?Н\.\s*)?Аллелюя(?:\s*\(\s*аллелюя\s*\))?[.!]?\s*\)?\.?/giu, ' ').replace(/[*†]/gu, '').replace(/\s+/gu, ' ').trim();
const FULL = /Хвала Айцу і Сыну,\s*і Духу Святому\.\s*Як была спрадвеку, цяпер і заўсёды,\s*і на векі вечныя\. Амэн\./giu;
const antiphon = node => node.classList?.contains('ora-ant') || /^(?:\d+\s*)?(?:Ант\.|ант\.)/u.test(plain(node.toString()));
const hourOf = field => field.match(/^(.+?)Ps\d+$/u)?.[1] || '';

function ranges(html) {
  const root = parse(html);
  const structured = root.querySelectorAll('[data-alternative-title]').filter(n => !n.parentNode?.closest?.('[data-alternative-title]'));
  if (structured.length) return structured.map(n => ({ start: n.range[0], end: n.range[1], title: n.getAttribute('data-alternative-title') }));
  // The same boundaries that the psalm picker recognises, retaining raw bytes.
  const boundaries = root.childNodes.filter(n => n.nodeType === 1 && (n.rawTagName === 'hr' || n.rawTagName === 'p' && /^А\s*бо(?:\s+(?:інш(?:ае|ая|ыя)|яшчэ))?\s*:/iu.test(plain(n.toString()))));
  const starts = [0, ...boundaries.map(n => n.range[1])];
  const ends = [...boundaries.map(n => n.range[0]), html.length];
  return starts.map((start, i) => ({ start, end: ends[i], title: '' })).filter(r => plain(html.slice(r.start, r.end)));
}

function inspectUncached(html, { field = '', continuation = false, rule } = {}) {
  const rubric = plain(Array.isArray(html) ? html.join(' ') : html);
  if (/^(?:Дадатковая псальмодыя; замест псальма|Антыфоны і псальмы з бягучага дня\.)/u.test(rubric) && !/<(?:p|div)\b/iu.test(String(html))) {
    return { classification: 'REFERENCE_RUBRIC', rule: { source: rubric.startsWith('Дадатковая') ? 'complementary' : 'current-day', text: rubric }, alternatives: [], edits: [] };
  }
  const classification = classifyField(field, html, { rule });
  if (classification.type !== 'REAL_TEXT') return { classification: classification.type, rule: classification.rule, alternatives: [], edits: [] };
  if (typeof html !== 'string') return { classification: 'REVIEW_NON_STRING', alternatives: [], edits: [] };
  const alternatives = [], edits = [];
  const pieces = ranges(html);
  const sharedHtml = pieces.length > 1 ? pieces.reduceRight((value, r) => value.slice(0, r.start) + value.slice(r.end), html) : '';
  const sharedDoxology = /Хвала Айцу|Як была спрадвеку/iu.test(plain(sharedHtml));
  const pickerCount = getLiturgicalAlternatives(html, 'psalm').length;
  for (const [index, range] of pieces.entries()) {
    const fragment = html.slice(range.start, range.end), root = parse(fragment);
    const containers = root.querySelectorAll('.ora-psalm');
    const structuredRoot = root.childNodes.find(n => n.nodeType === 1 && n.hasAttribute?.('data-alternative-title'));
    const target = containers.length === 1 ? containers[0] : structuredRoot || root;
    const body = target.toString(), text = prayerText(body);
    const full = [...text.matchAll(FULL)];
    const partial = /Хвала Айцу|Як была спрадвеку/iu.test(text) && full.length === 0;
    const ownTrinity = /Благаславім Айца і Сына, і Духа Святога/iu.test(text);
    const daniel = /Дан\s*3\s*,\s*57\s*[-–—]\s*88/iu.test(text) && ownTrinity;
    const psalm = root.querySelectorAll('p').map(n => plain(n.toString())).find(t => /^(?:Псальм|Песня|Песнь)/iu.test(t)) || (continuation ? 'Continuation of preceding psalm' : 'Unlabelled psalm part');
    const allParagraphs = target.querySelectorAll('p');
    const trailingAnts = [];
    for (const node of [...target.childNodes].reverse()) {
      if (!plain(node.toString())) continue;
      if (node.nodeType === 1 && antiphon(node)) trailingAnts.unshift(node);
      else break;
    }
    // A nested ora-ant following ora-psalm is outside target, already safe.
    const closingTag = target === root ? '' : target.toString().match(/<\/[^>]+>\s*$/u)?.[0];
    const lastVerseEnd = closingTag ? target.range[1] - closingTag.length : fragment.trimEnd().length;
    const insertAt = trailingAnts[0]?.range[0] ?? lastVerseEnd;
    const inlineRubric = /Хвала Айцу\.(?:<br\s*\/?>|\s)*Верш Хвала Айцу чытаецца ў канцы ўсіх псальмаў і песняў\./u.exec(fragment);
    const notes = allParagraphs.filter(n => /^(?:Хвала Айцу\.|Хвала Айцу і Сыну|Як была спрадвеку)/iu.test(plain(n.toString())));
    const location = full.length ? (trailingAnts.length ? 'before-repeated-antiphon' : containers.length ? 'inside-ora-psalm' : 'end-of-psalm') : 'absent';
    let status = continuation ? (full.length ? 'REVIEW_INVITATORY_DOXOLOGY' : 'invitatory-strophe') : daniel ? (full.length ? 'REVIEW_DANIEL_DUPLICATE' : 'exception-daniel-3-57-88-56') : full.length === 1 ? 'complete' : full.length > 1 ? 'REVIEW_DUPLICATE' : partial ? 'incomplete' : 'missing';
    if (containers.length > 1 || pieces.length !== pickerCount) status = 'REVIEW_ALTERNATIVE_STRUCTURE';
    // Multiple actual psalm headings inside a choice require editorial review.
    const headings = allParagraphs.filter(n => /^(?:Псальм\s+\d|Песн[яь]\s*\(?[А-ЯІЎЁ])/u.test(plain(n.toString())));
    if (headings.length > 1) status = 'REVIEW_MULTIPLE_PSALMS';
    if (full.length === 1 && !daniel && !continuation) {
      const suffix = text.slice(full[0].index + full[0][0].length).trim();
      const antiphonSuffix = prayerText(trailingAnts.map(n => n.toString()).join(' '));
      const repeatedResponse = /^Н\.\s/u.test(suffix) && text.slice(0, full[0].index).includes(suffix);
      if (suffix !== antiphonSuffix && !repeatedResponse) status = 'REVIEW_DOXOLOGY_POSITION';
      // A repeated antiphon between Scripture and the ending is also wrong.
      const endingIndex = allParagraphs.findIndex(n => prayerText(n.toString()).includes('Хвала Айцу і Сыну'));
      if (allParagraphs.some((n, i) => i > 1 && i < endingIndex && antiphon(n))) status = 'REVIEW_DOXOLOGY_POSITION';
    }
    if (sharedDoxology) status = 'REVIEW_SHARED_DOXOLOGY';
    if (['missing', 'incomplete'].includes(status)) {
      // Only standalone doxology paragraphs can be safely replaced.
      if (partial && !notes.length && !inlineRubric) status = 'REVIEW_INLINE_DOXOLOGY';
      else {
        if (inlineRubric) edits.push({start: range.start + inlineRubric.index, end: range.start + inlineRubric.index + inlineRubric[0].length, value: '', reason: 'expand-inline-doxology-rubric'});
        for (const n of notes) edits.push({ start: range.start + n.range[0], end: range.start + n.range[1], value: '', reason: 'replace-incomplete-doxology' });
        const position = notes.length ? notes[0].range[0] : insertAt;
        edits.push({ start: range.start + position, end: range.start + position, value: '\n' + DOXOLOGY_HTML + '\n', reason: status === 'incomplete' ? 'expand-incomplete-doxology' : 'add-missing-doxology' });
      }
    }
    alternatives.push({ index, title: range.title, psalm, fullDoxologies: full.length, location, status, ownTrinity, trailingAntiphons: trailingAnts.length });
  }
  return { classification: 'REAL_TEXT', hour: hourOf(field), alternativeCount: pieces.length, pickerCount, alternatives, edits };
}

const inspectionCache = new Map();
export function inspectPsalm(html, context = {}) {
  const key = JSON.stringify([context.field, Boolean(context.continuation), context.rule, html]);
  if (!inspectionCache.has(key)) inspectionCache.set(key, inspectUncached(html, context));
  return inspectionCache.get(key);
}

export function repairPsalm(html, context = {}) {
  const audit = inspectPsalm(html, context);
  let value = html;
  // Replacement first at an equal offset, insertion second. Both use original offsets.
  const edits = [...audit.edits].sort((a, b) => b.start - a.start || b.end - a.end);
  for (const edit of edits) value = value.slice(0, edit.start) + edit.value + value.slice(edit.end);
  return { value, audit, changed: value !== html };
}

/** Real psalmody only; includes seasonal deltas and Marian main section. */
export function psalmFields(document, prefix = []) {
  const result = [];
  for (const [key, value] of Object.entries(document || {})) {
    if (psalmField(key)) result.push({ path: [...prefix, key], field: key, value, rule: document._fieldRules?.[key] });
    else if (key === '_seasonalVariants' || key === '_mainSection') {
      if (key === '_seasonalVariants') for (const [season, delta] of Object.entries(value || {})) result.push(...psalmFields(delta, [...prefix, key, season]));
      else result.push(...psalmFields(value, [...prefix, key]));
    }
  }
  for (const [field, rule] of Object.entries(document?._fieldRules || {})) {
    if (psalmField(field) && !(field in document)) result.push({path: [...prefix, field], field, value: undefined, rule});
  }
  return result;
}
export function auditDocument(document) {
  const invFields = Object.keys(document).filter(k => /^invitatoriumPs\d+$/u.test(k) && plain(document[k]));
  const lastInv = invFields.sort((a,b) => Number(a.match(/\d+$/)[0]) - Number(b.match(/\d+$/)[0])).at(-1);
  return psalmFields(document).map(item => {
    const result = repairPsalm(item.value, { field: item.field, rule: item.rule,
      continuation: item.field.startsWith('invitatorium') && item.field !== lastInv });
    const parent = item.path.slice(0, -1).reduce((value, key) => value?.[key], document);
    const prefix = item.field.replace(/\d+$/, '');
    let reference = '';
    for (let n = Number(item.field.match(/\d+$/)[0]) - 1; n >= 1 && !reference; n--) {
      reference = parse(String(parent?.[prefix + n] || '')).querySelectorAll('p')
        .map(p => plain(p.toString())).find(text => /^(?:Псальм|Песня|Песнь)/u.test(text)) || '';
    }
    const audit = { ...result.audit, alternatives: result.audit.alternatives.map(a => ({ ...a,
      psalm: a.psalm === 'Unlabelled psalm part' && reference ? reference + ' (наступная частка)' : a.psalm })) };
    return { ...item, ...result, audit };
  });
}

import { createHash } from 'node:crypto';
import { parse } from 'node-html-parser';
import {
  normalizePrayerLegacyMarkdown, collectLegacyPrayerSpeakers, verifyPrayerNormalization,
  prayerLegacyStructure, AUTOMATIC_PRAYER_RULES, PRAYER_NORMALIZATION_VERSION,
} from '../../src/utils/prayerLegacyFormatting.js';
import { htmlToPrayerMarkdown, prayerMarkdownToPlainText, looksLikeHtml, PRAYER_TEXT_FORMAT } from '../../src/utils/prayerMarkdown.js';
import { prayerTextEntries } from './prayer-format-audit.mjs';
import { MASS_RITUAL } from '../../src/utils/massRitual.js';
import { publicAppCollections, storedDocument, describeDocuments, diffCollection, classifyPatch, CONTENT_SCHEMA_VERSION, canonicalJson } from '../content/lib/app-content.mjs';

export const MIGRATION_RULES = Object.freeze([...AUTOMATIC_PRAYER_RULES, 'legacy-html']);
const MASS_IDS = new Set(MASS_RITUAL.variants.map(variant => variant.prayerId));
const HTML_TAGS = new Set(['p', 'div', 'span', 'b', 'strong', 'i', 'em', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'blockquote', 'hr']);

export function portablePrayerValue(value) {
  if (value instanceof Date) return { __firestoreType: 'date', iso: value.toISOString() };
  if (Buffer.isBuffer(value)) return { __firestoreType: 'bytes', base64: value.toString('base64') };
  if (Array.isArray(value)) return value.map(portablePrayerValue);
  if (value && typeof value === 'object') {
    if (typeof value.toDate === 'function' && value.seconds !== undefined) {
      return { __firestoreType: 'timestamp', seconds: value.seconds, nanoseconds: value.nanoseconds };
    }
    if (typeof value.path === 'string' && typeof value.get === 'function') return { __firestoreType: 'reference', path: value.path };
    if (Object.getPrototypeOf(value)?.constructor?.name === 'GeoPoint') return { __firestoreType: 'geopoint', latitude: value.latitude, longitude: value.longitude };
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && typeof item !== 'function')
      .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, portablePrayerValue(item)]));
  }
  return value;
}

export const prayerPlanHash = value => createHash('sha256').update(canonicalJson(portablePrayerValue(value))).digest('hex');

export function checkPrayerPlan(plan, expectedHash = plan.planHash) {
  const { planHash, ...payload } = plan;
  if (plan.schemaVersion !== PRAYER_NORMALIZATION_VERSION || plan.collection !== 'prayers' || !Array.isArray(plan.documents)
    || !planHash || planHash !== expectedHash || prayerPlanHash(payload) !== planHash) {
    throw new Error('Plan version/hash mismatch. Regenerate and obtain approval for the exact plan.');
  }
  return true;
}

function htmlProposal(value, format) {
  const root = parse(value);
  const elements = root.querySelectorAll('*');
  if (!elements.length || !/^\s*</.test(value) || root.childNodes.some(node => !node.tagName && node.text.trim())) {
    return { automatic: false, reason: 'unconfirmed-html-fragment' };
  }
  if (elements.some(element => !HTML_TAGS.has(element.tagName.toLowerCase())
    || Object.keys(element.attributes).some(name => /^on/i.test(name))
    || /^(?:javascript|data):/i.test(element.getAttribute('href') || ''))) {
    return { automatic: false, reason: 'unsafe-or-unsupported-html' };
  }
  const converted = htmlToPrayerMarkdown(value);
  const visible = root.structuredText.replace(/\s+/g, ' ').trim();
  const plain = prayerMarkdownToPlainText(converted, PRAYER_TEXT_FORMAT).replace(/\s+/g, ' ').trim();
  const htmlLinks = root.querySelectorAll('a').map(element => [element.getAttribute('href'), element.getAttribute('title') || '']);
  const mdLinks = prayerLegacyStructure(converted).tokens.flatMap(token => (token.children || [])
    .filter(child => child.type === 'link_open').map(child => [child.attrGet('href'), child.attrGet('title') || '']));
  if (visible !== plain || JSON.stringify(htmlLinks) !== JSON.stringify(mdLinks)) return { automatic: false, reason: 'html-content-or-links-changed' };
  const needsReview = format === PRAYER_TEXT_FORMAT || elements.some(element => Object.entries(element.attributes)
    .some(([name, attribute]) => !['href', 'title'].includes(name)
      && !(name === 'class' && /^(?:rubric|mass-rubric-line|MsoNormal)$/.test(attribute))));
  return { automatic: !needsReview, markdown: converted, preservation: { passed: true, visibleText: true, links: true },
    reason: needsReview ? 'html-format-or-style-needs-review' : 'confirmed-legacy-html' };
}

function fieldDiff(before, after) {
  const oldLines = before.split('\n');
  const newLines = after.split('\n');
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < oldLines.length - prefix && suffix < newLines.length - prefix
    && oldLines.at(-1 - suffix) === newLines.at(-1 - suffix)) suffix += 1;
  return [`@@ -${prefix + 1},${oldLines.length - prefix - suffix} +${prefix + 1},${newLines.length - prefix - suffix} @@`,
    ...oldLines.slice(prefix, oldLines.length - suffix).map(line => '-' + line), ...newLines.slice(prefix, newLines.length - suffix).map(line => '+' + line)].join('\n');
}

export function writePrayerPlanUpdates(data, updates, reverse = false) {
  const result = structuredClone(portablePrayerValue(data));
  for (const update of updates) {
    if (!['text', 'textVersions', 'textFormat', 'textFormatVersion'].includes(update.field)) throw new Error('Forbidden field: ' + update.field);
    if (update.field === 'textVersions' && (typeof update.locale !== 'string' || !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(update.locale))) throw new Error('Invalid locale path.');
    if (update.field !== 'textVersions' && update.locale !== null && update.locale !== undefined) throw new Error('Unexpected locale for a root field.');
    const target = update.locale === null || update.locale === undefined ? result : (result.textVersions ||= {});
    const key = update.locale ?? update.field;
    if (reverse && update.beforeExists === false) delete target[key];
    else target[key] = reverse ? update.before : update.after;
  }
  return result;
}

function assistedAfter(source, proposal) {
  if (!proposal.replacement || proposal.fromLine === undefined) return null;
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  lines.splice(proposal.fromLine, proposal.toLine - proposal.fromLine, proposal.replacement);
  const after = lines.join('\n');
  const preservation = verifyPrayerNormalization(source, after);
  return preservation.failures.some(reason => reason !== 'punctuation-changed') ? null : after;
}

export function buildPrayerNormalizationPlan(entries, { snapshot = {}, categories = [], rules = MIGRATION_RULES } = {}) {
  if (new Set(entries.map(entry => entry.id)).size !== entries.length || entries.some(entry => !entry.id || entry.id.includes('/'))) throw new Error('Invalid or duplicate prayer IDs.');
  for (const rule of rules) if (!MIGRATION_RULES.includes(rule)) throw new Error('Unknown rule: ' + rule);
  const documents = [];
  const groups = new Map();
  const sets = { automatic: new Set(), assisted: new Set(), manual: new Set(), correct: new Set() };
  const stats = { documents: entries.length, versions: 0, nonemptyVersions: 0, optionalEmptyVersions: 0,
    alreadyCanonicalVersions: 0, automaticVersions: 0, assistedVersions: 0, manualVersions: 0,
    recognizableSpeakersBefore: 0, recognizableSpeakersAfter: 0, projectedSpeakersAfterApply: 0,
    preservedQuoteBlocks: 0, formats: { html: 0, markdown: 0, 'markdown-with-legacy-labels': 0 }, operations: {}, groups: 0,
    roleForms: { bare: 0, 'wrapped-label': 0, 'whole-line-emphasis': 0, standalone: 0 }, alreadyRenderedVersions: 0, alreadyRenderedDocuments: 0, assistedUnrenderedSpeakers: 0 };
  for (const entry of entries) {
    const { id, data } = entry;
    const fields = [];
    const updates = [];
    const entriesForDocument = prayerTextEntries(data);
    const hasContent = entriesForDocument.some(field => typeof field.value === 'string' && field.value.trim());
    let blockedHtml = false;
    let convertedHtml = false;
    for (const field of entriesForDocument) {
      stats.versions += 1;
      const record = { field: field.field, locale: field.locale, before: field.value, assisted: [], manual: [] };
      fields.push(record);
      if (field.locale && !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(field.locale)) { record.manual.push({ reason: 'invalid-locale-key' }); continue; }
      if (typeof field.value !== 'string') { record.manual.push({ reason: 'non-string-text' }); continue; }
      if (!field.value.trim()) {
        if (hasContent) { stats.optionalEmptyVersions += 1; record.optionalEmpty = true; }
        else record.manual.push({ reason: 'missing-prayer-content' });
        continue;
      }
      stats.nonemptyVersions += 1;
      const speakers = collectLegacyPrayerSpeakers(field.value);
      record.rendererRecoveredSpeakers = speakers.filter(speaker => !MASS_IDS.has(id) && (speaker.kind !== 'bare' || speaker.standalone || speaker.fullLabel)).length;
      for (const speaker of speakers) stats.roleForms[speaker.standalone ? 'standalone' : speaker.kind] += 1;
      stats.recognizableSpeakersBefore += speakers.filter(speaker => MASS_IDS.has(id) || (speaker.kind === 'bare' && !speaker.standalone && !speaker.fullLabel)).length;
      stats.recognizableSpeakersAfter += speakers.length;
      const sourceStructure = prayerLegacyStructure(field.value);
      const isHtml = looksLikeHtml(field.value) && (data.textFormat !== PRAYER_TEXT_FORMAT
        || (field.value.trimStart().startsWith('<') && sourceStructure.tokens[0]?.type !== 'code_block'));
      const kind = isHtml ? 'html' : speakers.some(speaker => speaker.kind !== 'bare') ? 'markdown-with-legacy-labels' : 'markdown';
      stats.formats[kind] = (stats.formats[kind] || 0) + 1;
      let markdown = field.value;
      let html = null;
      if (isHtml) {
        html = htmlProposal(field.value, data.textFormat);
        if (html.automatic && rules.includes('legacy-html')) { markdown = html.markdown; convertedHtml = true; }
        else {
          blockedHtml = true;
          if (html.markdown && data.textFormat !== PRAYER_TEXT_FORMAT) record.assisted.push({ group: 'legacy-html-review', confidence: 0.9, after: html.markdown, reason: html.reason });
          else if (html.markdown) record.manual.push({ reason: 'literal-html-or-mislabeled-format', proposal: html.markdown });
          else record.manual.push({ reason: html.reason });
          continue;
        }
      }
      const result = normalizePrayerLegacyMarkdown(markdown, { rules: rules.filter(rule => AUTOMATIC_PRAYER_RULES.includes(rule)) });
      record.assisted.push(...result.assisted.map(proposal => ({ ...proposal, after: assistedAfter(markdown, proposal),
        beforeFragment: proposal.fromLine === undefined ? markdown : markdown.replace(/\r\n?/g, '\n').split('\n').slice(proposal.fromLine, proposal.toLine).join('\n') })));
      stats.assistedUnrenderedSpeakers += result.assisted.reduce((sum, proposal) => sum + (proposal.speakerCount || 0), 0);
      record.manual.push(...(MASS_IDS.has(id) ? result.manual.filter(issue => issue.reason !== 'ambiguous-alphabet-or-initial') : result.manual));
      stats.preservedQuoteBlocks += result.preservedQuotes || 0;
      const repeat = normalizePrayerLegacyMarkdown(result.markdown, { rules: rules.filter(rule => AUTOMATIC_PRAYER_RULES.includes(rule)) });
      if (repeat.markdown !== result.markdown) record.manual.push({ reason: 'not-idempotent' });
      const supportedFormat = !data.textFormat || ['mybrev-markdown', 'html', 'legacy-html'].includes(data.textFormat);
      const supportedVersion = data.textFormatVersion === undefined || data.textFormatVersion === null || data.textFormatVersion === 1;
      if (!supportedVersion || !supportedFormat) record.manual.push({ reason: 'unsupported-format-version' });
      const changed = result.markdown !== field.value;
      if (MASS_IDS.has(id) && changed) record.manual.push({ reason: 'mass-parity-required' });
      if (changed && repeat.markdown === result.markdown && supportedVersion && supportedFormat && !MASS_IDS.has(id)) {
        const operations = [...(html ? [{ rule: 'legacy-html', confidence: 1 }] : []), ...result.operations];
        const update = { field: field.field, locale: field.locale, before: field.value, after: result.markdown, beforeExists: true,
          operations, preservation: html?.preservation || result.preservation, idempotent: true, diff: fieldDiff(field.value, result.markdown) };
        updates.push(update);
        record.automatic = update;
      }
    }
    // A global format flag can change only when every nonempty legacy HTML field is ready.
    if (convertedHtml && blockedHtml) {
      for (let index = updates.length - 1; index >= 0; index -= 1) {
        if (updates[index].operations.some(operation => operation.rule === 'legacy-html')) {
          const update = updates.splice(index, 1)[0];
          const record = fields.find(field => field.field === update.field && field.locale === update.locale);
          delete record.automatic;
          record.assisted.push({ group: 'mixed-html-document', confidence: 0.9, after: update.after, reason: 'Resolve all HTML fields before changing the document format.' });
        }
      }
    } else if (convertedHtml && updates.length) {
      for (const [field, after] of [['textFormat', PRAYER_TEXT_FORMAT], ['textFormatVersion', 1]]) {
        if (data[field] !== after) updates.push({ field, before: data[field] ?? null, beforeExists: field in data, after, operations: [{ rule: 'legacy-html', confidence: 1 }] });
      }
    }
    for (const record of fields) {
      if (record.automatic) {
        stats.automaticVersions += 1;
        sets.automatic.add(id);
        for (const operation of record.automatic.operations) stats.operations[operation.rule] = (stats.operations[operation.rule] || 0) + 1;
      }
      if (record.assisted.length) { stats.assistedVersions += 1; sets.assisted.add(id); }
      if (record.manual.length) { stats.manualVersions += 1; sets.manual.add(id); }
      if (!record.automatic && !record.assisted.length && !record.manual.length && !record.optionalEmpty) stats.alreadyCanonicalVersions += 1;
      if (!record.optionalEmpty && typeof record.before === 'string' && record.before.trim() && !record.rendererRecoveredSpeakers && !record.assisted.length && !record.manual.length && !looksLikeHtml(record.before)) stats.alreadyRenderedVersions += 1;
      for (const proposal of record.assisted) {
        const fragmentBefore = proposal.beforeFragment || record.before;
        const fragmentAfter = proposal.replacement || proposal.after || null;
        const groupId = proposal.group + ':' + prayerPlanHash({ before: fragmentBefore, after: fragmentAfter }).slice(0, 16);
        if (!groups.has(groupId)) groups.set(groupId, { id: groupId, kind: proposal.group, confidence: proposal.confidence, before: fragmentBefore, after: fragmentAfter,
          diff: fragmentAfter ? fieldDiff(fragmentBefore, fragmentAfter) : null, visualReviewRequired: true, members: [] });
        groups.get(groupId).members.push({ id, field: record.field, locale: record.locale, line: proposal.line, preservation: proposal.after ? verifyPrayerNormalization(record.before, proposal.after) : null });
      }
    }
    if (!hasContent && !entriesForDocument.length) sets.manual.add(id);
    if (hasContent && !fields.some(field => field.automatic || field.assisted.length || field.manual.length)) sets.correct.add(id);
    if (hasContent && !fields.some(field => field.rendererRecoveredSpeakers || field.assisted.length || field.manual.length || (typeof field.before === 'string' && looksLikeHtml(field.before)))) stats.alreadyRenderedDocuments += 1;
    const after = writePrayerPlanUpdates(data, updates);
    for (const field of prayerTextEntries(after)) if (typeof field.value === 'string') stats.projectedSpeakersAfterApply += collectLegacyPrayerSpeakers(field.value).length;
    documents.push({ id, beforeHash: prayerPlanHash(data), before: portablePrayerValue(data),
      snapshotUpdateTime: entry.updateTime ? portablePrayerValue(entry.updateTime) : null, updates, fields });
  }
  for (const [key, value] of Object.entries(sets)) stats[key + 'Documents'] = value.size;
  stats.groups = groups.size;
  stats.rendererRecoveredSpeakers = stats.recognizableSpeakersAfter - stats.recognizableSpeakersBefore;
  const unsupported = stats.rendererRecoveredSpeakers + stats.assistedUnrenderedSpeakers;
  stats.rendererRecoveryPercent = unsupported ? Math.round(stats.rendererRecoveredSpeakers / unsupported * 1000) / 10 : 0;
  const beforeCollection = entries.map(entry => storedDocument(entry.id, entry.data));
  const afterCollection = documents.map(document => storedDocument(document.id, writePrayerPlanUpdates(document.before, document.updates)));
  const beforePublic = publicAppCollections(new Map([['prayers', beforeCollection], ['prayerCategories', categories]])).get('prayers');
  const afterPublic = publicAppCollections(new Map([['prayers', afterCollection], ['prayerCategories', categories]])).get('prayers');
  const diff = diffCollection('prayers', describeDocuments(afterPublic), describeDocuments(beforePublic));
  const classification = classifyPatch([diff], { publishedSchema: CONTENT_SCHEMA_VERSION });
  const payload = { schemaVersion: PRAYER_NORMALIZATION_VERSION, generatedAt: new Date().toISOString(), collection: 'prayers', snapshot,
    coverage: 'Only the specified local snapshot. Current production completeness is not verified.', rules,
    stats, publicationEstimate: { ...classification, publicChangedDocuments: diff.changed.length, publicDocuments: diff.previousCount, bytes: diff.bytes,
      baseline: 'local snapshot, not the current contentManifest' }, groups: [...groups.values()], documents };
  return { ...payload, planHash: prayerPlanHash(payload) };
}

export function selectPrayerNormalizationPlan(plan, { rules, ids = [] } = {}) {
  checkPrayerPlan(plan);
  if (!rules?.length) throw new Error('Specify the automatic rules explicitly.');
  for (const id of ids) if (!plan.documents.some(document => document.id === id)) throw new Error('Selected document is not in the frozen plan.');
  for (const rule of rules) if (!plan.rules.includes(rule)) throw new Error('Rule is absent from the approved plan.');
  const selected = buildPrayerNormalizationPlan(plan.documents.filter(document => !ids.length || ids.includes(document.id))
    .map(document => ({ id: document.id, data: document.before, updateTime: document.snapshotUpdateTime })), { snapshot: plan.snapshot, rules });
  for (const document of selected.documents) {
    const approved = plan.documents.find(original => original.id === document.id);
    for (const update of document.updates) {
      const original = approved.updates.find(item => item.field === update.field && item.locale === update.locale);
      if (!original) throw new Error('Selection introduces an update absent from the approved plan.');
      if (update.operations.some(operation => !original.operations.some(item => item.rule === operation.rule && item.line === operation.line))) throw new Error('Selected operation is absent from the approved plan.');
      if (original.operations.every(operation => rules.includes(operation.rule)) && update.after !== original.after) throw new Error('Normalizer output changed since the plan was approved.');
    }
  }
  return selected.documents.filter(document => document.updates.length);
}

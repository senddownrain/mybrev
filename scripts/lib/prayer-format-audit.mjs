import {
  autoFixPrayerMarkdown, diagnosePrayerMarkdown, promotePrayerRubrics,
  validatePrayerMarkdown, prayerSpeakerRanges,
} from '../../src/utils/prayerMarkdown.js';

export function prayerTextEntries(document) {
  const entries = [];
  if ('text' in document) entries.push({ field: 'text', locale: null, value: document.text });
  if (document.textVersions && typeof document.textVersions === 'object' && !Array.isArray(document.textVersions)) {
    for (const [locale, value] of Object.entries(document.textVersions)) entries.push({ field: 'textVersions', locale, value });
  }
  return entries;
}

// Only newline encoding and a document-leading BOM are mechanically certain.
// All broader legacy repairs remain review proposals, never apply inputs.
export function safePrayerFormatting(value) {
  return String(value).replace(/^\uFEFF+/, '').replace(/\r\n?/g, '\n');
}

function fieldDiff(before, after) {
  const oldLines = before.split('\n');
  const newLines = after.split('\n');
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < oldLines.length - prefix && suffix < newLines.length - prefix
    && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]) suffix += 1;
  const removed = oldLines.slice(prefix, oldLines.length - suffix);
  const added = newLines.slice(prefix, newLines.length - suffix);
  return [`@@ -${prefix + 1},${removed.length} +${prefix + 1},${added.length} @@`, ...removed.map((line) => '-' + line), ...added.map((line) => '+' + line)].join('\n');
}

export function auditPrayerFormatting(documents, { rubrics = false } = {}) {
  const fields = [];
  const counts = { safe: 0, review: 0, manual: 0 };
  const reasons = {};
  const roles = {};
  let scannedVersions = 0;
  let nonStringFields = 0;
  const ids = new Set(documents.map((document) => document.id));
  const locales = {};
  for (const document of documents) {
    const entries = prayerTextEntries(document);
    if (!entries.length) { counts.manual += 1; reasons['missing-text'] = (reasons['missing-text'] || 0) + 1; }
    for (const entry of entries) {
      if (typeof entry.value !== 'string') {
        nonStringFields += 1; counts.manual += 1;
        reasons['non-string-text'] = (reasons['non-string-text'] || 0) + 1;
        fields.push({ id: document.id, field: entry.field, locale: entry.locale, severity: 'manual', reason: 'non-string-text', confidence: 1 });
        continue;
      }
      scannedVersions += 1;
      const localeKey = entry.locale || 'text';
      locales[localeKey] = (locales[localeKey] || 0) + 1;
      const before = entry.value;
      const safe = safePrayerFormatting(before);
      const technical = autoFixPrayerMarkdown(safe);
      const semantic = rubrics ? promotePrayerRubrics(technical.markdown) : null;
      const after = semantic?.markdown ?? technical.markdown;
      const diagnostics = diagnosePrayerMarkdown(safe);
      for (const match of safe.matchAll(/\]\(\/prayer\/([^\s)]+)\)/g)) {
        if (!ids.has(match[1])) diagnostics.push({ line: safe.slice(0, match.index).split('\n').length, severity: 'manual', code: 'missing-local-link-target', message: 'Мэта спасылкі адсутнічае ў лакальным snapshot; production не правераны.' });
      }
      for (const range of prayerSpeakerRanges(safe)) roles[range.role] = (roles[range.role] || 0) + 1;
      const proposals = [];
      if (safe !== before) proposals.push({ severity: 'safe', confidence: 1, reasons: ['newline-or-leading-bom'], before, after: safe });
      if (after !== safe) proposals.push({ severity: 'review', confidence: 0.5, reasons: [...technical.fixes, ...(semantic?.changed ? ['rubric-promotion'] : [])], before: safe, after });
      for (const proposal of proposals) {
        proposal.diff = fieldDiff(proposal.before, proposal.after);
        const repeat = proposal.severity === 'safe' ? safePrayerFormatting(proposal.after) : autoFixPrayerMarkdown(proposal.after).markdown;
        proposal.idempotent = repeat === proposal.after;
        proposal.validation = validatePrayerMarkdown(proposal.after);
        if (!proposal.idempotent || proposal.validation.length) proposal.severity = 'manual';
        counts[proposal.severity] += 1;
      }
      for (const issue of diagnostics) {
        counts[issue.severity] += 1;
        reasons[issue.code] = (reasons[issue.code] || 0) + 1;
      }
      fields.push({ id: document.id, field: entry.field, locale: entry.locale, before, proposals, diagnostics });
    }
  }
  const proposalCounts = { safe: 0, review: 0, manual: 0 };
  const findingCounts = { safe: 0, review: 0, manual: 0 };
  for (const field of fields) {
    for (const proposal of field.proposals || []) proposalCounts[proposal.severity] += 1;
    for (const finding of field.diagnostics || []) findingCounts[finding.severity] += 1;
    if (field.reason) findingCounts.manual += 1;
  }
  return { scannedDocuments: documents.length, scannedVersions, nonStringFields, locales, counts, proposalCounts, findingCounts, reasons, roles, fields };
}

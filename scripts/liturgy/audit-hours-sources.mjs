#!/usr/bin/env node
/**
 * Hours source audit (read-only, local data only).
 *
 * 1. Sources: every content field of patchs/feasts, common-texts,
 *    patchs/db-feasts, patchs/db-templates and the snapshot `days` /
 *    `liturgicalTemplates`, classified by `classifyField`.
 * 2. Runtime: the web pipeline for every date and diocese of the audit years,
 *    once with the legacy fixed `days` only and once with
 *    `liturgicalProperTexts`; every assembled field a reader would see.
 *
 *   node scripts/liturgy/audit-hours-sources.mjs [--snapshot dir] [--from 2026-01-01 --to 2027-12-31]
 *
 * Output: reports/liturgy/hours-sources-audit.json
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import moment from '../../src/utils/moment-be.js';
import { OFFICE_CONTENT_FIELDS, OFFICE_TEXT_FIELDS, TE_DEUM_FIELD } from '../../src/constants/officeFields.js';
import { openFirestoreSnapshot } from '../lib/firestore-snapshot.mjs';
import { classifyField, FIELD_VALUE_TYPE, NOT_RENDERABLE, plainText } from './lib/field-audit.mjs';
import { contentFor, openLiturgySource, snapshotDirectory } from './lib/snapshot-content.mjs';

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, 'reports', 'liturgy', 'hours-sources-audit.json');
export const DIOCESES = ['minsk-mohilev', 'vitebsk', 'pinsk', 'grodno'];
const arg = (name, fallback) => { const index = process.argv.indexOf(name); return index > 0 ? process.argv[index + 1] : fallback; };

const readJsonDir = (dir) => fs.readdirSync(path.join(ROOT, dir)).filter((name) => name.endsWith('.json') && name !== 'manifest.json')
  .map((name) => ({ file: `${dir}/${name}`, doc: JSON.parse(fs.readFileSync(path.join(ROOT, dir, name), 'utf8')) }));

function daysKind(doc) {
  if (doc._obsolete) return 'obsolete';
  if (doc.id === 'office-for-dead') return 'office-for-dead';
  if (/^(?:advent|christmas)-\d\d-\d\d$/.test(doc.id)) return 'seasonal-date';
  if (doc._feast) return 'dynamic';
  if (doc._date) return 'fixed';
  if (doc._periodType) return 'temporal';
  return 'other';
}

/** Classify every content field of a list of documents; group non-text values. */
function auditSource(name, items) {
  const counts = Object.fromEntries(Object.values(FIELD_VALUE_TYPE).map((type) => [type, 0]));
  const groups = new Map();
  items.forEach(({ id, doc }) => {
    const rules = doc._fieldRules || {};
    OFFICE_CONTENT_FIELDS.forEach((field) => {
      if (field === TE_DEUM_FIELD || (doc[field] === undefined && !rules[field])) return;
      const result = classifyField(field, doc[field], { rule: rules[field] });
      counts[result.type] += 1;
      // Grouped: everything that is not a text but is written as text in the
      // field itself (not a structured `_fieldRules` entry, not `from-day`).
      const writtenAsText = plainText(doc[field]) !== '' && !result.marker;
      if (!NOT_RENDERABLE.has(result.type) || !writtenAsText) return;
      const key = `${result.type}\u0000${plainText(doc[field]).toLowerCase()}`;
      const group = groups.get(key) || { type: result.type, value: plainText(doc[field]), rule: result.rule || null, reason: result.reason || null, fields: new Set(), documents: new Set() };
      group.fields.add(field); group.documents.add(id); groups.set(key, group);
    });
  });
  return {
    source: name,
    documents: items.length,
    counts,
    instructions: [...groups.values()].map((group) => ({
      ...group, fields: [...group.fields].sort(), documents: [...group.documents].sort(), occurrences: group.documents.size,
    })).sort((a, b) => b.occurrences - a.occurrences),
  };
}

function* datesBetween(from, to) {
  for (let day = moment(from); !day.isAfter(moment(to)); day = day.clone().add(1, 'day')) yield day.format('YYYY-MM-DD');
}

/** Every option × template of a date as the reader gets it. */
function renderedDays(content) {
  return content.dayOptions.flatMap((option) => (option.templates?.length ? option.templates : [{ id: option.dayId, day: option.day }])
    .filter((template) => template.day)
    .map((template) => ({ option, templateId: template.id, choice: template.choice || null, day: template.day })));
}

function runtimeScan(source, dates) {
  const visible = new Map();
  const integrity = new Map();
  const missing = new Map();
  const properSources = { liturgicalProperTexts: new Set(), 'legacy-days': new Set(), none: new Set() };
  const unavailable = new Map();
  for (const date of dates) {
    for (const diocese of DIOCESES) {
      const content = contentFor(source, date, { diocese });
      content.unavailable.forEach((item) => {
        const key = `${item.id}|${item.reason}|${Boolean(item.assembled)}`;
        const entry = unavailable.get(key) || {
          id: item.id, title: item.title, reason: item.reason,
          shown: Boolean(item.assembled), // assembled from a Common / the day vs. not offered at all
          dates: new Set(),
        };
        entry.dates.add(`${date}@${diocese}`); unavailable.set(key, entry);
      });
      content.dayOptions.forEach((option) => {
        const src = option.ordo?.properSource;
        if (src && properSources[src]) properSources[src].add(option.ordo.optionId);
      });
      renderedDays(content).forEach(({ option, templateId, day }) => {
        const owner = option.ordo?.optionId || option.key;
        OFFICE_TEXT_FIELDS.forEach((field) => {
          const result = classifyField(field, day[field]);
          if (NOT_RENDERABLE.has(result.type) && !result.marker) {
            const key = `${templateId}|${field}`;
            const entry = visible.get(key) || { optionId: owner, documentId: templateId, field, type: result.type, value: plainText(day[field]).slice(0, 120), dates: new Set() };
            entry.dates.add(date); visible.set(key, entry);
          }
        });
        (day._integrityErrors || []).forEach((error) => {
          const key = `${templateId}|${error.field}`;
          const entry = integrity.get(key) || { optionId: owner, documentId: templateId, ...error, dates: new Set() };
          entry.dates.add(date); integrity.set(key, entry);
        });
        (day._missingFields || []).forEach((field) => {
          const key = `${templateId}|${field}`;
          const entry = missing.get(key) || { optionId: owner, documentId: templateId, field, dates: new Set() };
          entry.dates.add(date); missing.set(key, entry);
        });
      });
    }
  }
  const finish = (map) => [...map.values()].map((entry) => {
    const list = [...entry.dates].sort();
    return { ...entry, dates: undefined, occurrences: list.length, firstDate: list[0], lastDate: list[list.length - 1] };
  }).sort((a, b) => b.occurrences - a.occurrences);
  return {
    rawInstructionsVisible: finish(visible),
    integrityErrors: finish(integrity),
    missingFields: finish(missing),
    unavailableOptions: finish(unavailable),
    properSource: Object.fromEntries(Object.entries(properSources).map(([key, set]) => [key, [...set].sort()])),
  };
}

/** Share of common words (Jaccard) of two texts. */
function wordSimilarity(left, right) {
  const words = (value) => new Set(plainText(value).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  const a = words(left);
  const b = words(right);
  const shared = [...a].filter((word) => b.has(word)).length;
  return shared / Math.max(1, new Set([...a, ...b]).size);
}

/**
 * Assembled Office ↔ the legacy materialized Office of the same legal option.
 * A difference is explained when the legacy value was a Common text the
 * rubric does not take there (memorial psalmody comes from the weekday,
 * GILH 235) or the day's own text; anything else is listed for review.
 */
function compareWithLegacy(legacySource, properSource, dates) {
  const byReason = {};
  const unexplained = [];
  let compared = 0;
  const commons = properSource.templates;
  for (const date of dates) {
    const legacy = contentFor(legacySource, date);
    const proper = contentFor(properSource, date);
    proper.dayOptions.filter((option) => option.ordo?.properSource === 'liturgicalProperTexts').forEach((option) => {
      const old = legacy.dayOptions.find((item) => item.ordo?.optionId === option.ordo.optionId);
      if (!old?.day || old.ordo?.properSource !== 'legacy-days') return;
      // The same choice as the legacy copy: its Common (named or the only one).
      const legacyCommon = old.day._currentVersion || (old.day._templates?.length === 1 ? old.day._templates[0] : null);
      const template = option.templates.find((item) => legacyCommon && item.choice === legacyCommon)
        || option.templates.find((item) => item.choice !== 'current-day') || option.templates[0];
      // Every source the legacy copy may have materialized.
      const sources = [
        ...(option.day?._templates || []).map((id) => [`Common ${id}`, commons.get(id)]),
        ['Sunday, week I', commons.get('sunday-week-1')],
      ].filter(([, doc]) => doc);
      const currentDay = proper.daysResult.seasonalException || proper.daysResult.periodFallback;
      compared += 1;
      OFFICE_TEXT_FIELDS.forEach((field) => {
        const before = old.day[field];
        if (classifyField(field, before).type !== FIELD_VALUE_TYPE.REAL_TEXT) return;
        const after = template.day[field];
        if (plainText(before) === plainText(after)) return;
        let reason = 'unexplained';
        const fromSource = sources.find(([, doc]) => plainText(before) === plainText(doc[field]));
        const afterSource = sources.find(([, doc]) => plainText(after) === plainText(doc[field]));
        if (fromSource && !afterSource && plainText(after) === plainText(currentDay?.[field])) reason = `legacy: ${fromSource[0]}; assembled: the day (rubric/choice)`;
        else if (fromSource && afterSource) reason = `legacy: ${fromSource[0]}; assembled: ${afterSource[0]}`;
        else if (fromSource) reason = `legacy: ${fromSource[0]}; assembled: other`;
        else if (currentDay && plainText(before) === plainText(currentDay[field])) reason = 'legacy: the day; assembled: Proper/Common';
        else if (!plainText(after)) reason = 'unexplained: assembled empty';
        else if (wordSimilarity(before, after) >= 0.8) reason = 'same text, variant (legacy copy ↔ source)';
        byReason[reason] = (byReason[reason] || 0) + 1;
        if (reason.startsWith('unexplained') && unexplained.length < 200) {
          unexplained.push({ date, optionId: option.ordo.optionId, choice: template.choice, field, reason, legacy: plainText(before).slice(0, 80), assembled: plainText(after).slice(0, 80) });
        }
      });
    });
  }
  return { comparedOptions: compared, byReason, unexplained };
}

async function main() {
  const snapshotDir = snapshotDirectory();
  const from = arg('--from', '2026-01-01');
  const to = arg('--to', '2027-12-31');
  const snapshot = await openFirestoreSnapshot(snapshotDir);
  const days = await snapshot.collection('days');
  const sources = [
    auditSource('patchs/feasts', readJsonDir('patchs/feasts').map(({ file, doc }) => ({ id: file, doc }))),
    auditSource('patchs/feasts/common-texts', readJsonDir('patchs/feasts/common-texts').map(({ file, doc }) => ({ id: file, doc }))),
    auditSource('patchs/db-feasts (liturgicalProperTexts)', readJsonDir('patchs/db-feasts').map(({ file, doc }) => ({ id: file, doc }))),
    auditSource('patchs/db-templates (liturgicalTemplates)', readJsonDir('patchs/db-templates').map(({ file, doc }) => ({ id: file, doc }))),
    ...['temporal', 'seasonal-date', 'dynamic', 'fixed', 'office-for-dead'].map((kind) => auditSource(
      `firestore days: ${kind}`, days.filter((doc) => daysKind(doc) === kind).map((doc) => ({ id: doc.id, doc })),
    )),
    auditSource('firestore liturgicalTemplates', ((await snapshot.collection('liturgicalTemplates')) || []).map((doc) => ({ id: doc.id, doc }))),
  ];

  const dates = [...datesBetween(from, to)];
  const legacy = await openLiturgySource({ snapshotDir, propers: 'none', templates: 'generated' });
  const proper = await openLiturgySource({ snapshotDir, propers: 'generated', templates: 'generated' });
  const target = await openLiturgySource({ snapshotDir, propers: 'generated', templates: 'generated', repairs: true });
  const report = {
    generatedAt: new Date().toISOString(),
    snapshot: { exportedAt: snapshot.manifest.exportedAt, scope: snapshot.manifest.scope },
    range: { from, to, dioceses: DIOCESES },
    sources,
    runtime: {
      legacyDays: runtimeScan(legacy, dates),
      properTexts: runtimeScan(proper, dates),
      // liturgicalProperTexts + the temporal repairs: the state after Phase I.
      target: runtimeScan(target, dates),
    },
    legacyComparison: compareWithLegacy(legacy, proper, dates),
  };
  const count = (scan) => ({
    rawInstructionsVisible: scan.rawInstructionsVisible.length,
    integrityErrors: scan.integrityErrors.length,
    missingFields: scan.missingFields.length,
    notShownOptions: scan.unavailableOptions.filter((item) => !item.shown).length,
    assembledWithoutProper: scan.unavailableOptions.filter((item) => item.shown).length,
    legacyDependentCelebrations: scan.properSource['legacy-days'].length,
  });
  report.summary = {
    legacyDays: count(report.runtime.legacyDays),
    properTexts: count(report.runtime.properTexts),
    target: count(report.runtime.target),
    sourceInstructions: Object.fromEntries(sources.map((item) => [item.source, {
      suspicious: item.counts.SUSPICIOUS_SHORT_TEXT, unresolved: item.counts.UNRESOLVED_REFERENCE,
    }])),
  };
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ output: path.relative(ROOT, OUTPUT), ...report.summary }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}

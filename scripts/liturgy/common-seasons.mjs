#!/usr/bin/env node
/**
 * Seasonal variants of the Commons — offline parser / auditor.
 *
 *   node scripts/liturgy/common-seasons.mjs --dry-run          # analyse, print the plan, write nothing
 *   node scripts/liturgy/common-seasons.mjs --check            # exit 1 if patchs/feasts/common-texts is not what the parser generates
 *   node scripts/liturgy/common-seasons.mjs --write            # update `_seasonalVariants` in patchs/feasts/common-texts + provenance
 *   node scripts/liturgy/common-seasons.mjs --report           # write reports/liturgy/common-seasons-audit.{json,md}
 *   --sources <dir>  --common <dir>   override the defaults
 *
 * Reads only local files (the three UTF-8 volumes and the canonical Commons).
 * Idempotent: the output is a pure function of the volumes and of the flat
 * base fields; `_seasonalVariants` already stored never influences the result.
 * After --write regenerate the templates: `npm run generate:fixed-feasts`.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { analyzeCorpus, loadCorpus, SEASONS } from './common-seasons/lib/analyze.mjs';
import { buildAudit, renderMarkdown } from './common-seasons/lib/report.mjs';
import { OFFICE_CONTENT_FIELDS } from '../../src/constants/officeFields.js';
import { SEASONAL_VARIANTS_FIELD, validateSeasonalVariants } from '../../src/utils/ordo/commonSeasons.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? path.resolve(args[i + 1]) : fallback; };

export const PATHS = {
  sources: option('sources', path.join(ROOT, 'patchs', 'sources', 'common-seasons')),
  common: option('common', path.join(ROOT, 'patchs', 'feasts', 'common-texts')),
  provenance: path.join(ROOT, 'patchs', 'sources', 'common-seasons', 'provenance.json'),
  reports: path.join(ROOT, 'reports', 'liturgy'),
};

const stable = (value) => `${JSON.stringify(value, null, 2)}\n`;

export function generate({ includeUnverified = false } = {}) {
  const corpus = loadCorpus({ sourcesDir: PATHS.sources, commonDir: PATHS.common });
  // The stored `_seasonalVariants` never feeds the analysis (idempotency).
  corpus.base.forEach((doc) => { delete doc[SEASONAL_VARIANTS_FIELD]; });
  void includeUnverified;
  const analysis = analyzeCorpus(corpus);
  const documents = new Map();
  const provenance = {};
  analysis.variants.forEach((perSeason, commonId) => {
    const ordered = {};
    SEASONS.forEach((season) => {
      const fields = perSeason[season];
      if (!fields || !Object.keys(fields).length) return;
      ordered[season] = {};
      OFFICE_CONTENT_FIELDS.filter((f) => f in fields).forEach((field) => {
        ordered[season][field] = fields[field].value;
        ((provenance[commonId] ||= {})[season] ||= {})[field] = {
          volume: fields[field].volume, lines: fields[field].lines, method: fields[field].method, kind: fields[field].kind,
          ...(fields[field].from ? { from: fields[field].from } : {}), ...(fields[field].rules?.length ? { rules: fields[field].rules } : {}),
          ...(fields[field].partial ? { partial: true } : {}), sha256: fields[field].hash,
        };
      });
    });
    documents.set(commonId, ordered);
  });
  return { corpus, analysis, documents, provenance };
}

function renderCommonFile(commonId, base, variants) {
  const { [SEASONAL_VARIANTS_FIELD]: ignored, ...rest } = base;
  void ignored;
  const out = { ...rest };
  if (Object.keys(variants).length) out[SEASONAL_VARIANTS_FIELD] = variants;
  return stable(out);
}

function main() {
  const { corpus, analysis, documents, provenance } = generate();
  const files = [];
  corpus.manifest.sections.forEach((section) => {
    const id = section.file.replace(/\.json$/, '');
    const file = path.join(PATHS.common, section.file);
    const current = fs.readFileSync(file, 'utf8');
    const stored = JSON.parse(current);
    const text = renderCommonFile(id, stored, documents.get(id) || {});
    const issues = validateSeasonalVariants({ _id: id, [SEASONAL_VARIANTS_FIELD]: documents.get(id) || undefined });
    files.push({ id, file, current, text, issues, changed: current !== text, fields: Object.values(documents.get(id) || {}).reduce((a, f) => a + Object.keys(f).length, 0) });
  });
  const provenanceText = stable(provenance);
  const provenanceCurrent = fs.existsSync(PATHS.provenance) ? fs.readFileSync(PATHS.provenance, 'utf8') : '';
  const invalid = files.flatMap((f) => f.issues);
  const summary = {
    commons: files.length,
    fieldsWithSeasonalVariants: files.reduce((a, f) => a + f.fields, 0),
    filesChanged: files.filter((f) => f.changed).length + (provenanceText !== provenanceCurrent ? 1 : 0),
    validationIssues: invalid.length,
    perCommon: Object.fromEntries(files.map((f) => [f.id, f.fields])),
  };

  if (flag('report')) {
    const audit = buildAudit({
      corpus, analysis, generatedFrom: Object.fromEntries(Object.values(corpus.volumes).map((v) => [v.id, { file: v.file, sha256: v.sha256 }])),
    });
    fs.mkdirSync(PATHS.reports, { recursive: true });
    fs.writeFileSync(path.join(PATHS.reports, 'common-seasons-audit.json'), stable(audit));
    fs.writeFileSync(path.join(PATHS.reports, 'common-seasons-audit.md'), renderMarkdown(audit));
    summary.report = path.relative(ROOT, path.join(PATHS.reports, 'common-seasons-audit.json'));
    summary.needsReview = audit.needsReview.length;
  }
  if (flag('write')) {
    files.filter((f) => f.changed).forEach((f) => fs.writeFileSync(f.file, f.text));
    if (provenanceText !== provenanceCurrent) fs.writeFileSync(PATHS.provenance, provenanceText);
  }
  console.log(JSON.stringify(summary, null, 2));
  if (invalid.length) { invalid.forEach((i) => console.error(`${i.path}: ${i.message}`)); process.exitCode = 1; }
  if (flag('check') && summary.filesChanged) {
    console.error(`common-texts is out of date (${summary.filesChanged} file(s)): run \`node scripts/liturgy/common-seasons.mjs --write\``);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

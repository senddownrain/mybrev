#!/usr/bin/env node
/**
 * Report celebrations the Ordo engine resolves (primary or legal alternative)
 * that have no `days` or proper `readings` document. Read-only: local
 * analysis source only, never Firestore.
 *
 *   node scripts/ordo-missing-content.mjs [--source <dir>] [--years 2026-2028]
 *     → reports/ordo-missing-content.json + docs/ordo-missing-content.md
 *   node scripts/ordo-missing-content.mjs --check   # exit 1 when the Markdown is stale
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildMissingContentReport, indexEvidence, renderMissingContentMarkdown } from './lib/ordo-data-followups.mjs';
import { defaultSourceDirectory, loadAnalysisSource, loadEvidenceFiles } from './lib/ordo-analysis-source.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function parseYears(value) {
  const match = /^(\d{4})(?:-(\d{4}))?$/.exec(String(value));
  if (!match) throw new Error(`Invalid --years: ${value}`);
  const from = Number(match[1]);
  const to = Number(match[2] || match[1]);
  if (to < from || to - from > 20) throw new Error(`Invalid --years range: ${value}`);
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

export function parseArgs(argv, root = ROOT) {
  const options = {
    source: null,
    years: [2026, 2027, 2028],
    json: path.join(root, 'reports/ordo-missing-content.json'),
    markdown: path.join(root, 'docs/ordo-missing-content.md'),
    check: false,
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const value = () => {
      const next = argv[++index];
      if (!next || next.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      return next;
    };
    if (arg === '--source') options.source = path.resolve(value());
    else if (arg === '--years') options.years = parseYears(value());
    else if (arg === '--json') options.json = path.resolve(value());
    else if (arg === '--markdown') options.markdown = path.resolve(value());
    else if (arg === '--check') options.check = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  options.source = options.source || defaultSourceDirectory(root);
  return options;
}

export async function run(argv, deps = {}) {
  const root = deps.root || ROOT;
  const options = parseArgs(argv, root);
  const log = deps.log || ((line) => console.log(line));
  const { days, readings, source } = await (deps.loadSource || loadAnalysisSource)(options.source);
  const evidenceIndex = indexEvidence((deps.loadEvidence || loadEvidenceFiles)(root));
  const report = buildMissingContentReport({ days, readings, years: options.years, evidenceIndex, source });
  const markdown = renderMissingContentMarkdown(report);
  if (options.check) {
    const current = await readFile(options.markdown, 'utf8').catch(() => '');
    if (current !== markdown) throw new Error(`${path.relative(root, options.markdown)} is stale. Run: node scripts/ordo-missing-content.mjs`);
    log('Missing-content report is up to date.');
    return report;
  }
  const write = deps.writeFile || writeFile;
  await (deps.mkdir || mkdir)(path.dirname(options.json), { recursive: true });
  await write(options.json, `${JSON.stringify(report, null, 2)}\n`);
  await write(options.markdown, markdown);
  log(JSON.stringify({ json: options.json, markdown: options.markdown, ...report.summary }));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  run(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}

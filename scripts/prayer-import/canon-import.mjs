#!/usr/bin/env node
// First-pass canonical import (official books). DRY-RUN by default: reads the structured corpus and a
// local read-only snapshot, writes reports into a private (git-ignored) folder, touches no database.
//   node scripts/prayer-import/canon-import.mjs plan --official <zip|dir> --snapshot <dir> [--snapshot <dir>] [--out <dir>]
// Apply / rollback live in apply.mjs and need an explicitly approved plan.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { loadOfficialCorpus, openCorpusRoot, sha256, stableJson } from './lib/corpus.mjs';
import { toCsv } from './lib/csv.mjs';
import { loadPrayerSnapshot } from './lib/snapshot.mjs';
import { planCanonical, CANON_BATCH } from './lib/plan-canon.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const sources = JSON.parse(readFileSync(path.join(here, 'sources.json'), 'utf8'));
const editorial = JSON.parse(readFileSync(path.join(here, 'editorial-decisions.json'), 'utf8'));

export function parseArgs(argv) {
  const options = { snapshots: [], out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--official') options.official = argv[++i];
    else if (arg === '--snapshot') options.snapshots.push(argv[++i]);
    else if (arg === '--out') options.out = argv[++i];
    else if (arg === '--workspace') options.workspace = argv[++i];
    else if (arg === '--apply') throw new Error('--apply is not part of the dry-run: use apply.mjs with an approved plan (see docs/prayer-import.md).');
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

export function writeReports(out, result, meta) {
  mkdirSync(out, { recursive: true });
  const operations = result.operations;
  const planSha256 = sha256(stableJson(operations.map(({ evidence: _evidence, ...op }) => op)));
  const plan = { batch: CANON_BATCH, generatedAt: meta.generatedAt, dryRun: true, planSha256, liveVerified: false, snapshot: meta.snapshot, counts: result.counts, operations };
  writeFileSync(path.join(out, 'planned_operations.json'), `${JSON.stringify(plan, null, 2)}\n`);
  mkdirSync(path.join(out, 'payloads'), { recursive: true });
  for (const [id, payload] of Object.entries(result.payloads)) writeFileSync(path.join(out, 'payloads', `${id}.json`), JSON.stringify(payload));
  const idRows = operations.filter((op) => op.targetId).map((op) => ({ sourceEntryId: op.sourceEntryId, action: op.action, oldIds: op.oldIds, oldTitle: op.oldTitle || '', newId: op.targetId, collection: op.targetCollection, title: op.title, url: `/prayer/${op.targetId}` }));
  writeFileSync(path.join(out, 'old_to_new_ids.csv'), toCsv(idRows, ['sourceEntryId', 'action', 'oldIds', 'oldTitle', 'newId', 'collection', 'title', 'url']));
  writeFileSync(path.join(out, 'duplicates_review.csv'), toCsv(result.duplicateRows.map((row) => ({ ...row, candidates: row.candidates.map((c) => `${c.id} «${c.title}» t=${c.titleScore} x=${c.textScore}${c.embedded ? ' embedded' : ''}`) })), ['sourceEntryId', 'title', 'decision', 'chosen', 'reason', 'candidates']));
  writeFileSync(path.join(out, 'source_coverage.csv'), toCsv(result.coverage, ['sourceId', 'book', 'entries', 'CREATE', 'REPLACE_KEEP_ID', 'REVIEW_AMBIGUOUS', 'PRESERVE_STRUCTURE']));
  writeFileSync(path.join(out, 'tag_mapping.csv'), toCsv(result.tagRows, ['sourceEntryId', 'title', 'tag', 'via']));
  writeFileSync(path.join(out, 'proposed_new_tags.csv'), toCsv(result.proposedNewTags.map((t) => ({ tag: t.tag, reason: t.reason, affectedCount: t.affected.length, affectedEntries: t.affected, action: 'create tag only after owner approval' })), ['tag', 'reason', 'affectedCount', 'affectedEntries', 'action']));
  writeFileSync(path.join(out, 'proposed_new_categories.csv'), toCsv([], ['category', 'reason', 'affectedEntries', 'action']));
  return planSha256;
}

export function qaMarkdown(result, meta, planSha256) {
  const c = result.counts; const q = result.qa;
  const rows = result.coverage.map((r) => `| ${r.sourceId} | ${r.entries} | ${r.CREATE} | ${r.REPLACE_KEEP_ID} | ${r.REVIEW_AMBIGUOUS} | ${r.PRESERVE_STRUCTURE} |`).join('\n');
  return `# Канонічны імпарт: dry-run (${meta.generatedAt})

Прагон на **лакальным снапшоце**, а не на live Firestore (\`liveVerified: false\`): план трэба перабудаваць на свежым read-only backup перад \`apply\`.

- planSha256: \`${planSha256}\`
- Снапшот: ${meta.snapshot.map((s) => `${s.projectId} ${s.exportedAt}`).join('; ')}; адсутнічаюць калекцыі: ${meta.missingCollections.join(', ') || '—'}

## Лічбы
CREATE ${c.CREATE || 0} · REPLACE_KEEP_ID ${c.REPLACE_KEEP_ID || 0} · REVIEW_AMBIGUOUS (чарнавік) ${c.REVIEW_AMBIGUOUS || 0} · PRESERVE_STRUCTURE ${c.PRESERVE_STRUCTURE || 0}

| source | entries | CREATE | REPLACE | REVIEW | STRUCTURE |
|---|---|---|---|---|---|
${rows}

## Якасць
- Спасылак на іншыя малітвы: ${q.resolvedLinks} пераўтворана ў \`/prayer/<id>\`, ${q.unresolvedLinks} засталіся тэкстам з нумарам старонкі.
- Блокаў са змешаным чырвоным/чорным: ${q.mixedRedBlocks} (чырвоная частка — тлусты шрыфт; чырвоны колер у Markdown не перадаецца).
- Назваў з выпраўленнем лацінскай літары ў кірыліцы: ${q.latinFixes}; пустых тэкстаў: ${q.emptyTexts}; замен з іншай назвай: ${q.titleChanged}.
- Без тэгаў: ${q.withoutTags.length}.
- Новыя тэгі (толькі прапанова): ${result.proposedNewTags.map((t) => `${t.tag} (${t.affected.length})`).join(', ') || '—'}.

## Публікацыя
\`apply\` для CREATE/REPLACE не патрабуе пацверджання правоў; неабходныя правераны план, backup і абарона ад канфліктаў.
`;
}

async function main() {
  const [command = 'plan', ...rest] = process.argv.slice(2);
  if (command !== 'plan') throw new Error('Only "plan" (dry-run) is available here. Use apply.mjs for apply/rollback.');
  const options = parseArgs(rest);
  if (!options.official || !options.snapshots.length) throw new Error('Usage: canon-import.mjs plan --official <zip|dir> --snapshot <dir> [--out <dir>]');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = path.resolve(options.out || `backups/prayer-import/canon-${stamp}`);
  const workspace = path.resolve(options.workspace || path.join('backups/prayer-import/workspace'));
  mkdirSync(workspace, { recursive: true });
  const corpus = loadOfficialCorpus(openCorpusRoot(path.resolve(options.official), workspace, 'official'));
  const snapshot = await loadPrayerSnapshot(options.snapshots.map((d) => path.resolve(d)));
  const result = planCanonical({ corpus, sources, oldPrayers: snapshot.prayers, categories: snapshot.categories, editorial });
  const meta = { generatedAt: new Date().toISOString(), snapshot: snapshot.info, missingCollections: snapshot.missingCollections };
  const planSha256 = writeReports(out, result, meta);
  writeFileSync(path.join(out, 'migration_qa.md'), qaMarkdown(result, meta, planSha256));
  console.log(JSON.stringify({ out, planSha256, counts: result.counts, qa: { ...result.qa, withoutTags: result.qa.withoutTags.length }, proposedNewTags: result.proposedNewTags.map((t) => t.tag) }, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

#!/usr/bin/env node
// Second pass: «Бог Добры» -> closed drafts only. Dry-run, never public. The first-pass plan is rebuilt in memory so
// "already exists" is judged against the final canonical set, not against old MyBrev alone.
//   node scripts/prayer-import/bog-import.mjs plan --bog <zip|dir> --official <zip|dir> --snapshot <dir> [--out <dir>]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBogCorpus, loadOfficialCorpus, openCorpusRoot, sha256, stableJson } from './lib/corpus.mjs';
import { toCsv } from './lib/csv.mjs';
import { loadPrayerSnapshot } from './lib/snapshot.mjs';
import { planCanonical } from './lib/plan-canon.mjs';
import { BOG_BATCH, BOG_SOURCE_ID, planBogDobry } from './lib/plan-bog.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const sources = JSON.parse(readFileSync(path.join(here, 'sources.json'), 'utf8'));
const editorial = JSON.parse(readFileSync(path.join(here, 'editorial-decisions.json'), 'utf8'));
const BOG_PDF_SHA256 = '898151275d4dba9202541f993d629ef1b047ff38ee8ec5242d82fc44893a98d1'; // schemas/INPUT_MANIFEST.json

export function writeBogReports(out, result, meta) {
  mkdirSync(path.join(out, 'payloads'), { recursive: true });
  const planSha256 = sha256(stableJson(result.operations.map(({ evidence: _e, matches: _m, ...op }) => op)));
  const plan = { batch: BOG_BATCH, draftsOnly: true, generatedAt: meta.generatedAt, dryRun: true, planSha256, liveVerified: false, snapshot: meta.snapshot, counts: result.counts, byType: result.byType, operations: result.operations };
  writeFileSync(path.join(out, 'planned_operations.json'), `${JSON.stringify(plan, null, 2)}\n`);
  for (const [id, payload] of Object.entries(result.payloads)) writeFileSync(path.join(out, 'payloads', `${id}.json`), JSON.stringify(payload));
  const drafts = result.operations.filter((op) => op.targetId);
  writeFileSync(path.join(out, 'bog_dobry_drafts.csv'), toCsv(drafts.map((op) => ({ draftId: op.targetId, decision: op.action, title: op.title, type: op.type, page: `${op.printedPageStart}${op.printedPageEnd && op.printedPageEnd !== op.printedPageStart ? `–${op.printedPageEnd}` : ''}`, section: op.sectionTrail.slice(-1)[0] || '', tags: op.tags, categories: op.categories, status: 'draft', flags: op.flags, sourceEntryId: op.sourceEntryId })), ['draftId', 'decision', 'title', 'type', 'page', 'section', 'tags', 'categories', 'status', 'flags', 'sourceEntryId']));
  writeFileSync(path.join(out, 'excluded_bog_dobry.csv'), toCsv(result.excluded.map((row) => ({ sourceEntryId: row.sourceEntryId, type: row.type, language: row.language, title: row.title, page: row.printedPageStart, reason: row.reason, detail: row.detail })), ['sourceEntryId', 'type', 'language', 'title', 'page', 'reason', 'detail']));
  writeFileSync(path.join(out, 'old_to_new_ids.csv'), toCsv(drafts.map((op) => ({ sourceEntryId: op.sourceEntryId, action: op.action, oldIds: '', newId: op.targetId, collection: 'prayerDrafts', title: op.title, url: '(closed draft, no public URL)' })), ['sourceEntryId', 'action', 'oldIds', 'newId', 'collection', 'title', 'url']));
  writeFileSync(path.join(out, 'duplicates_review.csv'), toCsv(result.duplicateRows.map((row) => ({ ...row, matches: row.matches.map((m) => `${m.origin || ''} ${m.id} «${m.title || ''}» x=${m.textScore ?? ''}`) })), ['sourceEntryId', 'title', 'decision', 'matches']));
  writeFileSync(path.join(out, 'tag_mapping.csv'), toCsv(result.tagRows, ['sourceEntryId', 'title', 'tag', 'via']));
  writeFileSync(path.join(out, 'proposed_new_tags.csv'), toCsv(result.proposedNewTags.map((t) => ({ tag: t.tag, reason: t.reason, affectedCount: t.affected.length, action: 'create tag only after owner approval' })), ['tag', 'reason', 'affectedCount', 'action']));
  writeFileSync(path.join(out, 'proposed_new_categories.csv'), toCsv([], ['category', 'reason', 'affectedEntries', 'action']));
  writeFileSync(path.join(out, 'source_coverage.csv'), toCsv(Object.entries(result.byType).map(([type, by]) => ({ sourceId: BOG_SOURCE_ID, type, EXCLUDE: by.EXCLUDE || 0, ALREADY_EXISTS: by.ALREADY_EXISTS || 0, UNIQUE_DRAFT: by.UNIQUE_DRAFT || 0, REVIEW: by.REVIEW || 0 })), ['sourceId', 'type', 'EXCLUDE', 'ALREADY_EXISTS', 'UNIQUE_DRAFT', 'REVIEW']));
  return planSha256;
}

export function bogQaMarkdown(result, meta, planSha256) {
  const c = result.counts;
  return `# «Бог Добры» (Пінск, 2022): dry-run (${meta.generatedAt})

Толькі закрытыя чарнавікі (\`prayerDrafts\`), нічога публічнага. Прагон на лакальным снапшоце, не на live (\`liveVerified: false\`).

- planSha256: \`${planSha256}\`
- Усяго запісаў: ${Object.values(c).reduce((a, b) => a + b, 0)}
- **EXCLUDE ${c.EXCLUDE}** · **ALREADY_EXISTS ${c.ALREADY_EXISTS}** · **UNIQUE_DRAFT ${c.UNIQUE_DRAFT}** · **REVIEW ${c.REVIEW}**
- Прычыны выключэння: ${Object.entries(result.exclusionReasons).map(([k, v]) => `${k} ${v}`).join(', ')}
- Праверана супраць: канон першага захопу (${meta.canonicalCount} тэкстаў), жывыя малітвы снапшота (${meta.liveCount}), існуючыя чарнавікі (${meta.draftCount}).
- Блокаў-малюнкаў прапушчана: ${result.qa.imagesSkipped}; без тэгаў: ${result.qa.noTags}; загалоўкаў з вялікімі літарамі прыведзена да сказа: ${result.qa.titleCase}.
- Новыя тэгі (толькі прапанова): ${result.proposedNewTags.map((t) => t.tag).join(', ') || '—'}.

Публікацыя: адміністратар можа апублікаваць любы поўны чарнавік непасрэдна, без дадатковых станаў і пацверджанняў правоў.
`;
}

async function main() {
  const [command = 'plan', ...rest] = process.argv.slice(2);
  if (command !== 'plan') throw new Error('Only "plan" (dry-run). Draft import uses apply.mjs with the approved plan.');
  const options = { snapshots: [] };
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === '--bog') options.bog = rest[++i]; else if (arg === '--official') options.official = rest[++i]; else if (arg === '--snapshot') options.snapshots.push(rest[++i]);
    else if (arg === '--out') options.out = rest[++i]; else if (arg === '--workspace') options.workspace = rest[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.bog || !options.official || !options.snapshots.length) throw new Error('Usage: bog-import.mjs plan --bog <zip|dir> --official <zip|dir> --snapshot <dir> [--out <dir>]');
  const out = path.resolve(options.out || `backups/prayer-import/bog-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  const workspace = path.resolve(options.workspace || 'backups/prayer-import/workspace');
  mkdirSync(workspace, { recursive: true }); mkdirSync(out, { recursive: true });
  const official = loadOfficialCorpus(openCorpusRoot(path.resolve(options.official), workspace, 'official'));
  const bog = loadBogCorpus(openCorpusRoot(path.resolve(options.bog), workspace, 'bog'));
  const snapshot = await loadPrayerSnapshot(options.snapshots.map((d) => path.resolve(d)));
  const canonical = planCanonical({ corpus: official, sources, oldPrayers: snapshot.prayers, categories: snapshot.categories, editorial });
  const result = planBogDobry({ corpus: bog, sources, canonical, oldPrayers: snapshot.prayers, drafts: [], categories: snapshot.categories, sourceSha256: BOG_PDF_SHA256 });
  const meta = { generatedAt: new Date().toISOString(), snapshot: snapshot.info, canonicalCount: Object.keys(canonical.payloads).length, liveCount: snapshot.prayers.length, draftCount: 0 };
  const planSha256 = writeBogReports(out, result, meta);
  writeFileSync(path.join(out, 'migration_qa.md'), bogQaMarkdown(result, meta, planSha256));
  console.log(JSON.stringify({ out, planSha256, counts: result.counts, byType: result.byType, exclusionReasons: result.exclusionReasons, qa: result.qa, proposedNewTags: result.proposedNewTags.map((t) => t.tag) }, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

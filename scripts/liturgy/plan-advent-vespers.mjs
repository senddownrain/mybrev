#!/usr/bin/env node
/** Offline-only narrow plan. Intentionally has no Firebase dependency or apply phase.
 * node scripts/liturgy/plan-advent-vespers.mjs --snapshot <dir> --out <new private dir>
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import reviewed from '../../src/data/liturgical/advent-vespers-by.json' with { type: 'json' };
import { openFirestoreSnapshot } from '../lib/firestore-snapshot.mjs';
import { snapshotDirectory } from './lib/snapshot-content.mjs';
import { plain } from './lib/lh-catholic-by.mjs';

const ALLOWLIST = Object.freeze({
  'advent-21-12': ['vesperR', 'vesperInter', 'vesperPr'],
  'advent-w4-d1': ['vesper1Hymn', 'vesper1Ant1', 'vesper1Ant2', 'vesper1Ant3',
    'vesper1Ps1', 'vesper1Ps2', 'vesper1Ps3', 'vesper1R', 'vesper1Inter', 'vesper1Pr'],
});
const canonical = (value) => JSON.stringify(value, (_key, item) => (
  item && !Array.isArray(item) && typeof item === 'object'
    ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item
));
export const documentHash = (value) => createHash('sha256').update(canonical(value)).digest('hex');

export function planAdventVespers(entries) {
  const documents = new Map(entries.map((entry) => [entry.id, entry]));
  const changes = [];
  const conflicts = [];
  const backup = [];
  for (const [id, fields] of Object.entries(reviewed.documents)) {
    if (!ALLOWLIST[id] || Object.keys(fields).some((field) => !ALLOWLIST[id].includes(field))
      || Object.keys(fields).length !== ALLOWLIST[id].length) throw new Error(`Invalid field allowlist: ${id}`);
    const entry = documents.get(id);
    if (!entry) { conflicts.push({ id, reason: 'missing document' }); continue; }
    const sha256 = documentHash(entry.data);
    backup.push({ ...entry, sha256 });
    const update = {};
    for (const [field, { before, value, source }] of Object.entries(fields)) {
      const current = entry.data[field] ?? null;
      if (current === value) continue;
      if (current !== before) { conflicts.push({ id, field, reason: 'differs from reviewed original' }); continue; }
      update[field] = { before: current, after: value, source };
    }
    if (Object.keys(update).length) changes.push({ path: `days/${id}`, sha256,
      updateTime: entry.updateTime || null, fields: update });
  }
  return { mode: 'dry-run', writes: 0, changes, conflicts, backup,
    productionReady: conflicts.length === 0 && backup.length === 2 && backup.every((entry) => entry.updateTime),
    requirementsBeforeApply: [
      'Separate owner approval for production writes.',
      'Fresh backup of exactly these two live documents including updateTime; verify original field values and document hashes.',
      'Only field-level updates with lastUpdateTime preconditions; abort the entire patch on any conflict. Never set/replace documents.',
      'Read back the allowlisted fields, rerun the provenance audit, then separately review the content manifest publication. No deploy/merge.',
    ],
  };
}

async function main() {
  if (process.argv.includes('--apply')) throw new Error('Offline plan only; production writes require separate authorization.');
  const index = process.argv.indexOf('--out');
  const out = path.resolve(index > 0 ? process.argv[index + 1] : 'backups/advent-vespers-dry-run');
  const privateRoot = path.resolve('backups') + path.sep;
  if (!out.startsWith(privateRoot)) throw new Error('Keep backups and plans in the private backups/ directory.');
  if (fs.existsSync(out)) throw new Error('Output already exists; choose a new directory to preserve the backup.');
  const snapshot = await openFirestoreSnapshot(snapshotDirectory());
  const result = planAdventVespers(await snapshot.collectionEntries('days') || []);
  fs.mkdirSync(out, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(out, 'backup.json'), `${JSON.stringify({ snapshot: snapshot.manifest, documents: result.backup }, null, 2)}\n`, { mode: 0o600 });
  const { backup: _backup, ...plan } = result;
  fs.writeFileSync(path.join(out, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`, { mode: 0o600 });
  const lines = ['# Advent Vespers — offline dry-run', '',
    `Source: ${snapshot.manifest.scope}, ${snapshot.manifest.exportedAt}. Writes: **0**.`, '',
    `Production-ready backup with updateTime: **${Boolean(result.productionReady)}**.`, '',
    '| Document | Field | Before | After | Belarusian text source |', '|---|---|---|---|---|',
    ...result.changes.flatMap((change) => Object.entries(change.fields).map(([field, value]) =>
      `| ${change.path} | ${field} | ${plain(value.before).slice(0, 90) || '(empty)'} | ${plain(value.after).slice(0, 90)} | ${value.source.document}.${value.source.field} |`)),
    '', ...result.requirementsBeforeApply.map((item) => `- ${item}`), ''];
  fs.writeFileSync(path.join(out, 'summary.md'), lines.join('\n'), { mode: 0o600 });
  console.log(JSON.stringify({ mode: result.mode, writes: 0, documents: result.changes.length,
    fields: result.changes.reduce((n, item) => n + Object.keys(item.fields).length, 0),
    conflicts: result.conflicts, productionReady: Boolean(result.productionReady), output: out }, null, 2));
  if (result.conflicts.length) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}

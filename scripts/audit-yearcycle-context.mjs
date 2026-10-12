import fs from 'node:fs/promises';
import { openFirestoreSnapshot } from './lib/firestore-snapshot.mjs';
import { contextualAudit } from './lib/catholicby-yearcycle.mjs';
const directory = 'reports/catholicby-yearcycle';
const plan = JSON.parse(await fs.readFile(`${directory}/import-plan.json`, 'utf8'));
const snapshot = await openFirestoreSnapshot(plan.snapshots.prayers.root);
const existing = [...(await snapshot.collection('prayers') || []), ...(await snapshot.collection('priestProtectedPrayers') || [])];
const result = contextualAudit(plan.entries.filter((e) => e.candidate && e.status !== 'skipped-reference').map((e) => e.candidate), existing);
await fs.writeFile(`${directory}/contextual-dedup.json`, JSON.stringify({ snapshotVersion: snapshot.manifest.snapshotVersion, existingDocuments: existing.length, firestoreReads: 0, result }, null, 2));
for (const row of result) {
  console.log(row.id, JSON.stringify(row.matches.slice(0, 2).map((m) => ({ id: m.id, title: m.title, candidateCoverage: +m.candidateCoverage.toFixed(3), existingCoverage: +m.existingCoverage.toFixed(3), exact: m.normalizedExact, embedded: m.embedded }))));
}

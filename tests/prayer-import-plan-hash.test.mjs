import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadApprovedPlan } from '../scripts/prayer-import/apply.mjs';
import { sha256, stableJson } from '../scripts/prayer-import/lib/corpus.mjs';

// Regression: the Bog Dobry planner leaves `evidence` and `matches` out of planSha256, so apply must too.
test('loadApprovedPlan accepts a plan whose operations carry evidence and matches', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'plan-hash-'));
  mkdirSync(path.join(dir, 'payloads'));
  const text = 'Знак святога Крыжа';
  const textSha256 = createHash('sha256').update(text).digest('hex');
  const operations = [
    { sourceEntryId: 'a', action: 'UNIQUE_DRAFT', targetCollection: 'prayerDrafts', targetId: 'bd_a', textSha256, evidence: ['x'] },
    { sourceEntryId: 'b', action: 'ALREADY_EXISTS', matches: [{ id: 'live1', score: 1 }], evidence: ['y'] },
  ];
  const planSha256 = sha256(stableJson(operations.map(({ evidence: _e, matches: _m, ...op }) => op)));
  writeFileSync(path.join(dir, 'planned_operations.json'), JSON.stringify({ planSha256, draftsOnly: true, operations }));
  writeFileSync(path.join(dir, 'payloads', 'bd_a.json'), JSON.stringify({ data: { text } }));
  const { plan, payloads } = loadApprovedPlan(dir, planSha256);
  assert.equal(plan.planSha256, planSha256);
  assert.ok(payloads.bd_a);
  assert.throws(() => loadApprovedPlan(dir, 'f'.repeat(64)), /approve-sha/);
  operations[0].textSha256 = 'tampered';
  writeFileSync(path.join(dir, 'planned_operations.json'), JSON.stringify({ planSha256, draftsOnly: true, operations }));
  assert.throws(() => loadApprovedPlan(dir, planSha256), /modified after the dry-run/);
});

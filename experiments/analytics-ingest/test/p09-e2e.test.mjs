import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { MULTIPLICITY, runE2E, summarize } from '../e2e/p09-e2e.mjs';

const result = await runE2E();
const summary = summarize(result);

test('P09 gate matrix: every closed lock sends nothing, keeps no queue, and the transport is never called', () => {
  for (const g of summary.gates) {
    assert.equal(g.sent, 0, g.name);
    assert.equal(g.transportCalls, 0, g.name);
    assert.equal(g.queueKeyExists ?? g.queueKeyExistsAfter ?? false, false, g.name);
  }
  assert.equal(summary.gates.find((g) => g.name === 'build OFF').kvWrites, 0, 'build OFF never touches the store');
  assert.equal(summary.gates.find((g) => g.name === 'revoke after queueing').queuedBefore, 1);
});

test('P09 e2e: WEB collector + iOS/Android QA packets are valid v2 and all reach the store (4 packets, 0 lost)', () => {
  for (const run of [summary.x1, summary.x6]) {
    for (const list of Object.values(run.packetsValid)) assert.ok(list.every((errors) => errors === 0));
    assert.deepEqual(run.transport, { calls: 4, accepted: 4 });
    for (const d of Object.values(run.perDevice)) { assert.equal(d.lost, 0); assert.equal(d.queueLeft, 0); }
    assert.equal(run.storedEqualsExpected, true, 'stored sums equal the independent per-platform sums of the source packets');
  }
});

test('P09 e2e: k-suppression — one QA session publishes (almost) nothing; the x6 fixture publishes exactly the expected lower bounds', () => {
  assert.equal(summary.x1.report.publishedOpens, 0, 'single-session opens are all below k');
  assert.equal(summary.x1.report.publishedFv, 0);
  assert.ok(summary.x1.report.minPublishedN >= summary.x1.report.k);
  assert.equal(summary.x6.report.publishedOpens, summary.x6.expectedTotals.screen_view);
  assert.equal(summary.x6.report.publishedOpens, 23 * MULTIPLICITY);
  assert.ok(summary.x6.report.minPublishedN >= summary.x6.report.k);
  assert.ok(summary.x6.report.publishedFv <= summary.x6.expectedTotals.text_read_fv, 'published never exceeds raw');
});

test('P09 e2e: no analytics network attempt of any kind and no forbidden strings in either report', () => {
  assert.deepEqual(summary.networkAttempts, []);
  assert.deepEqual(summary.x1.report.privacyScan, []);
  assert.deepEqual(summary.x6.report.privacyScan, []);
});

test('P09 evidence: committed e2e-result.json matches a fresh run', () => {
  const committed = JSON.parse(fs.readFileSync(new URL('../../../docs/analytics-evidence/p09/e2e-out/e2e-result.json', import.meta.url), 'utf8'));
  assert.deepEqual(committed, JSON.parse(JSON.stringify(summary)));
});

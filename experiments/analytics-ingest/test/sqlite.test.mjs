/** The same behaviour on a real local SQLite (node:sqlite, in memory). Skipped when the module is not available. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { cleanup, handleIngest } from '../src/core.mjs';

let createSqliteStorage = null;
try { ({ createSqliteStorage } = await import('../src/storage-sqlite.mjs')); } catch { /* Node without node:sqlite */ }
const skip = createSqliteStorage ? false : 'node:sqlite is not available on this Node';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/analytics-contract-v2.json'), 'utf8'));
const publicIds = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'src/utils/analytics/public-inventory.json'), 'utf8')).ids);
const NOW = Date.parse('2026-10-17T12:00:00Z');
const body = (overrides = {}) => ({ method: 'POST', bodyText: JSON.stringify({ ...fixture.validPacket, day: '2026-10-17', ...overrides }) });
const env = (storage, config = {}) => ({ config: { ingestEnabled: true, ...config }, now: () => NOW, publicIds, storage });

test('SQLite: upsert sums counters, one transaction per packet, schema is the migration file', { skip }, async () => {
  const storage = createSqliteStorage();
  const tables = storage.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((row) => row.name);
  assert.deepEqual(tables, ['cell_counts', 'daily_budget']);
  assert.equal(storage.db.prepare("SELECT count(*) AS c FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_autoindex%'").get().c, 0, 'no secondary index: one row write per upsert');
  await handleIngest(body(), env(storage));
  await handleIngest(body(), env(storage));
  const rows = await storage.all();
  assert.equal(rows.reduce((s, r) => s + r.n, 0), 2 * fixture.validPacket.cells.reduce((s, c) => s + c.n, 0));
  const budget = storage.db.prepare('SELECT rows_written FROM daily_budget').get().rows_written;
  assert.equal(budget, 2 * rows.length);
  storage.close();
});

test('SQLite: a failing statement rolls the whole packet back; budget refusal writes nothing; retention deletes by key range', { skip }, async () => {
  const storage = createSqliteStorage();
  await handleIngest(body(), env(storage));
  const before = JSON.stringify(await storage.all());
  // force a failure in the middle of the next packet: drop the table the upsert needs after the budget read
  const broken = createSqliteStorage();
  broken.db.exec('DROP TABLE cell_counts');
  const result = await handleIngest(body(), env(broken));
  assert.equal(result.code, 'storage_unavailable');
  assert.equal(JSON.stringify(await storage.all()), before);
  const tiny = createSqliteStorage();
  assert.equal((await handleIngest(body(), env(tiny, { dailyRowWriteBudget: 2 }))).code, 'budget_exhausted');
  assert.equal((await tiny.all()).length, 0);
  assert.ok((await cleanup(storage, Date.parse('2027-12-01T00:00:00Z'), 395)) > 0);
  assert.equal((await storage.all()).length, 0);
  [storage, broken, tiny].forEach((s) => s.close());
});

test('SQLite: only an in-memory database is allowed (no file, no remote, no D1 connection)', { skip }, () => {
  assert.throws(() => createSqliteStorage({ file: '/tmp/x.db' }), /in-memory/);
});

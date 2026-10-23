/**
 * P06: the same guarantees on a real SQLite engine (node:sqlite), including TWO connections to one temp file to prove the
 * read-then-write budget race of the old code and its absence in the new one. Local temp files only; no network, no D1.
 * D1 SEMANTICS NOT VERIFIED: this proves SQLite behaviour, not Cloudflare D1 behaviour (see docs/analytics-ingest-d1-adapter-design.md).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { cleanup, handleIngest, normalizeCells } from '../src/core.mjs';

let createSqliteStorage = null; let DatabaseSync = null;
try { ({ createSqliteStorage } = await import('../src/storage-sqlite.mjs')); ({ DatabaseSync } = await import('node:sqlite')); } catch { /* Node without node:sqlite */ }
const skip = createSqliteStorage ? false : 'node:sqlite is not available (skip explicitly allowed)';
if (!createSqliteStorage && process.env.ANALYTICS_INGEST_ALLOW_SQLITE_SKIP !== '1') {
  test('P06 SQLite tests need node:sqlite (Node >= 24); set ANALYTICS_INGEST_ALLOW_SQLITE_SKIP=1 to skip knowingly', () => { assert.fail('node:sqlite is not available on this Node'); });
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/analytics-contract-v2.json'), 'utf8'));
const publicIds = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'src/utils/analytics/public-inventory.json'), 'utf8')).ids);
const NOW = Date.parse('2026-10-17T12:00:00Z');
const FIVE = ['songs', 'favorites', 'prayers_all', 'prayers_home', 'hours_list'].map((catalog_id) => ({ e: 'catalog_open', catalog_id, n: 1 }));
const packet = (overrides = {}) => ({ ...JSON.parse(JSON.stringify(fixture.validPacket)), day: '2026-10-17', ...overrides });
const post = (body) => ({ method: 'POST', bodyText: JSON.stringify(body) });
const env = (storage, config = {}) => ({ config: { ingestEnabled: true, ...config }, now: () => NOW, publicIds, storage });
const tempDb = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ingest-p06-')); return { file: path.join(dir, 'db.sqlite'), dir }; };

test('SQLite: concurrent packets near the 80 000 budget never overspend (exactly one 6-row packet fits)', { skip }, async () => {
  const storage = createSqliteStorage();
  storage.db.prepare('INSERT INTO daily_budget (day, rows_written) VALUES (?, ?)').run('2026-10-17', 79990);
  const e = env(storage); const body = post(packet({ cells: FIVE }));
  const results = await Promise.all(Array.from({ length: 10 }, () => handleIngest(body, e)));
  assert.equal(results.filter((r) => r.status === 204).length, 1);
  assert.equal(results.filter((r) => r.code === 'budget_exhausted').length, 9);
  assert.equal(await storage.budgetUsed('2026-10-17'), 79996);
  assert.equal((await storage.all()).reduce((s, r) => s + r.n, 0), 5);
  storage.close();
});

test('SQLite: boundary 80 000 is allowed, 80 001 is refused, and a packet bigger than the whole budget is refused on an empty day', { skip }, async () => {
  for (const [seed, status] of [[79994, 204], [79995, 503]]) {
    const storage = createSqliteStorage();
    storage.db.prepare('INSERT INTO daily_budget (day, rows_written) VALUES (?, ?)').run('2026-10-17', seed);
    assert.equal((await handleIngest(post(packet({ cells: FIVE })), env(storage))).status, status);
    storage.close();
  }
  const storage = createSqliteStorage();
  assert.equal((await handleIngest(post(packet({ cells: FIVE })), env(storage, { dailyRowWriteBudget: 5 }))).code, 'budget_exhausted');
  assert.equal(await storage.budgetUsed('2026-10-17'), 0);
  assert.equal((await storage.all()).length, 0);
  storage.close();
});

test('SQLite: the OLD read-then-write budget pattern loses an update across two connections; the new single-statement reservation does not', { skip }, async () => {
  const { file, dir } = tempDb();
  try {
    const a = new DatabaseSync(file); const b = new DatabaseSync(file);
    const storageA = createSqliteStorage({ db: a }); const storageB = createSqliteStorage({ db: b });
    const BUDGET = 10; const CHARGE = 6;
    // OLD pattern (as in #138): A reads the used budget, B commits a whole packet, A then writes `before + charge` absolutely.
    const aBefore = a.prepare('SELECT rows_written FROM daily_budget WHERE day = ?').get('x')?.rows_written || 0;
    await storageB.addCounts({ today: 'x', rows: new Array(CHARGE - 1).fill(0).map((_, i) => ({ key: `["b${i}"]`, n: 1 })), charge: CHARGE, dailyRowWriteBudget: BUDGET });
    assert.ok(aBefore + CHARGE <= BUDGET, 'A believes it fits');
    a.exec('BEGIN IMMEDIATE');
    a.prepare('INSERT INTO daily_budget (day, rows_written) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET rows_written = excluded.rows_written').run('x', aBefore + CHARGE);
    a.exec('COMMIT');
    assert.equal(await storageB.budgetUsed('x'), 6, 'LOST UPDATE: 12 rows were written but the counter says 6, the budget (10) is silently overspent');
    // NEW pattern: the same interleaving, but A's reservation is evaluated by the engine against the current row.
    const result = await storageA.addCounts({ today: 'y', rows: [{ key: '["a"]', n: 1 }], charge: 6, dailyRowWriteBudget: BUDGET });
    const second = await storageB.addCounts({ today: 'y', rows: [{ key: '["b"]', n: 1 }], charge: 6, dailyRowWriteBudget: BUDGET });
    assert.deepEqual([result.ok, second.ok], [true, false]);
    assert.equal(await storageA.budgetUsed('y'), 6);
    a.close(); b.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('SQLite: a connection that cannot take the write lock fails the packet cleanly (503 storage_unavailable, nothing written, lock released)', { skip }, async () => {
  const { file, dir } = tempDb();
  try {
    const holder = new DatabaseSync(file); const other = new DatabaseSync(file);
    const storage = createSqliteStorage({ db: other }); createSqliteStorage({ db: holder });
    holder.exec('BEGIN IMMEDIATE');
    const result = await handleIngest(post(packet({ cells: FIVE })), env(storage));
    assert.deepEqual([result.status, result.code], [503, 'storage_unavailable']);
    holder.exec('ROLLBACK');
    assert.equal((await storage.all()).length, 0);
    assert.equal((await handleIngest(post(packet({ cells: FIVE })), env(storage))).status, 204, 'the next packet works: no stuck transaction');
    holder.close(); other.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('SQLite: failure AFTER the budget reservation (counter overflow on the 2nd cell) rolls back cells and budget together', { skip }, async () => {
  const storage = createSqliteStorage();
  const cells = FIVE.slice(0, 3);
  const rows = normalizeCells(packet({ cells }));
  storage.db.prepare('INSERT INTO cell_counts (cell_key, n) VALUES (?, ?)').run(rows[1].key, Number.MAX_SAFE_INTEGER);
  const before = JSON.stringify(await storage.all());
  const result = await handleIngest(post(packet({ cells })), env(storage));
  assert.deepEqual([result.status, result.code], [503, 'storage_unavailable']);
  assert.equal(JSON.stringify(await storage.all()), before);
  assert.equal(await storage.budgetUsed('2026-10-17'), 0, 'the reserved budget was rolled back, no leak');
  assert.equal(storage.db.prepare('SELECT typeof(n) AS t FROM cell_counts WHERE cell_key = ?').get(rows[1].key).t, 'integer', 'the CHECK stops the silent int64 -> REAL conversion');
  assert.equal((await handleIngest(post(packet({ cells: FIVE.slice(3) })), env(storage))).status, 204, 'storage is usable afterwards');
  storage.close();
});

test('SQLite: retention uses real engine ordering — day is the first key component, cutoff day is kept, budget rows are pruned', { skip }, async () => {
  const storage = createSqliteStorage();
  const days = ['2023-12-31', '2024-02-29', '2024-03-01', '2025-01-01', '2026-10-15', '2026-10-16', '2026-10-17'];
  for (const day of days) {
    const [row] = normalizeCells({ ...packet({ cells: FIVE.slice(0, 1) }), day });
    storage.db.prepare('INSERT INTO cell_counts (cell_key, n) VALUES (?, 1)').run(row.key);
    storage.db.prepare('INSERT INTO daily_budget (day, rows_written) VALUES (?, 2)').run(day);
  }
  const deleted = await cleanup(storage, Date.parse('2026-10-19T00:00:00Z'), 3); // cutoff 2026-10-16
  assert.equal(deleted, 5);
  assert.deepEqual((await storage.all()).map((r) => JSON.parse(r.cell_key)[0]), ['2026-10-16', '2026-10-17']);
  assert.deepEqual(storage.db.prepare('SELECT day FROM daily_budget ORDER BY day').all().map((r) => r.day), ['2026-10-16', '2026-10-17']);
  storage.close();
});

test('SQLite: midnight UTC — the budget row of the new server day starts from zero; a late packet is charged to the server day', { skip }, async () => {
  const storage = createSqliteStorage();
  const late = { ...env(storage), now: () => Date.parse('2026-10-18T00:00:00Z') };
  assert.equal((await handleIngest(post(packet({ day: '2026-10-16', cells: FIVE })), late)).status, 204);
  assert.equal(await storage.budgetUsed('2026-10-18'), 6);
  assert.equal(await storage.budgetUsed('2026-10-16'), 0);
  storage.close();
});

test('SQLite: migration has only the two tables, no index, and CHECK constraints reject negative / over-limit counters directly', { skip }, () => {
  const storage = createSqliteStorage();
  const insert = storage.db.prepare('INSERT INTO cell_counts (cell_key, n) VALUES (?, ?)');
  assert.throws(() => insert.run('k1', -1), /CHECK/);
  assert.throws(() => insert.run('k2', Number.MAX_SAFE_INTEGER + 2), /CHECK|datatype/);
  insert.run('k3', Number.MAX_SAFE_INTEGER);
  assert.throws(() => storage.db.prepare('UPDATE cell_counts SET n = n + 1 WHERE cell_key = ?').run('k3'), /CHECK/);
  storage.close();
});

test('SQLite: the D1 batch design — a CHECK on the budget row aborts ALL statements of the transaction (engine semantics only, D1 NOT VERIFIED)', { skip }, () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE b (day TEXT PRIMARY KEY, rows_written INTEGER NOT NULL, cap INTEGER NOT NULL, CHECK (rows_written >= 0 AND rows_written <= cap)) WITHOUT ROWID; CREATE TABLE c (k TEXT PRIMARY KEY, n INTEGER NOT NULL) WITHOUT ROWID;');
  const batch = (charge) => {
    db.exec('BEGIN');
    try {
      db.prepare('INSERT INTO b (day, rows_written, cap) VALUES (?, ?, 10) ON CONFLICT(day) DO UPDATE SET rows_written = rows_written + excluded.rows_written').run('d', charge);
      db.prepare('INSERT INTO c (k, n) VALUES (?, 1) ON CONFLICT(k) DO UPDATE SET n = n + 1').run(`k${charge}`);
      db.exec('COMMIT'); return true;
    } catch { db.exec('ROLLBACK'); return false; }
  };
  assert.equal(batch(6), true);
  assert.equal(batch(6), false, '12 > cap 10');
  assert.equal(db.prepare('SELECT rows_written FROM b').get().rows_written, 6);
  assert.equal(db.prepare('SELECT count(*) AS c FROM c').get().c, 1, 'the cell write of the refused packet is gone');
  db.close();
});

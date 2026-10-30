/**
 * LOCAL / TEST ONLY: the subset of the D1 Database API used by d1-storage.mjs on top of node:sqlite.
 * batch() = one transaction, rolled back as a whole when any statement fails (documented D1 behaviour).
 * `meta.rows_written` here is SQLite `changes`, NOT Cloudflare billing. This is the SQLite fallback of R02-STAGING-BLOCKED-CREDENTIALS.
 */
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS = ['0001_init.sql', '0002_d1_budget_cap_and_control.sql'].map((f) => new URL(`../../migrations/${f}`, import.meta.url));

export function createSqliteD1({ file = ':memory:' } = {}) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA busy_timeout = 5000');
  // 0002 drops and rebuilds daily_budget (staging-only reset semantics); apply the chain only to a fresh database
  const fresh = !db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'control'").get();
  if (fresh) for (const url of MIGRATIONS) db.exec(fs.readFileSync(url, 'utf8'));
  const meta = (r) => ({ changes: Number(r.changes), rows_written: Number(r.changes) });
  const make = (sql, params = []) => ({
    bind: (...args) => make(sql, args),
    _run: () => meta(db.prepare(sql).run(...params)),
    async run() { return { success: true, meta: this._run() }; },
    async all() { return { results: db.prepare(sql).all(...params), success: true, meta: {} }; },
    async first() { return db.prepare(sql).get(...params) ?? null; },
  });
  return {
    raw: db,
    prepare: (sql) => make(sql),
    async batch(statements) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const out = statements.map((s) => ({ success: true, meta: s._run() }));
        db.exec('COMMIT');
        return out;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    close: () => db.close(),
  };
}

/** Local in-memory SQLite (node:sqlite, experimental, Node >= 22.5) with the migration applied; never a remote or D1 connection. */
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const MIGRATION = new URL('../migrations/0001_init.sql', import.meta.url);

/**
 * @param {{ file?: string, db?: DatabaseSync }} options  `db` lets a TEST hand in connections to a temp file to prove
 *   cross-connection behaviour; production code of this prototype never uses it (no file, no remote, no D1).
 */
export function createSqliteStorage({ file = ':memory:', db: injected } = {}) {
  if (!injected && file !== ':memory:') throw new Error('The offline prototype uses an in-memory database only.');
  const db = injected || new DatabaseSync(file);
  db.exec(fs.readFileSync(MIGRATION, 'utf8'));
  const upsert = db.prepare('INSERT INTO cell_counts (cell_key, n) VALUES (?, ?) ON CONFLICT(cell_key) DO UPDATE SET n = n + excluded.n');
  // Budget check AND increment are ONE statement: the guard is evaluated by the engine against the row it updates, so there is
  // no read-then-write window. `changes` = 0 means the guard refused (budget exhausted).
  const reserve = db.prepare('INSERT INTO daily_budget (day, rows_written) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET rows_written = rows_written + excluded.rows_written WHERE rows_written + excluded.rows_written <= ?');
  return {
    db,
    async addCounts({ today, rows, charge = rows.length, dailyRowWriteBudget }) {
      if (charge > dailyRowWriteBudget) return { ok: false }; // does not depend on stored state
      db.exec('BEGIN IMMEDIATE'); // one transaction per packet: all cells or none
      try {
        if (Number(reserve.run(today, charge, dailyRowWriteBudget).changes) === 0) { db.exec('ROLLBACK'); return { ok: false }; }
        for (const { key, n } of rows) upsert.run(key, n);
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      return { ok: true };
    },
    async deleteBefore(cutoffDay) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const deleted = Number(db.prepare('DELETE FROM cell_counts WHERE cell_key < ?').run(`["${cutoffDay}"`).changes);
        db.prepare('DELETE FROM daily_budget WHERE day < ?').run(cutoffDay);
        db.exec('COMMIT');
        return deleted;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    async all() { return db.prepare('SELECT cell_key, n FROM cell_counts ORDER BY cell_key').all(); },
    async budgetUsed(day) { return db.prepare('SELECT rows_written FROM daily_budget WHERE day = ?').get(day)?.rows_written ?? 0; },
    close() { db.close(); },
  };
}

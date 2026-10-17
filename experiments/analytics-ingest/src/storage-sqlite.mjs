/** Local in-memory SQLite (node:sqlite, experimental, Node >= 22.5) with the migration applied; never a remote or D1 connection. */
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const MIGRATION = new URL('../migrations/0001_init.sql', import.meta.url);

export function createSqliteStorage({ file = ':memory:' } = {}) {
  if (file !== ':memory:') throw new Error('The offline prototype uses an in-memory database only.');
  const db = new DatabaseSync(file);
  db.exec(fs.readFileSync(MIGRATION, 'utf8'));
  const upsert = db.prepare('INSERT INTO cell_counts (cell_key, n) VALUES (?, ?) ON CONFLICT(cell_key) DO UPDATE SET n = n + excluded.n');
  const used = db.prepare('SELECT rows_written FROM daily_budget WHERE day = ?');
  const setUsed = db.prepare('INSERT INTO daily_budget (day, rows_written) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET rows_written = excluded.rows_written');
  return {
    db,
    async addCounts({ today, rows, dailyRowWriteBudget }) {
      const before = used.get(today)?.rows_written || 0;
      if (before + rows.length > dailyRowWriteBudget) return { ok: false };
      db.exec('BEGIN IMMEDIATE'); // one transaction per packet: all cells or none
      try {
        for (const { key, n } of rows) upsert.run(key, n);
        setUsed.run(today, before + rows.length);
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      return { ok: true };
    },
    async deleteBefore(cutoffDay) {
      return Number(db.prepare('DELETE FROM cell_counts WHERE cell_key < ?').run(`["${cutoffDay}"`).changes);
    },
    async all() { return db.prepare('SELECT cell_key, n FROM cell_counts ORDER BY cell_key').all(); },
    close() { db.close(); },
  };
}

/**
 * D1 adapter for the ingest core (same contract as storage-sqlite.mjs / storage-memory.mjs).
 * One packet = one `db.batch([...])` (D1 runs a batch as a transaction: a failing statement rolls back all of it).
 * The daily budget guard is the CHECK `budget_cap` of migration 0002, not a read-then-write.
 * Only `prepare().bind()` + `batch()/all()/first()` are used, so any D1-shaped object works (workerd D1, the local SQLite shim).
 */
const CELLS_PER_STATEMENT = 40; // 2 bound parameters per cell; D1 allows <= 100 per query
const BUDGET_SQL = 'INSERT INTO daily_budget (day, rows_written, cap) VALUES (?, ?, ?) ON CONFLICT(day) DO UPDATE SET rows_written = rows_written + excluded.rows_written, cap = excluded.cap';
const isBudgetRefusal = (error) => /budget_cap/.test(String(error?.message ?? error));

export function createD1Storage(db) {
  return {
    async addCounts({ today, rows, charge = rows.length, dailyRowWriteBudget }) {
      if (charge > dailyRowWriteBudget) return { ok: false };
      const statements = [db.prepare(BUDGET_SQL).bind(today, charge, dailyRowWriteBudget)];
      for (let i = 0; i < rows.length; i += CELLS_PER_STATEMENT) {
        const chunk = rows.slice(i, i + CELLS_PER_STATEMENT);
        const sql = `INSERT INTO cell_counts (cell_key, n) VALUES ${chunk.map(() => '(?, ?)').join(', ')} ON CONFLICT(cell_key) DO UPDATE SET n = n + excluded.n`;
        statements.push(db.prepare(sql).bind(...chunk.flatMap(({ key, n }) => [key, n])));
      }
      try {
        const results = await db.batch(statements);
        const rowsWritten = results.reduce((sum, r) => sum + (r?.meta?.rows_written ?? 0), 0);
        return { ok: true, rowsWritten };
      } catch (error) {
        if (isBudgetRefusal(error)) return { ok: false };
        throw error; // counter overflow, outage, ...: the batch rolled back, the core answers 503
      }
    },
    async deleteBefore(cutoffDay) {
      const [cells] = await db.batch([
        db.prepare('DELETE FROM cell_counts WHERE cell_key < ?').bind(`["${cutoffDay}"`),
        db.prepare('DELETE FROM daily_budget WHERE day < ?').bind(cutoffDay),
      ]);
      return cells.meta?.changes ?? 0;
    },
    async all(limit = 20000) {
      const { results } = await db.prepare('SELECT cell_key, n FROM cell_counts ORDER BY cell_key LIMIT ?').bind(limit).all();
      return results;
    },
    async budgetUsed(day) {
      const row = await db.prepare('SELECT rows_written FROM daily_budget WHERE day = ?').bind(day).first();
      return row?.rows_written ?? 0;
    },
    async ingestSwitchedOff() {
      const row = await db.prepare("SELECT value FROM control WHERE key = 'ingest'").first();
      return row?.value === 'off';
    },
    async setIngestSwitch(enabled) {
      await db.prepare("INSERT INTO control (key, value) VALUES ('ingest', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(enabled ? 'on' : 'off').run();
    },
  };
}

/**
 * R05: READ-ONLY reader over the same D1 database. Only SELECT statements exist in this file (tested): the dashboard
 * Worker has no path that writes cell_counts, daily_budget or control.
 * Keyset pagination on the primary key (cell_key starts with the UTC day, so a day range is a key range, no extra index).
 */
const PAGE = 5000;
export const MAX_CELLS = 200000; // reader cap: above it the report is flagged `truncated` (still a lower bound)

export function createReportsReader(db, { maxCells = MAX_CELLS } = {}) {
  return {
    /** All cells of days >= fromDay (UTC `YYYY-MM-DD`), ordered by key. */
    async cellsFrom(fromDay) {
      const rows = [];
      let after = `["${fromDay}"`;
      let inclusive = true;
      for (;;) {
        const sql = `SELECT cell_key, n FROM cell_counts WHERE cell_key ${inclusive ? '>=' : '>'} ? ORDER BY cell_key LIMIT ?`;
        const { results } = await db.prepare(sql).bind(after, PAGE).all();
        for (const r of results) rows.push(r);
        if (results.length < PAGE) return { rows, truncated: false };
        if (rows.length >= maxCells) return { rows, truncated: true };
        after = results.at(-1).cell_key; inclusive = false;
      }
    },
    async ingestSwitchedOff() {
      const row = await db.prepare("SELECT value FROM control WHERE key = 'ingest'").first();
      return row?.value === 'off';
    },
  };
}

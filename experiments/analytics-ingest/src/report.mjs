/**
 * Read-side k-suppression (a PROJECT decision, k = 5 proposed; it is not a claim of legal anonymity).
 * Cells with n < k are dropped from a report, and so are the totals that would reveal them by subtraction
 * (the caller aggregates only the rows returned here). A single incoming packet can still carry a sensitive
 * combination; suppression protects what is published, not what the server received.
 */
/** LOW LEVEL: `suppressedCells` is a count of hidden cells and must NOT be published (use buildReport). */
export function suppressSmallCells(rows, { k = 5 } = {}) {
  if (!Number.isInteger(k) || k < 2) throw new Error('k must be an integer >= 2');
  const kept = rows.filter((row) => row.n >= k);
  return { rows: kept, suppressedCells: rows.length - kept.length, k };
}

const KEY_FIELDS = ['day', 'platform', 'app_version', 'region', 'e', 'section', 'content_id', 'metric', 'bucket', 'feature_id', 'catalog_id', 'error_id'];

/**
 * Mock report with a NON-INTERFERENCE guarantee: every published number is a function of the cells with n >= k only.
 * Totals are sums of the surviving cells (never of the raw table), the number of hidden cells is not published and nothing
 * in the output depends on whether a hidden cell exists, so hidden cells cannot be recovered by subtraction, filters or
 * slices (tested by perturbing hidden cells). Consequence: totals are LOWER BOUNDS, and the output always says so.
 * Still a project choice, not legal anonymisation; no people counter, "opens" only.
 * @param {{ cell_key: string, n: number }[]} rows  rows of cell_counts (test/read side only; there is no authorised read path yet)
 */
export function buildReport(rows, { k = 5 } = {}) {
  const { rows: kept } = suppressSmallCells(rows, { k });
  const cells = kept.map(({ cell_key: key, n }) => {
    const parts = JSON.parse(key);
    return { ...Object.fromEntries(KEY_FIELDS.map((field, i) => [field, parts[i]]).filter(([, v]) => v !== '')), n };
  });
  const totals = {};
  for (const cell of cells) {
    const slot = `${cell.day}|${cell.platform}|${cell.e}`;
    totals[slot] = (totals[slot] || 0) + cell.n;
  }
  return { k, totalsAreLowerBounds: true, cells, totals };
}

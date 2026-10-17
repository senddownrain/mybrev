/**
 * Read-side k-suppression (a PROJECT decision, k = 5 proposed; it is not a claim of legal anonymity).
 * Cells with n < k are dropped from a report, and so are the totals that would reveal them by subtraction
 * (the caller aggregates only the rows returned here). A single incoming packet can still carry a sensitive
 * combination; suppression protects what is published, not what the server received.
 */
export function suppressSmallCells(rows, { k = 5 } = {}) {
  if (!Number.isInteger(k) || k < 2) throw new Error('k must be an integer >= 2');
  const kept = rows.filter((row) => row.n >= k);
  return { rows: kept, suppressedCells: rows.length - kept.length, k };
}

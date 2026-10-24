/** In-memory storage with the same contract as the SQLite one: all-or-nothing writes, daily row-write budget. */
export function createMemoryStorage({ failOn } = {}) {
  const counts = new Map();
  const budget = new Map();
  return {
    counts,
    budget,
    async addCounts({ today, rows, charge = rows.length, dailyRowWriteBudget }) {
      if (failOn?.()) throw new Error('storage unavailable'); // simulated D1 outage / rollback
      const used = budget.get(today) || 0;
      // no await between this read and the commit below: atomic inside ONE isolate only (NOT across Worker isolates)
      if (used + charge > dailyRowWriteBudget) return { ok: false };
      const staged = new Map();
      for (const { key, n } of rows) {
        const total = (counts.get(key) || 0) + n;
        if (total > Number.MAX_SAFE_INTEGER) throw new Error('counter overflow'); // same bound as the SQL CHECK
        staged.set(key, total);
      }
      for (const [key, value] of staged) counts.set(key, value); // commit
      budget.set(today, used + charge);
      return { ok: true };
    },
    async deleteBefore(cutoffDay) {
      let deleted = 0;
      for (const key of [...counts.keys()]) if (key < `["${cutoffDay}"`) { counts.delete(key); deleted += 1; }
      for (const day of [...budget.keys()]) if (day < cutoffDay) budget.delete(day);
      return deleted;
    },
    async budgetUsed(day) { return budget.get(day) || 0; },
    async all() { return [...counts].map(([key, n]) => ({ cell_key: key, n })); },
  };
}

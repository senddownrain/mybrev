/** In-memory storage with the same contract as the SQLite one: all-or-nothing writes, daily row-write budget. */
export function createMemoryStorage({ failOn } = {}) {
  const counts = new Map();
  const budget = new Map();
  return {
    counts,
    budget,
    async addCounts({ today, rows, dailyRowWriteBudget }) {
      if (failOn?.()) throw new Error('storage unavailable'); // simulated D1 outage / rollback
      const used = budget.get(today) || 0;
      if (used + rows.length > dailyRowWriteBudget) return { ok: false };
      const staged = new Map();
      for (const { key, n } of rows) staged.set(key, (counts.get(key) || 0) + n);
      for (const [key, value] of staged) counts.set(key, value); // commit
      budget.set(today, used + rows.length);
      return { ok: true };
    },
    async deleteBefore(cutoffDay) {
      let deleted = 0;
      for (const key of [...counts.keys()]) if (key < `["${cutoffDay}"`) { counts.delete(key); deleted += 1; }
      return deleted;
    },
    async all() { return [...counts].map(([key, n]) => ({ cell_key: key, n })); },
  };
}

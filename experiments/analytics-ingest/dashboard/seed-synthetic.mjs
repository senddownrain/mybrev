/**
 * R05: fills a D1-shaped database (workerd D1 or the SQLite shim) with deterministic SYNTHETIC counters for QA, through the same
 * P06 core and D1 adapter as the ingest Worker (not by writing rows by hand). Never run it against anything but a staging / local DB.
 *   node experiments/analytics-ingest/dashboard/seed-synthetic.mjs --db /tmp/r05.sqlite [--end-day 2026-11-06 | today] [--days 31] [--seed N]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createD1Storage } from '../worker/src/d1-storage.mjs';
import { createSqliteD1 } from '../worker/src/sqlite-d1-shim.mjs';
import { DEFAULT_SEED, daysBetween, loadPublicInventory, runSyntheticPipeline } from '../dashboard-demo/synthetic.mjs';

const DAY_MS = 86400000;
/** @returns {Promise<{ packets: object[], days: string[], cells: number }>} */
export async function seedSynthetic(db, { seed = DEFAULT_SEED, endDay = '2026-11-06', days = 31 } = {}) {
  const firstDay = new Date(Date.parse(`${endDay}T00:00:00Z`) - (days - 1) * DAY_MS).toISOString().slice(0, 10);
  const run = await runSyntheticPipeline({ seed, publicIds: loadPublicInventory(), firstDay, lastDay: endDay, retentionDays: 90 });
  const rows = (await run.backend.rows()).map(({ cell_key: key, n }) => ({ key, n }));
  const result = await createD1Storage(db).addCounts({ today: endDay, rows, charge: rows.length, dailyRowWriteBudget: 10 ** 9 });
  if (!result.ok) throw new Error('seed refused by the budget guard');
  return { packets: run.packets, days: daysBetween(firstDay, endDay), cells: rows.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
  const end = arg('end-day', '2026-11-06');
  const db = createSqliteD1({ file: arg('db', ':memory:') });
  const out = await seedSynthetic(db, { seed: Number(arg('seed', DEFAULT_SEED)), endDay: end === 'today' ? new Date().toISOString().slice(0, 10) : end, days: Number(arg('days', 31)) });
  console.log(`seeded ${out.cells} synthetic cells, ${out.packets.length} packets, ${out.days[0]} … ${out.days.at(-1)}`);
  db.close();
}

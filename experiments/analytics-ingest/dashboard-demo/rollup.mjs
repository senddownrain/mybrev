/**
 * P08: the ONLY reader of stored counters for the dashboard. Produces a sanitised, synthetic `report` object.
 *
 * Rule: roll up FIRST (to the published granularity), then suppress (k = 5, reusing the P06 `suppressSmallCells`).
 * Every published number is a sum of surviving published cells; nothing depends on a hidden cell, the number of hidden
 * cells is never published, and totals are always "at least" (lower bounds). One family = one granularity, and the
 * dashboard never mixes families in a sum. Not a legal anonymisation claim, and `n` counts OPENS, never people.
 *
 * Deliberately NOT in the report: app_version, region, content_id outside the four big public catalogues, search text,
 * exact timestamps (days only), devices, any per-user path, any people counter, hidden-cell counts.
 */
import { suppressSmallCells } from '../src/report.mjs';

export const REPORT_SCHEMA = 'p08-report-v1';
export const BANNER = 'SYNTHETIC DATA — НЕТ РЕАЛЬНОЙ СТАТИСТИКИ';
export const BANNER_SUB = 'ОТКРЫТИЯ ≠ ЛЮДИ';
export const MATERIAL_SECTIONS = Object.freeze({ prayers: 'prayer:', songs: 'song:', compendium: 'comp:', bible: 'bible:' });
export const TOP_N = 10;

const FIELD = ['day', 'platform', 'app_version', 'region', 'e', 'section', 'content_id', 'metric', 'bucket', 'feature_id', 'catalog_id', 'error_id'];
const parse = ({ cell_key: key, n }) => ({ ...Object.fromEntries(JSON.parse(key).map((v, i) => [FIELD[i], v])), n });

function family(cells, pick, keyOf, k) {
  const sums = new Map();
  for (const c of cells) {
    if (!pick(c)) continue;
    const key = JSON.stringify(keyOf(c));
    sums.set(key, (sums.get(key) || 0) + c.n);
  }
  return suppressSmallCells([...sums].map(([cell_key, n]) => ({ cell_key, n })), { k }).rows
    .map(({ cell_key, n }) => ({ key: JSON.parse(cell_key), n }));
}

/** @param {{cell_key:string,n:number}[]} rows  cell_counts of the SYNTHETIC mock backend only */
export function buildDashboardReport(rows, { k = 5, publicIds = [], seed = null, generated = null } = {}) {
  const cells = rows.map(parse);
  const days = [...new Set(cells.map((c) => c.day))].sort();
  const opens = family(cells, (c) => c.e === 'screen_view', (c) => [c.day, c.platform, c.section], k)
    .map(({ key: [day, platform, section], n }) => ({ day, platform, section, n }));
  const catalog = family(cells, (c) => c.e === 'catalog_open', (c) => [c.day, c.platform, c.catalog_id], k)
    .map(({ key: [day, platform, catalog_id], n }) => ({ day, platform, catalog_id, n }));
  const text = family(cells, (c) => c.e === 'text_read', (c) => [c.platform, c.section, c.metric, c.bucket], k)
    .map(({ key: [platform, section, metric, bucket], n }) => ({ platform, section, metric, bucket, n }));
  const features = family(cells, (c) => c.e === 'feature_use', (c) => [c.platform, c.feature_id], k)
    .map(({ key: [platform, feature_id], n }) => ({ platform, feature_id, n }));
  const errors = family(cells, (c) => c.e === 'measurement_error', (c) => [c.platform, c.error_id], k)
    .map(({ key: [platform, error_id], n }) => ({ platform, error_id, n }));

  const materials = [];
  for (const [section, prefix] of Object.entries(MATERIAL_SECTIONS)) {
    const survivors = family(cells, (c) => c.e === 'screen_view' && c.section === section, (c) => [c.content_id], k)
      .map(({ key: [content_id], n }) => ({ section, content_id, n }))
      .sort((a, b) => b.n - a.n || a.content_id.localeCompare(b.content_id));
    // complementary suppression: exactly one hidden material would be recoverable from the section sum, so hide one more
    const inventory = publicIds.filter((id) => id.startsWith(prefix)).length;
    if (inventory - survivors.length === 1) survivors.pop();
    materials.push(...survivors.slice(0, TOP_N));
  }

  return {
    schema: REPORT_SCHEMA, synthetic: true, banner: BANNER, banner_sub: BANNER_SUB, seed, generated,
    k, totalsAreLowerBounds: true, unit: 'opens (not people)',
    window: { from: days[0] ?? null, to: days.at(-1) ?? null, days },
    opens, catalog, materials, text, features, errors,
  };
}

export const emptyReport = (extra = {}) => buildDashboardReport([], extra);

/** Flat CSV of every published cell (view, day, platform, key1, key2, n). Same numbers as the JSON, nothing more. */
export function reportToCsv(report) {
  const lines = ['view,day,platform,dimension_1,dimension_2,n'];
  const row = (view, day, platform, d1, d2, n) => lines.push([view, day, platform, d1, d2, n].join(','));
  for (const c of report.opens) row('screen_view', c.day, c.platform, c.section, '', c.n);
  for (const c of report.catalog) row('catalog_open', c.day, c.platform, c.catalog_id, '', c.n);
  for (const c of report.text) row(`text_read_${c.metric}`, '', c.platform, c.section, c.bucket, c.n);
  for (const c of report.materials) row('material_top', '', 'all', c.section, c.content_id, c.n);
  for (const c of report.features) row('feature_use', '', c.platform, c.feature_id, '', c.n);
  for (const c of report.errors) row('measurement_error', '', c.platform, c.error_id, '', c.n);
  return `${lines.join('\n')}\n`;
}

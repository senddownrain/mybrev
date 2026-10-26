/**
 * R05: read-side rollup for the private dashboard. Pure: rows of `cell_counts` in, one sanitised summary out.
 *
 * Privacy rules (project decision, not a legal anonymisation claim):
 *  1. ROLL UP FIRST to a fixed published granularity ("base cell"), THEN suppress base cells with n < k (reusing the P06 `suppressSmallCells`).
 *       opens    day  x platform x section            (screen_view)
 *       catalog  week x platform x catalog_id         (catalog_open)
 *       text     week x platform x section x metric x bucket   (text_read: fv / er / sd)
 *       features week x platform x feature_id         (feature_use)
 *       errors   week x platform x error_id           (measurement_error)
 *       material week x section x content_id          (screen_view of prayers / songs / compendium / bible; platforms merged)
 *     "week" = a 7-day block counted back from the server's UTC today, so the 7-day, 28-day and whole-retention views are built from the SAME base cells.
 *  2. SECONDARY SUPPRESSION BY CONSTRUCTION: every published number (filtered or not) is a sum of surviving base cells. There is no
 *     "total", "other", "rest", share, hidden-cell count or raw-table sum in the output, so a hidden cell cannot be recovered by
 *     subtraction or by changing a filter. Perturbing any hidden cell (0 < n < k) changes no byte of the output (tested).
 *     Consequence: every sum is a LOWER BOUND, and the output says so.
 *  3. Unit = OPENS. There are no people / devices / sessions / installs in the data, so no such number exists.
 *  4. app_version, region and any content_id outside the four public catalogues never leave this module.
 */
import { suppressSmallCells } from './report.mjs';

export const SUMMARY_SCHEMA = 'r05-summary-v1';
export const UNIT = 'opens (not people)';
export const BANNER_SUB = 'ОТКРЫТИЯ ≠ ПОЛЬЗОВАТЕЛИ';
export const BANNER_QA = 'QA / SYNTHETIC — НЕТ РЕАЛЬНОЙ СТАТИСТИКИ';
export const PERIODS = Object.freeze([7, 28, 91]); // 91 = 13 blocks = whole 90-day staging retention (+ today)
export const PLATFORMS = Object.freeze(['web', 'android', 'ios']);
export const MATERIAL_SECTIONS = Object.freeze({ prayers: 'prayer:', songs: 'song:', compendium: 'comp:', bible: 'bible:' });
export const TOP_N = 10;
export const RETENTION_DAYS = 90;

const DAY_MS = 86400000;
const FIELD = ['day', 'platform', 'app_version', 'region', 'e', 'section', 'content_id', 'metric', 'bucket', 'feature_id', 'catalog_id', 'error_id'];
const parse = ({ cell_key: key, n }) => ({ ...Object.fromEntries(JSON.parse(key).map((v, i) => [FIELD[i], v])), n });

/** Sums rows per key, then drops keys with n < k. Returns [{ key: [...], n }]. */
function family(cells, keyOf, k) {
  const sums = new Map();
  for (const c of cells) {
    const key = JSON.stringify(keyOf(c));
    sums.set(key, (sums.get(key) || 0) + c.n);
  }
  return suppressSmallCells([...sums].map(([cell_key, n]) => ({ cell_key, n })), { k }).rows
    .map(({ cell_key, n }) => ({ key: JSON.parse(cell_key), n }));
}
const sumBy = (items, keyOf) => { const m = new Map(); for (const x of items) m.set(keyOf(x), (m.get(keyOf(x)) || 0) + x.n); return m; };
const ranked = (map, name) => [...map].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).map(([id, n]) => ({ [name]: id, n }));

export const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
export const daysAgo = (today, day) => Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / DAY_MS);
export function windowDays(today, days) {
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) out.push(dayOf(Date.parse(`${today}T00:00:00Z`) - i * DAY_MS));
  return out;
}

/**
 * @param {{cell_key:string,n:number}[]} rows  cell_counts rows (read side only)
 * @param {object} o
 * @param {number} o.now       server clock, ms (UTC day boundaries)
 * @param {7|28|91} [o.days]
 * @param {'all'|'web'|'android'|'ios'} [o.platform]
 * @param {string} [o.section]  'all' or a section id (text families + daily chart)
 * @param {string[]} [o.publicIds]  published inventory: a material outside it is never shown
 * @param {Record<string,string>} [o.titles]  id -> title, taken from the published bundle only
 * @param {'qa'|'live'} [o.mode]
 * @param {'switched_off'|'not_switched_off'} [o.intake]
 * @param {boolean} [o.truncated]  the reader stopped at its row cap: every number is still a lower bound
 */
export function buildSummary(rows, {
  now, days = 7, platform = 'all', section = 'all', k = 5, publicIds = null, titles = {}, mode = 'qa', intake = 'not_switched_off', truncated = false,
} = {}) {
  if (!PERIODS.includes(days)) throw new Error('days must be one of 7, 28, 91');
  const today = dayOf(now);
  const idSet = publicIds ? new Set(publicIds) : null;
  const inWindow = [];
  for (const row of rows) {
    const c = parse(row);
    const age = daysAgo(today, c.day);
    if (age < 0 || age >= days) continue;
    c.week = Math.floor(age / 7);
    inWindow.push(c);
  }
  const keep = (c) => platform === 'all' || c.platform === platform;
  const scoped = inWindow.filter(keep);

  // 1) opens: base cells day x platform x section, suppressed ONCE; section filter only picks surviving cells
  const opensAll = family(scoped.filter((c) => c.e === 'screen_view'), (c) => [c.day, c.platform, c.section], k)
    .map(({ key: [day, plat, sect], n }) => ({ day, platform: plat, section: sect, n }));
  const opensShown = opensAll.filter((c) => section === 'all' || c.section === section);
  const windowList = windowDays(today, days);
  const daily = windowList.map((day) => {
    const row = { day, web: 0, android: 0, ios: 0, total: 0 };
    for (const c of opensShown) if (c.day === day) { row[c.platform] += c.n; row.total += c.n; }
    return row;
  });
  const sections = ranked(sumBy(opensAll, (c) => c.section), 'section');

  // 2) week-block families
  const catalog = ranked(sumBy(family(scoped.filter((c) => c.e === 'catalog_open'), (c) => [c.week, c.platform, c.catalog_id], k)
    .map(({ key: [, , catalog_id], n }) => ({ catalog_id, n })), (c) => c.catalog_id), 'catalog_id');
  const textBase = family(scoped.filter((c) => c.e === 'text_read'), (c) => [c.week, c.platform, c.section, c.metric, c.bucket], k)
    .filter(({ key: [, , sect] }) => section === 'all' || sect === section);
  const text = {};
  for (const metric of ['fv', 'er', 'sd']) {
    text[metric] = [...sumBy(textBase.filter(({ key }) => key[3] === metric).map(({ key, n }) => ({ bucket: key[4], n })), (x) => x.bucket)].map(([bucket, n]) => ({ bucket, n })).sort((a, b) => a.bucket.localeCompare(b.bucket));
  }
  const features = ranked(sumBy(family(scoped.filter((c) => c.e === 'feature_use'), (c) => [c.week, c.platform, c.feature_id], k)
    .map(({ key: [, , feature_id], n }) => ({ feature_id, n })), (c) => c.feature_id), 'feature_id');
  const errors = ranked(sumBy(family(scoped.filter((c) => c.e === 'measurement_error'), (c) => [c.week, c.platform, c.error_id], k)
    .map(({ key: [, , error_id], n }) => ({ error_id, n })), (c) => c.error_id), 'error_id');

  // 3) materials: platforms merged, public catalogues only, published inventory only, top N
  const materials = [];
  for (const [sect, prefix] of Object.entries(MATERIAL_SECTIONS)) {
    const survivors = family(inWindow.filter((c) => c.e === 'screen_view' && c.section === sect && c.content_id?.startsWith(prefix)), (c) => [c.week, c.content_id], k)
      .filter(({ key: [, id] }) => !idSet || idSet.has(id));
    const top = ranked(sumBy(survivors.map(({ key: [, id], n }) => ({ id, n })), (x) => x.id), 'content_id').slice(0, TOP_N)
      .map(({ content_id, n }) => ({ content_id, ...(titles[content_id] ? { title: titles[content_id] } : {}), n }));
    materials.push({ section: sect, top });
  }

  const published = opensAll.length + catalog.length + features.length + errors.length + materials.reduce((s, m) => s + m.top.length, 0) + Object.values(text).reduce((s, l) => s + l.length, 0);
  const opensTotal = opensShown.reduce((s, c) => s + c.n, 0);
  return {
    schema: SUMMARY_SCHEMA,
    mode, synthetic: mode === 'qa',
    banner: mode === 'qa' ? BANNER_QA : null, banner_sub: BANNER_SUB,
    unit: UNIT, k, totalsAreLowerBounds: true,
    filter: { days, platform, section },
    window: { from: windowList[0], to: today, days: windowList.length, retention_days: RETENTION_DAYS },
    intake,
    state: rows.length === 0 ? 'empty' : published === 0 ? 'no_published_cells' : 'ok',
    truncated,
    kpi: { opens_shown: opensTotal },
    daily, sections, catalog, text, features, errors, materials,
  };
}

const csvCell = (v) => { const s = String(v ?? ''); return /^[=+\-@\t\r]/.test(s) || /[",\n]/.test(s) ? `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"` : s; };

/** Flat CSV of the numbers of ONE summary (already suppressed). Same numbers as the JSON, nothing more; no ids beyond the public ones. */
export function summaryToCsv(summary) {
  const lines = ['mode,k,window_from,window_to,platform_filter,view,day,dimension_1,dimension_2,n'];
  const base = [summary.mode, summary.k, summary.window.from, summary.window.to, summary.filter.platform];
  const row = (view, day, d1, d2, n) => lines.push([...base, view, day, d1, d2, n].map(csvCell).join(','));
  for (const d of summary.daily) for (const p of PLATFORMS) if (d[p] > 0) row('screen_view', d.day, p, '', d[p]);
  for (const c of summary.sections) row('screen_view_section', '', c.section, '', c.n);
  for (const c of summary.catalog) row('catalog_open', '', c.catalog_id, '', c.n);
  for (const metric of ['fv', 'er', 'sd']) for (const c of summary.text[metric]) row(`text_read_${metric}`, '', c.bucket, '', c.n);
  for (const c of summary.features) row('feature_use', '', c.feature_id, '', c.n);
  for (const c of summary.errors) row('measurement_error', '', c.error_id, '', c.n);
  for (const m of summary.materials) for (const c of m.top) row('material_top', '', m.section, c.content_id, c.n);
  return `${lines.join('\n')}\n`;
}

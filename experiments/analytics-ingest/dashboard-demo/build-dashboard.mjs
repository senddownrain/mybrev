/**
 * P08: one command -> deterministic synthetic fixture -> P06 core -> sanitised report -> one self-contained html.
 *   npm run analytics:dashboard-demo [-- <outDir> [--seed N]]
 * Writes report.json, report.csv, dashboard.html (default: dashboard-demo/out/, git-ignored). Opens nothing, serves nothing,
 * uses no network, no secrets, no production backend. Open dashboard.html from disk (file://) or localhost only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BANNER, BANNER_SUB, REPORT_SCHEMA, buildDashboardReport, emptyReport, reportToCsv } from './rollup.mjs';
import { runScenarios } from './scenarios.mjs';
import { DEFAULT_SEED, K, RETENTION_DAYS, loadPublicInventory, runSyntheticPipeline } from './synthetic.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const GENERATED_LABEL = 'synthetic fixture (fixed date, not a real run)';

export const SAFETY = [
  'Только синтетические данные из фиксированного seed; реальной статистики, пользователей, устройств и сессий нет.',
  'Единица — «открытие»: один и тот же человек может дать много открытий, поэтому «открытия ≠ люди»; счётчика людей нет и быть не может (в схеме нет идентификаторов).',
  `k = ${K}: сначала агрегация до публикуемой гранулярности, потом скрытие ячеек n < k; все суммы считаются только по показанным ячейкам и всегда «не менее».`,
  'Число скрытых ячеек, app_version, region, устройства, поиск, точное время, путь по экранам и даты богослужебных материалов в отчёт не попадают.',
  'Нет закрытых материалов и их ID: неизвестный ID отклоняется ядром, в отчёте только публичные ID из перечня (750).',
  'Панель читает только report.json (sanitised); доступа к cell_counts нет. Сети нет: CSP connect-src none, нет CDN, шрифтов, аналитики.',
  'Не публиковать и не хостить. Это не разрешение на сбор: D-01…D-09 открыты, сеть заблокирована.',
];

export async function buildAll({ seed = DEFAULT_SEED } = {}) {
  const publicIds = loadPublicInventory();
  const run = await runSyntheticPipeline({ seed, publicIds });
  const rows = await run.backend.rows();
  const report = buildDashboardReport(rows, { k: K, publicIds, seed, generated: GENERATED_LABEL });
  const scenarios = await runScenarios();
  const scenario = (id) => scenarios.find((s) => s.id === id);
  const state = (id, label, title, text) => ({ label, title, text, hasData: false, http: scenario(id).actual.status, code: scenario(id).actual.code });
  const states = {
    ok: { label: 'Приём включён, данные есть', hasData: true, http: 204, code: 'ok' },
    kill_switch_off: state('kill_switch_off', 'Kill switch: приём выключен', 'Приём выключен (kill switch)', 'Сервер отвечает 503 до разбора тела; ничего не записано. Панель не показывает нули как факт — данных нет.'),
    rejected: state('closed_or_unknown_id', 'Все пакеты отклонены', 'Данные отклонены', 'Пакеты не прошли проверку (неизвестный ID, лишние поля, устаревший день): записано 0 агрегатов.'),
    no_data: state('no_data', 'Нет данных', 'Нет данных', 'Приём включён, но пакетов ещё не было (или всё удалено по сроку хранения).'),
  };
  const days = report.window.days;
  const removed = run.days.filter((d) => !days.includes(d));
  const output = {
    meta: { schema: REPORT_SCHEMA, seed, generated: GENERATED_LABEL, banner: BANNER, banner_sub: BANNER_SUB, k: K, retention_days: RETENTION_DAYS, days_generated: run.days.length, days_removed_by_retention: removed, platforms: ['web', 'android', 'ios'], public_ids: publicIds.length, features_in_profile: 8 },
    report, states, scenarios, safety: SAFETY,
  };
  return { output, csv: reportToCsv(report), empty: emptyReport({ k: K }) };
}

export function renderHtml(output) {
  const template = fs.readFileSync(path.join(here, 'ui.template.html'), 'utf8');
  const data = JSON.stringify(output).replace(/</g, '\\u003c');
  return template.replace('__DATA__', () => data);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const seedIndex = args.indexOf('--seed');
  const seed = seedIndex >= 0 ? Number(args.splice(seedIndex, 2)[1]) : DEFAULT_SEED;
  const outDir = path.resolve(args[0] || path.join(here, 'out'));
  const { output, csv } = await buildAll({ seed });
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'report.json'), `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, 'report.csv'), csv);
  fs.writeFileSync(path.join(outDir, 'dashboard.html'), renderHtml(output));
  const failed = output.scenarios.filter((s) => !s.pass);
  console.log(`${BANNER} · ${BANNER_SUB}`);
  console.log(`seed ${seed}; days in window ${output.report.window.days.length}; scenarios ${output.scenarios.length - failed.length}/${output.scenarios.length} PASS`);
  console.log(`wrote ${outDir}/{report.json,report.csv,dashboard.html}`);
  console.log(`open locally: file://${path.join(outDir, 'dashboard.html')}`);
  if (failed.length) process.exitCode = 1;
}

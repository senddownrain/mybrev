/** Markdown report of `npm run ordo:validate` (docs/ordo-validation-report.md). */
import { CHECKS, STATUSES } from './validate.mjs';

const LABEL = Object.freeze({
  'minsk-mohilev': 'Мінск (2025–26)', vitebsk: 'Віцебск (2025–26)', pinsk: 'Пінск (2026)', grodno: 'Гродна (2027)',
});
const SHORT = Object.freeze({
  MATCH: 'MATCH',
  EXPECTED_DIOCESAN_DIFFERENCE: 'DIOC',
  EXPECTED_YEAR_EXCEPTION: 'YEAR',
  SOURCE_MORE_DETAILED: 'MORE',
  PARSER_UNCERTAIN: 'PARSER',
  GENERATOR_MISMATCH: 'MISMATCH',
});

const pct = (value) => (value === null || value === undefined ? '—' : `${(100 * value).toFixed(1)}%`);
const esc = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

function summaryTable(results) {
  const rows = results.map(({ diocese, summary: s }) => `| ${LABEL[diocese] || diocese} | ${s.days} | ${STATUSES.map((status) => s.byStatus[status]).join(' | ')} | **${pct(s.matchRate)}** | ${pct(s.explainedRate)} | ${s.reviewedMismatches} / ${s.unreviewedMismatches} |`);
  return [
    `| Епархия | Дни | ${STATUSES.map((status) => SHORT[status]).join(' | ')} | MATCH | Объяснено | MISMATCH: разобрано / нет |`,
    `| --- | ---: | ${STATUSES.map(() => '---:').join(' | ')} | ---: | ---: | ---: |`,
    ...rows,
  ].join('\n');
}

function checksTable(results) {
  const header = `| Проверка | ${results.map(({ diocese }) => LABEL[diocese] || diocese).join(' | ')} |`;
  const rows = CHECKS.map((check) => `| ${check} | ${results.map(({ summary }) => {
    const item = summary.byCheck[check];
    if (!item?.total) return '—';
    const other = STATUSES.filter((status) => status !== 'MATCH' && item[status])
      .map((status) => `${SHORT[status]} ${item[status]}`).join(', ');
    return `${pct(item.matchRate)} (${item.MATCH}/${item.total}${other ? `; ${other}` : ''})`;
  }).join(' | ')} |`);
  return [header, `| --- | ${results.map(() => '---').join(' | ')} |`, ...rows].join('\n');
}

function casesOf(results, predicate, limit) {
  const cases = [];
  results.forEach(({ diocese, days }) => days.forEach((day) => Object.entries(day.checks).forEach(([check, value]) => {
    if (predicate(value)) cases.push({ diocese, date: day.date, check, ...value });
  })));
  return limit ? cases.slice(0, limit) : cases;
}

function casesTable(cases) {
  if (!cases.length) return '_нет_';
  return [
    '| Епархия | Дата | Проверка | Статус | Детали / причина |',
    '| --- | --- | --- | --- | --- |',
    ...cases.map((item) => `| ${item.diocese} | ${item.date} | ${item.check} | ${SHORT[item.status]} | ${esc(item.reason || item.detail)} |`),
  ].join('\n');
}

/** Representative (not exhaustive) cases: a few per diocese and status. */
function representative(results, status, perDiocese = 3) {
  return results.flatMap((result) => casesOf([result], (value) => value.status === status && !value.sourceError)
    .filter((item, index, list) => list.findIndex((other) => other.check === item.check && other.detail === item.detail) === index)
    .slice(0, perDiocese));
}

export function renderValidationReport(results) {
  const sourceErrors = casesOf(results, (value) => value.sourceError);
  return `# Ordo: проверка генератора по опубликованным календарям

> Генерируется \`npm run ordo:validate\` (\`scripts/ordo/validate.mjs\`). Полные результаты по
> каждому дню — \`reports/ordo-validation.json\` (не в git).

Каждый день из \`src/data/ordo/evidence/<diocese>.json\` (кроме "preview"-дней) сравнивается с
\`generateLiturgicalYear(year, { diocese, notes })\`. Выравнивание — по идентичности, а не по
гражданской дате: празднования — по \`identity.id\` (slug \`days\` / код подвижного праздника /
день периода), перенесённые — туда, куда их поставил движок; рубрики Нешпар/Комплеты — к вечеру
данной даты; заметки Гродно «на завтра» — к следующему дню; вигилия (24.12) — к торжеству.

Статусы: **MATCH**; **DIOC** = EXPECTED_DIOCESAN_DIFFERENCE (практика епархии / местного
костёла, которую движок сознательно не моделирует); **YEAR** = EXPECTED_YEAR_EXCEPTION (решение
одного года); **MORE** = SOURCE_MORE_DETAILED (источник знает больше, чем данные MyBrev);
**PARSER** = PARSER_UNCERTAIN (извлечённый факт ненадёжен); **MISMATCH** = GENERATOR_MISMATCH.
Каждый MISMATCH разобран: либо исправлен в движке/данных, либо записан в
\`scripts/ordo/lib/validation-expectations.mjs\` с причиной. «Разобранные» MISMATCH — ошибки
источника (опечатки, строки, скопированные с другого дня, противоречие общим нормам): движок под
них не подгоняется, но в статистике они остаются MISMATCH.

## Сводка по епархиям

Статус дня — худший статус его проверок. «Объяснено» = все статусы, кроме MISMATCH.

${summaryTable(results)}

## Проверки

Доля MATCH среди дней, где источник позволяет проверку (например, I Нешпары проверяются только там,
где календарь их печатает; Te Deum — по типу Официя, напечатанному источником).

${checksTable(results)}

## Разобранные ошибки источников (MISMATCH)

${casesTable(sourceErrors)}

## Примеры остальных статусов

### EXPECTED_DIOCESAN_DIFFERENCE

${casesTable(representative(results, 'EXPECTED_DIOCESAN_DIFFERENCE'))}

### EXPECTED_YEAR_EXCEPTION

${casesTable(representative(results, 'EXPECTED_YEAR_EXCEPTION'))}

### SOURCE_MORE_DETAILED

${casesTable(representative(results, 'SOURCE_MORE_DETAILED'))}

### PARSER_UNCERTAIN

${casesTable(representative(results, 'PARSER_UNCERTAIN'))}

## Что исправлено по результатам проверки

- Нешпары и Комплета в октаве Рождества: II Нешпары и воскресная Комплета (после I или II Нешпар),
  как в Минске (26 и 30.12.2025), Витебске и Гродно.
- Суббота Пасхальной октавы → I Нешпары II Пасхального воскресенья (равный ранг, воскресенье
  начинается с I Нешпар; Витебск, Пинск 11.04.2026).
- Цвета: Всех усопших — фиолетовый (альтернатива — чёрный); Великая суббота — белый Вигилии.
- Данные: Остробрамская — обязательное воспоминание во всей Беларуси, Кармельская — в Гродно;
  св. Иоанн Авильский (10.05, общий календарь); «Свв. Марфы, Марии и Лазаря» (29.07).
- Селекторы заметок: фазы периода парсера, заметки местных костёлов в контексте епархии,
  фатимский день 13-го числа каждого месяца.
`;
}

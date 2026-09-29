#!/usr/bin/env node
/** Render docs/ordo-diocesan-differences.md from src/data/ordo (npm run ordo:docs). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'ordo', file), 'utf8'));
const differences = read('diocesan-differences.json');
const notes = read('notes.json');
const DIOCESES = ['minsk-mohilev', 'vitebsk', 'pinsk', 'grodno'];
const SHORT = { 'minsk-mohilev': 'Мінск', vitebsk: 'Віцебск', pinsk: 'Пінск', grodno: 'Гродна' };
const RANK = { solemnitas: 'урач.', festum: 'свята', memoria: 'усп.', 'memoria-ad-libitum': 'неаб.', sunday: 'нядз.' };

const cell = (v) => {
  if (!v) return '';
  if (v.status === 'celebrated') return `${RANK[v.rank] || v.rank || '—'}${v.transferredFrom ? ' (перанос)' : ''}${v.role !== 'primary' ? '*' : ''}`;
  if (v.status === 'omitted') return 'прапушч.';
  if (v.status === 'absent') return v.impeded ? 'няма (імпед.)' : 'няма';
  return 'н/п';
};

const lines = [];
lines.push('# Ordo: епархиальные различия', '');
lines.push('> Генерируется `npm run ordo:docs` из `src/data/ordo/diocesan-differences.json` и `notes.json`.');
lines.push('> Выравнивание — по идентичности празднования (fixed `MM-DD` / movable code), не по гражданской дате:');
lines.push(`> Мінск и Віцебск 2025–26, Пінск 2026, Гродна 2027. \`*\` — альтернатива («Або:/Дазволена:»),`);
lines.push('> «імпед.» — в этом году день занят более высоким рангом, «н/п» — дата вне покрытия.', '');

lines.push('## Сводка', '');
lines.push('| Тип | Празднования в MyBrev | Нет в MyBrev |', '| --- | --- | --- |');
['UNIVERSAL', 'BELARUS', 'DIOCESAN', 'LOCAL', 'YEAR_SPECIFIC', 'MORE_DETAILED_SOURCE', 'REAL_CONFLICT'].forEach((type) => {
  lines.push(`| ${type} | ${differences.summary[type] || 0} | ${differences.missingSummary[type] || 0} |`);
});
lines.push('');

const section = (title, filter) => {
  const rows = differences.entries.filter((e) => e.differences.some(filter));
  if (!rows.length) return;
  lines.push(`## ${title}`, '');
  lines.push(`| Празднаванне | MM-DD | MyBrev | ${DIOCESES.map((d) => SHORT[d]).join(' | ')} | Класіфікацыя |`);
  lines.push(`| --- | --- | --- | ${DIOCESES.map(() => '---').join(' | ')} | --- |`);
  rows.forEach((e) => {
    const mybrev = [RANK[e.mybrev.rank] || '—', ...Object.entries(e.mybrev.diocesan).map(([d, r]) => `${SHORT[d]}: ${RANK[r] || r}`)].join('; ');
    const kinds = [...new Set(e.differences.filter(filter).map((d) => d.type))].join(', ');
    lines.push(`| ${e.title} (\`${e.celebrationId}\`) | ${e.mmdd || 'рух.'} | ${mybrev} | ${DIOCESES.map((d) => cell(e.byDiocese[d])).join(' | ')} | ${kinds} |`);
  });
  lines.push('');
};

section('Расхождение источников с MyBrev (все епархии согласны)', (d) => d.mybrevDivergence);
section('Епархиальные ранги и собственные празднования (DIOCESAN / LOCAL)', (d) => d.type === 'DIOCESAN' || d.type === 'LOCAL');
section('Реальные конфликты (REAL_CONFLICT)', (d) => d.type === 'REAL_CONFLICT');
section('Более подробный источник (MORE_DETAILED_SOURCE)', (d) => d.type === 'MORE_DETAILED_SOURCE');

lines.push('## Празднования, которых нет в MyBrev', '');
lines.push('| MM-DD | Назва (как в источнике) | Епархии | Ранги | Тип |', '| --- | --- | --- | --- | --- |');
differences.missingInMyBrev.forEach((e) => {
  lines.push(`| ${e.mmdd} | ${e.title.replace(/\|/g, '/')} | ${e.dioceses.map((d) => SHORT[d]).join(', ')} | ${e.ranks.map((r) => RANK[r] || r).join('/')} | ${e.type} |`);
});
lines.push('');

const yearSpecific = differences.entries.filter((e) => e.differences.every((d) => d.type === 'YEAR_SPECIFIC'));
lines.push('## Только различия конкретного года (YEAR_SPECIFIC)', '');
lines.push(`${yearSpecific.length} празднований различаются только из-за календаря года (нядзеля, Пост, актава, перанос). Пример: ${yearSpecific.slice(0, 12).map((e) => `\`${e.celebrationId}\``).join(', ')}.`, '');

lines.push('## Заметки Ordo, общие для нескольких епархий', '');
lines.push('| Селектор | Катэгорыя | Епархіі | Тэкст |', '| --- | --- | --- | --- |');
notes.notes.filter((n) => n.scope.level === 'belarus').forEach((n) => {
  lines.push(`| \`${JSON.stringify(n.selector)}\` | ${n.category} | ${n.observed.map((o) => SHORT[o.diocese]).join(', ')} | ${n.text.slice(0, 110).replace(/\|/g, '/')} |`);
});
lines.push('');

fs.writeFileSync(path.join(ROOT, 'docs', 'ordo-diocesan-differences.md'), `${lines.join('\n')}\n`, 'utf8');
console.log('docs/ordo-diocesan-differences.md written');

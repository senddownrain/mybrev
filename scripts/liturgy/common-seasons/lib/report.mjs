/** Machine-readable (+ Markdown) audit of the seasonal analysis. */
import { SEASONS, SOURCE_TYPO_FIXES } from './analyze.mjs';
import { VOLUMES } from './volume.mjs';

const count = (items, key) => items.reduce((acc, item) => { const k = typeof key === 'function' ? key(item) : item[key]; acc[k] = (acc[k] || 0) + 1; return acc; }, {});

export function buildNeedsReview(analysis) {
  const items = [];
  const push = (item) => items.push({ id: `NR-${String(items.length + 1).padStart(3, '0')}`, status: 'needs_review', ...item });

  const unverifiedByField = analysis.unverified.reduce((acc, item) => { (acc[`${item.common}.${item.field}`] ||= []).push(item); return acc; }, {});
  push({
    kind: 'alleluia-versicle-form',
    title: 'Form of Alleluia added to K./Н. versicles and responsory responses',
    detail: `«(Велікодны перыяд Аллелюя)» follows ${analysis.unverified.length} K./Н. lines in ${Object.keys(unverifiedByField).length} fields. The volumes print no Easter form of such lines (only of antiphons), so the text was NOT generated; the stored base is inherited in Easter for these elements.`,
    proposal: 'append «, аллелюя.» before the final full stop (rule alleluia-v1-versicle); confirm the punctuation and then run the parser with --include-unverified',
    fields: Object.entries(unverifiedByField).map(([key, list]) => ({ field: key, lines: list.map((i) => i.line), proposals: list.slice(0, 2).map((i) => i.proposal) })),
  });
  analysis.review.forEach((item) => push({ kind: item.type, common: item.common, field: item.field, season: item.season, source: item.source, line: item.line, reason: item.reason, text: item.text }));
  const seenSwap = new Set();
  analysis.matrix.filter((c) => c.knSwap && !seenSwap.has(`${c.common}.${c.field}`) && seenSwap.add(`${c.common}.${c.field}`)).forEach((c) => push({
    kind: 'base-defect-kn-swapped', common: c.common, field: c.field, season: c.season, source: c.source,
    reason: c.note, texts: c.diff, proposal: 'fix the К./Н. labels in patchs/feasts/common-texts (separate editorial change; not part of the seasonal variants)',
  }));
  analysis.typos.forEach((n, id) => {
    const fix = SOURCE_TYPO_FIXES.find((f) => f.id === id);
    push({ kind: 'source-misprint-corrected', reason: fix?.note, occurrences: n, proposal: 'confirm the correction' });
  });
  push({
    kind: 'holy-week-mapping',
    reason: 'Ordo period `holyweek` (Palm Sunday–Holy Thursday) takes the Lent variants; the Triduum takes none. The rubric of Volume II says «У Вялікі пост».',
    proposal: 'confirm; no Common-based Office is legal in Holy Week/Triduum (proved by tests/common-seasons-calendar.test.mjs)',
  });
  push({
    kind: 'blessed-virgin-mary-saturday-memorial',
    common: 'blessed-virgin-mary',
    reason: 'The stored Common merges the main texts and the «Успамін Найсв. Панны Марыі ў суботу» alternatives into the same fields; seasonal prayers of Volume I replace the whole list of optional prayers in Advent/Christmas.',
    proposal: 'confirm that in Advent and the Christmas season the six optional prayers are not offered (Volume I prints only the seasonal prayer)',
  });
  return items;
}

export function buildAudit({ corpus, analysis, generatedFrom }) {
  const volumes = {};
  Object.values(VOLUMES).forEach((meta) => {
    const volume = corpus.volumes[meta.id];
    const commons = {};
    volume.commons.forEach((entry, id) => {
      commons[id] = { units: entry.common.order.length, fields: entry.fields.size, startLine: entry.common.startLine };
    });
    volumes[meta.id] = {
      file: meta.file, sha256: volume.sha256, bytes: volume.bytes, lines: volume.lines.length, indexStartLine: volume.indexStart + 1, commons: Object.keys(commons).length,
      recognizedUnits: Object.values(commons).reduce((a, c) => a + c.units, 0), recognizedFields: Object.values(commons).reduce((a, c) => a + c.fields, 0),
      parseIssues: volume.issues, perCommon: commons,
    };
  });
  const needsReview = buildNeedsReview(analysis);
  const matrix = analysis.matrix.map((c) => ({
    common: c.common, hour: c.hour, field: c.field, season: c.season, category: c.category, status: c.status, relation: c.relation,
    method: c.method || null, rules: c.rules?.length ? c.rules : undefined, source: c.source, note: c.note, diff: c.diff,
  }));
  let variantCount = 0;
  analysis.variants.forEach((perSeason) => Object.values(perSeason).forEach((fields) => { variantCount += Object.keys(fields).length; }));
  const bySeason = Object.fromEntries(SEASONS.map((s) => [s, matrix.filter((c) => c.season === s && c.status.startsWith('variant')).length]));
  return {
    generatedFrom,
    summary: {
      commons: corpus.base.size,
      matrixCells: matrix.length,
      cellsByCategory: count(matrix, 'category'),
      cellsByStatus: count(matrix, 'status'),
      seasonalVariantFields: variantCount,
      variantFieldsBySeason: bySeason,
      explicitSeasonalConditions: matrix.filter((c) => c.category === 'seasonal_explicit').length,
      editorialDifferences: matrix.filter((c) => c.category === 'editorial_difference').length,
      unverifiedAlleluiaElements: analysis.unverified.length,
      needsReview: needsReview.length,
      coverage: 'Every field of every Common × every variant season is a matrix cell; cells with status `review` or listed in needs_review are NOT verified.',
    },
    volumes,
    needsReview,
    matrix,
  };
}

export function renderMarkdown(audit) {
  const s = audit.summary;
  const lines = [];
  lines.push('# Агульныя тэксты: сезонныя варыянты — аўдыт', '');
  lines.push(`Крыніцы: ${Object.values(audit.volumes).map((v) => `\`${v.file}\` (sha256 ${v.sha256.slice(0, 12)}…)`).join(', ')}.`, '');
  lines.push('## Лічбы', '');
  lines.push(`- Common: ${s.commons}; клетак матрыцы Common × поле × сезон: ${s.matrixCells}`);
  Object.entries(audit.volumes).forEach(([id, v]) => lines.push(`- Том ${id}: распазнана адзінак ${v.recognizedUnits}, палёў ${v.recognizedFields}, парсерных заўваг ${v.parseIssues.length}`));
  lines.push(`- Палёў са сезонным варыянтам (запісана ў \`_seasonalVariants\`): ${s.seasonalVariantFields} (${Object.entries(s.variantFieldsBySeason).map(([k, v]) => `${k}: ${v}`).join(', ')})`);
  lines.push(`- Яўных сезонных умоў: ${s.explicitSeasonalConditions}; рэдакцыйных адрозненняў (не сезонных): ${s.editorialDifferences}`);
  lines.push(`- Не прыменена (форма Аллелюя ў К./Н.): ${s.unverifiedAlleluiaElements} элементаў; needs_review: ${s.needsReview}`, '');
  lines.push('## Катэгорыі', '', '| Катэгорыя | Клетак |', '|---|---|');
  Object.entries(s.cellsByCategory).forEach(([k, v]) => lines.push(`| ${k} | ${v} |`));
  lines.push('', '## Статусы', '', '| Статус | Клетак |', '|---|---|');
  Object.entries(s.cellsByStatus).forEach(([k, v]) => lines.push(`| ${k} | ${v} |`));
  lines.push('', '## needs_review', '');
  audit.needsReview.forEach((item) => {
    lines.push(`### ${item.id} · ${item.kind}${item.common ? ` · ${item.common}` : ''}${item.field ? `.${item.field}` : ''}${item.season ? ` · ${item.season}` : ''}`);
    if (item.title) lines.push(`**${item.title}**`);
    if (item.detail) lines.push(item.detail);
    if (item.reason) lines.push(`- Прычына: ${item.reason}`);
    if (item.source) lines.push(`- Крыніца: том ${item.source.volume}, радкі ${item.source.lines?.join('–')}`);
    if (item.text) lines.push(`- Тэкст: ${item.text}`);
    if (item.texts) lines.push(`- Том: «${item.texts.volume}» / захаваны: «${item.texts.stored}»`);
    if (item.proposal) lines.push(`- Прапанова: ${item.proposal}`);
    if (item.fields) lines.push(`- Палёў: ${item.fields.length} (${item.fields.slice(0, 12).map((f) => f.field).join(', ')}${item.fields.length > 12 ? ', …' : ''}); поўны спіс у JSON`);
    lines.push('');
  });
  lines.push('## Парсерныя заўвагі (магчымыя страты)', '');
  Object.entries(audit.volumes).forEach(([id, v]) => {
    lines.push(`- Том ${id}: ${v.parseIssues.length ? v.parseIssues.map((i) => `${i.common}/${i.hour} радок ${i.line}`).join('; ') : 'няма'}`);
  });
  lines.push('', 'Поўная матрыца (Common × гадзіна × поле × сезон) — у `common-seasons-audit.json`.', '');
  return `${lines.join('\n')}\n`;
}

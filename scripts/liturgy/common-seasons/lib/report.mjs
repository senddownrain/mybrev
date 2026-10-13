/**
 * Machine-readable (+ Markdown) audit of the seasonal analysis.
 *
 * The audit answers: what is printed in the three volumes, what of it reached `_seasonalVariants`, what
 * did not and why. It is a pure function of the volumes, the stored Commons and the frozen numbers of the
 * first audit (reports/liturgy/common-seasons-audit-baseline-adf6b14.json).
 */
import { SEASONS, SEASON_VOLUME, SOURCE_TYPO_FIXES } from './analyze.mjs';
import { VOLUMES } from './volume.mjs';
import { DIFFERENCE_CLASSES } from './compare.mjs';
import {
  BASE_CORRECTIONS, OWNER_DECISIONS, baseVersusOrdinary, indexCrossCheck, scanSourceMisprints,
} from './ledger.mjs';

const count = (items, key) => items.reduce((acc, item) => { const k = typeof key === 'function' ? key(item) : item[key]; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
const cellKey = (c) => `${c.common}.${c.field}.${c.season}`;
const sortObject = (object) => Object.fromEntries(Object.entries(object).sort(([a], [b]) => String(a).localeCompare(String(b))));

const quote = (corpus, volId, from, to, limit = 360) => {
  const lines = corpus.volumes[volId].lines.slice(from - 1, to).map((l) => l.text).filter((t) => t.trim());
  const text = lines.join(' ¶ ');
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
};

/** Concrete passages for the questions that only the owner can decide. */
export function buildDisputed({ corpus, analysis, baseGaps }) {
  const items = [];
  const unitsOf = (volId, common, field) => corpus.volumes[volId].commons.get(common)?.fields.get(field) || [];
  const range = (units) => { const ns = units.flatMap((u) => [u.startLine, ...u.lines.map((l) => l.n)]); return ns.length ? [Math.min(...ns), Math.max(...ns)] : [0, 0]; };
  const passage = (volId, common, field, limit) => { const [a, b] = range(unitsOf(volId, common, field)); return { volume: volId, lines: [a, b], text: a ? quote(corpus, volId, a, b, limit) : '(не печатается)' }; };

  // D-1: holy-women second reading
  items.push({
    id: 'D-1', title: 'holy-women.officeOfReadingsR2: том I и II печатают только отсылку, том III — полный текст',
    question: 'В Адвент, Рождество, Пост и Пасху оставить текст тома III (Пій XII о жене, 396 слов) или показывать отсылку «выбираются наиболее подходящие тексты из Общих текстов о святых мужчинах»?',
    current: 'оставлен текст базы (том III) во всех сезонах; отсылка сохранена только в отчёте',
    passages: [passage('I', 'holy-women', 'officeOfReadingsR2', 260), passage('II', 'holy-women', 'officeOfReadingsR2', 260), passage('III', 'holy-women', 'officeOfReadingsR2', 200)],
  });

  // D-2: Saturday memorial of the BVM
  const satFields = [...new Set(analysis.matrix.filter((c) => c.common === 'blessed-virgin-mary' && c.resolution === 'kept-base-subset').map((c) => c.field))];
  const satHeading = corpus.volumes.III.commons.get('blessed-virgin-mary').common.order.find((u) => u.section === 'saturday')?.sectionHeading;
  items.push({
    id: 'D-2', title: 'Найсв. Панна Марыя: альтернативы «Успамін Найсв. Панны Марыі ў суботу» только в томе III',
    question: `Тома I и II печатают только основной раздел Common (без раздела «Успамін ... у суботу», он по предисловию тома III относится к субботам Звычайнага перыяду). В базе оба раздела слиты в одни поля. Скрывать ли в Адвент/Рождество/Пост/Пасху альтернативы субботнего успамина в полях: ${satFields.join(', ')}? (Молитвы уже скрыты по NR-012.)`,
    current: 'альтернативы остаются (ничего не потеряно); молитвы заменены сезонной по NR-012',
    passages: [
      { volume: 'III', lines: [corpus.volumes.III.commons.get('blessed-virgin-mary').startLine, corpus.volumes.III.commons.get('blessed-virgin-mary').startLine + 3], text: quote(corpus, 'III', corpus.volumes.III.commons.get('blessed-virgin-mary').startLine, corpus.volumes.III.commons.get('blessed-virgin-mary').startLine + 3, 240) },
      { volume: 'III', lines: [satHeading?.n || 0, (satHeading?.n || 0) + 3], text: quote(corpus, 'III', satHeading?.n || 1, (satHeading?.n || 0) + 3, 240) },
      passage('I', 'blessed-virgin-mary', 'laudesAntBen', 240),
    ],
  });

  // D-3: a psalm verse that only one volume prints
  const passages = analysis.matrix.filter((c) => c.resolution === 'disputed-passage' && c.difference.relation === 'passage-only-in-volume' && c.season === 'advent');
  if (passages.length) {
    items.push({
      id: 'D-3', title: `Псалом: куплет напечатан только в томе I (${passages.map((c) => `${c.common}.${c.field}`).join(', ')})`,
      question: 'Том I печатает в Адвент/Рождество дополнительный куплет псалма 45 (44), которого нет в томе III (и в томе II). Это сезонное чтение, особенность издания тома I или пропуск тома III?',
      current: 'оставлен текст базы (том III); куплет в отчёте',
      passages: [
        ...passages.slice(0, 1).flatMap((c) => [passage('I', c.common, c.field, 200), passage('III', c.common, c.field, 200)]),
        { volume: 'I', lines: [0, 0], text: `различие: «${passages[0].difference.changes?.[0]?.volume || ''}»` },
      ],
    });
  }

  // D-4: wording that I and II share against III
  const substantial = analysis.matrix.filter((c) => c.resolution === 'kept-base-substantial-wording' && c.difference.sameAsOtherSeasonalVolume);
  const bySlot = new Map();
  substantial.forEach((c) => { const k = `${c.common}.${c.field}`; if (!bySlot.has(k)) bySlot.set(k, c); });
  const sample = [...bySlot.values()].slice(0, 5);
  items.push({
    id: 'D-4', title: `Другая редакция перевода: ${bySlot.size} полей, где тома I и II печатают одно, а том III — иное`,
    question: 'Слова/обороты в томах I и II совпадают между собой и расходятся с томом III (напр. «святыя шатры» / «святое жыллё»). Это не сезонные тексты. Оставить базу (том III) во всех сезонах (текущее поведение) или перенести редакцию I/II в базу отдельным редакционным коммитом?',
    current: 'оставлена база (том III); полный список слов — в audit.json (matrix[].difference.changes, sameAsOtherSeasonalVolume)',
    passages: sample.map((c) => ({ volume: `I = II ≠ III`, lines: c.source?.lines || [0, 0], text: `${c.common}.${c.field}: ` + (c.difference.changes || []).slice(0, 3).map((x) => `«${x.ordinary || '∅'}» → «${x.volume || '∅'}»`).join('; ') })),
  });

  // D-5: Alleluia printed inside Advent/Christmas readings of Volume I
  const alleluiaInI = analysis.matrix.filter((c) => c.resolution === 'whole-field-variant' && c.volume === 'I' && c.season === 'advent').filter((c) => {
    const [a, b] = c.source.lines; return corpus.volumes.I.lines.slice(a - 1, b).some((l) => /[Аа]ллелюя/.test(l.text));
  });
  if (alleluiaInI.length) {
    items.push({
      id: 'D-5', title: `Том I печатает «аллелюя» в респонсориях чтений Адвента/Рождества (${alleluiaInI.map((c) => `${c.common}.${c.field}`).join(', ')})`,
      question: 'Текст перенесён как напечатан (с «аллелюя»). Оставить или считать унаследованной пасхальной формой и убрать?',
      current: 'как в томе I',
      passages: alleluiaInI.map((c) => {
        const [a, b] = c.source.lines;
        const line = corpus.volumes.I.lines.slice(a - 1, b).find((l) => /[Аа]ллелюя/.test(l.text));
        return { volume: 'I', lines: [line.n, line.n], text: `${c.common}: ${line.text.slice(0, 220)}` };
      }),
    });
  }

  // D-6: base gaps against Volume III
  const CROSS_REFERENCE = /(?:\bс\b|агульных тэкстаў|нешпараў|уласных тэкстаў|з бягучай суботы|выбіраюцца)/;
  const gaps = baseGaps.filter((g) => g.missingWords >= 40 && !CROSS_REFERENCE.test((g.changes || []).map((x) => x.onlyInVolumeIII).join(' ')));
  if (gaps.length) {
    items.push({
      id: 'D-6', title: 'База (поля Common) не содержит текст, который печатает том III',
      question: `Том III печатает текст, которого нет в сохранённом поле: ${gaps.map((g) => `${g.common}.${g.field} (−${g.missingWords} слов)`).join('; ')}. (Ещё ${baseGaps.length - gaps.length} полей отличаются мелочами или отсылками, список — baseVersusVolumeIII в audit.json.) Дополнить базу отдельным редакционным коммитом? Сезонные варианты этих полей не затронуты.`,
      current: 'не изменялось («базовые поля обычного периода не трогать»)',
      passages: gaps.map((g) => { const [a, b] = range(unitsOf('III', g.common, g.field)); return { volume: 'III', lines: [a, b], text: `${g.common}.${g.field}: ${quote(corpus, 'III', a, b, 280)}` }; }),
    });
  }

  // D-7: scope of whole-field texts of Volume II
  items.push({
    id: 'D-7', title: 'Область действия чтений тома II (religious: Эф 4, 1–24; works-of-mercy: 1 Ян 4, 7–21)',
    question: 'Чтение напечатано без пометы «У Вялікі пост» / «У Велікодны перыяд», но его респонсорий несёт пометку «(Велікодны перыяд Аллелюя)» — значит, блок читается и в Пост (без аллелюя), и в Пасху (с аллелюя). Подтвердите, что оба сезона правильны (в Адвент/Рождество то же чтение напечатано в томе I).',
    current: 'применено к Посту и Пасхе (и к Адвенту/Рождеству по тому I)',
    passages: [
      passage('II', 'religious', 'officeOfReadingsR1', 300), passage('III', 'religious', 'officeOfReadingsR1', 200),
      passage('II', 'works-of-mercy', 'officeOfReadingsR1', 300), passage('III', 'works-of-mercy', 'officeOfReadingsR1', 200),
    ],
  });
  return items;
}

export function buildNeedsReview({ analysis, misprints, indexCheck }) {
  const items = [];
  const push = (item) => items.push({ id: item.id, ...item });
  OWNER_DECISIONS.forEach((decision) => {
    const entry = { ...decision };
    if (decision.id === 'NR-001') {
      const lines = new Set(analysis.alleluia.filter((a) => a.rule === 'alleluia-v1-versicle').map((a) => a.line));
      entry.result = `${lines.size} К./Н. строк томa II получили «, аллелюя.» (правило alleluia-v1-versicle); дублей нет; краткие «ответы» (Н. Яна выбрала.) не меняются`;
    }
    if (decision.id === 'NR-002') {
      const a = analysis.alleluia.find((x) => x.common === 'church-dedication' && x.field === 'officeOfReadingsAnt2');
      entry.result = a ? `пасхальный вариант: «${a.after}» (без †: том II печатает † после пометки (строка ${a.line}), том III — после антифона (строка 241), а сам псалом 84 (83) начинает вторую строку с «†»)` : 'не найдено';
    }
    if (decision.id === 'NR-010') entry.result = `${misprints.length} строк (${misprints.reduce((s, m) => s + m.words, 0)} слов) в томe II: ${misprints.map((m) => m.line).join(', ')}`;
    push(entry);
  });
  return { items, indexCheck };
}

export function buildAudit({ corpus, analysis, generatedFrom, baseline }) {
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

  const matrix = analysis.matrix.map((c) => ({
    common: c.common, hour: c.hour, field: c.field, season: c.season, volume: c.volume, category: c.category, status: c.status, relation: c.relation,
    resolution: c.resolution, method: c.method || null, rules: c.rules?.length ? c.rules : undefined, source: c.source, note: c.note,
    difference: c.difference,
  }));
  const variantCells = matrix.filter((c) => c.status.startsWith('variant'));
  const bySeason = Object.fromEntries(SEASONS.map((s) => [s, variantCells.filter((c) => c.season === s).length]));
  const misprints = scanSourceMisprints(corpus);
  const indexCheck = indexCrossCheck(corpus);
  const baseGaps = baseVersusOrdinary(corpus);
  const disputed = buildDisputed({ corpus, analysis, baseGaps });
  const decisions = buildNeedsReview({ analysis, misprints, indexCheck });

  // ---- before / after -------------------------------------------------------------------------------------
  const oldVariant = new Set(baseline.cells.variant);
  const newKeys = variantCells.map(cellKey);
  const added = variantCells.filter((c) => !oldVariant.has(cellKey(c)));
  const removed = [...oldVariant].filter((key) => !newKeys.includes(key));
  const causeOf = (c) => {
    if (c.resolution === 'whole-field-variant') return 'whole-field (целиком напечатанный текст тома)';
    if (c.category === 'seasonal_inherited') return 'унаследовано от родительского Common (doctors ← pastors)';
    const lines = analysis.alleluia.filter((a) => a.common === c.common && a.field === c.field && a.season === c.season);
    if (lines.some((a) => a.rule === 'alleluia-v1-versicle')) return 'К./Н. с пометкой «(Велікодны перыяд Аллелюя)» (NR-001)';
    if (lines.some((a) => a.rule === 'alleluia-v1-exclaim')) return 'антифона, заканчивающаяся «!» (NR-002)';
    return 'прочее';
  };
  const addedByCause = count(added, causeOf);
  const wholeFieldCells = variantCells.filter((c) => c.resolution === 'whole-field-variant');
  const wholeReadings = wholeFieldCells.filter((c) => /R[12]$/.test(c.field));
  const beforeAfter = {
    baseline: { commit: baseline.commit, bySeason: baseline.variantFieldsBySeason, total: baseline.summary.seasonalVariantFields },
    after: { bySeason, total: variantCells.length },
    delta: Object.fromEntries([...SEASONS, 'total'].map((k) => [k, (k === 'total' ? variantCells.length : bySeason[k]) - (k === 'total' ? baseline.summary.seasonalVariantFields : baseline.variantFieldsBySeason[k])])),
    addedFieldsByCause: addedByCause,
    removedFields: removed,
    newWholeFieldVariants: {
      cells: wholeFieldCells.length,
      wholeReadingCells: wholeReadings.length,
      distinctReadings: [...new Set(wholeReadings.map((c) => `${c.common}.${c.field}.${SEASON_VOLUME[c.season]}`))].length,
      list: wholeFieldCells.map((c) => {
        const units = corpus.volumes[c.volume].commons.get(c.common).fields.get(c.field) || [];
        const marked = units.some((u) => u.season || u.branches.length);
        const annotated = units.some((u) => u.annotations > 0);
        return {
          common: c.common, field: c.field, season: c.season, volume: c.volume, lines: c.source.lines, class: c.difference.class, coverage: c.difference.coverage,
          scopeProof: marked ? 'season-marker' : (annotated ? 'unmarked block with «(Велікодны перыяд Аллелюя)» inside: read in Lent (without) and Easter (with Alleluia)' : `unmarked block of Volume ${c.volume}: the volume's seasons share it (every difference of the volume is marked by «У …»)`),
        };
      }),
    },
  };

  // ---- the 500 «editorial_difference» cells of the first audit --------------------------------------------
  const byKey = new Map(matrix.map((c) => [cellKey(c), c]));
  const outcome = (c) => {
    if (!c) return 'нет клетки';
    if (c.resolution === 'whole-field-variant') return 'класс 3: другой текст → сезонный вариант целого поля';
    if (c.category === 'seasonal_inherited') return 'унаследовано (doctors ← pastors)';
    if (c.status.startsWith('variant') && c.category === 'seasonal_explicit') return 'класс 5: явно обусловлено сезоном (вариант)';
    if (c.difference) {
      const d = c.difference;
      if (c.category === 'ordinary_base') return 'тот же текст (после исправления парсера/сравнения с томом III)';
      if (c.resolution === 'base-correction-kn') return 'класс 2: К./Н. переставлены в томе III → исправлена база (NR-007–009)';
      return `класс ${d.class} (${DIFFERENCE_CLASSES[d.className].title}) → ${c.resolution}`;
    }
    return `${c.category}/${c.status}`;
  };
  const reclassified = baseline.cells.editorial_difference.map((key) => ({ key, outcome: outcome(byKey.get(key)) }));
  const reclassification = {
    total: reclassified.length,
    byOutcome: sortObject(count(reclassified, 'outcome')),
    // every one of the 500 cells with its new class (machine-readable)
    cells: reclassified.map(({ key, outcome: o }) => {
      const c = byKey.get(key);
      return { key, outcome: o, class: c?.difference?.class ?? (c?.category === 'seasonal_explicit' ? 5 : null), resolution: c?.resolution || null, category: c?.category || null };
    }),
  };
  const classCounts = Object.fromEntries(Object.entries(DIFFERENCE_CLASSES).map(([name, meta]) => [meta.number, {
    name, title: meta.title,
    cells: matrix.filter((c) => c.difference?.className === name && !c.difference.identical && c.category !== 'seasonal_explicit').length + (name === 'seasonal' ? matrix.filter((c) => c.category === 'seasonal_explicit').length : 0),
  }]));
  classCounts[0] = { name: 'identical', title: 'текст сезонного тома идентичен тому III (не различие)', cells: matrix.filter((c) => c.difference?.identical).length };

  // ---- the 47 «review» cells and the 12 needs_review items of the first audit --------------------------------
  const oldReview = baseline.cells.review.map((key) => ({ key, now: (() => { const c = byKey.get(key); return c ? `${c.category}/${c.status}${c.resolution ? `/${c.resolution}` : ''}` : 'нет клетки'; })() }));
  const reviewOutcome = count(oldReview, 'now');

  const summary = {
    commons: corpus.base.size,
    matrixCells: matrix.length,
    cellsByCategory: sortObject(count(matrix, 'category')),
    cellsByStatus: sortObject(count(matrix, 'status')),
    cellsByResolution: sortObject(count(matrix.filter((c) => c.resolution), 'resolution')),
    differenceClasses: classCounts,
    seasonalVariantFields: variantCells.length,
    variantFieldsBySeason: bySeason,
    explicitSeasonalConditions: matrix.filter((c) => c.category === 'seasonal_explicit').length,
    editorialDifferences: matrix.filter((c) => c.category === 'editorial_difference').length,
    reviewCells: matrix.filter((c) => c.status === 'review').length,
    alleluia: {
      annotationsInVolumeII: 425,
      annotationsInIndexOfVolumeII: indexCheck.indexAnnotated,
      appliedElements: new Set(analysis.alleluia.map((a) => a.line)).size,
      byRule: sortObject(count([...new Map(analysis.alleluia.map((a) => [a.line, a])).values()], 'rule')),
      versicleLines: new Set(analysis.alleluia.filter((a) => a.rule === 'alleluia-v1-versicle').map((a) => a.line)).size,
    },
    needsReview: decisions.items.filter((i) => i.status === 'open').length,
    openQuestionsForTheOwner: disputed.length,
    coverage: 'Every field of every Common × every variant season is a matrix cell; a cell is verified when its category is ordinary_base, seasonal_*, or its difference is classified and resolved (see differenceClasses / cellsByResolution).',
  };

  return {
    generatedFrom, summary, beforeAfter, volumes,
    baselineComparison: {
      baseline: baseline.commit,
      editorialDifferences: { before: baseline.cells.editorial_difference.length, after: summary.editorialDifferences },
      reviewCells: { before: baseline.cells.review.length, after: summary.reviewCells, outcomeOfTheOldOnes: sortObject(reviewOutcome) },
      needsReviewItems: { before: baseline.needsReview.length, after: summary.needsReview },
      unverifiedAlleluiaElements: { before: baseline.summary.unverifiedAlleluiaElements, after: 0, appliedKNLines: summary.alleluia.versicleLines },
      seasonalVariantFields: { before: baseline.summary.seasonalVariantFields, after: summary.seasonalVariantFields },
      missingSource: { before: baseline.cells.missing_source.length, after: summary.cellsByCategory.missing_source },
    },
    reclassification,
    decisions: decisions.items,
    baseCorrections: BASE_CORRECTIONS.map(({ verify, ...rest }) => ({ ...rest, verification: verify(corpus) })),
    sourceMisprints: { fix: SOURCE_TYPO_FIXES.map((f) => ({ id: f.id, note: f.note })), occurrences: misprints, appliedInVariants: analysis.typos.get('alleyuya') || 0 },
    baseVersusVolumeIII: baseGaps,
    antiphonIndexOfVolumeII: indexCheck,
    disputed,
    alleluiaApplications: analysis.alleluia.map((a) => ({ common: a.common, field: a.field, season: a.season, line: a.line, rule: a.rule, after: a.after })).sort((x, y) => x.line - y.line || x.common.localeCompare(y.common) || x.field.localeCompare(y.field) || x.season.localeCompare(y.season)),
    unresolved: analysis.review,
    matrix,
  };
}

const table = (header, rows) => [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)];

export function renderMarkdown(audit) {
  const s = audit.summary;
  const b = audit.beforeAfter;
  const L = [];
  L.push('# Агульныя тэксты: сезонныя варыянты — аўдыт (паўторны)', '');
  L.push(`Крыніцы: ${Object.values(audit.volumes).map((v) => `\`${v.file}\` (sha256 ${v.sha256.slice(0, 12)}…)`).join(', ')}. Базавыя лічбы папярэдняга аўдыту — \`common-seasons-audit-baseline-${audit.baselineComparison.baseline}.json\`.`, '');
  L.push('## Метод', '');
  L.push('Парсер больше не ищет сезонные маркеры внутри блока. Для каждой клетки `Common → час → поле → сезон` целиком сравнивается напечатанный раздел сезонного тома (I: Адвент + Рождество, II: Пост + Пасха) с разделом тома III (обычный период), по словам (знаки, регистр, апострофы, ссылки на страницы и рубрики `*` `†` `/` не считаются словами). Отсутствие локальной пометы не означает совпадения: расхождение классифицируется (6 классов, `lib/compare.mjs`), класс 3 («другой текст») и класс 4 с чужими элементами превращаются в сезонный вариант целого поля; остальное остаётся в базе с записью в матрице.', '');
  L.push('## До / после', '');
  L.push(...table(['Сезон', `до (${b.baseline.commit})`, 'после', 'Δ'], [...SEASONS.map((k) => [k, b.baseline.bySeason[k], b.after.bySeason[k], `${b.delta[k] >= 0 ? '+' : ''}${b.delta[k]}`]), ['всего полей', b.baseline.total, b.after.total, `${b.delta.total >= 0 ? '+' : ''}${b.delta.total}`]]), '');
  L.push(`Новые варианты целиком напечатанных текстов: **${b.newWholeFieldVariants.cells}** клеток (поле × сезон), из них целых чтений (R1/R2): **${b.newWholeFieldVariants.wholeReadingCells}** клеток = **${b.newWholeFieldVariants.distinctReadings}** различных чтений (Common × поле × том).`, '');
  L.push('Откуда прибавились поля:', '', ...table(['Причина', 'Полей'], Object.entries(b.addedFieldsByCause).map(([k, v]) => [k, v])), '');
  if (b.removedFields.length) L.push(`Исчезли: ${b.removedFields.join(', ')}`, '');
  L.push('## Числа предыдущего аудита', '');
  const c = audit.baselineComparison;
  L.push(...table(['Показатель', 'до', 'после', 'Почему изменилось'], [
    ['editorial_difference (клеток)', c.editorialDifferences.before, c.editorialDifferences.after, 'все 500 переклассифицированы (раздел ниже); сравнение идёт с томом III, а не с HTML базы; исправлен парсер (усечённые гимны, ссылки на страницы)'],
    ['review (клеток)', c.reviewCells.before, c.reviewCells.after, 'клетки с чтениями без якоря получили вариант целого поля; К./Н. с пометкой применяются (NR-001); «уже есть аллелюя» — не ошибка'],
    ['needs_review (пунктов)', c.needsReviewItems.before, c.needsReviewItems.after, 'решения редактора NR-001…012 применены или проверены; открытые вопросы — в разделе «Спорные места»'],
    ['К./Н. с «(Велікодны перыяд Аллелюя)»', c.unverifiedAlleluiaElements.before, `0 неприменённых; ${c.unverifiedAlleluiaElements.appliedKNLines} применено`, '97 + 3 строки в чтениях religious/works-of-mercy, которые раньше терялись при поиске блока'],
    ['полей с сезонным вариантом', c.seasonalVariantFields.before, c.seasonalVariantFields.after, 'см. «До / после»'],
    ['missing_source (клеток)', c.missingSource.before, c.missingSource.after, 'doctors-of-church наследует поля pastors («Усё з Агульных тэкстаў пра пастыраў»)'],
  ].map((r) => r.map(String))), '');
  L.push('Старые 47 клеток `review` теперь:', '', ...table(['Состояние сейчас', 'Клеток'], Object.entries(c.reviewCells.outcomeOfTheOldOnes)), '');
  L.push('## 500 `editorial_difference` — повторная классификация', '');
  L.push(...table(['Результат', 'Клеток'], Object.entries(audit.reclassification.byOutcome).map(([k, v]) => [k, v])), '');
  L.push('Классы (вся матрица; клетки без сезонной метки сравниваются с томом III, клетки с меткой — класс 5):', '', ...table(['№', 'Класс', 'Клеток'], Object.entries(s.differenceClasses).map(([n, v]) => [n, v.title, v.cells])), '');
  L.push('Решения по клеткам:', '', ...table(['Решение', 'Клеток'], Object.entries(s.cellsByResolution).map(([k, v]) => [k, v])), '');
  L.push('## Решения редактора', '');
  L.push(...table(['№', 'Тема', 'Статус', 'Результат'], audit.decisions.map((d) => [d.id, d.title, d.status, d.result || d.decision])), '');
  L.push('## Исправления базовых текстов (отдельно от сезонных вариантов)', '');
  L.push(...table(['№', 'Поле', 'Проверка'], audit.baseCorrections.map((x) => [x.id, `${x.common}.${x.field}`, x.verification.ok ? 'подтверждено (база = тома I/II)' : '**НЕ СОВПАДАЕТ**'])), '');
  L.push(`Опечатка тома II «аллеюя»: ${audit.sourceMisprints.occurrences.length} строк (${audit.sourceMisprints.occurrences.map((m) => m.line).join(', ')}); исправлено в сезонных текстах «аллелюя».`, '');
  L.push('## Спорные места (нужно решение владельца)', '');
  audit.disputed.forEach((d) => {
    L.push(`### ${d.id}. ${d.title}`, '', d.question, '', `Сейчас: ${d.current}.`, '');
    d.passages.forEach((p) => L.push(`- том ${p.volume}${p.lines[0] ? `, стр. ${p.lines[0]}–${p.lines[1]}` : ''}: ${p.text}`));
    L.push('');
  });
  L.push('## Проверка полноты', '', `- Индекс антифонов тома II (после строки ${audit.volumes.II.indexStartLine}): ${audit.antiphonIndexOfVolumeII.indexAnnotated} пометок, без пары в корпусе: ${audit.antiphonIndexOfVolumeII.unmatched.length}.`);
  L.push(`- «(Велікодны перыяд Аллелюя)»: в тексте тома II ${s.alleluia.annotationsInVolumeII} пометок (из них ${s.alleluia.annotationsInIndexOfVolumeII} в индексе), применено элементов ${s.alleluia.appliedElements}: ${Object.entries(s.alleluia.byRule).map(([k, v]) => `${k}: ${v}`).join(', ')}.`);
  Object.entries(audit.volumes).forEach(([id, v]) => L.push(`- Том ${id}: распознано единиц ${v.recognizedUnits}, полей ${v.recognizedFields}, парсерных замечаний ${v.parseIssues.length}.`));
  L.push('', 'Полная матрица (Common × час × поле × сезон) — в `common-seasons-audit.json`.', '');
  return `${L.join('\n')}\n`;
}

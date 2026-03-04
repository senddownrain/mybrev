#!/usr/bin/env node

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

const PERIOD_LABEL_MAP = {
  ordinary: 'Звычайны перыяд',
  advent: 'Адвэнт',
  lent: 'Вялікі пост',
  easter: 'Велікодны перыяд',
  christmas: 'Перыяд Божага Нараджэння',
  holyweek: 'Вялікі тыдзень',
};

const WEEKDAY_LABEL_MAP = {
  1: 'Нядзеля',
  2: 'Панядзелак',
  3: 'Аўторак',
  4: 'Серада',
  5: 'Чацвер',
  6: 'Пятніца',
  7: 'Субота',
};

const DAY_TEMPLATE_FIELDS = [
  '_dayOfWeek',
  '_periodType',
  'feastComment',
  'officeOfReadingsHymn',
  'officeOfReadingsAnt1',
  'officeOfReadingsAnt2',
  'officeOfReadingsAnt3',
  'officeOfReadingsPs1',
  'officeOfReadingsPs2',
  'officeOfReadingsPs3',
  'officeOfReadingsVers',
  'officeOfReadingsR1',
  'officeOfReadingsR2',
  'officeOfReadingsTeDeum',
  'officeOfReadingsPr',
  'laudesHymn',
  'laudesAnt1',
  'laudesAnt2',
  'laudesAnt3',
  'laudesPs1',
  'laudesPs2',
  'laudesPs3',
  'laudesR',
  'laudesAntBen',
  'laudesInter',
  'laudesPr',
  'sext1Hymn',
  'sext1Ant1',
  'sext1Ant2',
  'sext1Ant3',
  'sext1Ps1',
  'sext1Ps2',
  'sext1Ps3',
  'sext1R',
  'sext1Pr',
  'sext2Hymn',
  'sext2Ant1',
  'sext2Ant2',
  'sext2Ant3',
  'sext2Ps1',
  'sext2Ps2',
  'sext2Ps3',
  'sext2R',
  'sext2Pr',
  'sext3Hymn',
  'sext3Ant1',
  'sext3Ant2',
  'sext3Ant3',
  'sext3Ps1',
  'sext3Ps2',
  'sext3Ps3',
  'sext3R',
  'sext3Pr',
  'vesperHymn',
  'vesperAnt1',
  'vesperAnt2',
  'vesperAnt3',
  'vesperPs1',
  'vesperPs2',
  'vesperPs3',
  'vesperR',
  'vesperAntMag',
  'vesperInter',
  'vesperPr',
];

const TODO_RECIPES = [
  {
    target: { periodType: 'advent', psalmWeekNumber: 3, dayOfWeek: 7 },
    source: { periodType: 'ordinary', psalmWeekNumber: 3, dayOfWeek: 7 },
  },
  {
    target: { periodType: 'easter', psalmWeekNumber: 3, dayOfWeek: 4 },
    source: { periodType: 'lent', psalmWeekNumber: 3, dayOfWeek: 4 },
  },
  {
    target: { periodType: 'easter', psalmWeekNumber: 4, dayOfWeek: 4 },
    source: { periodType: 'lent', psalmWeekNumber: 4, dayOfWeek: 4 },
  },
  {
    target: { periodType: 'lent', psalmWeekNumber: 3, dayOfWeek: 3 },
    source: { periodType: 'easter', psalmWeekNumber: 3, dayOfWeek: 3 },
  },
  ...[1, 2, 3, 7].map((dayOfWeek) => ({
    target: { periodType: 'christmas', psalmWeekNumber: 1, dayOfWeek },
    source: { periodType: 'ordinary', psalmWeekNumber: 1, dayOfWeek },
  })),
];

function makeTemplateId(periodType, psalmWeekNumber, dayOfWeek) {
  return `${periodType}-psalmweek-${psalmWeekNumber}-day-${dayOfWeek}`;
}

function buildTodoTitle(periodType, psalmWeekNumber, dayOfWeek) {
  const periodLabel = PERIOD_LABEL_MAP[periodType] || periodType;
  const dayLabel = WEEKDAY_LABEL_MAP[dayOfWeek] || String(dayOfWeek);
  return `TODO: ${periodLabel} • Тыдзень псалтыра: ${psalmWeekNumber} - ${dayLabel}`;
}

function buildPayloadFromSource(sourceTemplate, target) {
  const payload = {
    _title: buildTodoTitle(target.periodType, target.psalmWeekNumber, target.dayOfWeek),
    _psalmWeekNumber: target.psalmWeekNumber,
  };

  for (const field of DAY_TEMPLATE_FIELDS) {
    if (field === '_periodType') {
      payload[field] = target.periodType;
      continue;
    }
    if (field === '_dayOfWeek') {
      payload[field] = target.dayOfWeek;
      continue;
    }
    payload[field] = sourceTemplate[field] ?? null;
  }

  payload._todo = true;
  payload._todoSource = {
    periodType: sourceTemplate._periodType || null,
    psalmWeekNumber: sourceTemplate._psalmWeekNumber || null,
    dayOfWeek: sourceTemplate._dayOfWeek || null,
    id: sourceTemplate.id || null,
  };

  return payload;
}

async function main() {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  console.log('Стварэнне TODO-шаблонаў для ручной дапрацоўкі...');

  const results = [];

  for (const recipe of TODO_RECIPES) {
    const sourceId = makeTemplateId(
      recipe.source.periodType,
      recipe.source.psalmWeekNumber,
      recipe.source.dayOfWeek
    );

    const targetId = makeTemplateId(
      recipe.target.periodType,
      recipe.target.psalmWeekNumber,
      recipe.target.dayOfWeek
    );

    const sourceRef = db.collection('dayTemplates').doc(sourceId);
    const targetRef = db.collection('dayTemplates').doc(targetId);

    const sourceSnap = await sourceRef.get();

    if (!sourceSnap.exists) {
      results.push({ recipe, sourceId, targetId, status: 'missing-source' });
      continue;
    }

    const sourceTemplate = { id: sourceSnap.id, ...sourceSnap.data() };
    const payload = buildPayloadFromSource(sourceTemplate, recipe.target);

    await targetRef.set(payload, { merge: true });

    results.push({ recipe, sourceId, targetId, status: 'created' });
  }

  const created = results.filter((x) => x.status === 'created');
  const missing = results.filter((x) => x.status === 'missing-source');

  console.log(`\nГатова. Створана/абноўлена TODO-шаблонаў: ${created.length}`);

  if (created.length) {
    console.log('\nСтвораныя TODO-шаблоны:');
    created.forEach((item) => {
      const { target } = item.recipe;
      console.log(
        `- ${item.targetId} <= ${item.sourceId} | ${buildTodoTitle(target.periodType, target.psalmWeekNumber, target.dayOfWeek)}`
      );
    });
  }

  if (missing.length) {
    console.log('\nНЕ хапае зыходных шаблонаў:');
    missing.forEach((item) => {
      console.log(`- target ${item.targetId}: няма source ${item.sourceId}`);
    });
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Памылка:', err);
  process.exit(1);
});

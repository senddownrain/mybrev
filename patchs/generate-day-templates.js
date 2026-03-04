#!/usr/bin/env node

/**
 * Генерация dayTemplates из коллекции days.
 *
 * Что делает:
 * - Берёт периоды: ordinary, easter, lent, advent, christmas.
 * - Парсит _psalmWeek (римская запись недели псалтыра) -> _psalmWeekNumber (1..4).
 * - Для каждой комбинации period + psalmWeekNumber(1..4) + dayOfWeek(1..7)
 *   выбирает лучший документ day (по количеству заполненных полей шаблона).
 * - Формирует/обновляет шаблон в dayTemplates.
 * - В конце печатает отчёт по периодам: какие дни/недели не найдены.
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

const TARGET_PERIODS = ['ordinary', 'easter', 'lent', 'advent', 'christmas'];

const PERIOD_LABEL_MAP = {
  ordinary: 'Звычайны перыяд',
  advent: 'Адвэнт',
  lent: 'Вялікі пост',
  easter: 'Велікодны перыяд',
  christmas: 'Перыяд Божага Нараджэння',
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

function normalizeText(input) {
  if (input === undefined || input === null) return '';
  return String(input).trim();
}

function parsePsalmWeekNumber(raw) {
  if (raw === undefined || raw === null) return null;

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const n = Math.trunc(raw);
    return n >= 1 && n <= 4 ? n : null;
  }

  const source = normalizeText(raw)
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[ІI]/g, 'I'); // кириллическая І -> латинская I

  const match = source.match(/(IV|III|II|I)/);
  if (!match) return null;

  switch (match[1]) {
    case 'I': return 1;
    case 'II': return 2;
    case 'III': return 3;
    case 'IV': return 4;
    default: return null;
  }
}

function hasValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
}

function buildTitle(periodType, psalmWeekNumber, dayOfWeek) {
  const periodLabel = PERIOD_LABEL_MAP[periodType] || periodType;
  const dayLabel = WEEKDAY_LABEL_MAP[dayOfWeek] || dayOfWeek;
  return `${psalmWeekNumber} тыдзень, ${dayLabel}, ${periodLabel}`;
}

function buildTemplatePayload(dayDoc, periodType, psalmWeekNumber, dayOfWeek) {
  const payload = {
    _title: buildTitle(periodType, psalmWeekNumber, dayOfWeek),
    _psalmWeekNumber: psalmWeekNumber,
  };

  DAY_TEMPLATE_FIELDS.forEach((field) => {
    if (field === '_periodType') {
      payload[field] = periodType;
      return;
    }
    if (field === '_dayOfWeek') {
      payload[field] = dayOfWeek;
      return;
    }
    payload[field] = dayDoc[field] ?? null;
  });

  return payload;
}

function computeContentScore(dayDoc) {
  let score = 0;
  for (const field of DAY_TEMPLATE_FIELDS) {
    if (field === '_dayOfWeek' || field === '_periodType') continue;
    if (hasValue(dayDoc[field])) score += 1;
  }
  return score;
}

function makeTemplateId(periodType, psalmWeekNumber, dayOfWeek) {
  return `${periodType}-psalmweek-${psalmWeekNumber}-day-${dayOfWeek}`;
}

async function main() {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  console.log('Чытаю days...');
  const daysSnap = await db.collection('days').get();
  const days = daysSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const candidates = new Map();

  for (const day of days) {
    const periodType = normalizeText(day._periodType);
    if (!TARGET_PERIODS.includes(periodType)) continue;

    const dayOfWeek = Number(day._dayOfWeek);
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) continue;

    const psalmWeekNumber = parsePsalmWeekNumber(day._psalmWeek);
    if (!psalmWeekNumber) continue;

    const key = `${periodType}|${psalmWeekNumber}|${dayOfWeek}`;
    const score = computeContentScore(day);
    const current = candidates.get(key);

    if (!current || score > current.score) {
      candidates.set(key, { day, score });
    }
  }

  const report = {};
  const batch = db.batch();
  let createdCount = 0;

  for (const periodType of TARGET_PERIODS) {
    report[periodType] = { created: 0, missing: [] };

    for (let psalmWeekNumber = 1; psalmWeekNumber <= 4; psalmWeekNumber += 1) {
      for (let dayOfWeek = 1; dayOfWeek <= 7; dayOfWeek += 1) {
        const key = `${periodType}|${psalmWeekNumber}|${dayOfWeek}`;
        const hit = candidates.get(key);

        if (!hit) {
          report[periodType].missing.push({ psalmWeekNumber, dayOfWeek });
          continue;
        }

        const payload = buildTemplatePayload(hit.day, periodType, psalmWeekNumber, dayOfWeek);
        const templateId = makeTemplateId(periodType, psalmWeekNumber, dayOfWeek);
        const ref = db.collection('dayTemplates').doc(templateId);

        batch.set(ref, payload, { merge: true });
        report[periodType].created += 1;
        createdCount += 1;
      }
    }
  }

  await batch.commit();

  console.log('');
  console.log(`Захавана/абноўлена шаблонаў: ${createdCount}`);
  console.log('');
  console.log('Справаздача па перыядах:');

  for (const periodType of TARGET_PERIODS) {
    const periodReport = report[periodType];
    console.log(`\n- ${periodType}: створана ${periodReport.created}/28`);

    if (periodReport.missing.length === 0) {
      console.log('  Усе 4 тыдні × 7 дзён знойдзены.');
      continue;
    }

    const missingByWeek = new Map();
    for (const item of periodReport.missing) {
      if (!missingByWeek.has(item.psalmWeekNumber)) missingByWeek.set(item.psalmWeekNumber, []);
      missingByWeek.get(item.psalmWeekNumber).push(item.dayOfWeek);
    }

    for (let week = 1; week <= 4; week += 1) {
      const missingDays = missingByWeek.get(week);
      if (!missingDays || missingDays.length === 0) continue;
      const labels = missingDays.sort((a, b) => a - b).map((d) => `${d} (${WEEKDAY_LABEL_MAP[d]})`).join(', ');
      console.log(`  Няма для тыдня ${week}: ${labels}`);
    }
  }

  process.exit(0);
}

main().catch((error) => {
  console.error('Памылка генерацыі шаблонаў:', error);
  process.exit(1);
});

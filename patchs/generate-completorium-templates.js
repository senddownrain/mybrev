#!/usr/bin/env node

/**
 * Генерация шаблонов комплеты из коллекции days.
 *
 * Периоды: ordinary, easter, lent, advent, christmas
 * Для каждого периода ищет по одному дню на каждый день недели (1..7),
 * берет поля комплеты и записывает в completoriumTemplates.
 *
 * Запуск:
 *   node patchs/generate-completorium-templates.js
 *   node patchs/generate-completorium-templates.js --dry-run
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const admin = require('firebase-admin');

const serviceAccount = require('./serviceAccountKey.json');

const PERIODS = ['ordinary', 'easter', 'lent', 'advent', 'christmas'];
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

const TEMPLATE_FIELDS = [
  'compHymn',
  'compAnt1',
  'compAnt2',
  'compPs1',
  'compPs2',
  'compR',
  'compResp',
  'compAntS',
  'compPr',
];

const dryRun = process.argv.includes('--dry-run');

function readLabelMapsFromLiturgical() {
  const liturgicalPath = path.resolve(__dirname, '../src/constants/liturgical.js');
  const source = fs.readFileSync(liturgicalPath, 'utf8');

  const extractObjectLiteral = (constName) => {
    const regex = new RegExp(`export\\s+const\\s+${constName}\\s*=\\s*({[\\s\\S]*?})\\s*;`);
    const match = source.match(regex);
    if (!match) {
      throw new Error(`Не найден ${constName} в src/constants/liturgical.js`);
    }
    return vm.runInNewContext(`(${match[1]})`);
  };

  return {
    PERIOD_LABEL_MAP: extractObjectLiteral('PERIOD_LABEL_MAP'),
    WEEKDAY_LABEL_MAP: extractObjectLiteral('WEEKDAY_LABEL_MAP'),
  };
}

function pickBestDayByWeekday(daysDocs) {
  /**
   * Берем первый документ после сортировки по _date/id.
   * Этого достаточно для задачи «найти по 7 дней на период».
   */
  return daysDocs
    .slice()
    .sort((a, b) => {
      const ad = a.data._date || a.id;
      const bd = b.data._date || b.id;
      return String(ad).localeCompare(String(bd));
    })[0];
}

async function main() {
  const { PERIOD_LABEL_MAP, WEEKDAY_LABEL_MAP } = readLabelMapsFromLiturgical();

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  const db = admin.firestore();
  const daysRef = db.collection('days');
  const templatesRef = db.collection('completoriumTemplates');

  const report = [];

  for (const period of PERIODS) {
    const periodResult = {
      period,
      periodLabel: PERIOD_LABEL_MAP[period] || period,
      created: 0,
      updated: 0,
      missingWeekdays: [],
    };

    console.log(`\n=== Период: ${periodResult.periodLabel} (${period}) ===`);

    for (const weekday of WEEKDAYS) {
      const qSnap = await daysRef
        .where('_periodType', '==', period)
        .where('_dayOfWeek', '==', weekday)
        .get();

      if (qSnap.empty) {
        periodResult.missingWeekdays.push(weekday);
        continue;
      }

      const candidates = qSnap.docs.map((docSnap) => ({ id: docSnap.id, data: docSnap.data() }));
      const selected = pickBestDayByWeekday(candidates);

      const title = `${WEEKDAY_LABEL_MAP[weekday] || weekday} — ${PERIOD_LABEL_MAP[period] || period}`;

      const payload = {
        title,
        _dayOfWeek: weekday,
        _periodType: period,
        sourceDayId: selected.id,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      for (const field of TEMPLATE_FIELDS) {
        payload[field] = selected.data[field] || '';
      }

      const existingSnap = await templatesRef
        .where('_periodType', '==', period)
        .where('_dayOfWeek', '==', weekday)
        .limit(1)
        .get();

      if (dryRun) {
        if (existingSnap.empty) {
          periodResult.created += 1;
          console.log(`  [dry-run] create: ${title} (day: ${selected.id})`);
        } else {
          periodResult.updated += 1;
          console.log(`  [dry-run] update: ${title} (day: ${selected.id})`);
        }
        continue;
      }

      if (existingSnap.empty) {
        await templatesRef.add({
          ...payload,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        periodResult.created += 1;
        console.log(`  create: ${title} (day: ${selected.id})`);
      } else {
        const existingDoc = existingSnap.docs[0];
        await existingDoc.ref.set(payload, { merge: true });
        periodResult.updated += 1;
        console.log(`  update: ${title} (day: ${selected.id})`);
      }
    }

    if (periodResult.missingWeekdays.length) {
      console.log(
        `  Пропущены дни недели: ${periodResult.missingWeekdays
          .map((d) => WEEKDAY_LABEL_MAP[d] || d)
          .join(', ')}`
      );
    } else {
      console.log('  Найдены все 7 дней недели.');
    }

    report.push(periodResult);
  }

  console.log('\n===== ИТОГОВЫЙ ОТЧЕТ =====');
  for (const item of report) {
    console.log(`- ${item.periodLabel} (${item.period}): created=${item.created}, updated=${item.updated}`);
    if (item.missingWeekdays.length) {
      console.log(
        `  missing: ${item.missingWeekdays.map((d) => WEEKDAY_LABEL_MAP[d] || d).join(', ')}`
      );
    } else {
      console.log('  missing: нет');
    }
  }

  if (dryRun) {
    console.log('\nDRY RUN: записи в Firestore не изменялись.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\nОшибка выполнения скрипта:', error);
    process.exit(1);
  });

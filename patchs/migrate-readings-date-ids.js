/**
 * migrate-readings-date-ids.js
 *
 * Миграция:
 *  - для документов в коллекции "readings" с _date формата 'MM-DD'
 *    создаём новые документы:
 *      * id = 'DD.MM'
 *      * _date = 'DD.MM'
 *  - остальные поля копируем как есть
 *  - если новый id уже существует, спрашиваем, что делать
 */

const admin = require('firebase-admin');
const readline = require('readline');
const chalk = require('chalk');

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const READINGS_COLLECTION = 'readings';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(q) {
  return new Promise((resolve) => rl.question(q, (ans) => resolve(ans.trim())));
}

const fmtHeader = (t) => chalk.bold.cyan(t);
const fmtOk = (t) => chalk.green(t);
const fmtWarn = (t) => chalk.yellow(t);
const fmtError = (t) => chalk.red(t);
const fmtInfo = (t) => chalk.magenta(t);

function mmddToDdMm(mmdd) {
  // ожидаем 'MM-DD'
  const m = /^(\d{2})-(\d{2})$/.exec(mmdd);
  if (!m) return null;
  const [_, MM, DD] = m;
  return `${DD}.${MM}`; // DD.MM
}

async function main() {
  try {
    console.log(fmtHeader('Миграция _date и id: "MM-DD" → "DD.MM" в коллекции readings'));

    const snap = await db.collection(READINGS_COLLECTION).get();
    const docs = snap.docs;

    const candidates = docs.filter((doc) => {
      const data = doc.data();
      const d = data._date;
      return typeof d === 'string' && /^\d{2}-\d{2}$/.test(d);
    });

    console.log(
      fmtInfo(
        `Найдено документов с _date формата "MM-DD": ${candidates.length}`,
      ),
    );

    for (const doc of candidates) {
      const oldId = doc.id;
      const data = doc.data();
      const oldDate = data._date;
      const newDate = mmddToDdMm(oldDate);

      if (!newDate) {
        console.log(
          fmtWarn(
            `Пропуск документа ${oldId}: некорректный формат _date="${oldDate}"`,
          ),
        );
        continue;
      }

      const newId = newDate; // id = "DD.MM"

      console.log('\n' + fmtHeader(`Документ: ${oldId}`));
      console.log(fmtInfo(`  Старый _date: ${oldDate}`));
      console.log(fmtInfo(`  Новый _date: ${newDate}`));
      console.log(fmtInfo(`  Новый id:    ${newId}`));

      const newDocRef = db.collection(READINGS_COLLECTION).doc(newId);
      const newDocSnap = await newDocRef.get();

      if (newDocSnap.exists) {
        console.log(
          fmtWarn(
            `⚠ Документ с id=${newId} уже существует. Его данные НЕ будут автоматически объединены.`,
          ),
        );
        console.log('  1 – перезаписать существующий (merge старых данных поверх)');
        console.log('  2 – пропустить этот перенос');
        console.log('  3 – показать существующий документ и потом спросить ещё раз');

        // маленький цикл, чтобы можно было глянуть содержимое
        let localChoice = '';
        while (localChoice !== '1' && localChoice !== '2') {
          localChoice = await ask('Ваш выбор (1/2/3): ');
          if (localChoice === '3') {
            const exData = newDocSnap.data() || {};
            console.log(fmtInfo(`\nСуществующий ${newId}:`));
            console.dir(exData, { depth: 3, colors: true });
          } else if (localChoice === '1' || localChoice === '2') {
            break;
          }
        }

        if (localChoice === '2') {
          console.log('→ Пропускаем этот документ, ничего не меняем.');
          continue;
        }

        console.log(
          fmtWarn(
            `→ Перезаписываем данные в id=${newId} (merge). Старый документ ${oldId} будет затем удалён.`,
          ),
        );
      }

      // Готовим новые данные: всё как было, но _date заменяем
      const newData = {
        ...data,
        _date: newDate,
      };

      await newDocRef.set(newData, { merge: true });
      console.log(fmtOk(`✓ Записан документ с id=${newId}, _date=${newDate}`));

      // Удаляем старый документ, если id отличается
      if (oldId !== newId) {
        await doc.ref.delete();
        console.log(fmtOk(`✓ Удалён старый документ с id=${oldId}`));
      } else {
        console.log(
          fmtInfo(
            'id совпадает с новым значением, удалять старый документ не нужно.',
          ),
        );
      }

    //   const cont = await ask('\nEnter → далее, q → выйти: ');
    //   if (cont.toLowerCase() === 'q') {
    //     console.log(fmtInfo('Прервано по запросу пользователя.'));
    //     break;
    //   }
    }

    console.log('\n' + fmtHeader('Миграция дат завершена.'));
    rl.close();
    process.exit(0);
  } catch (err) {
    console.error(fmtError('Ошибка миграции дат:'), err);
    rl.close();
    process.exit(1);
  }
}

main();
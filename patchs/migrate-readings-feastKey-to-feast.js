/**
 * migrate-readings-feastKey-to-feast.js
 *
 * Миграция:
 *  - для документов в коллекции "readings" с полем _feastKey
 *    создаём/обновляем поле _feast = _feastKey и удаляем _feastKey
 *  - id документа НЕ меняется
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

async function main() {
  try {
    console.log(
      fmtHeader(
        'Миграция _feastKey → _feast в коллекции readings (id не меняем)',
      ),
    );

    const snap = await db.collection(READINGS_COLLECTION).get();
    const docs = snap.docs;

    const candidates = docs.filter((doc) => {
      const data = doc.data();
      return Object.prototype.hasOwnProperty.call(data, '_feastKey');
    });

    console.log(
      fmtInfo(
        `Найдено документов с _feastKey: ${candidates.length}`,
      ),
    );

    for (const doc of candidates) {
      const id = doc.id;
      const data = doc.data();
      const feastKeyVal = data._feastKey;
      const existingFeast = data._feast;

      console.log('\n' + fmtHeader(`Документ: ${id}`));
      console.log(fmtInfo(`  _feastKey: ${feastKeyVal}`));
      console.log(fmtInfo(`  _feast (существующий): ${existingFeast}`));

      let chosenFeastValue = feastKeyVal;

      if (existingFeast && existingFeast !== feastKeyVal) {
        console.log(
          fmtWarn(
            '⚠ В документе уже есть _feast, отличающийся от _feastKey.',
          ),
        );
        console.log('  1 – перезаписать _feast значением из _feastKey');
        console.log(
          '  2 – оставить существующий _feast, только удалить _feastKey',
        );
        console.log('  3 – пропустить этот документ');

        let choice = '';
        while (!['1', '2', '3'].includes(choice)) {
          choice = await ask('Ваш выбор (1/2/3): ');
        }

        if (choice === '3') {
          console.log('→ Пропускаем, никаких изменений не вносим.');
          continue;
        } else if (choice === '2') {
          chosenFeastValue = existingFeast;
        } else if (choice === '1') {
          chosenFeastValue = feastKeyVal;
        }
      }

      const docRef = doc.ref;

      // Обновляем: ставим _feast и удаляем _feastKey
      const updatePayload = {
        _feast: chosenFeastValue,
        _feastKey: admin.firestore.FieldValue.delete(),
      };

      await docRef.update(updatePayload);
      console.log(
        fmtOk(
          `✓ Обновлено: _feast = "${chosenFeastValue}", _feastKey удалён`,
        ),
      );

    //   const cont = await ask('\nEnter → далее, q → выйти: ');
    //   if (cont.toLowerCase() === 'q') {
    //     console.log(fmtInfo('Прервано по запросу пользователя.'));
    //     break;
    //   }
    }

    console.log('\n' + fmtHeader('Миграция _feastKey → _feast завершена.'));
    rl.close();
    process.exit(0);
  } catch (err) {
    console.error(fmtError('Ошибка миграции feastKey → feast:'), err);
    rl.close();
    process.exit(1);
  }
}

main();
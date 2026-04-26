#!/usr/bin/env node

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

const INVITATORIUM_FIELDS = [
  'invitatoriumPs1',
  'invitatoriumPs2',
  'invitatoriumPs3',
  'invitatoriumPs4',
  'invitatoriumPs5',
  'invitatoriumPs6',
];

function normalize(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function keepOnlyInvitatoriumFields(payload) {
  const result = {};

  for (const field of INVITATORIUM_FIELDS) {
    result[field] = normalize(payload[field]);
  }

  return result;
}

async function main() {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  const db = admin.firestore();
  const snapshot = await db.collection('invitatoriums').get();

  if (snapshot.empty) {
    console.log('Коллекция invitatoriums пуста, изменений нет.');
    return;
  }

  const batchSize = 400;
  const docs = snapshot.docs;

  for (let i = 0; i < docs.length; i += batchSize) {
    const chunk = docs.slice(i, i + batchSize);
    const batch = db.batch();

    for (const doc of chunk) {
      const sanitized = keepOnlyInvitatoriumFields(doc.data());
      batch.set(doc.ref, sanitized);
    }

    await batch.commit();
  }

  console.log(`Готово. Обновлено документов: ${docs.length}.`);
}

main()
  .catch((error) => {
    console.error('Ошибка очистки полей invitatoriums:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((app) => app.delete()));
    }
  });

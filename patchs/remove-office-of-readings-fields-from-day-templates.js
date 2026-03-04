#!/usr/bin/env node

/**
 * Removes Office of Readings fields from all dayTemplates documents.
 *
 * Usage:
 *   node patchs/remove-office-of-readings-fields-from-day-templates.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

const FIELDS_TO_DELETE = [
  'officeOfReadingsR1',
  'officeOfReadingsR2',
  'officeOfReadingsTeDeum',
  'officeOfReadingsPr',
];

const BATCH_SIZE = 400;

async function main() {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  const snapshot = await db.collection('dayTemplates').get();
  if (snapshot.empty) {
    console.log('No dayTemplates documents found.');
    return;
  }

  let batch = db.batch();
  let pending = 0;
  let updated = 0;

  for (const docSnap of snapshot.docs) {
    const updatePayload = {};
    for (const field of FIELDS_TO_DELETE) {
      updatePayload[field] = admin.firestore.FieldValue.delete();
    }

    batch.update(docSnap.ref, updatePayload);
    pending += 1;
    updated += 1;

    if (pending >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }

  if (pending > 0) {
    await batch.commit();
  }

  console.log(`Updated dayTemplates docs: ${updated}`);
  console.log(`Removed fields: ${FIELDS_TO_DELETE.join(', ')}`);
}

main().catch((error) => {
  console.error('Failed to remove fields from dayTemplates:', error);
  process.exit(1);
});

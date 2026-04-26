import admin from 'firebase-admin';
import serviceAccount from './serviceAccountKey.json' with { type: 'json' };

const SOURCE_COLLECTION = 'oldDays';

const PERIOD_TO_TARGET_COLLECTION = {
  advent: 'adventTmp',
  christmas: 'christmasTmp',
  ordinary: 'ordinaryTmp',
  lent: 'lentTmp',
  holyweek: 'holyweekTmp',
  easter: 'easterTmp',
};

const FIELDS_TO_KEEP = [
  '_dayOfWeek',
  '_periodType',
  '_periodWeekNumber',
  '_dayName',
  'invitatoriumAnt',
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
  'vesper1Hymn',
  'vesper1Ant1',
  'vesper1Ant2',
  'vesper1Ant3',
  'vesper1Ps1',
  'vesper1Ps2',
  'vesper1Ps3',
  'vesper1R',
  'vesper1AntMag',
  'vesper1Inter',
  'vesper1Pr',
];

const PERIOD_RANGES = [
  { start: '2019-12-01', end: '2019-12-24', period: 'advent' },
  { start: '2019-12-25', end: '2020-01-12', period: 'christmas' },

  { start: '2020-01-13', end: '2020-02-25', period: 'ordinary' },
  { start: '2020-02-26', end: '2020-04-04', period: 'lent' },
  { start: '2020-04-05', end: '2020-04-11', period: 'holyweek' },
  { start: '2020-04-12', end: '2020-05-31', period: 'easter' },
  { start: '2020-06-01', end: '2020-11-28', period: 'ordinary' },
  { start: '2020-11-29', end: '2020-12-24', period: 'advent' },
  { start: '2020-12-25', end: '2021-01-10', period: 'christmas' },

  { start: '2021-01-11', end: '2021-02-16', period: 'ordinary' },
  { start: '2021-02-17', end: '2021-03-27', period: 'lent' },
  { start: '2021-03-28', end: '2021-04-03', period: 'holyweek' },
  { start: '2021-04-04', end: '2021-05-23', period: 'easter' },
  { start: '2021-05-24', end: '2021-11-27', period: 'ordinary' },
  { start: '2021-11-28', end: '2021-12-24', period: 'advent' },
  { start: '2021-12-25', end: '2022-01-09', period: 'christmas' },

  { start: '2022-01-10', end: '2022-03-01', period: 'ordinary' },
  { start: '2022-03-02', end: '2022-04-09', period: 'lent' },
  { start: '2022-04-10', end: '2022-04-16', period: 'holyweek' },
  { start: '2022-04-17', end: '2022-06-05', period: 'easter' },
  { start: '2022-06-06', end: '2022-11-26', period: 'ordinary' },
  { start: '2022-11-27', end: '2022-12-24', period: 'advent' },
  { start: '2022-12-25', end: '2023-01-08', period: 'christmas' },

  { start: '2023-01-09', end: '2023-02-21', period: 'ordinary' },
  { start: '2023-02-22', end: '2023-04-01', period: 'lent' },
  { start: '2023-04-02', end: '2023-04-08', period: 'holyweek' },
  { start: '2023-04-09', end: '2023-05-28', period: 'easter' },
  { start: '2023-05-29', end: '2023-12-02', period: 'ordinary' },
  { start: '2023-12-03', end: '2023-12-24', period: 'advent' },
  { start: '2023-12-25', end: '2024-01-07', period: 'christmas' },

  { start: '2024-01-08', end: '2024-02-13', period: 'ordinary' },
  { start: '2024-02-14', end: '2024-03-23', period: 'lent' },
  { start: '2024-03-24', end: '2024-03-30', period: 'holyweek' },
  { start: '2024-03-31', end: '2024-05-19', period: 'easter' },
  { start: '2024-05-20', end: '2024-11-30', period: 'ordinary' },
  { start: '2024-12-01', end: '2024-12-24', period: 'advent' },
  { start: '2024-12-25', end: '2025-01-12', period: 'christmas' },

  { start: '2025-01-13', end: '2025-03-04', period: 'ordinary' },
  { start: '2025-03-05', end: '2025-04-12', period: 'lent' },
  { start: '2025-04-13', end: '2025-04-19', period: 'holyweek' },
  { start: '2025-04-20', end: '2025-06-08', period: 'easter' },
  { start: '2025-06-09', end: '2025-11-29', period: 'ordinary' },
  { start: '2025-11-30', end: '2025-12-24', period: 'advent' },
  { start: '2025-12-25', end: '2026-01-11', period: 'christmas' },
];

const BATCH_SIZE = 200;
const MAX_BATCH_BYTES = 8 * 1024 * 1024;
const MAX_COMMIT_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 1_000;

function getPeriodByDate(dateId) {
  const match = PERIOD_RANGES.find(({ start, end }) => dateId >= start && dateId <= end);
  return match?.period ?? null;
}

function buildPayload(data, period) {
  const payload = {};

  for (const key of FIELDS_TO_KEEP) {
    if (key === '_periodType') {
      payload[key] = period;
      continue;
    }

    if (Object.hasOwn(data, key)) {
      payload[key] = data[key];
    }
  }

  return payload;
}

async function migrate() {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  const sourceSnapshot = await db
    .collection(SOURCE_COLLECTION)
    .where(admin.firestore.FieldPath.documentId(), '>=', '2019-12-01')
    .where(admin.firestore.FieldPath.documentId(), '<=', '2026-01-11')
    .orderBy(admin.firestore.FieldPath.documentId())
    .get();

  let migrated = 0;
  let skipped = 0;
  let committed = 0;
  const pendingWrites = [];
  let pendingBytes = 0;

  const isDeadlineError = (error) =>
    error?.code === 4 || String(error?.details ?? '').includes('Deadline exceeded');
  const isPayloadTooLargeError = (error) =>
    error?.code === 3 || String(error?.details ?? '').includes('Request payload size exceeds the limit');

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const commitChunk = async (writes, depth = 0) => {
    let attempt = 0;
    while (attempt <= MAX_COMMIT_RETRIES) {
      try {
        const batch = db.batch();
        for (const write of writes) {
          batch.set(write.ref, write.payload, { merge: false });
        }
        await batch.commit();
        committed += writes.length;
        return;
      } catch (error) {
        const canRetry = isDeadlineError(error) && attempt < MAX_COMMIT_RETRIES;
        if (canRetry) {
          const delay = BASE_RETRY_DELAY_MS * 2 ** attempt;
          console.warn(
            `Commit retry ${attempt + 1}/${MAX_COMMIT_RETRIES} for ${writes.length} docs after deadline. Waiting ${delay}ms...`,
          );
          await sleep(delay);
          attempt += 1;
          continue;
        }

        const canSplit = (isDeadlineError(error) || isPayloadTooLargeError(error)) && writes.length > 1 && depth < 10;
        if (canSplit) {
          const middle = Math.ceil(writes.length / 2);
          const left = writes.slice(0, middle);
          const right = writes.slice(middle);
          console.warn(`Splitting failed chunk (${writes.length}) into ${left.length} + ${right.length}.`);
          await commitChunk(left, depth + 1);
          await commitChunk(right, depth + 1);
          return;
        }

        throw error;
      }
    }
  };

  const flushPendingWrites = async () => {
    if (pendingWrites.length === 0) {
      return;
    }

    const writesToCommit = pendingWrites.splice(0, pendingWrites.length);
    pendingBytes = 0;
    await commitChunk(writesToCommit);
  };

  for (const doc of sourceSnapshot.docs) {
    const dateId = doc.id;
    const period = getPeriodByDate(dateId);

    if (!period) {
      skipped += 1;
      continue;
    }

    const targetCollection = PERIOD_TO_TARGET_COLLECTION[period];
    if (!targetCollection) {
      skipped += 1;
      continue;
    }

    const payload = buildPayload(doc.data(), period);
    const targetRef = db.collection(targetCollection).doc(dateId);
    const payloadSize = Buffer.byteLength(JSON.stringify(payload)) + Buffer.byteLength(dateId) + 256;

    pendingWrites.push({ ref: targetRef, payload });
    pendingBytes += payloadSize;
    migrated += 1;

    if (pendingWrites.length >= BATCH_SIZE || pendingBytes >= MAX_BATCH_BYTES) {
      await flushPendingWrites();
    }
  }

  await flushPendingWrites();

  console.log(JSON.stringify({ sourceDocs: sourceSnapshot.size, migrated, committed, skipped }, null, 2));
}

migrate().catch((error) => {
  console.error(error);
  process.exit(1);
});

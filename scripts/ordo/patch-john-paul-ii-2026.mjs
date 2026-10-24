#!/usr/bin/env node
/**
 * Source-approved, single-document correction for St John Paul II (22 October).
 *
 * OFFLINE PRECHECK (no Firestore): node scripts/ordo/patch-john-paul-ii-2026.mjs
 * LIVE DRY RUN: node scripts/ordo/patch-john-paul-ii-2026.mjs --service-account /private/key.json
 * APPLY: node scripts/ordo/patch-john-paul-ii-2026.mjs --service-account /private/key.json --apply
 *
 * The owner explicitly approved only:
 *   святога Ян Павел ІІ, папа → святы Ян Павел ІІ, папа
 *   Адчыніце дзверы Хрусту! → Адчыніце дзверы Хрысту!
 *
 * It patches only two fields of liturgicalProperTexts/22-10-sv-john-paul-ii
 * and, atomically, increments liturgicalCalendarMeta/current.properTextsRevision.
 * No other documents, words, rubrics, days, templates or contentManifest are changed.
 * Publication to Flutter requires a separate, validated content:manifest patch.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PROPER_ID = '22-10-sv-john-paul-ii';
export const PROPER_COLLECTION = 'liturgicalProperTexts';
const corrections = Object.freeze({
  officeOfReadingsPr: { before: 'святога Ян Павел ІІ, папа', after: 'святы Ян Павел ІІ, папа' },
  officeOfReadingsR2: { before: 'Адчыніце дзверы Хрусту!', after: 'Адчыніце дзверы Хрысту!' },
});

function exactOnce(text, part) {
  return typeof text === 'string' && text.split(part).length === 2;
}

/**
 * Reconstruct only the exact pre-correction wording.
 *
 * In the Office reading, "Адчыніце дзверы Хрысту!" appears twice: in the
 * heading (already correct in the legacy source), and in the responsory (the
 * ONLY place where the user authorized correcting "Хрусту").
 * Replacing the first occurrence corrupts our production comparison.
 */
function reconstructBefore(field, current, { before, after }) {
  if (typeof current !== 'string' || current.includes(before)) {
    throw new Error(`Unapproved or unexpected source wording in ${field}.`);
  }
  if (field === 'officeOfReadingsR2') {
    const marker = 'Рэспансорый</span>';
    if (!exactOnce(current, marker)) {
      throw new Error('Missing or duplicated responsory heading in the approved text.');
    }
    const pivot = current.indexOf(marker);
    const heading = current.slice(0, pivot);
    const responsory = current.slice(pivot);
    // The heading was already "Хрысту"; only the responsory was "Хрусту".
    if (!exactOnce(heading, after) || !exactOnce(responsory, after)) {
      throw new Error('Expected exactly one approved phrase in both heading and responsory.');
    }
    return heading + responsory.replace(after, before);
  }
  if (!exactOnce(current, after)) {
    throw new Error(`Expected exactly one approved name phrase in ${field}.`);
  }
  return current.replace(after, before);
}

export function expectedWording(root = ROOT) {
  const read = (subdir) => JSON.parse(fs.readFileSync(path.join(root, 'patchs', subdir, `${PROPER_ID}.json`), 'utf8'));
  const source = read('feasts');
  const generated = read('db-feasts');
  if (generated._id !== PROPER_ID || generated._schema !== 2 || generated._date !== '22.10') {
    throw new Error('The generated Proper identity/schema/date differs from the approved target.');
  }
  const result = {};
  for (const [field, { before, after }] of Object.entries(corrections)) {
    const expected = source[field];
    if (generated[field] !== expected) {
      throw new Error(`The source and generated ${field} are not identical, approved texts.`);
    }
    result[field] = { before: reconstructBefore(field, expected, { before, after }), after: expected };
  }
  if (generated._fieldRules?.laudesPr?.ref !== 'officeOfReadingsPr'
      || generated._fieldRules?.vesperPr?.ref !== 'officeOfReadingsPr') {
    throw new Error('Unexpected Proper prayer references for Lauds or Vespers.');
  }
  return result;
}

export function verifyLiveDocument(live, expected) {
  if (!live) throw new Error(`Missing ${PROPER_COLLECTION}/${PROPER_ID}; refusing to create a new document.`);
  const changed = [];
  for (const [field, versions] of Object.entries(expected)) {
    const current = live[field];
    if (current === versions.before) changed.push(field);
    else if (current !== versions.after) {
      throw new Error(`Unexpected production ${field} text: not equal to the verified before/after version. No write permitted.`);
    }
  }
  return changed;
}

function parseArgs(argv) {
  const result = { apply: false, serviceAccount: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--apply') result.apply = true;
    else if (argv[i] === '--service-account') {
      result.serviceAccount = argv[++i];
      if (!result.serviceAccount || result.serviceAccount.startsWith('--')) throw new Error('Missing --service-account path.');
    } else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (result.apply && !result.serviceAccount) throw new Error('Explicit --service-account required for --apply.');
  return result;
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const expected = expectedWording();
  console.log(JSON.stringify({
    status: 'source-and-generated-files-verified',
    target: `${PROPER_COLLECTION}/${PROPER_ID}`,
    changedFields: Object.keys(expected),
    mode: opts.apply ? 'apply' : 'dry-run',
  }, null, 2));
  if (!opts.serviceAccount) {
    console.log('Offline only. No live Firestore read or write; pass --service-account for live diff.');
    return { offline: true };
  }

  const key = JSON.parse(fs.readFileSync(path.resolve(opts.serviceAccount), 'utf8'));
  const { default: admin } = await import('firebase-admin');
  const app = admin.initializeApp({
    credential: admin.credential.cert(key),
    projectId: key.project_id,
  }, `approved-jp2-${Date.now()}`);
  try {
    const db = admin.firestore(app);
    const properRef = db.collection(PROPER_COLLECTION).doc(PROPER_ID);
    const metaRef = db.collection('liturgicalCalendarMeta').doc('current');
    const [properSnapshot, metaSnapshot] = await Promise.all([properRef.get(), metaRef.get()]);
    if (!properSnapshot.exists || !metaSnapshot.exists) throw new Error('Expected live Proper and meta documents must both exist.');
    const live = properSnapshot.data();
    const changed = verifyLiveDocument(live, expected);
    const revision = metaSnapshot.data()?.properTextsRevision;
    if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Invalid live properTextsRevision; refusing an unsafe update.');
    console.log(JSON.stringify({ liveProject: key.project_id, plannedChangedFields: changed, revisionBefore: revision, revisionAfter: changed.length ? revision + 1 : revision }));
    if (!opts.apply || changed.length === 0) {
      console.log(changed.length ? 'Dry-run only. Firestore unchanged.' : 'Already corrected; no changes necessary.');
      return { changed, published: false };
    }

    // Capture a local private rollback record before attempting any transaction.
    const dir = path.join(ROOT, 'backups', 'ordo-feasts');
    fs.mkdirSync(dir, { recursive: true });
    const filename = path.join(dir, `john-paul-ii-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(filename, JSON.stringify({
      collection: PROPER_COLLECTION, id: PROPER_ID, projectId: key.project_id,
      before: Object.fromEntries(Object.keys(expected).map((field) => [field, live[field]])),
      properTextsRevision: revision,
      capturedAt: new Date().toISOString(),
    }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(`Private rollback record saved: ${path.relative(ROOT, filename)}`);

    const outcome = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(properRef);
      const meta = await transaction.get(metaRef);
      if (!doc.exists || !meta.exists) throw new Error('Document disappeared before apply.');
      const data = doc.data();
      const actual = verifyLiveDocument(data, expected);
      if (!Number.isSafeInteger(meta.data()?.properTextsRevision) || meta.data().properTextsRevision < 0) {
        throw new Error('Unexpected metadata revision.');
      }
      if (actual.length === 0) return { changed: [], revision: meta.data().properTextsRevision };
      const updates = Object.fromEntries(actual.map((field) => [field, expected[field].after]));
      transaction.update(properRef, updates);
      transaction.set(metaRef, { properTextsRevision: meta.data().properTextsRevision + 1 }, { merge: true });
      return { changed: actual, revision: meta.data().properTextsRevision + 1 };
    });
    console.log(JSON.stringify({ status: 'single-proper-transaction-applied', ...outcome, nextStep: 'Run the separately reviewed content:manifest dry-run and SAFE CONTENT PATCH apply.' }));
    return outcome;
  } finally {
    await app.delete();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}

#!/usr/bin/env node
/**
 * Issue #198 only. Updates just contentManifest/days.hashes[ordinary-w30-d6],
 * its size and the two corresponding digests/versions. All other manifest
 * entries remain exactly as published, even if live days has pending changes.
 * Default is read-only. --apply requires approved production release workflow.
 */
import fs from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';
import { CONTENT_SCHEMA_VERSION, collectionDigest, documentHash, storedDocument, validateCollection } from './lib/app-content.mjs';
import { TARGET, SOURCE, FEAST, VESPER_FIELDS } from '../liturgy/lib/ordinary-friday-vespers.mjs';

function assertThat(condition, message) {
  if (!condition) throw new Error(message);
}

export function planSingleDayManifest({ current, index, target, source, feast, now = Date.now() }) {
  assertThat(current && index && target && source && feast, 'Missing manifest or verification document');
  assertThat(current.schemaVersion === CONTENT_SCHEMA_VERSION, 'Content schema mismatch');
  assertThat(target._periodType === 'ordinary' && Number(target._periodWeekNumber) === 30
    && Number(target._dayOfWeek) === 6, 'Unexpected target selector');
  assertThat(source._periodType === 'ordinary' && Number(source._periodWeekNumber) === 2
    && Number(source._dayOfWeek) === 6, 'Unexpected psalter selector');
  for (const field of VESPER_FIELDS) {
    assertThat(typeof target[field] === 'string' && target[field].trim()
      && target[field] === source[field], 'Uncorrected or unexpected Friday field: ' + field);
    const first = field.replace(/^vesper/, 'vesper1');
    assertThat(target[field] !== feast[first], 'All Saints content still present: ' + field);
  }
  const stored = storedDocument(TARGET, target);
  assertThat(validateCollection('days', [stored]).length === 0, 'Invalid corrected day');
  assertThat(index.collection === 'days' && index.hashes && index.sizes
    && typeof index.hashes === 'object' && typeof index.sizes === 'object', 'Missing published days manifest');
  const ids = Object.keys(index.hashes);
  assertThat(ids.includes(TARGET) && Object.keys(index.sizes).length === ids.length
    && ids.every(id => Number.isFinite(index.sizes[id])), 'Invalid published hashes/sizes');
  const digestBefore = collectionDigest(index.hashes);
  const advertised = current.collections?.days;
  assertThat(index.digest === digestBefore && advertised?.digest === digestBefore,
    'Published current/index digests mismatch');
  assertThat(advertised.version === index.version && advertised.count === ids.length,
    'Published days version/count mismatch');
  assertThat(Number.isSafeInteger(index.version) && index.version >= 1, 'Invalid collection version');
  const hash = documentHash(stored);
  const size = Buffer.byteLength(JSON.stringify(stored));
  const beforeHash = index.hashes[TARGET];
  const changed = beforeHash !== hash || index.sizes[TARGET] !== size;
  const newHashes = { ...index.hashes, [TARGET]: hash };
  const newSizes = { ...index.sizes, [TARGET]: size };
  const newDigest = collectionDigest(newHashes);
  const newBytes = Object.values(newSizes).reduce((a, b) => a + b, 0);
  const version = index.version + (changed ? 1 : 0);
  const nextIndex = changed ? { ...index, hashes: newHashes, sizes: newSizes,
    digest: newDigest, version } : index;
  const nextCurrent = changed ? { ...current,
    contentVersion: Math.max(now, Number(current.contentVersion || 0) + 1),
    publishedAt: new Date(now).toISOString(),
    collections: { ...current.collections, days: { ...advertised,
      digest: newDigest, count: ids.length, bytes: newBytes, version } },
  } : current;
  assertThat(ids.every(id => id === TARGET || nextIndex.hashes[id] === index.hashes[id]
    && nextIndex.sizes[id] === index.sizes[id]), 'Unrelated manifest changes');
  return { changed, beforeHash, afterHash: hash, digestBefore, digestAfter: newDigest,
    versionBefore: index.version, versionAfter: version, sizeBefore: index.sizes[TARGET],
    sizeAfter: size, nextIndex, nextCurrent };
}

export async function run({ apply = false, keyPath }) {
  assertThat(keyPath && fs.existsSync(keyPath), 'Missing private service account');
  const credentials = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  assertThat(credentials.project_id === 'ibreviaryby', 'Wrong Firebase project');
  const app = admin.initializeApp({ credential: admin.credential.cert(credentials), projectId: credentials.project_id },
    'issue-198-manifest-' + Date.now());
  try {
    const db = admin.firestore(app);
    db.settings({ preferRest: true });
    const currentRef = db.collection('contentManifest').doc('current');
    const indexRef = db.collection('contentManifest').doc('days');
    const targetRef = db.collection('days').doc(TARGET);
    const sourceRef = db.collection('days').doc(SOURCE);
    const feastRef = db.collection('days').doc(FEAST);
    const summary = await db.runTransaction(async tx => {
      const [c, i, t, s, f] = await Promise.all([
        tx.get(currentRef), tx.get(indexRef), tx.get(targetRef), tx.get(sourceRef), tx.get(feastRef),
      ]);
      assertThat([c, i, t, s, f].every(x => x.exists), 'Required production document missing');
      const plan = planSingleDayManifest({
        current: c.data(), index: i.data(), target: t.data(), source: s.data(), feast: f.data(),
      });
      if (apply && plan.changed) {
        tx.set(indexRef, plan.nextIndex);
        tx.set(currentRef, plan.nextCurrent);
      }
      return { changed: plan.changed, beforeHash: plan.beforeHash, afterHash: plan.afterHash,
        previousDigest: plan.digestBefore, newDigest: plan.digestAfter,
        versionBefore: plan.versionBefore, versionAfter: plan.versionAfter,
        bytesBefore: plan.sizeBefore, bytesAfter: plan.sizeAfter };
    });
    if (apply) {
      const [c, i, t] = await Promise.all([currentRef.get(), indexRef.get(), targetRef.get()]);
      assertThat(c.exists && i.exists && t.exists, 'Post-commit readback missing');
      const published = i.data();
      const hash = documentHash(storedDocument(TARGET, t.data()));
      assertThat(published.hashes[TARGET] === hash && published.digest === collectionDigest(published.hashes)
        && c.data().collections.days.digest === published.digest,
      'Post-commit manifest readback failed');
    }
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', target: TARGET,
      ...summary, unrelatedDocumentsPublished: 0 }));
    return summary;
  } finally {
    await app.delete();
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  if (args.some(x => x !== '--apply' && x !== '--service-account' && x !== process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    console.error('Expected --service-account <path> [--apply]');
    process.exitCode = 1;
  } else {
    run({ apply: args.includes('--apply'),
      keyPath: args[args.indexOf('--service-account') + 1] || process.env.GOOGLE_APPLICATION_CREDENTIALS })
      .catch(e => { console.error(e.message); process.exitCode = 1; });
  }
}

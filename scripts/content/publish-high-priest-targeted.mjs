#!/usr/bin/env node
/**
 * Exact 3-document publication; defaults to read-only.
 *
 * node scripts/content/publish-high-priest-targeted.mjs \
 *   --service-account /secure/key.json
 *
 * Apply only after review:
 * node scripts/content/publish-high-priest-targeted.mjs \
 *   --service-account /secure/key.json --apply --approved
 *
 * Reads: days/feast-christthehighpriest and contentManifest/{days,current}.
 * Writes: the same three documents in one optimistic, atomic batch. Every
 * write has lastUpdateTime preconditions to stop concurrent modifications.
 * Never scans the days collection or invokes the full-manifest publisher.
 */
import fs from 'node:fs/promises';
import {
  CONTENT_SCHEMA_VERSION,
  classifyPatch,
  collectionDigest,
  diffCollection,
  documentHash,
  storedDocument,
  validateCollection,
} from './lib/app-content.mjs';
import { publicationDecision } from './publish-manifest.mjs';
import {
  HIGH_PRIEST_ID, HIGH_PRIEST_FIELDS, planHighPriestTargetedRelease,
} from './high-priest-targeted-plan.mjs';

const args = process.argv.slice(2);
const input = args.indexOf('--service-account');
if (input < 0 || !args[input + 1]) throw new Error('Pass --service-account /path/to/key.json');
const allowed = new Set(['--service-account', '--apply', '--approved']);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--service-account') { i++; continue; }
  if (!allowed.has(args[i])) throw new Error('Unsupported argument: ' + args[i]);
}
const applying = args.includes('--apply');
if (applying !== args.includes('--approved')) {
  throw new Error('--apply requires explicit --approved; --approved requires --apply');
}

const { default: admin } = await import('firebase-admin');
const credentials = JSON.parse(await fs.readFile(args[input + 1], 'utf8'));
if (credentials.project_id !== 'ibreviaryby') throw new Error('Wrong Firebase project');
const app = admin.initializeApp({
  credential: admin.credential.cert(credentials), projectId: credentials.project_id,
}, 'targeted-high-priest-release');
const db = admin.firestore(app);
db.settings({ preferRest: true });
const refDay = db.doc('days/' + HIGH_PRIEST_ID);
const refDays = db.doc('contentManifest/days');
const refCurrent = db.doc('contentManifest/current');

try {
  const [daySnapshot, daysSnapshot, currentSnapshot] = await Promise.all([
    refDay.get(), refDays.get(), refCurrent.get(),
  ]);
  if (![daySnapshot, daysSnapshot, currentSnapshot].every(snap => snap.exists && snap.updateTime)) {
    throw new Error('Missing production document or updateTime; refusing publication');
  }
  const day = storedDocument(daySnapshot.id, daySnapshot.data());
  const previousDays = daysSnapshot.data();
  const previousCurrent = currentSnapshot.data();
  const plan = planHighPriestTargetedRelease({
    day, days: previousDays, current: previousCurrent, now: Date.now(),
    ops: {
      schemaVersion: CONTENT_SCHEMA_VERSION, documentHash, collectionDigest,
      validateDay: doc => validateCollection('days', [doc]).length === 0,
    },
  });
  if (plan.kind === 'already-published') {
    console.log(JSON.stringify({
      result: 'ALREADY PUBLISHED', target: HIGH_PRIEST_ID,
      targetHash: plan.before, writes: 0,
    }));
    process.exitCode = 0;
  } else {
    const described = {
      hashes: plan.nextDays.hashes, sizes: plan.nextDays.sizes,
      digest: plan.nextDays.digest, count: plan.count, bytes: plan.nextBytes,
    };
    const diff = diffCollection('days', described, previousDays);
    const classification = classifyPatch([diff], { publishedSchema: previousCurrent.schemaVersion });
    const decision = publicationDecision(classification.verdict);
    if (classification.verdict !== 'SAFE CONTENT PATCH'
      || !decision.publish || diff.added.length || diff.removed.length
      || diff.changed.length !== 1 || diff.changed[0] !== HIGH_PRIEST_ID) {
      throw new Error('Unexpected manifest diff; refusing publication');
    }
    console.log(JSON.stringify({
      result: applying ? 'APPLYING APPROVED PATCH' : 'SAFE CONTENT PATCH (DRY RUN)',
      document: 'days/' + HIGH_PRIEST_ID,
      before: plan.before, after: plan.after,
      fields: HIGH_PRIEST_FIELDS,
      collectionCount: plan.count, collectionBytesAfter: plan.nextBytes,
      targetStoredBytesAfter: plan.storedBytes,
      currentDaysVersion: previousDays.version, nextDaysVersion: plan.version,
      oldDigest: plan.originalDigest, nextDigest: plan.nextDigest,
      manifestAdded: diff.added.length, manifestChanged: diff.changed,
      manifestRemoved: diff.removed.length, writes: applying ? 3 : 0,
      // Version preconditions are checked during atomic commit, not only here.
      preconditions: 'all three Firestore updateTime values',
    }, null, 2));

    if (applying) {
      const batch = db.batch();
      batch.update(refDay, plan.set, { lastUpdateTime: daySnapshot.updateTime });
      batch.update(refDays, {
        hashes: plan.nextDays.hashes, sizes: plan.nextDays.sizes,
        digest: plan.nextDays.digest, version: plan.nextDays.version,
      }, { lastUpdateTime: daysSnapshot.updateTime });
      batch.update(refCurrent, {
        collections: plan.nextCurrent.collections,
        contentVersion: plan.nextCurrent.contentVersion,
        publishedAt: plan.nextCurrent.publishedAt,
      }, { lastUpdateTime: currentSnapshot.updateTime });
      await batch.commit();
      const [verifyDay, verifyDays, verifyCurrent] = await Promise.all([
        refDay.get(), refDays.get(), refCurrent.get(),
      ]);
      const actualHash = documentHash(storedDocument(verifyDay.id, verifyDay.data()));
      if (actualHash !== plan.after
        || verifyDays.data()?.digest !== plan.nextDigest
        || verifyDays.data()?.hashes?.[HIGH_PRIEST_ID] !== plan.after
        || verifyCurrent.data()?.collections?.days?.digest !== plan.nextDigest
        || verifyCurrent.data()?.contentVersion !== plan.contentVersion) {
        throw new Error('Post-commit verification failed; inspect production immediately');
      }
      console.log(JSON.stringify({
        result: 'PUBLISHED AND VERIFIED', document: 'days/' + HIGH_PRIEST_ID,
        targetHash: actualHash, digest: plan.nextDigest, writes: 3,
      }));
    }
  }
} finally {
  await app.delete();
}

#!/usr/bin/env node
/**
 * XI Sunday I Vespers — publish exactly one day and its two manifest documents
 * atomically, with lastUpdateTime preconditions and no collection scans.
 *
 * Default: dry-run, 3 Firestore document reads, zero writes.
 * --apply --approved: one atomic batch touching only
 *   days/ordinary-w11-d1, contentManifest/days, contentManifest/current.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';
import { validateXiSundaySource, planXiSundayPatch, XI_FIELDS, XI_SOURCE_PATH, XI_TARGET } from '../liturgy/patch-xi-sunday-first-vespers.mjs';
import {
  CONTENT_SCHEMA_VERSION, collectionDigest, documentHash, storedDocument, validateCollection,
} from './lib/app-content.mjs';

const assert = (okay, message) => { if (!okay) throw new Error(message); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function planXiSundayAtomicRelease({ day, index, current, fields, now = Date.now() }) {
  const patch = planXiSundayPatch(day, fields);
  assert(!patch.conflicts.length, 'Conflicting nonempty I-Vespers fields; no publication');
  assert(index?.collection === 'days' && index?.hashes && index?.sizes, 'Missing published days manifest');
  assert(current?.schemaVersion === CONTENT_SCHEMA_VERSION, 'Content schema mismatch');
  const keys = Object.keys(index.hashes);
  assert(keys.includes(XI_TARGET) && keys.length === Object.keys(index.sizes).length
    && keys.every(key => Number.isFinite(index.sizes[key])), 'Invalid published manifest index');
  const digestBefore = collectionDigest(index.hashes);
  const advertised = current.collections?.days;
  assert(digestBefore === index.digest && advertised?.digest === digestBefore, 'Published index/current mismatch');
  assert(Number.isSafeInteger(index.version) && index.version >= 1
    && advertised?.version === index.version && advertised?.count === keys.length, 'Published version/count mismatch');
  const nextDay = { ...day, ...patch.updates };
  assert(XI_FIELDS.every(key => nextDay[key] === fields[key]), 'Unverified Sunday I Vespers field');
  assert(validateCollection('days', [storedDocument(XI_TARGET, nextDay)]).length === 0, 'Invalid new day schema');
  const doc = storedDocument(XI_TARGET, nextDay);
  const hash = documentHash(doc);
  const size = Buffer.byteLength(JSON.stringify(doc));
  const changedIndex = index.hashes[XI_TARGET] !== hash || index.sizes[XI_TARGET] !== size;
  const changedDay = Object.keys(patch.updates).length > 0;
  assert(!changedDay || changedIndex, 'New day text already advertised by old manifest; inconsistent state');
  const hashes = { ...index.hashes, [XI_TARGET]: hash };
  const sizes = { ...index.sizes, [XI_TARGET]: size };
  const digest = collectionDigest(hashes);
  const version = index.version + (changedIndex ? 1 : 0);
  const bytes = Object.values(sizes).reduce((sum, x) => sum + x, 0);
  const nextIndex = changedIndex
    ? { ...index, hashes, sizes, digest, version }
    : index;
  const nextCurrent = changedIndex
    ? { ...current, contentVersion: Math.max(now, Number(current.contentVersion || 0) + 1),
      publishedAt: new Date(now).toISOString(),
      collections: { ...current.collections,
        days: { ...advertised, digest, version, count: keys.length, bytes } } }
    : current;
  assert(keys.every(key => key === XI_TARGET || nextIndex.hashes[key] === index.hashes[key]
    && nextIndex.sizes[key] === index.sizes[key]), 'Unrelated content included in manifest patch');
  for (const collection of Object.keys(current.collections || {})) {
    if (collection !== 'days') assert(same(nextCurrent.collections[collection], current.collections[collection]), 'Unrelated manifest collection');
  }
  return {
    status: changedIndex ? 'SAFE SINGLE DAY CONTENT PATCH' : 'ALREADY PUBLISHED',
    dayUpdates: patch.updates, changedIndex,
    oldHash: index.hashes[XI_TARGET], newHash: hash,
    oldDigest: digestBefore, newDigest: digest, versionBefore: index.version, versionAfter: version,
    nextIndex, nextCurrent,
  };
}

function options(argv) {
  const args = { apply: argv.includes('--apply'), approved: argv.includes('--approved'),
    keyPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || '' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--service-account') args.keyPath = argv[++i];
    else if (argv[i] !== '--apply' && argv[i] !== '--approved') throw Error('Unknown argument ' + argv[i]);
  }
  if (args.apply !== args.approved) throw Error('--apply and --approved must be provided together');
  return args;
}

async function main() {
  const args = options(process.argv.slice(2));
  assert(args.keyPath && fs.existsSync(args.keyPath), 'Missing service account');
  const credential = JSON.parse(fs.readFileSync(args.keyPath, 'utf8'));
  assert(credential.project_id === 'ibreviaryby', 'Wrong Firebase project');
  const fields = validateXiSundaySource(JSON.parse(fs.readFileSync(XI_SOURCE_PATH, 'utf8')));
  const app = admin.initializeApp({
    credential: admin.credential.cert(credential), projectId: 'ibreviaryby',
  }, 'xi-sunday-targeted-' + process.pid);
  try {
    const db = admin.firestore(app);
    db.settings({ preferRest: true });
    const target = db.doc('days/' + XI_TARGET);
    const idx = db.doc('contentManifest/days');
    const current = db.doc('contentManifest/current');
    const [d, i, c] = await Promise.all([target.get(), idx.get(), current.get()]);
    assert([d,i,c].every(snap => snap.exists && snap.updateTime), 'One of three required documents missing');
    const plan = planXiSundayAtomicRelease({
      day: d.data(), index: i.data(), current: c.data(), fields,
    });
    console.log(JSON.stringify({
      mode: args.apply ? 'apply' : 'dry-run', status: plan.status,
      target: 'days/' + XI_TARGET, changedFields: Object.keys(plan.dayUpdates),
      oldHash: plan.oldHash, newHash: plan.newHash,
      oldDigest: plan.oldDigest, newDigest: plan.newDigest,
      versionBefore: plan.versionBefore, versionAfter: plan.versionAfter,
      writeDocuments: args.apply && plan.changedIndex ? (Object.keys(plan.dayUpdates).length ? 3 : 2) : 0,
      otherDocumentsAffected: 0,
    }, null, 2));
    if (!args.apply || !plan.changedIndex) return;

    const backup = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../backups/liturgy');
    fs.mkdirSync(backup, { recursive: true });
    const filename = path.join(backup, 'xi-sunday-first-vespers-atomic-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
    fs.writeFileSync(filename, JSON.stringify({
      document: 'days/' + XI_TARGET, priorUpdateTime: d.updateTime.toDate().toISOString(),
      priorDay: d.data(), originalDaysManifest: i.data(), originalCurrentManifest: c.data(),
    }, null, 2) + '\n', { mode: 0o600 });
    console.log('Backup: ' + path.relative(process.cwd(), filename));

    const batch = db.batch();
    if (Object.keys(plan.dayUpdates).length) batch.update(target, plan.dayUpdates, { lastUpdateTime: d.updateTime });
    batch.update(idx, plan.nextIndex, { lastUpdateTime: i.updateTime });
    batch.update(current, plan.nextCurrent, { lastUpdateTime: c.updateTime });
    await batch.commit();

    const [dd,ii,cc] = await Promise.all([target.get(),idx.get(),current.get()]);
    const actualHash = documentHash(storedDocument(XI_TARGET, dd.data()));
    assert(actualHash === plan.newHash && ii.data()?.hashes?.[XI_TARGET] === actualHash
      && ii.data()?.digest === plan.newDigest && cc.data()?.collections?.days?.digest === plan.newDigest
      && cc.data()?.contentVersion === plan.nextCurrent.contentVersion, 'Post-release verification failed');
    console.log(JSON.stringify({
      status: 'PUBLISHED AND VERIFIED', target: 'days/' + XI_TARGET, hash: actualHash,
      version: plan.versionAfter, manifestDigest: plan.newDigest,
    }));
  } finally {
    await app.delete();
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(e => { console.error('XI Sunday atomic release: ' + e.message); process.exitCode = 1; });
}

/** One exact metadata-only final-test publication. Ordinary MASS policy stays closed. */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';
import { APP_CONTENT_COLLECTIONS } from './app-content.mjs';
import { binarySha256, valueSha256, describeCatalog, coordinatedManifestPlan, publishCoordinatedManifest, manifestReceipt } from '../../liturgy/lib/coordinated-release.mjs';
export const REVIEWED_PLAN_SHA = '707e13042ed74996cf996aacbd9564c2dc3200448f05eca11946abe502d1e95a';
export const REVIEWED_DIR = 'docs/releases/final-test-2026-11-17';
const check = (v, why) => { if (!v) throw Error(why); };
export function loadReviewedManifest(file, expectedSha) {
  check(file === REVIEWED_DIR + '/plan.json' && expectedSha === REVIEWED_PLAN_SHA, 'Exact reviewed manifest plan required');
  const bytes = fs.readFileSync(file);
  check(binarySha256(bytes) === expectedSha, 'Reviewed plan SHA mismatch');
  const plan = JSON.parse(bytes);
  check(plan.schema === 1 && plan.project === 'ibreviaryby' && plan.policy === 'final-test-manifest-only-2026-11-17'
    && plan.ownerApproved === true && plan.contentWrites === 0 && plan.maxUncachedDocumentReads === 0 && plan.maxManifestWrites === 12
    && plan.bundleSha256 === '19ed6b4b8247baa4d97e20a8404975b6f539a9531bf9061e1b063f73c9e9152c'
    && plan.compatibility.mobileReleasePerformed === false && plan.compatibility.installedClientInventory === 'not-available', 'Invalid final-test metadata policy');
  check(isDeepStrictEqual([...APP_CONTENT_COLLECTIONS].sort(), plan.collections), 'Only all existing public app collections may be described');
  check(valueSha256(JSON.parse(fs.readFileSync(REVIEWED_DIR + '/owner-question-plan.json'))) === plan.ownerQuestionPlanSha256, 'Owner question plan changed');
  const proofBytes = fs.readFileSync(REVIEWED_DIR + '/compatibility.json');
  check(binarySha256(proofBytes) === 'd9589d61bbbf10c910b46f3af10f38baf374e6ffaa67089c9a851d27a2e74b14', 'Full-bundle compatibility proof changed');
  const proof = JSON.parse(proofBytes);
  check(proof.status === 'passed' && proof.passed === 2 && proof.failed === 0 && proof.bundleSha256 === plan.bundleSha256
    && proof.settingsFavoritesPersonalPrayersPreserved === true && proof.firebaseReads === 0 && proof.firebaseWrites === 0
    && binarySha256(fs.readFileSync(REVIEWED_DIR + '/legacy-full-bundle-tests.jsonl.gz')) === proof.logsSha256
    && binarySha256(fs.readFileSync(REVIEWED_DIR + '/legacy-full-bundle-test.dart.txt')) === proof.sourceSha256, 'Full-bundle source/tests not verified');
  const catalogBytes = fs.readFileSync(REVIEWED_DIR + '/catalog.json.gz');
  check(binarySha256(catalogBytes) === plan.catalogSha256, 'Catalog SHA mismatch');
  const beforeBytes = fs.readFileSync(REVIEWED_DIR + '/manifest-before.json');
  check(binarySha256(beforeBytes) === plan.manifestRecordsSha256, 'Manifest records SHA mismatch');
  const catalog = JSON.parse(zlib.gunzipSync(catalogBytes)).documents;
  const manifests = new Map(Object.entries(JSON.parse(beforeBytes).records));
  const contract = { collections: plan.collections, expected: plan.expected, report: { contentVersion: plan.bundleContentVersion } };
  describeCatalog(catalog, contract);
  const planned = coordinatedManifestPlan(plan.expected, manifests, plan, contract);
  check(isDeepStrictEqual(planned.changed.sort(), [...plan.changedCollections].sort()) && planned.changed.length + 1 === plan.maxManifestWrites, 'Reviewed manifest scope changed');
  for (const [name, entry] of Object.entries(catalog)) check(name.split('/').length === 2 && plan.collections.includes(name.split('/')[0])
    && Number.isSafeInteger(entry.updateTime?.seconds) && Number.isSafeInteger(entry.updateTime?.nanoseconds), 'Invalid catalog timestamp/scope');
  return { plan, catalog, manifests, contract };
}

export async function executeReviewedManifest({ db, reviewed, previous = {}, journal }) {
  const { plan, catalog, manifests, contract } = reviewed;
  const refs = [...plan.collections.map(n => 'contentManifest/' + n), 'contentManifest/current'];
  const usage = { manifestDocumentReads: 0, metadataDocumentReads: 0, uncachedDocumentReads: 0 };
  const onReads = (kind, count) => { usage[kind] += count; journal({ firebaseUsage: { ...usage } }); };
  const readback = async payloads => {
    const docs = await db.getAll(...refs.map(n => db.doc(n))); onReads('manifestDocumentReads', refs.length);
    const records = new Map(docs.filter(d => d.exists).map(d => [d.ref.path, { data: d.data(), updateTime: { seconds: d.updateTime.seconds, nanoseconds: d.updateTime.nanoseconds } }]));
    return manifestReceipt(records, payloads);
  };
  if (previous.manifestAttempt) {
    check(previous.planSha256 === REVIEWED_PLAN_SHA && previous.manifestAttempt.writeDocuments.every(n => refs.includes(n)), 'Resume plan/scope mismatch');
    // Recovery only verifies the acknowledged/ambiguous atomic payload. It cannot repeat writes.
    const receipt = await readback(previous.manifestAttempt.payloads);
    await journal({ state: 'reviewed-manifest-readbacks-verified', manifestReceipt: receipt, resumedManifest: true, contentWrites: 0 });
    return;
  }
  const result = await publishCoordinatedManifest(db, { catalog: structuredClone(catalog), manifests, contract, authorization: plan, journal, onReads });
  const receipt = await readback(result.payloads);
  await journal({ state: 'reviewed-manifest-readbacks-verified', manifestReceipt: receipt, liveDigestGate: result.liveDigestGate,
    publishedCurrent: result.current, contentWrites: 0 });
}

export async function reviewedManifestMain(argv) {
  const accepted = new Set(['--reviewed-manifest-authorization', '--expected-plan-sha', '--service-account', '--receipt', '--resume', '--apply']);
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    check(accepted.has(argv[i]), 'Unreviewed flag refused: ' + argv[i]);
    if (argv[i] === '--apply') options.apply = true;
    else { check(argv[i + 1] && !argv[i + 1].startsWith('--'), 'Missing flag value'); options[argv[i]] = argv[++i]; }
  }
  const reviewed = loadReviewedManifest(options['--reviewed-manifest-authorization'], options['--expected-plan-sha']);
  if (!options.apply) { console.log('Verified exact metadata-only plan; Firebase reads/writes: 0/0'); return; }
  check(options['--receipt'] && options['--service-account'], 'Receipt and credential paths required');
  const receiptFile = options['--receipt']; fs.mkdirSync(path.dirname(receiptFile), { recursive: true });
  let state = options['--resume'] ? JSON.parse(fs.readFileSync(options['--resume'])) : {};
  const journal = update => {
    state = { ...state, ...update, schema: 1, project: 'ibreviaryby', planSha256: REVIEWED_PLAN_SHA };
    const fd = fs.openSync(receiptFile + '.tmp', 'w', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(state, null, 2) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(receiptFile + '.tmp', receiptFile);
  };
  // All immutable scope checks above precede credential/SDK access.
  const credential = JSON.parse(fs.readFileSync(options['--service-account']));
  check(credential.project_id === 'ibreviaryby', 'Wrong Firebase project');
  const { default: admin } = await import('firebase-admin');
  const app = admin.initializeApp({ credential: admin.credential.cert(credential), projectId: credential.project_id }, 'reviewed-final-test');
  const db = admin.firestore(app); db.settings({ preferRest: true });
  try {
    await executeReviewedManifest({ db, reviewed, previous: state, journal });
    console.log(JSON.stringify({ state: state.state, firebaseUsage: state.firebaseUsage, manifestWrites: state.manifestAttempt?.writeDocuments.length, contentWrites: 0 }));
  } catch (error) {
    journal({ state: 'reviewed-manifest-blocked', reason: error.message, code: error.code ?? null });
    throw error; // No retry, including RESOURCE_EXHAUSTED/unknown failures.
  } finally { await app.delete(); }
}

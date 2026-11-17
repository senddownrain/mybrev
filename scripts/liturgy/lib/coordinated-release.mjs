/** PR255 only: reviewed release gate, exact masks, reusable receipts and digest fence. */
import fs from 'node:fs';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { canonicalJson, collectionDigest, describeDocuments, storedDocument, validateCollection } from '../../content/lib/app-content.mjs';
import { planManifest, publicationDecision } from '../../content/publish-manifest.mjs';
import { editorialHash } from './editorial-responsories.mjs';
import { buildFirestoreWrite } from '../audit-doxologies.mjs';
import { validatePublicationPlan, serverTime, preparePublicationResume, executePreparedPublication } from './editorial-publication.mjs';
export const COORDINATED_POLICY = 'pr255-coordinated-bundle-release';
export const FLUTTER_MERGE = 'bb145d8e366236af930b7d1086c24b3d1c52256a';
export const COORDINATED_COLLECTIONS = ['days', 'liturgicalTemplates', 'liturgicalProperTexts'];
export const CONTRACT_DIR = 'docs/audits/liturgical-common-texts-2026-11/v4/flutter-pr113';
export const binarySha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const valueSha256 = value => binarySha256(canonicalJson(value));
const check = (yes, why) => { if (!yes) throw Error(why); };
const at = (data, path) => path.reduce((v, k) => v?.[k], data);
const timeEqual = (a, b) => a?.seconds === b?.seconds && a?.nanoseconds === b?.nanoseconds;
const validSha = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const proof = item => item && validSha(item.sha256) && /^https:\/\//u.test(item.url || '');

export function loadCoordinatedContract(dir = CONTRACT_DIR, { testApp = false } = {}) {
  const provenance = JSON.parse(fs.readFileSync(`${dir}/provenance.json`));
  check(provenance.repository === 'senddownrain/ibreviarybyapp' && provenance.pullRequest === 113 && provenance.mergeSha === FLUTTER_MERGE, 'Unpinned Flutter handoff');
  const files = {};
  for (const [file, expected] of Object.entries(provenance.files)) {
    check(/^[\w.-]+$/u.test(file), 'Unsafe handoff path');
    const bytes = fs.readFileSync(`${dir}/${file}`);
    check(binarySha256(bytes) === expected.sha256 && bytes.length === expected.bytes, `Handoff integrity: ${file}`);
    files[file] = bytes;
  }
  const report = JSON.parse(files['bundle-report.json']), requirements = JSON.parse(files['manifest-requirements.json']);
  check(report.webCommit === 'c35dbad33b3f56ff6176fff3120c5f39dce75242' && report.schemaVersion === 1 && requirements.schemaVersion === 1
    && report.fields === 7791 && report.documents === 749 && report.heldFieldsUnchanged === 843
    && report.properFields === 406 && report.adventFields === 14 && report.contentVersion === requirements.bundleContentVersion, 'Unexpected bundle scope/schema');
  const expected = {};
  for (const name of COORDINATED_COLLECTIONS) {
    const item = JSON.parse(files[`${name}-manifest-candidate.json`]);
    const count = Object.keys(item.hashes).length, bytes = Object.values(item.sizes).reduce((n, v) => n + v, 0);
    check(item.collection === name && collectionDigest(item.hashes) === item.digest && Object.keys(item.hashes).every(id => Number.isSafeInteger(item.sizes[id]) && item.sizes[id] > 0)
      && Object.keys(item.sizes).length === count, `Invalid candidate ${name}`);
    check(item.digest === report.collections[name].digest && count === report.collections[name].count && bytes === report.collections[name].storedBytes
      && item.digest === requirements.collections[name].digest && count === requirements.collections[name].count && bytes === requirements.collections[name].bytes, `Bundle/candidate mismatch ${name}`);
    expected[name] = { hashes: item.hashes, sizes: item.sizes, digest: item.digest, count, bytes };
  }
  const contract = { report, requirements, expected, reportSha256: binarySha256(files['bundle-report.json']), provenanceSha256: valueSha256(provenance) };
  if (testApp) {
    const bytes = fs.readFileSync(`${dir}/../flutter-baseline-reconciliation.json.gz`);
    check(binarySha256(bytes) === 'e08c154ff6d7d5d1443a4f89b297c0c9de2da2d6195a3527ee33a9d0718a2692', 'Unpinned test-app supplement');
    const patch = JSON.parse(zlib.gunzipSync(bytes));
    check(patch.scope === 'flutter-bundle-baseline-only' && patch.firestoreWrites === 0 && patch.summary.totalFields === 344
      && patch.summary.heldWebValuesChanged === 0 && isDeepStrictEqual(patch.before, expected), 'Supplement differs from PR113');
    for (const name of COORDINATED_COLLECTIONS) check(collectionDigest(patch.after[name].hashes) === patch.after[name].digest
      && Object.keys(patch.after[name].hashes).length === patch.after[name].count
      && Object.values(patch.after[name].sizes).reduce((a,b) => a+b,0) === patch.after[name].bytes, 'Invalid reconciled target');
    contract.expected = patch.after;
    contract.testApp = { policy: 'pr255-test-app-before-mobile-release', supplementSha256: binarySha256(bytes) };
    contract.targetContractSha256 = valueSha256({ reportSha256: contract.reportSha256, ...contract.testApp, expected: contract.expected });
  }
  return contract;
}

/** Runs BEFORE reading credentials, importing the SDK, or making a request. */
export function verifyCoordinatedAuthorization({ plan, expectedPlan, planBytes, sourceBytes, catalogBytes, evidenceBytes, authorization, mode, contract, now = Date.now() }) {
  validatePublicationPlan(plan);
  check(isDeepStrictEqual(plan.documents, expectedPlan.documents) && plan.summary.readyFields === 7791 && plan.summary.readyDocuments === 749, 'Plan differs from immutable 7791-field selection');
  check(binarySha256(sourceBytes) === contract.report.sourcePlanSha256, 'Source plan binary SHA mismatch (legacy editorialHash is not binary SHA)');
  check(plan.compatibility?.policy === 'days-templates-awaiting-compatible-bundle', 'Unexpected source-plan policy');
  const a = authorization, e = JSON.parse(evidenceBytes);
  check(a.project === 'ibreviaryby' && a.policy === COORDINATED_POLICY && a.action === mode && a.ownerApproved === true && a.reason
    && a.planBinarySha256 === binarySha256(planBytes) && a.baselineCatalogSha256 === binarySha256(catalogBytes)
    && a.releaseEvidenceSha256 === binarySha256(evidenceBytes) && validSha(a.manifestBaselineSha256), 'Concrete coordinated authorization/SHA bindings required');
  check(e.schema === 1 && e.project === 'ibreviaryby' && e.flutterMergeSha === FLUTTER_MERGE && e.bundleReportSha256 === contract.reportSha256
    && e.bundleManifestSha256 === contract.report.files['manifest.json'].sha256, 'Release evidence does not identify this Flutter bundle');
  if (contract.testApp) {
    verifyTestAppCompatibility(e, a, contract);
  } else {
  check(e.release?.confirmed === true && Number.isFinite(Date.parse(e.release.releasedAt)) && Date.parse(e.release.releasedAt) <= now
    && Array.isArray(e.release.builds) && e.release.builds.length > 0, 'Flutter release not confirmed; no Firebase access');
  for (const build of e.release.builds) check(['android', 'ios'].includes(build.platform) && Number.isInteger(build.buildNumber) && build.buildNumber > 6
    && build.version && /^[a-f0-9]{40}$/u.test(build.sourceSha||'') && build.bundleSourceMergeSha === FLUTTER_MERGE && build.bundleManifestSha256 === contract.report.files['manifest.json'].sha256 && proof(build.ancestry) && proof(build.artifact) && /^https:\/\//u.test(build.distributionUrl || ''), 'Missing exact released build/distribution receipt');
  for (const name of ['offlineColdStart', 'hours', 'upgradeUserData', 'olderOverlay', 'interruptedUpdate']) check(e.nativeSmoke?.[name]?.status === 'passed' && proof(e.nativeSmoke[name]) && e.release.builds.some(build => build.artifact.sha256 === e.nativeSmoke[name].artifactSha256), `Native smoke missing: ${name}`);
  check(e.compatibility?.inventory?.complete === true && proof(e.compatibility.inventory) && e.compatibility.inventory.installedBuilds?.length > 0, 'Installed-client inventory not confirmed');
  for (const platform of ['android', 'ios']) {
    const inventory = e.compatibility.inventory.platforms?.[platform];
    check(proof(inventory) && ['active', 'not-distributed'].includes(inventory.distribution), 'Missing platform distribution inventory: ' + platform);
    if (inventory.distribution === 'active') check(e.compatibility.inventory.installedBuilds.some(build => build.platform === platform), 'Active platform omitted from build inventory');
  }
  for (const build of e.compatibility.inventory.installedBuilds) {
    const result = e.compatibility.checks?.find(item => item.platform === build.platform && item.buildNumber === build.buildNumber && item.artifactSha256 === build.artifactSha256);
    check(validSha(build.artifactSha256) && result?.kind === 'installed-binary' && proof(result) && result.downloads === 0 && result.dataPreserved === true
      && ['current', 'appReleaseRequired'].includes(result.result), 'Installed-binary compatibility/upgrade proof missing');
  }
  }
  const review = a.massManifestReview;
  check(review?.approved === true && review.reviewer && /^https:\/\//u.test(review.url || '') && review.releaseEvidenceSha256 === a.releaseEvidenceSha256
    && review.bundleReportSha256 === contract.reportSha256, 'Explicit release-specific MASS manifest review required');
  check(Array.isArray(a.introduceCollections) && a.introduceCollections.every(n => n === 'liturgicalProperTexts')
    && Number.isInteger(a.maxUncachedDocumentReads) && a.maxUncachedDocumentReads >= 0 && a.maxUncachedDocumentReads <= 50, 'Invalid introduction/read budget');
  return { policy: COORDINATED_POLICY, flutterMergeSha: FLUTTER_MERGE, planBinarySha256: a.planBinarySha256,
    ...(contract.testApp ? { executionPolicy: contract.testApp.policy, targetContractSha256: contract.targetContractSha256 } : {}),
    releaseEvidenceSha256: a.releaseEvidenceSha256, bundleReportSha256: contract.reportSha256, baselineCatalogSha256: a.baselineCatalogSha256 };
}

// Source/tests are sufficient for the owner's test-app policy. This branch
// explicitly makes no released-build or installed-client inventory claim.
export function verifyTestAppCompatibility(e, a, contract) {
  check(e.policy === contract.testApp.policy && a.executionPolicy === e.policy
    && e.targetContractSha256 === contract.targetContractSha256 && a.targetContractSha256 === contract.targetContractSha256
    && e.supplementSha256 === contract.testApp.supplementSha256, 'Exact test-app target authorization required');
  check(e.mobileReleaseRequired === false && e.mobileReleasePerformed === false && e.installedClientInventory === 'not-available'
    && e.release === undefined && e.nativeSmoke === undefined, 'Test-app evidence must not fabricate release/native/inventory evidence');
  const readProof = item => {
    check(item && /^docs\/[\w./-]+$/u.test(item.path || '') && !item.path.split('/').includes('..') && validSha(item.sha256), 'Invalid source/test proof');
    const bytes = fs.readFileSync(item.path);
    check(binarySha256(bytes) === item.sha256, 'Source/test proof SHA mismatch');
    return JSON.parse(bytes);
  };
  const review = readProof(e.sourceReview), tests = readProof(e.testResults), target = readProof(e.targetHashVerification);
  check(target.status === 'passed' && target.targetContractSha256 === contract.targetContractSha256
    && isDeepStrictEqual(target.collections, contract.expected)
    && COORDINATED_COLLECTIONS.every(name => target.sourceFiles?.[name+'.json.gz'] === contract.report.files[name+'.json.gz'].sha256), 'Reconciled target not verified against source assets');
  check(review.repository === 'senddownrain/ibreviarybyapp' && review.schema === 1 && tests.schema === 1
    && tests.failed === 0 && tests.passed > 0 && tests.firebaseReads === 0 && tests.firebaseWrites === 0, 'Compatibility tests not verified');
  for (const revision of ['6b5b278fcb0f77f557cf5f739c455236cb19029c', '84d1d6dd61f8cb78aa33fb1b6538996f9156fc20', '6ef0ba811e351d787eec349af81e82b9f94d465a']) {
    const source = review.revisions?.find(r => r.revision === revision);
    const run = tests.runs?.find(r => r.revision === revision);
    check(source && validSha(source.updaterSha256) && source.userDataBoxesUntouched === true
      && run?.status === 'passed' && run.passed > 0 && run.failed === 0, 'Known updater revision not verified: ' + revision);
  }
  check(tests.appReleaseDataPreservation === true && tests.appReleaseRestart === true && tests.upgradeStatusClears === true
    && tests.settingsFavoritesPersonalPrayersPreserved === true && tests.targetHashesVerified === true, 'Test-app data preservation/target verification incomplete');
}

export function catalogEntry(document, record) {
  const [name, id] = document.split('/');
  check(COORDINATED_COLLECTIONS.includes(name) && id && record?.updateTime, 'Invalid live catalog record');
  const stored = storedDocument(id, record.data);
  check(validateCollection(name, [stored]).length === 0, `Invalid public document ${document}`);
  const described = describeDocuments([stored]);
  return { hash: described.hashes[id], bytes: described.sizes[id], updateTime: { seconds: record.updateTime.seconds, nanoseconds: record.updateTime.nanoseconds } };
}

/** Hash-only local baseline. A proven masked Proper receipt advances only its fields/time. */
export async function buildCoordinatedCatalog(snapshot, fullPlan, published) {
  const entries = new Map();
  for (const name of COORDINATED_COLLECTIONS) for (const entry of await snapshot.collectionEntries(name)) entries.set(`${name}/${entry.id}`, entry);
  check(published.allReadbacksVerified && published.writtenDocuments === 226 && published.writtenFields === 406, 'Proper receipt incomplete');
  for (const receipt of published.documents) {
    const source = fullPlan.documents.find(d => d.document === receipt.document), entry = entries.get(receipt.document);
    check(source && entry && timeEqual(source.updateTime, entry.updateTime) && receipt.fields.length === source.fields.length
      && timeEqual(receipt.readbackUpdateTime, serverTime(receipt.serverUpdateTime)), `Unproven Proper baseline ${receipt.document}`);
    const data = storedDocument(receipt.document.split('/')[1], entry.data);
    for (const field of source.fields) {
      check(editorialHash(at(data, field.path)) === field.beforeSha256 && receipt.fields.some(f => f.field === field.field && f.beforeSha256 === field.beforeSha256 && f.afterSha256 === field.afterSha256), 'Proper receipt field mismatch');
      let target = data; for (const key of field.path.slice(0, -1)) target = target[key];
      target[field.path.at(-1)] = field.after;
    }
    entries.set(receipt.document, { data, updateTime: receipt.readbackUpdateTime });
  }
  return { schema: 1, sourcePlanCanonicalSha256: valueSha256(fullPlan), properReceiptSha256: published.receiptSha256,
    documents: Object.fromEntries([...entries].map(([name, record]) => [name, catalogEntry(name, record)])) };
}

/** Only reviewed before/after values are allowed. Fresh updateTime becomes CAS;
 * already-after fields are readback-verified but omitted from the write mask. */
export function prepareCoordinatedFresh(plan, records) {
  validatePublicationPlan(plan);
  const prepared = [], conflicts = [];
  for (const d of plan.documents) {
    const fresh = records.get(d.document), pending = [];
    if (!fresh) { conflicts.push({ document: d.document, reason: 'missing-document' }); continue; }
    for (const f of d.fields) {
      const value = at(fresh.data, f.path), hash = typeof value === 'string' ? editorialHash(value) : null;
      if (hash === f.beforeSha256) pending.push(f);
      else if (hash !== f.afterSha256) conflicts.push({ document: d.document, field: f.field, reason: 'unknown-field-SHA' });
    }
    if (pending.length) prepared.push({ plan: { ...d, updateTime: fresh.updateTime }, write: buildFirestoreWrite(fresh.data, { ...d, updateTime: fresh.updateTime, fields: pending }) });
  }
  if (conflicts.length) { const error = Error('Fresh coordinated preflight conflicts; no writes'); error.conflicts = conflicts; throw error; }
  return prepared;
}

/** Uses the already-required target preflight, with no extra reads. Non-mask
 * fields must survive AND agree with the released bundle after our masks. */
export function verifyProjectedTargets(plan, records, contract) {
  const conflicts = [];
  for (const doc of plan.documents) {
    const fresh = records.get(doc.document);
    if (!fresh) continue; // Verified resumed documents are fenced by metadata.
    const [name, id] = doc.document.split('/'), data = storedDocument(id, fresh.data);
    for (const field of doc.fields) {
      let target = data;
      for (const key of field.path.slice(0, -1)) target = target[key];
      target[field.path.at(-1)] = field.after;
    }
    const after = catalogEntry(doc.document, { data, updateTime: fresh.updateTime });
    if (after.hash !== contract.expected[name].hashes[id] || after.bytes !== contract.expected[name].sizes[id]) {
      conflicts.push({ document: doc.document, reason: 'projected-bundle-mismatch-outside-reviewed-masks', actualHash: after.hash,
        expectedHash: contract.expected[name].hashes[id], actualBytes: after.bytes, expectedBytes: contract.expected[name].sizes[id] });
    }
  }
  if (conflicts.length) { const error = Error('Target preflight cannot match Flutter bundle without unapproved field changes; no writes'); error.conflicts = conflicts; throw error; }
}

export function describeCatalog(catalog, contract) {
  const described = {};
  for (const name of COORDINATED_COLLECTIONS) {
    const items = Object.entries(catalog).filter(([document]) => document.startsWith(name + '/'));
    const hashes = Object.fromEntries(items.map(([document, entry]) => [document.split('/')[1], entry.hash]));
    const sizes = Object.fromEntries(items.map(([document, entry]) => [document.split('/')[1], entry.bytes]));
    described[name] = { hashes, sizes, digest: collectionDigest(hashes), count: items.length, bytes: items.reduce((n, [, entry]) => n + entry.bytes, 0) };
    if (!isDeepStrictEqual(described[name], contract.expected[name])) {
      const error = Error(`Live bundle digest/count/bytes mismatch: ${name}; current manifest must not switch`);
      error.conflicts = [...new Set([...Object.keys(hashes), ...Object.keys(contract.expected[name].hashes)])]
        .filter(id => hashes[id] !== contract.expected[name].hashes[id] || sizes[id] !== contract.expected[name].sizes[id])
        .map(id => ({ document: name + '/' + id, actualHash: hashes[id] ?? null, expectedHash: contract.expected[name].hashes[id] ?? null,
          actualBytes: sizes[id] ?? null, expectedBytes: contract.expected[name].sizes[id] ?? null }));
      throw error;
    }
  }
  return described;
}

export function coordinatedManifestPlan(described, manifestRecords, authorization, contract, now = Date.now()) {
  const baseline = manifestRecords.get('contentManifest/current')?.data;
  check(baseline?.schemaVersion === 1 && valueSha256(baseline) === authorization.manifestBaselineSha256, 'Published manifest baseline changed');
  check(now >= contract.report.contentVersion && now >= baseline.contentVersion, 'Publication clock predates bundle/published manifest');
  for (const name of COORDINATED_COLLECTIONS) {
    const before = baseline.collections[name];
    if (!before) { check(authorization.introduceCollections.includes(name), `Introduction not reviewed: ${name}`); continue; }
    check(Number.isSafeInteger(before.version) && before.version > 0, `Invalid current version ${name}`);
    const index = manifestRecords.get(`contentManifest/${name}`)?.data;
    check(index && index.digest === before.digest && index.version === before.version && collectionDigest(index.hashes) === before.digest
      && Object.keys(index.hashes).length === before.count && Object.values(index.sizes).reduce((n, v) => n + v, 0) === before.bytes, `Published index inconsistent: ${name}`);
  }
  // The ordinary MASS gate remains closed. This is a reviewed release override,
  // never permission to make an ordinary patch or to change schemaVersion.
  check(!publicationDecision('MASS CONTENT REBUILD').publish && authorization.massManifestReview?.approved === true, 'MASS release gate not reviewed');
  check(publicationDecision('MASS CONTENT REBUILD', { allowLargePatch: true }).publish, 'Coordinated release override refused');
  const next = planManifest(described, baseline, now, { partial: true });
  const current = { ...baseline, ...next.current };
  if (current.contentVersion < contract.report.contentVersion) { current.contentVersion = now; current.publishedAt = new Date(now).toISOString(); }
  const payloads = Object.fromEntries(COORDINATED_COLLECTIONS.map(name => [`contentManifest/${name}`, {
    ...manifestRecords.get(`contentManifest/${name}`)?.data, collection: name, digest: described[name].digest,
    version: current.collections[name].version, hashes: described[name].hashes, sizes: described[name].sizes,
  }]));
  payloads['contentManifest/current'] = current;
  return { current, changed: next.changed, payloads };
}

/** Metadata projection is read inside the SAME transaction that switches all
 * four manifests. Reuse proven hashes only when server updateTime still matches. */
export async function verifyLiveCatalog(metadata, catalog, readChanged, contract, budget) {
  const actual = Object.fromEntries(metadata.map(record => [record.document, record]));
  check(Object.keys(actual).length === metadata.length, 'Duplicate live metadata record');
  const expectedNames = COORDINATED_COLLECTIONS.flatMap(name => Object.keys(contract.expected[name].hashes).map(id => `${name}/${id}`)).sort();
  check(isDeepStrictEqual(Object.keys(actual).sort(), expectedNames), 'Live collection IDs/count changed; no manifest switch');
  const changed = expectedNames.filter(name => !timeEqual(actual[name].updateTime, catalog[name]?.updateTime));
  check(changed.length <= budget, `Uncached live documents ${changed.length} exceed reviewed read budget ${budget}`);
  if (changed.length) {
    const records = await readChanged(changed);
    for (const name of changed) { check(timeEqual(records.get(name)?.updateTime, actual[name].updateTime), 'Inconsistent transaction snapshot'); catalog[name] = catalogEntry(name, records.get(name)); }
  }
  return { described: describeCatalog(catalog, contract), projectedDocuments: expectedNames.length, additionalDocumentReads: changed.length };
}

export async function executeCoordinatedRelease({ plan, adapter, contract, authorization, compatibility, baselineCatalog, previous = {}, mode, batchSize = 25, journal }) {
  const manifests = await adapter.readManifest();
  // An atomic manifest commit whose acknowledgement/readback was interrupted
  // is recovered by exact payload equality; it is never blindly repeated.
  if (previous.manifestAttempt) {
    const attempt = previous.manifestAttempt;
    if (Object.entries(attempt.payloads).every(([name, data]) => isDeepStrictEqual(manifests.get(name)?.data, data))) {
      await journal({ state: 'coordinated-release-readbacks-verified', manifestReceipt: manifestReceipt(manifests, attempt.payloads), resumedManifest: true });
      return;
    }
    check(valueSha256(manifests.get('contentManifest/current')?.data) === authorization.manifestBaselineSha256, 'Ambiguous/changed manifest on resume');
  }
  check(valueSha256(manifests.get('contentManifest/current')?.data) === authorization.manifestBaselineSha256, 'Manifest changed before field preflight');
  // Validate schema, baseline indexes, versions and introduction BEFORE reading
  // any target data. The final transaction recomputes from live digests.
  coordinatedManifestPlan(contract.expected, manifests, authorization, contract);
  const verified = new Set((previous.receipts || []).filter(b => b.readback === 'verified').flatMap(b => b.documents.map(d => d.document)));
  const records = await adapter.read(plan.documents.filter(d => !verified.has(d.document)).map(d => d.document));
  const resumed = preparePublicationResume(plan, records, previous, { prepare: prepareCoordinatedFresh });
  verifyProjectedTargets(plan, records, contract);
  const catalog = structuredClone(previous.catalog || baselineCatalog.documents);
  for (const [name, record] of records) catalog[name] = catalogEntry(name, record);
  const toWrite = new Set(resumed.prepared.map(p => p.plan.document));
  const alreadyAfter = plan.documents.filter(d => !verified.has(d.document) && !toWrite.has(d.document));
  const receipts = resumed.receipts;
  if (alreadyAfter.length) receipts.push({ readback: 'verified', origin: 'fresh-preflight-already-after', documents: alreadyAfter.map(d => ({
    document: d.document, serverUpdateTime: timestampString(records.get(d.document).updateTime), readbackUpdateTime: records.get(d.document).updateTime,
    writtenFieldMasks: [], fields: d.fields.map(f => ({ field: f.field, path: f.path, beforeSha256: f.beforeSha256, afterSha256: f.afterSha256 })),
  })) });
  await journal({ state: 'coordinated-fresh-preflight-passed', compatibility, receipts, catalog, manifestBaseline: Object.fromEntries(manifests) });
  if (mode === 'preflight') return;
  const wrappedRead = async names => {
    const result = await adapter.read(names);
    for (const [name, record] of result) catalog[name] = catalogEntry(name, record);
    return result;
  };
  await executePreparedPublication(resumed.prepared, { read: wrappedRead, commit: adapter.commit,
    journal: next => journal({ state: 'coordinated-fields-in-progress', receipts: next, catalog }),
  }, { maxWrites: batchSize, initialReceipts: receipts, includeValues: false });
  await journal({ state: 'coordinated-all-field-readbacks-verified', catalog });
  const result = await adapter.publishManifest({ catalog, manifests, contract, authorization, journal });
  const checked = await adapter.readManifest();
  const receipt = manifestReceipt(checked, result.payloads);
  await journal({ state: 'coordinated-release-readbacks-verified', manifestReceipt: receipt, liveDigestGate: result.liveDigestGate });
}
export function timestampString(time) { return new Date(time.seconds * 1000).toISOString().replace(/\.\d{3}Z$/u, `.${String(time.nanoseconds).padStart(9, '0')}Z`); }
export function manifestReceipt(records, payloads) {
  return Object.fromEntries(Object.entries(payloads).map(([name, data]) => {
    const record = records.get(name);
    check(record && isDeepStrictEqual(record.data, data), `Manifest readback mismatch ${name}`);
    return [name, { sha256: valueSha256(data), updateTime: record.updateTime }];
  }));
}

/** Production adapter: reference-only transaction fence, indexes before root.
 * No automatic transaction retry: a conflict requires explicit guarded resume. */
export async function publishCoordinatedManifest(db, { catalog, manifests, contract, authorization, journal, onReads = () => {} }) {
 const refs=['contentManifest/days','contentManifest/liturgicalTemplates','contentManifest/liturgicalProperTexts','contentManifest/current'];
 const mapDocs=docs=>new Map(docs.filter(d=>d.exists).map(d=>[d.ref.path,{data:d.data(),updateTime:{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds}}]));
   const result=await db.runTransaction(async tx=>{
    const fresh=mapDocs(await tx.getAll(...refs.map(n=>db.doc(n))));onReads('manifestDocumentReads',refs.length);
    for(const name of refs)if(valueSha256(fresh.get(name)||null)!==valueSha256(manifests.get(name)||null))throw Error('Manifest CAS baseline changed: '+name);
    const metadata=[];
    for(const name of COORDINATED_COLLECTIONS){const projection=await tx.get(db.collection(name).select());onReads('metadataDocumentReads',Math.max(1,projection.docs.length));for(const doc of projection.docs)metadata.push({document:doc.ref.path,updateTime:{seconds:doc.updateTime.seconds,nanoseconds:doc.updateTime.nanoseconds}});}
    const gate=await verifyLiveCatalog(metadata,catalog,async names=>{const docs=await tx.getAll(...names.map(n=>db.doc(n)));onReads('uncachedDocumentReads',names.length);return mapDocs(docs);},contract,authorization.maxUncachedDocumentReads);
    const planned=coordinatedManifestPlan(gate.described,fresh,authorization,contract);
    const liveDigestGate={projectedDocuments:gate.projectedDocuments,additionalDocumentReads:gate.additionalDocumentReads,collections:Object.fromEntries(COORDINATED_COLLECTIONS.map(n=>[n,{digest:gate.described[n].digest,count:gate.described[n].count,bytes:gate.described[n].bytes}]))};
    const writeDocuments=refs.filter(name=>valueSha256(fresh.get(name)?.data??null)!==valueSha256(planned.payloads[name]));
    await journal({state:'coordinated-manifest-prepared',catalog,manifestAttempt:{payloads:planned.payloads,writeDocuments,liveDigestGate}});
    // Queue indexes first and current last, in ONE atomic transaction. No
    // reader can observe current pointing at an uncommitted collection index.
    for(const name of writeDocuments)tx.set(db.doc(name),planned.payloads[name]);
    return {...planned,liveDigestGate};
   },{maxAttempts:1});
 await journal({state:'coordinated-manifest-commit-acknowledged'});
 return result;
}

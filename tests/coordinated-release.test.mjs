import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { selectDaysTemplates } from '../scripts/liturgy/prepare-days-templates.mjs';
import { canonicalJson, describeDocuments, storedDocument } from '../scripts/content/lib/app-content.mjs';
import { publicationDecision } from '../scripts/content/publish-manifest.mjs';
import { editorialHash } from '../scripts/liturgy/lib/editorial-responsories.mjs';
import { decodeFirestoreValue } from '../scripts/ordo/lib/approved-calendar-rest.mjs';
import { createReleaseCommit } from '../scripts/liturgy/lib/firestore-release-commit.mjs';
import {
  COORDINATED_COLLECTIONS as names, COORDINATED_POLICY, FLUTTER_MERGE, loadCoordinatedContract, binarySha256, valueSha256,
  verifyCoordinatedAuthorization, prepareCoordinatedFresh, catalogEntry, describeCatalog, verifyLiveCatalog,
  coordinatedManifestPlan, executeCoordinatedRelease, publishCoordinatedManifest, timestampString,
} from '../scripts/liturgy/lib/coordinated-release.mjs';
const dir = 'docs/audits/liturgical-common-texts-2026-11/v4';
const sourceBytes = fs.readFileSync(`${dir}/full-content-plan.json.gz`), full = JSON.parse(zlib.gunzipSync(sourceBytes));
const published = JSON.parse(fs.readFileSync(`${dir}/PUBLICATION_RESULT.json`));
const realPlan = selectDaysTemplates(full, published);
realPlan.inputs = { fullPlanSha256: editorialHash(sourceBytes), publishedReceiptSha256: published.receiptSha256 };
const planBytes = zlib.gzipSync(JSON.stringify(realPlan) + '\n', { level: 9 });
const catalogBytes = fs.readFileSync(`${dir}/coordinated-baseline.json.gz`);
const contract = loadCoordinatedContract();
const proof = { sha256: '1'.repeat(64), url: 'https://example.invalid/reviewed-proof' };
function releaseFixture() {
  const evidence = { schema: 1, project: 'ibreviaryby', flutterMergeSha: FLUTTER_MERGE, bundleReportSha256: contract.reportSha256,
    bundleManifestSha256: contract.report.files['manifest.json'].sha256,
    release: { confirmed: true, releasedAt: '2026-11-17T00:00:00Z', builds: [{ platform: 'android', buildNumber: 7, version: '1.0.1', sourceSha: 'b'.repeat(40),
      bundleSourceMergeSha: FLUTTER_MERGE, bundleManifestSha256: contract.report.files['manifest.json'].sha256,
      ancestry: proof, artifact: proof, distributionUrl: 'https://example.invalid/distribution' }] },
    nativeSmoke: Object.fromEntries(['offlineColdStart', 'hours', 'upgradeUserData', 'olderOverlay', 'interruptedUpdate'].map(n => [n, { ...proof, status: 'passed', artifactSha256: proof.sha256 }])),
    compatibility: { inventory: { ...proof, complete: true, platforms: { android: { ...proof, distribution: 'active' }, ios: { ...proof, distribution: 'not-distributed' } }, installedBuilds: [{ platform: 'android', buildNumber: 6, artifactSha256: proof.sha256 }] },
      checks: [{ ...proof, platform: 'android', buildNumber: 6, artifactSha256: proof.sha256, kind: 'installed-binary', downloads: 0, dataPreserved: true, result: 'appReleaseRequired' }] },
  };
  const evidenceBytes = Buffer.from(JSON.stringify(evidence));
  const authorization = { project: 'ibreviaryby', action: 'execute', ownerApproved: true, reason: 'TEST ONLY - never a real release approval', policy: COORDINATED_POLICY,
    planBinarySha256: binarySha256(planBytes), baselineCatalogSha256: binarySha256(catalogBytes), releaseEvidenceSha256: binarySha256(evidenceBytes),
    manifestBaselineSha256: '2'.repeat(64), maxUncachedDocumentReads: 5, introduceCollections: ['liturgicalProperTexts'],
    massManifestReview: { approved: true, reviewer: 'TEST', url: proof.url, releaseEvidenceSha256: binarySha256(evidenceBytes), bundleReportSha256: contract.reportSha256 } };
  return { evidence, evidenceBytes, authorization };
}
function verify(fixture = releaseFixture(), extra = {}) {
  return verifyCoordinatedAuthorization({ plan: realPlan, expectedPlan: selectDaysTemplates(full, published), sourceBytes, planBytes, catalogBytes,
    ...fixture, mode: 'execute', contract, now: Date.parse('2026-11-17T12:00:00Z'), ...extra });
}
test('exact PR113 contract, binary source SHA and all 7791 masks are pinned; generic MASS remains refused', () => {
  assert.equal(realPlan.documents.length, 749); assert.equal(realPlan.summary.readyFields, 7791);
  assert.equal(binarySha256(sourceBytes), contract.report.sourcePlanSha256);
  assert.notEqual(binarySha256(sourceBytes), editorialHash(sourceBytes));
  assert.equal(verify().policy, COORDINATED_POLICY);
  assert.equal(publicationDecision('MASS CONTENT REBUILD').publish, false);
  assert.equal(publicationDecision('SCHEMA CHANGE', { allowLargePatch: true }).publish, false);
  const altered = structuredClone(realPlan); altered.documents[0].fields[0].after += ' ';
  assert.throws(() => verify(undefined, { plan: altered }), /proof|selection/);
  assert.throws(() => verify(undefined, { sourceBytes: Buffer.from('wrong') }), /binary SHA/);
});
test('missing release, native, installed-binary compatibility or bound review stops offline', () => {
  for (const mutate of [
    f => { f.evidence.release.confirmed = false; }, f => { delete f.evidence.nativeSmoke.olderOverlay; },
    f => { f.evidence.compatibility.inventory.complete = false; }, f => { f.evidence.compatibility.checks[0].kind = 'source-only'; },
    f => { f.authorization.ownerApproved = false; }, f => { f.authorization.massManifestReview.bundleReportSha256 = '0'.repeat(64); },
    f => { f.evidence.release.builds[0].bundleManifestSha256 = '0'.repeat(64); },
  ]) {
    const f = releaseFixture(); mutate(f); f.evidenceBytes = Buffer.from(JSON.stringify(f.evidence));
    f.authorization.releaseEvidenceSha256 = binarySha256(f.evidenceBytes);
    f.authorization.massManifestReview.releaseEvidenceSha256 = binarySha256(f.evidenceBytes);
    assert.throws(() => verify(f));
  }
});
test('CLI rejects unreleased evidence BEFORE reading a missing service account or opening a receipt', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pr255-no-firebase-'));
  try {
    const f = releaseFixture(); f.evidence.release.confirmed = false; f.evidenceBytes = Buffer.from(JSON.stringify(f.evidence));
    f.authorization.releaseEvidenceSha256 = binarySha256(f.evidenceBytes); f.authorization.massManifestReview.releaseEvidenceSha256 = binarySha256(f.evidenceBytes);
    fs.writeFileSync(`${temp}/plan.gz`, planBytes); fs.writeFileSync(`${temp}/release.json`, f.evidenceBytes); fs.writeFileSync(`${temp}/auth.json`, JSON.stringify(f.authorization));
    assert.throws(() => execFileSync(process.execPath, ['scripts/liturgy/future-publish-editorial-v3.mjs', '--mode', 'execute', '--plan', `${temp}/plan.gz`,
      '--authorization', `${temp}/auth.json`, '--coordinated-release', `${temp}/release.json`, '--baseline-catalog', `${dir}/coordinated-baseline.json.gz`,
      '--service-account', `${temp}/MUST-NOT-BE-READ.json`, '--receipt', `${temp}/receipt.json`], { stdio: 'pipe' }),
    error => { assert.match(error.stderr.toString(), /Flutter release not confirmed; no Firebase access/); return true; });
    assert.equal(fs.existsSync(`${temp}/receipt.json`), false);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
const field = (name, before = 'old', after = 'new') => ({ field: name, path: [name], updateMask: name, status: 'ready', edits: [{ start: 0, end: before.length, value: after }], before, after, beforeSha256: editorialHash(before), afterSha256: editorialHash(after) });
function fixture() {
  const records = new Map([
    ['days/one', { data: { _periodType: 'ordinary', laudesR: 'old', vesperR: 'old', advent: 'DO NOT CHANGE' }, updateTime: { seconds: 10, nanoseconds: 123456789 } }],
    ['liturgicalTemplates/one', { data: { _kind: 'common', title: 'Common', laudesR: 'old' }, updateTime: { seconds: 11, nanoseconds: 234567890 } }],
    ['liturgicalProperTexts/one', { data: { _schema: 2, _celebrationId: 'one', _date: '01.01', laudesR: 'PROPER STAYS' }, updateTime: { seconds: 12, nanoseconds: 345678901 } }],
  ]);
  const documents = ['days/one', 'liturgicalTemplates/one'].map(document => ({ document, updateTime: { seconds: 1, nanoseconds: 2 },
    fields: (document.startsWith('days/') ? ['laudesR', 'vesperR'] : ['laudesR']).map(name => field(name)) }));
  const plan = { schema: 3, network: false, documents, summary: { readyDocuments: 2, readyFields: 3 } };
  const nextRecords = structuredClone(records);
  for (const d of documents) for (const f of d.fields) nextRecords.get(d.document).data[f.field] = f.after;
  const expected = Object.fromEntries(names.map(name => [name, describeDocuments([...nextRecords].filter(([key]) => key.startsWith(name + '/')).map(([key, r]) => storedDocument(key.split('/')[1], r.data)))]));
  const localContract = { ...contract, expected };
  const oldIndexes = Object.fromEntries(names.slice(0, 2).map(name => [name, describeDocuments([...records].filter(([key]) => key.startsWith(name + '/')).map(([key, r]) => storedDocument(key.split('/')[1], r.data)))]));
  const root = { schemaVersion: 1, contentVersion: 1794815200000, publishedAt: '2026-11-16T07:46:40Z', keepRootMetadata: 'KEEP', collections: {
    days: { digest: oldIndexes.days.digest, count: 1, bytes: oldIndexes.days.bytes, version: 11 },
    liturgicalTemplates: { digest: oldIndexes.liturgicalTemplates.digest, count: 1, bytes: oldIndexes.liturgicalTemplates.bytes, version: 8 },
    readings: { digest: 'KEEP', version: 27, bytes: 1234, count: 99 },
  } };
  const manifests = new Map([['contentManifest/current', { data: root, updateTime: { seconds: 13, nanoseconds: 7 } }], ...names.slice(0, 2).map(name => [`contentManifest/${name}`, { data: {
    collection: name, version: root.collections[name].version, digest: oldIndexes[name].digest, hashes: oldIndexes[name].hashes, sizes: oldIndexes[name].sizes,
  }, updateTime: { seconds: 13, nanoseconds: 6 } }])]);
  const authorization = { ...releaseFixture().authorization, manifestBaselineSha256: valueSha256(root) };
  const catalog = Object.fromEntries([...records].map(([name, record]) => [name, catalogEntry(name, record)]));
  const metadata = () => [...records].map(([document, record]) => ({ document, updateTime: record.updateTime }));
  return { plan, records, nextRecords, catalog, contract: localContract, manifests, authorization, metadata };
}
test('fresh timestamps replace old captured preconditions; only before fields enter exact masks, conflicts stop all', () => {
  const f = fixture(); f.records.get('days/one').data.vesperR = 'new';
  const prepared = prepareCoordinatedFresh(f.plan, f.records);
  assert.deepEqual(prepared[0].write.updateMask.fieldPaths, ['laudesR']);
  assert.equal(prepared[0].write.currentDocument.updateTime, '1970-01-01T00:00:10.123456789Z');
  assert.equal(prepared[0].plan.fields.length, 2, 'all selected fields are read back, including already-after');
  assert.ok(prepared.every(p => !p.plan.document.startsWith('liturgicalProperTexts/')));
  f.records.get('liturgicalTemplates/one').data.laudesR = 'unknown';
  assert.throws(() => prepareCoordinatedFresh(f.plan, f.records), /conflicts/);
});
test('manifest versions come from actual root, preserve all other entries; introduction is explicit', () => {
  const f = fixture(), described = Object.fromEntries(names.map(name => [name, f.contract.expected[name]]));
  const next = coordinatedManifestPlan(described, f.manifests, f.authorization, f.contract, 1794900000000);
  assert.equal(next.current.collections.days.version, 12); assert.equal(next.current.collections.liturgicalTemplates.version, 9); assert.equal(next.current.collections.liturgicalProperTexts.version, 1);
  assert.equal(next.current.contentVersion, 1794900000000); assert.equal(next.current.schemaVersion, 1);
  assert.deepEqual(next.current.collections.readings, f.manifests.get('contentManifest/current').data.collections.readings);
  assert.equal(next.current.keepRootMetadata, 'KEEP');
  assert.throws(() => coordinatedManifestPlan(described, f.manifests, { ...f.authorization, introduceCollections: [] }, f.contract), /Introduction/);
  f.manifests.get('contentManifest/current').data.collections.days.version++;
  assert.throws(() => coordinatedManifestPlan(described, f.manifests, f.authorization, f.contract), /baseline changed/);
});
test('live metadata fence reuses exact-version hashes, reads only changed documents and stops on mismatch/budget/IDs', async () => {
  const f = fixture(), catalog = Object.fromEntries([...f.nextRecords].map(([n, r]) => [n, catalogEntry(n, r)]));
  await verifyLiveCatalog(f.metadata(), catalog, () => assert.fail('extra data read'), f.contract, 0);
  f.records.get('liturgicalProperTexts/one').updateTime.seconds++;
  let reads = 0;
  const read = async ids => { reads += ids.length; return new Map(ids.map(id => [id, f.records.get(id)])); };
  await verifyLiveCatalog(f.metadata(), catalog, read, f.contract, 1); assert.equal(reads, 1);
  f.records.get('liturgicalProperTexts/one').data.laudesR = 'unexpected production edit'; f.records.get('liturgicalProperTexts/one').updateTime.seconds++;
  await assert.rejects(verifyLiveCatalog(f.metadata(), catalog, read, f.contract, 0), /budget/); assert.equal(reads, 1);
  await assert.rejects(verifyLiveCatalog(f.metadata(), catalog, read, f.contract, 1), /Live bundle digest/);
  await assert.rejects(verifyLiveCatalog([...f.metadata(), { document: 'days/new', updateTime: { seconds: 1, nanoseconds: 1 } }], catalog, read, f.contract, 50), /IDs\/count/);
});
function adapterFor(f, options = {}) {
  const state = { receipts: [], attempts: [] }, reads = [], writes = [], manifestWrites = [];
  const journal = async update => { Object.assign(state, structuredClone(update)); if (options.failPending && update.receipts?.at(-1)?.readback === 'pending') throw Error('SIMULATED CRASH before readback'); };
  const read = async ids => { reads.push([...ids]); return new Map(ids.map(id => [id, structuredClone(f.records.get(id))])); };
  const adapter = { read, readManifest: async () => structuredClone(f.manifests),
    commit: async batch => {
      writes.push(batch);
      const writeResults = [];
      for (const w of batch) {
        const name = w.update.name.split('/documents/')[1], record = f.records.get(name);
        assert.equal(w.currentDocument.updateTime, timestampString(record.updateTime));
        assert.ok(!name.startsWith('liturgicalProperTexts/'));
        const data = Object.fromEntries(Object.entries(w.update.fields).map(([k, v]) => [k, decodeFirestoreValue(v)]));
        for (const mask of w.updateMask.fieldPaths) record.data[mask] = data[mask];
        record.updateTime = { seconds: 20 + writes.length, nanoseconds: 456789012 };
        writeResults.push({ updateTime: timestampString(record.updateTime) });
      }
      return { writeResults };
    },
    publishManifest: async ({ catalog, manifests, contract, authorization, journal }) => {
      if (options.driftProper) { f.records.get('liturgicalProperTexts/one').data.laudesR = 'unreviewed'; f.records.get('liturgicalProperTexts/one').updateTime.seconds++; }
      if (options.raceManifest) f.manifests.get('contentManifest/current').data.keepRootMetadata = 'EXTERNAL EDIT';
      assert.equal(valueSha256(f.manifests.get('contentManifest/current')), valueSha256(manifests.get('contentManifest/current')), 'manifest CAS conflict');
      const live = await verifyLiveCatalog(f.metadata(), catalog, read, contract, authorization.maxUncachedDocumentReads);
      const planned = coordinatedManifestPlan(live.described, f.manifests, authorization, contract, 1794900000000);
      await journal({ manifestAttempt: { payloads: planned.payloads, liveDigestGate: live } });
      for (const [n, data] of Object.entries(planned.payloads)) f.manifests.set(n, { data, updateTime: { seconds: 100, nanoseconds: 8 } });
      manifestWrites.push(planned.payloads);
      if (options.failAfterManifest) throw Error('SIMULATED manifest acknowledgement lost');
      return { ...planned, liveDigestGate: live };
    } };
  return { adapter, journal, state, reads, writes, manifestWrites };
}
const run = (f, a, previous = {}) => executeCoordinatedRelease({ plan: f.plan, ...a, contract: f.contract, authorization: f.authorization,
  compatibility: { policy: COORDINATED_POLICY }, baselineCatalog: { documents: f.catalog }, previous, mode: 'execute', batchSize: 1 });
test('controlled batches/readback then four coherent manifests; no Proper/Advent overwrite and checksums retained', async () => {
  const f = fixture(), a = adapterFor(f); await run(f, a);
  assert.equal(a.writes.length, 2); assert.equal(a.manifestWrites.length, 1); assert.equal(a.state.state, 'coordinated-release-readbacks-verified');
  assert.equal(f.records.get('days/one').data.advent, 'DO NOT CHANGE'); assert.equal(f.records.get('liturgicalProperTexts/one').data.laudesR, 'PROPER STAYS');
  assert.equal(Object.keys(a.state.manifestReceipt).length, 4);
  assert.ok(a.state.receipts.every(b => b.readback === 'verified' && b.documents.every(d => d.writtenFieldMasks.length && d.readbackUpdateTime)));
  assert.equal(a.reads.flat().filter(n => n.startsWith('liturgicalProperTexts/')).length, 0);
});
test('non-mask target mismatch is rejected BEFORE data writes using the same fresh preflight', async () => {
  const f = fixture(); f.records.get('days/one').data.advent = 'later real production value';
  const a = adapterFor(f); await assert.rejects(run(f, a), /cannot match Flutter bundle/);
  assert.equal(a.writes.length, 0); assert.equal(a.manifestWrites.length, 0);
});

test('incompatible current schema is rejected before any target preflight or writes', async () => {
  const f = fixture(); f.manifests.get('contentManifest/current').data.schemaVersion = 2;
  f.authorization.manifestBaselineSha256 = valueSha256(f.manifests.get('contentManifest/current').data);
  const a = adapterFor(f); await assert.rejects(run(f, a), /baseline changed/);
  assert.equal(a.reads.length, 0); assert.equal(a.writes.length, 0);
});

test('unknown preflight conflict => zero commits; later unrelated edit/digest mismatch => zero manifest switch', async () => {
  const f = fixture(); f.records.get('liturgicalTemplates/one').data.laudesR = 'conflict'; const a = adapterFor(f);
  await assert.rejects(run(f, a), /conflicts/); assert.equal(a.writes.length, 0);
  for (const options of [{ driftProper: true }, { raceManifest: true }]) {
    const f = fixture(), before = structuredClone(f.manifests.get('contentManifest/current')), a = adapterFor(f, options);
    await assert.rejects(run(f, a), /Live bundle digest|CAS conflict/); assert.equal(a.manifestWrites.length, 0); assert.equal(a.writes.length, 2);
    if (!options.raceManifest) assert.deepEqual(f.manifests.get('contentManifest/current'), before);
  }
});
test('resume verifies pending commit without repeating writes; already-after docs require zero data writes', async () => {
  const f = fixture(), first = adapterFor(f, { failPending: true }); await assert.rejects(run(f, first), /SIMULATED/);
  const resumed = adapterFor(f); await run(f, resumed, first.state);
  assert.equal(resumed.writes.length, 1); assert.equal(resumed.writes[0][0].update.name.endsWith('liturgicalTemplates/one'), true);
  const after = fixture(); after.records = after.nextRecords; after.metadata = () => [...after.records].map(([document, r]) => ({ document, updateTime: r.updateTime }));
  const a = adapterFor(after); await run(after, a); assert.equal(a.writes.length, 0); assert.equal(a.manifestWrites.length, 1);
  assert.ok(a.state.receipts.every(b => b.documents.every(d => d.writtenFieldMasks.length === 0)));
});
test('pending receipt timestamp drift is refused; manifest-acknowledgement crash resumes by readback only', async () => {
  const f = fixture(), a = adapterFor(f, { failPending: true }); await assert.rejects(run(f, a), /SIMULATED/);
  f.records.get('days/one').updateTime.seconds++;
  await assert.rejects(run(f, adapterFor(f), a.state), /updateTime conflict/);
  const g = fixture(), first = adapterFor(g, { failAfterManifest: true }); await assert.rejects(run(g, first), /acknowledgement lost/);
  const second = adapterFor(g); await run(g, second, first.state);
  assert.equal(second.writes.length, 0); assert.equal(second.manifestWrites.length, 0); assert.equal(second.reads.length, 0); assert.equal(second.state.resumedManifest, true);
});
test('resumed commit request numbers cannot collide with the previous acknowledgement journal', async () => {
  const events = [], commit = createReleaseCommit({ getAccessToken: async () => ({ access_token: 'SECRET' }) }, { initialRequestNumber: 40,
    onEvent: async e => events.push(e), fetchImpl: async () => new globalThis.Response(JSON.stringify({ writeResults: [{ updateTime: '1970-01-01T00:00:20.000000001Z' }] })) });
  await commit([{ update: { name: 'projects/ibreviaryby/databases/(default)/documents/days/one' }, updateMask: { fieldPaths: ['laudesR'] }, currentDocument: { updateTime: '1970-01-01T00:00:10Z' } }]);
  assert.equal(events[0].request.requestNumber, 41); assert.equal(events.at(-1).requestNumber, 41);
});
test('catalog JSON and catalog-hash comparisons have stable canonical ordering', () => {
  const f = fixture(); assert.equal(valueSha256({ a: 1, b: 2 }), valueSha256({ b: 2, a: 1 }));
  assert.deepEqual(describeCatalog(Object.fromEntries([...f.nextRecords].map(([n, r]) => [n, catalogEntry(n, r)])), f.contract), f.contract.expected);
  assert.equal(typeof canonicalJson(f.catalog), 'string');
});

test('actual manifest transaction adapter queues indexes before root, never retries, and writes no unchanged payload', async () => {
  const f = fixture(); f.records = f.nextRecords;
  const catalog = Object.fromEntries([...f.records].map(([n, r]) => [n, catalogEntry(n, r)]));
  const commits = [], reads = [], state = {};
  const snapshot = name => { const record = f.manifests.get(name) || f.records.get(name); return { exists: !!record, ref: { path: name }, data: () => structuredClone(record?.data), updateTime: record?.updateTime }; };
  const db = {
    doc: path => ({ path }), collection: name => ({ select: () => ({ collection: name, projection: 'names-only' }) }),
    runTransaction: async (callback, options) => {
      assert.equal(options.maxAttempts, 1);
      const queued = [];
      const tx = { getAll: async (...refs) => { reads.push(refs.map(r => r.path)); return refs.map(r => snapshot(r.path)); },
        get: async query => { assert.equal(query.projection, 'names-only'); return { docs: [...f.records.keys()].filter(n => n.startsWith(query.collection + '/')).map(snapshot) }; },
        set: (ref, data) => queued.push([ref.path, structuredClone(data)]) };
      const result = await callback(tx);
      for (const [name, data] of queued) f.manifests.set(name, { data, updateTime: { seconds: 200, nanoseconds: 12 } });
      commits.push(queued.map(([name]) => name)); return result;
    },
  };
  const parameters = () => ({ catalog, manifests: structuredClone(f.manifests), contract: f.contract, authorization: { ...f.authorization, manifestBaselineSha256: valueSha256(f.manifests.get('contentManifest/current').data) }, journal: async data => Object.assign(state, data) });
  await publishCoordinatedManifest(db, parameters());
  assert.deepEqual(commits[0], ['contentManifest/days', 'contentManifest/liturgicalTemplates', 'contentManifest/liturgicalProperTexts', 'contentManifest/current']);
  assert.equal(state.manifestAttempt.writeDocuments.length, 4);
  assert.equal(reads.length, 1, 'one fresh manifest read inside the atomic fence');
  await publishCoordinatedManifest(db, parameters()); assert.deepEqual(commits[1], [], 'an already-published manifest is not written again');
  f.records.get('liturgicalProperTexts/one').data.laudesR = 'unknown'; f.records.get('liturgicalProperTexts/one').updateTime.seconds++;
  const before = structuredClone(f.manifests);
  await assert.rejects(publishCoordinatedManifest(db, parameters()), /Live bundle digest/);
  assert.deepEqual(f.manifests, before); assert.equal(commits.length, 2);
});

test('committed quota-saving catalog contains only public hashes/sizes/times and pins prior Proper receipts', () => {
  const catalog = JSON.parse(zlib.gunzipSync(catalogBytes));
  assert.equal(catalog.schema, 1); assert.equal(Object.keys(catalog.documents).length, 1043);
  assert.equal(catalog.inputs.sourcePlanBinarySha256, contract.report.sourcePlanSha256);
  assert.equal(catalog.properReceiptSha256, published.receiptSha256);
  for (const [name, item] of Object.entries(catalog.documents)) {
    assert.ok(names.includes(name.split('/')[0])); assert.deepEqual(Object.keys(item).sort(), ['bytes', 'hash', 'updateTime']);
    assert.match(item.hash, /^[a-f0-9]{16}$/u); assert.ok(Number.isSafeInteger(item.bytes) && item.bytes > 0);
  }
});

test('future manual workflow scripts parse without executing credentials or Firebase commands', () => {
  const workflow = fs.readFileSync('.github/workflows/pr245-reviewed-content.yml', 'utf8');
  const scripts = [...workflow.matchAll(/node --input-type=module <<'JS'\n([\s\S]*?)\n {10}JS/gu)];
  assert.equal(scripts.length, 2);
  for (const [, script] of scripts) execFileSync(process.execPath, ['--input-type=module', '--check'], { input: script.replace(/^ {10}/gmu, ''), stdio: ['pipe', 'pipe', 'pipe'] });
  assert.ok(workflow.indexOf('verifyCoordinatedAuthorization') < workflow.indexOf('secrets.FIREBASE_SERVICE_ACCOUNT_IBREVIARYBY'));
  assert.match(workflow, /group: firebase-firestore-production/u);
});


test('rollback uses acknowledged masks only, preserving fields/docs already after before this release', () => {
  const f = fixture(), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pr255-exact-rollback-'));
  try {
    const bytes = zlib.gzipSync(JSON.stringify(f.plan)), planPath = temp + '/plan.gz', receiptPath = temp + '/receipt.json';
    const documents = f.plan.documents.map((d, i) => ({ document: d.document, serverUpdateTime: '1970-01-01T00:00:20.000000009Z',
      writtenFieldMasks: i === 0 ? ['laudesR'] : [], fields: d.fields.map(field => ({ field: field.field, path: field.path, beforeSha256: field.beforeSha256, afterSha256: field.afterSha256 })) }));
    fs.writeFileSync(planPath, bytes); fs.writeFileSync(receiptPath, JSON.stringify({ schema: 3, project: 'ibreviaryby', mode: 'execute', planSha256: editorialHash(bytes), compatibility: { planBinarySha256: binarySha256(bytes) }, receipts: [{ readback: 'verified', documents }] }));
    execFileSync(process.execPath, ['scripts/liturgy/build-editorial-rollback-v3.mjs', '--receipt', receiptPath, '--out', temp + '/rollback.gz', '--source-plan', planPath], { stdio: 'pipe' });
    const rollback = JSON.parse(zlib.gunzipSync(fs.readFileSync(temp + '/rollback.gz')));
    assert.equal(rollback.documents.length, 1); assert.equal(rollback.summary.readyFields, 1); assert.equal(rollback.documents[0].fields[0].field, 'laudesR');
    assert.equal(rollback.documents[0].fields[0].before, 'new'); assert.equal(rollback.documents[0].fields[0].after, 'old');
    assert.deepEqual(rollback.documents[0].updateTime, { seconds: 20, nanoseconds: 9 });
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test('owner test-app policy requires exact reconciled target and real proof files, without fake mobile evidence', () => {
  const target = loadCoordinatedContract(undefined, { testApp: true });
  assert.notDeepEqual(target.expected, contract.expected);
  assert.equal(target.expected.days.digest, 'cbe2b5a263890a42');
  const folder = 'docs/.test-pr255-test-app-gate';
  fs.mkdirSync(folder, { recursive: true });
  try {
    const revisions = ['6b5b278fcb0f77f557cf5f739c455236cb19029c', '84d1d6dd61f8cb78aa33fb1b6538996f9156fc20', '6ef0ba811e351d787eec349af81e82b9f94d465a'];
    const write = (name, data) => {
      const file = `${folder}/${name}.json`, bytes = Buffer.from(JSON.stringify(data));
      fs.writeFileSync(file, bytes); return { path: file, sha256: binarySha256(bytes) };
    };
    const sourceReview = write('review', { schema: 1, repository: 'senddownrain/ibreviarybyapp', revisions: revisions.map(revision => ({ revision, updaterSha256: 'a'.repeat(64), userDataBoxesUntouched: true })) });
    const testResults = write('results', { schema: 1, passed: 3, failed: 0, firebaseReads: 0, firebaseWrites: 0,
      runs: revisions.map(revision => ({ revision, status: 'passed', passed: 1, failed: 0 })),
      appReleaseDataPreservation: true, appReleaseRestart: true, upgradeStatusClears: true,
      settingsFavoritesPersonalPrayersPreserved: true, targetHashesVerified: true });
    const fixture = releaseFixture();
    const { evidence, authorization } = fixture;
    delete evidence.release; delete evidence.nativeSmoke; delete evidence.compatibility;
    Object.assign(evidence, { policy: target.testApp.policy, targetContractSha256: target.targetContractSha256,
      supplementSha256: target.testApp.supplementSha256, mobileReleaseRequired: false, mobileReleasePerformed: false,
      installedClientInventory: 'not-available', sourceReview, testResults,
      targetHashVerification: write('target', { status: 'passed', targetContractSha256: target.targetContractSha256, collections: target.expected,
        sourceFiles: Object.fromEntries(names.map(n => [n+'.json.gz', contract.report.files[n+'.json.gz'].sha256])) }) });
    Object.assign(authorization, { executionPolicy: evidence.policy, targetContractSha256: target.targetContractSha256 });
    const bind = () => {
      fixture.evidenceBytes = Buffer.from(JSON.stringify(evidence));
      authorization.releaseEvidenceSha256 = binarySha256(fixture.evidenceBytes);
      authorization.massManifestReview.releaseEvidenceSha256 = authorization.releaseEvidenceSha256;
    };
    bind();
    assert.equal(verify(fixture, { contract: target }).executionPolicy, target.testApp.policy);
    assert.throws(() => verify(fixture), /Flutter release not confirmed/);
    evidence.targetContractSha256 = '0'.repeat(64); bind(); assert.throws(() => verify(fixture, { contract: target }), /target authorization/);
    evidence.targetContractSha256 = target.targetContractSha256;
    evidence.release = { confirmed: true }; bind(); assert.throws(() => verify(fixture, { contract: target }), /fabricate/);
    delete evidence.release; evidence.testResults.sha256 = '0'.repeat(64); bind(); assert.throws(() => verify(fixture, { contract: target }), /proof SHA/);
    assert.equal(publicationDecision('MASS CONTENT REBUILD').publish, false);
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});

#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { openFirestoreSnapshot } from './lib/firestore-snapshot.mjs';
import { decodeCollection } from './content/lib/app-content.mjs';
import { PRAYER_COLLECTIONS, isPrayerCollection, buildShortSourcePlan, sourceWrites, applySourcePlan, rollbackSourcePlan } from './lib/prayer-source-plan.mjs';

const options = {};
for (let i = 2; i < process.argv.length; i++) {
  const flag = process.argv[i];
  if (['--capture', '--apply', '--rollback', '--manifest-context'].includes(flag)) options[flag.slice(2)] = true;
  else if (['--snapshot', '--bundle', '--out', '--plan', '--approve-sha', '--service-account', '--journal'].includes(flag)) options[flag.slice(2)] = process.argv[++i];
  else throw new Error(`Unknown option: ${flag}`);
}
const out = path.resolve(options.out || 'backups/prayer-sources-unification');
const writeJson = async (file, value, exclusive = false) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2) + '\n', { flag: exclusive ? 'wx' : 'w', mode: 0o600 });
};
const hash = (value) => createHash('sha256').update(value).digest('hex');
async function main() {
  if ([options.capture, options.apply, options.rollback].filter(Boolean).length > 1) throw new Error('Choose one live operation');
  let rest;
  const live = async () => rest ||= await (await import('./lib/prayer-source-rest.mjs')).createSourceRest({ serviceAccount: options['service-account'] });
  if (options.capture) {
    // Only when there is no usable snapshot and a new scoped read is authorized. Never refresh an existing snapshot.
    await fs.mkdir(out, { recursive: true });
    const capture = path.join(out, 'snapshot');
    await fs.mkdir(capture, { recursive: false });
    const api = await live();
    const receipt = { requests:[], documentsReturned:0, writes:0 };
    const captureRequest = async (url, body, method='POST') => {
      const row={method,path:new URL(url).pathname};
      try {
        const response=await api.request(url,body,method);
        row.status=200;row.documents=(response.documents || (response.name ? [response] : [])).length;
        receipt.documentsReturned+=row.documents;receipt.requests.push(row);
        // Preserve each successful response before the next request, even if a later page fails.
        await writeJson(path.join(capture,'pages',`${receipt.requests.length}.json`),response,true);
        await writeJson(path.join(capture,'capture-receipt.json'),receipt);
        return response;
      } catch (error) {
        if (!receipt.requests.includes(row)) {row.status=error.status || 'transport-error';receipt.requests.push(row);}
        await writeJson(path.join(capture,'capture-receipt.json'),receipt);
        throw error;
      }
    };
    const names = new Set(PRAYER_COLLECTIONS);
    if (options['manifest-context']) for (const name of ['prayerCategories','priestProtectedCategories']) names.add(name);
    let pageToken;
    do {
      const response = await captureRequest(api.base + '/documents:listCollectionIds', { pageSize: 1000, ...(pageToken ? { pageToken } : {}) });
      for (const name of response.collectionIds || []) if (isPrayerCollection(name)) names.add(name);
      pageToken = response.nextPageToken;
    } while (pageToken);
    const manifest = { schemaVersion: 1, projectId: 'ibreviaryby', snapshotVersion: new Date().toISOString(), scope: 'prayer collections only; top-level discovery', collections: {} };
    const {decodeSourceRestValue:decode} = await import('./lib/prayer-source-rest.mjs');
    for (const collection of names) {
      const documents = []; let page;
      do {
        const url = new URL(api.base + '/documents/' + collection); url.searchParams.set('pageSize', '1000');
        if (page) url.searchParams.set('pageToken', page);
        const response = await captureRequest(url, undefined, 'GET');
        for (const doc of response.documents || []) documents.push({ id: doc.name.split('/').at(-1), data: Object.fromEntries(Object.entries(doc.fields || {}).map(([k,v]) => [k,decode(v)])), updateTime: doc.updateTime });
        page = response.nextPageToken;
      } while (page);
      const file = `${collection}.json`, text = JSON.stringify({ schemaVersion: 1, collectionPath: collection, documents });
      await fs.writeFile(path.join(capture, file), text, {mode:0o600});
      manifest.collections[collection] = { file, documentCount: documents.length, sha256: hash(text) };
    }
    if (options['manifest-context']) {
      // Two exact manifest documents, never a scan of unrelated published collections.
      const documents=[];
      for (const id of ['current','prayers']) {
        const doc=await captureRequest(api.base+'/documents/contentManifest/'+id,undefined,'GET');
        documents.push({id,data:Object.fromEntries(Object.entries(doc.fields || {}).map(([k,v])=>[k,decode(v)])),updateTime:doc.updateTime});
      }
      const file='contentManifest.json', text=JSON.stringify({schemaVersion:1,collectionPath:'contentManifest',documents});
      await fs.writeFile(path.join(capture,file),text,{mode:0o600});
      manifest.collections.contentManifest={file,documentCount:documents.length,sha256:hash(text)};
      manifest.scope+='; access categories and two targeted prayers manifest documents';
    }
    await writeJson(path.join(capture, 'manifest.json'), manifest, true);
    options.snapshot = capture;
  }
  if (options.apply || options.rollback) {
    let plan = JSON.parse(await fs.readFile(options.plan, 'utf8'));
    if (plan.planSha256 !== options['approve-sha']) throw new Error('--approve-sha must match the reviewed plan');
    if (options.rollback) {
      const journal = JSON.parse(await fs.readFile(options.journal, 'utf8'));
      plan = rollbackSourcePlan(plan, journal);
    } else {
      if (plan.analysisSource !== 'firestore-snapshot' || PRAYER_COLLECTIONS.some((name) => !Object.hasOwn(plan.coverage, name))) throw new Error('Apply requires a snapshot covering public, protected and closed draft collections');
    }
    sourceWrites(plan, 'ibreviaryby'); // validate before contacting Firebase
    await fs.mkdir(out, { recursive: true });
    const backupPath = path.join(out, 'before.json'), journalPath = path.join(out, 'journal.json');
    let previous;
    try {
      const backup = JSON.parse(await fs.readFile(backupPath, 'utf8'));
      if (backup.planSha256 !== plan.planSha256) throw new Error('Output directory belongs to a different plan');
      previous = JSON.parse(await fs.readFile(journalPath, 'utf8'));
      rollbackSourcePlan(plan, previous); // refuse foreign or modified journals before authentication
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await writeJson(backupPath, plan, true); // refuses an existing backup with a missing journal
    }
    const previouslyCommitted = previous?.committed.length || 0;
    if (previous && previouslyCommitted === plan.changes.length && !previous.pendingReadback) {
      console.log(JSON.stringify({written:0,alreadyAcknowledged:previouslyCommitted,totalWritten:previouslyCommitted,readbacksThisRun:0,journalPath}));
      return;
    }
    const api = await live();
    const journal = await applySourcePlan(plan, {
      commit: (writes) => api.request(api.base + '/documents:commit', { writes }),
      saveJournal: (data) => writeJson(journalPath, data),
      readback: async ({collection,id}) => {
        const doc = await api.request(api.base + '/documents/' + collection + '/' + id + '?mask.fieldPaths=source&mask.fieldPaths=sourceBook', undefined, 'GET');
        return Object.fromEntries(Object.entries(doc.fields || {}).map(([field,value]) => [field,value.stringValue]));
      },
    }, { journal: previous });
    console.log(JSON.stringify({ written: journal.committed.length - previouslyCommitted, alreadyAcknowledged: previouslyCommitted, totalWritten: journal.committed.length, readbacks: journal.verified.length, journalPath }));
    return;
  }
  let collections, analysisSource, coverage;
  if (options.bundle) {
    const bundle = JSON.parse(gunzipSync(await fs.readFile(path.join(options.bundle, 'prayers.json.gz'))));
    collections = new Map([['prayers', Object.entries(decodeCollection(bundle)).map(([id,data]) => ({id,data}))]]);
    analysisSource = 'flutter-bundle'; coverage = { prayers: { bundleVersion: bundle.contentVersion, currentProduction: false } };
  } else {
    const snapshot = await openFirestoreSnapshot(options.snapshot || 'backups/firestore-snapshot');
    if (snapshot.manifest.projectId && snapshot.manifest.projectId !== 'ibreviaryby') throw new Error('Snapshot belongs to another project');
    collections = new Map(); coverage = {};
    for (const name of snapshot.collectionPaths.filter(isPrayerCollection)) {
      const entries = await snapshot.collectionEntries(name);
      collections.set(name, entries.map((entry) => ({ ...entry, updateTime: typeof entry.updateTime === 'string' ? entry.updateTime : entry.updateTime ? new Date(entry.updateTime.seconds * 1000).toISOString().replace(/\.\d{3}Z$/, '.' + String(entry.updateTime.nanoseconds).padStart(9,'0') + 'Z') : undefined })));
      coverage[name] = { documents: entries.length, snapshotVersion: snapshot.manifest.snapshotVersion };
    }
    analysisSource = 'firestore-snapshot';
  }
  const plan = buildShortSourcePlan(collections, {analysisSource,coverage});
  await writeJson(path.join(out,'plan.json'), plan, true);
  console.log(JSON.stringify({ ...plan.counts, disputedDocuments: plan.disputedDocuments, planSha256: plan.planSha256, out }));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });

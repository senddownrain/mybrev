#!/usr/bin/env node
// Offline candidate only. Does not replace shipped assets or publish a manifest.
import fs from 'node:fs/promises';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { decodeCollection, encodeCollection, describeDocuments, documentHash } from './content/lib/app-content.mjs';
import { buildShortSourcePlan } from './lib/prayer-source-plan.mjs';

export function buildPrayerBundleCandidate(bundle) {
  const original = decodeCollection(bundle);
  for (const [id, data] of Object.entries(original)) if (bundle.hashes[id] !== documentHash(data)) throw new Error('Baseline hash mismatch: ' + id);
  const plan = buildShortSourcePlan(new Map([['prayers', Object.entries(original).map(([id,data]) => ({id,data}))]]), {analysisSource:'flutter-bundle'});
  const corrected = structuredClone(original);
  for (const change of plan.changes) Object.assign(corrected[change.id], change.updates);
  const docs = Object.entries(corrected).map(([id,data]) => ({...data,id}));
  const described = describeDocuments(docs);
  const candidate = {...bundle, ...encodeCollection(docs), hashes: described.hashes, candidateOnly:true};
  // No fabricated published generation: keep the baseline version, label the file as a candidate.
  return {candidate, plan, summary:{candidateOnly:true,releaseReady:false,baselineVersion:bundle.contentVersion,count:docs.length,changedDocuments:plan.changes.length,disputedDocuments:plan.disputedDocuments,candidateDigest:described.digest,firestoreReads:0,firestoreWrites:0,manifestWrites:0}};
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if(args.length!==4||args[0]!=='--bundle'||args[2]!=='--out') throw new Error('Usage: --bundle <existing content directory> --out backups/<candidate directory>');
  const output=path.resolve(args[3]);
  if(!output.startsWith(path.resolve('backups')+path.sep)) throw new Error('Candidate output must be under ignored backups/');
  const bundle=JSON.parse(gunzipSync(await fs.readFile(path.join(args[1],'prayers.json.gz'))));
  const {candidate,plan,summary}=buildPrayerBundleCandidate(bundle);
  await fs.mkdir(output,{recursive:true});
  for(const [file,value] of [['prayers.candidate.json.gz',gzipSync(JSON.stringify(candidate))],['source-plan.json',JSON.stringify(plan,null,2)+'\n'],['candidate-summary.json',JSON.stringify(summary,null,2)+'\n']]) await fs.writeFile(path.join(output,file),value,{flag:'wx',mode:0o600});
  console.log(JSON.stringify(summary));
}

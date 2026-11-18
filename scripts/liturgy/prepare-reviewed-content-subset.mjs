#!/usr/bin/env node
/** Select from the EXISTING PR #245 dry-run. No new corpus audit, refresh,
 * Firestore client, apply flag, or publication. All masks stay field-specific. */
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { openFirestoreSnapshot } from '../lib/firestore-snapshot.mjs';
import { buildFirestoreWrite, verifyPlannedDocument } from './audit-doxologies.mjs';
import { isTwoLineVersicle, reviewAntiphon, reviewHash } from './lib/manual-common-review.mjs';
const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--snapshot')throw Error('Usage: --snapshot <existing-local-snapshot>; no apply/live mode.');
const out='docs/audits/liturgical-common-texts-2026-11';
const readGzip=name=>JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(out,name))));
const original=readGzip('dry-run.json.gz'),audit=readGzip('audit.json.gz');
const findings=new Map();
for(const candidate of audit.candidates.filter(c=>c.source==='snapshot')){
 const key=candidate.collection+'/'+candidate.id+'|'+candidate.field;
 if(!findings.has(key))findings.set(key,[]);findings.get(key).push(candidate);
}
const snapshot=await openFirestoreSnapshot(args[1]),collections=new Map();
const getEntry=async(document)=>{const [name,id]=document.split('/');if(!collections.has(name))collections.set(name,new Map((await snapshot.collectionEntries(name)).map(e=>[e.id,e])));return collections.get(name).get(id);};
const documents=[],held=[],index=[];
for(const old of original.documents){
 const entry=await getEntry(old.document);if(!entry)throw Error('Missing snapshot document '+old.document);
 verifyPlannedDocument(entry.data,old,entry.updateTime);
 const fields=[];
 for(const field of old.fields){
  const candidates=findings.get(old.document+'|'+field.field)||[],reasons=[];
  if(!candidates.some(c=>c.beforeSha256===field.beforeSha256&&c.afterSha256===field.afterSha256))reasons.push('No matching prior reviewed change/hash pair.');
  for(const c of candidates.filter(c=>c.status==='manual-review')){
   const baseField=field.path.at(-1);
   if(c.type==='abbreviated-responsory'){
    if(!isTwoLineVersicle(field.after,baseField))reasons.push('Unresolved responsory remains in this complete field.');
   }else if(c.type==='embedded-antiphon-needs-context'){
    const parent=field.path.slice(0,-1).reduce((v,k)=>v?.[k],entry.data);
    const antField=baseField.replace(/Ps([123])$/u,'Ant$1'),dedicated=parent?.[antField]??entry.data[antField]??'';
    const before=reviewAntiphon(field.before,dedicated),after=reviewAntiphon(field.after,dedicated);
    const kept=JSON.stringify(before.embedded?.map(a=>a.text))===JSON.stringify(after.embedded?.map(a=>a.text));
    if(!kept||!['formatting-only','printed-text-variant','owned-alternative-antiphons'].includes(after.classification))reasons.push('Antiphon form/ownership not proven preserved.');
   }else reasons.push('Unresolved prior finding: '+c.type);
  }
  if(reasons.length)held.push({document:old.document,field:field.field,reason:[...new Set(reasons)]});
  else{fields.push(field);index.push({document:old.document,field:field.field,beforeSha256:field.beforeSha256,afterSha256:field.afterSha256,
   provenance:'Existing PR245 dry-run; reviewed transformations; no unresolved contents in this whole field.',sourcePlanField:field.field});}
 }
 if(fields.length){const plan={document:old.document,updateTime:old.updateTime,fields};buildFirestoreWrite(entry.data,plan);documents.push(plan);}
}
let batches=0,count=0,bytes=0;
for(const doc of documents){const write=buildFirestoreWrite((await getEntry(doc.document)).data,doc),size=Buffer.byteLength(JSON.stringify(write));if(count&&(count>=400||bytes+size>8*1024*1024)){batches++;count=0;bytes=0;}count++;bytes+=size;}if(count)batches++;
const summary={sourceDocuments:original.documents.length,sourceFields:original.documents.reduce((n,d)=>n+d.fields.length,0),readyDocuments:documents.length,readyFields:index.length,heldFields:held.length,maximumCommitWrites:400,maximumCommitBytes:8*1024*1024,estimatedBatches:batches};
const result={schema:1,mode:'content-reviewed-dry-run-only',scope:'Subset of the existing PR245 plan, not a new audit.',sourcePlanSha256:reviewHash(fs.readFileSync(path.join(out,'dry-run.json.gz'))),snapshotAt:snapshot.manifest.exportedAt,
 preflightRequired:'Snapshot updateTime and beforeSha256 must still match a fresh read before any future authorized write. Conflict means stop/review. This file authorizes no production action.',
 publication:'Independent content verification does not bypass MASS CONTENT REBUILD, app release or manifest gates. No manifest/revision/deploy operation is included.',summary,fields:index,held};
fs.writeFileSync(path.join(out,'ready-to-publish-fields.json.gz'),zlib.gzipSync(JSON.stringify(result)+'\n',{level:9}));
fs.writeFileSync(path.join(out,'ready-to-publish-summary.json'),JSON.stringify({...result,fields:undefined,held:undefined},null,2)+'\n');
fs.writeFileSync(path.join(out,'ready-to-publish-fields.tsv'),['document\tfield\tbeforeSha256\tafterSha256',...index.map(r=>[r.document,r.field,r.beforeSha256,r.afterSha256].join('\t'))].join('\n')+'\n');
fs.writeFileSync(path.join(out,'ready-to-publish-dry-run.json.gz'),zlib.gzipSync(JSON.stringify({schema:1,mode:'dry-run',network:false,summary,documents})+'\n',{level:9}));
console.log(JSON.stringify(summary,null,2));

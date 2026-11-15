#!/usr/bin/env node
/** Offline field rollback from the private commit journal, never a DB write. */
import fs from 'node:fs';
import zlib from 'node:zlib';
import { editorialHash } from './lib/editorial-responsories.mjs';
import { validatePublicationPlan } from './lib/editorial-publication.mjs';
const a=process.argv.slice(2);if(![4,6].includes(a.length)||a[0]!=='--receipt'||a[2]!=='--out'||(a.length===6&&a[4]!=='--source-plan'))throw Error('Usage: --receipt <private-json> --out <new-private-plan.gz> [--source-plan <pinned-plan.gz>]');
const receipt=JSON.parse(fs.readFileSync(a[1]));if(receipt.schema!==3||receipt.project!=='ibreviaryby'||receipt.mode!=='execute'||!Array.isArray(receipt.receipts))throw Error('Not a write receipt');
let source;
if(a[4]){const bytes=fs.readFileSync(a[5]);if(editorialHash(bytes)!==receipt.planSha256)throw Error('Source plan SHA differs from receipt');source=JSON.parse(zlib.gunzipSync(bytes));}
if(fs.existsSync(a[3]))throw Error('Do not overwrite rollback evidence');
const documents=receipt.receipts.flatMap(batch=>batch.documents.map(d=>{
 const m=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/u.exec(d.serverUpdateTime||'');if(!m)throw Error('Missing exact server commit timestamp');
 return {document:d.document,updateTime:{seconds:Date.parse(m[1]+'Z')/1000,nanoseconds:Number((m[2]||'').padEnd(9,'0'))},fields:d.fields.map(raw=>{
  const original=source?.documents.find(x=>x.document===d.document)?.fields.find(x=>x.field===raw.field);
  const f=typeof raw.before==='string'?raw:{...raw,before:original?.before,after:original?.after};
  if(editorialHash(f.before)!==f.beforeSha256||editorialHash(f.after)!==f.afterSha256)throw Error('Invalid journal hashes');
  return {...f,status:'ready',updateMask:f.field,before:f.after,after:f.before,beforeSha256:f.afterSha256,afterSha256:f.beforeSha256,edits:[{start:0,end:f.after.length,value:f.before}],operationClass:'owner-authorized-rollback',provenance:['Private write receipt '+receipt.planSha256]};
 })};
}));
const plan={schema:3,network:false,summary:{state:'rollback-content-ready, awaiting-live-preflight-and-separate-authorization',readyDocuments:documents.length,readyFields:documents.reduce((n,d)=>n+d.fields.length,0),heldFields:0},documents};validatePublicationPlan(plan);
fs.writeFileSync(a[3],zlib.gzipSync(JSON.stringify(plan)+'\n',{level:9}),{mode:0o600});console.log('Offline rollback plan saved; no writes.');

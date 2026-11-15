#!/usr/bin/env node
/** Explicit production phase. Content plan stays immutable across small batches. */
import fs from 'node:fs';
import zlib from 'node:zlib';
import { verifyCompatibleSubset } from './lib/editorial-compatible-subset.mjs';
import { editorialHash } from './lib/editorial-responsories.mjs';
import { preparePublicationResume,executePreparedPublication,boundPublicationWrites,validatePublicationPlan } from './lib/editorial-publication.mjs';
import { createReleaseCommit } from './lib/firestore-release-commit.mjs';
import { sanitizeReleaseValue } from './lib/firestore-release-errors.mjs';
const args=process.argv.slice(2),get=key=>{const i=args.indexOf(key);return i<0?null:args[i+1];};
if(args.includes('--help')||!args.length){console.log('--mode preflight|execute --plan <gz> --authorization <json> --service-account <private-json> --receipt <new-private-file> [--quota-report <json>] [--batch-size 25] [--resume <prior-receipt>]');process.exit(0);}
const allowed=['--mode','--plan','--authorization','--service-account','--receipt','--quota-report','--batch-size','--resume'];
if(args.length%2||args.some((v,i)=>i%2===0&&!allowed.includes(v))||new Set(args.filter((_,i)=>i%2===0)).size!==args.length/2)throw Error('Unknown/missing options');
for(const name of allowed.slice(0,5))if(!get(name))throw Error('Missing '+name);
const mode=get('--mode');if(!['preflight','execute'].includes(mode))throw Error('Invalid mode');
const bytes=fs.readFileSync(get('--plan')),plan=JSON.parse(zlib.gunzipSync(bytes)),planSha256=editorialHash(bytes),authorization=JSON.parse(fs.readFileSync(get('--authorization')));validatePublicationPlan(plan);
if(authorization.project!=='ibreviaryby'||authorization.planSha256!==planSha256||authorization.action!==mode||authorization.ownerApproved!==true||!authorization.reason||authorization.massRebuildReleaseGateReviewed!==true)throw Error('Concrete owner authorization and compatibility review required');
const receiptFile=get('--receipt');if(fs.existsSync(receiptFile))throw Error('Never overwrite a prior receipt');
const batchSize=Number(get('--batch-size')||25);if(!Number.isInteger(batchSize)||batchSize<1||batchSize>400)throw Error('Batch size outside bounds');
const previous=get('--resume')?JSON.parse(fs.readFileSync(get('--resume'))):{receipts:[]};
if(get('--resume')&&(previous.project!=='ibreviaryby'||previous.planSha256!==planSha256))throw Error('Resume receipt project/plan SHA mismatch');
const startedAt=new Date().toISOString();let state={receipts:previous.receipts||[],attempts:[],resumedFrom:get('--resume')?editorialHash(fs.readFileSync(get('--resume'))):null,batchSize};
const journal=update=>{state={...state,...update};fs.writeFileSync(receiptFile,JSON.stringify({schema:3,mode,startedAt,project:'ibreviaryby',planSha256,...state},null,2)+'\n',{mode:0o600});};
let phase='preflight';
try{
 const quota=get('--quota-report')?JSON.parse(fs.readFileSync(get('--quota-report'))):null;
 if(quota){if(quota.project!=='ibreviaryby'||Date.now()-Date.parse(quota.observedAt)>15*60000)throw Error('Quota report stale/wrong project');journal({quotaAssessment:quota.quotaAssessment,quotaReportSha256:editorialHash(fs.readFileSync(get('--quota-report')))});if(quota.quotaAssessment==='daily-free-write-quota-exhausted')throw Error('Current free daily write quota exhausted; no write/retry attempted');}
 const key=JSON.parse(fs.readFileSync(get('--service-account')));if(key.project_id!=='ibreviaryby')throw Error('Wrong Firebase project');
 const {initializeApp,cert}=await import('firebase-admin/app'),{getFirestore}=await import('firebase-admin/firestore');
 const credential=cert(key),app=initializeApp({credential,projectId:'ibreviaryby'}),db=getFirestore(app);
 const read=async names=>{const records=new Map();for(let i=0;i<names.length;i+=100)for(const doc of await db.getAll(...names.slice(i,i+100).map(n=>db.doc(n))))if(doc.exists)records.set(doc.ref.path,{data:doc.data(),updateTime:{seconds:doc.updateTime.seconds,nanoseconds:doc.updateTime.nanoseconds}});return records;};
 let compatibility;if(plan.compatibility){const manifest=await db.doc('contentManifest/current').get();if(!manifest.exists)throw Error('Missing published manifest');compatibility={...verifyCompatibleSubset(plan,manifest.data().collections),serverUpdateTime:{seconds:manifest.updateTime.seconds,nanoseconds:manifest.updateTime.nanoseconds}};}
 const verified=new Set((previous.receipts||[]).filter(b=>b.readback==='verified').flatMap(b=>b.documents.map(d=>d.document)));
 const records=await read(plan.documents.filter(d=>!verified.has(d.document)).map(d=>d.document));
 const resumed=preparePublicationResume(plan,records,previous),prepared=resumed.prepared;
 journal({state:'fresh-preflight-passed',compatibility,receipts:resumed.receipts,remainingDocuments:prepared.length,alreadyVerifiedDocuments:resumed.alreadyVerifiedDocuments});
 if(mode==='preflight')journal({state:'fresh-preflight-passed-no-writes',batches:boundPublicationWrites(prepared,{maxWrites:batchSize}).length});
 else{
  phase='write';
  const commit=createReleaseCommit(credential,{onEvent:async event=>{const attempts=[...state.attempts,event];journal({attempts,state:event.event==='failed-write'?'failed-write':'write-in-progress',...(event.failure?{failure:event.failure,classification:event.classification}:event.event==='acknowledged'?{failure:null,classification:null}:{})});}});
  const receipts=await executePreparedPublication(prepared,{read,commit,journal:receipts=>{phase=receipts.at(-1)?.readback==='pending'?'readback':'write';journal({state:'in-progress',receipts});}},{maxWrites:batchSize,initialReceipts:resumed.receipts,includeValues:false});
  journal({state:'all-field-readbacks-verified',receipts,writtenDocumentsAcknowledged:receipts.reduce((n,b)=>n+b.documents.length,0),writtenFieldsAcknowledged:receipts.reduce((n,b)=>n+b.documents.reduce((m,d)=>m+d.fields.length,0),0)});
 }
 console.log(JSON.stringify({state:state.state,documents:state.writtenDocumentsAcknowledged||0,fields:state.writtenFieldsAcknowledged||0,receipt:receiptFile,manifestWrites:0}));
}catch(error){journal({state:phase==='write'?'failed-write':phase==='readback'?'failed-readback':'preflight-blocked-no-writes',reason:sanitizeReleaseValue(error.message),...(error.releaseFailure?{failure:error.releaseFailure,classification:error.classification}:{}),conflicts:error.conflicts||[],writtenDocumentsAcknowledged:(state.receipts||[]).reduce((n,b)=>n+b.documents.length,0),writtenFieldsAcknowledged:(state.receipts||[]).reduce((n,b)=>n+b.documents.reduce((m,d)=>m+d.fields.length,0),0)});console.error(JSON.stringify({state:state.state,status:state.failure?.status,httpStatus:state.failure?.httpStatus,message:state.failure?.message||state.reason,classification:state.classification,acknowledgedDocuments:state.writtenDocumentsAcknowledged}));process.exitCode=1;}

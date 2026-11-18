#!/usr/bin/env node
/** Explicit production phase. Content plan stays immutable across small batches. */
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { toStorable } from '../content/lib/app-content.mjs';
import { selectDaysTemplates } from './prepare-days-templates.mjs';
import { loadCoordinatedContract,verifyCoordinatedAuthorization,binarySha256,executeCoordinatedRelease,publishCoordinatedManifest,loadVerifiedPreflightCheckpoint,verifyManifestOnlyResume } from './lib/coordinated-release.mjs';
import { verifyCompatibleSubset } from './lib/editorial-compatible-subset.mjs';
import { editorialHash } from './lib/editorial-responsories.mjs';
import { preparePublicationResume,executePreparedPublication,boundPublicationWrites,validatePublicationPlan } from './lib/editorial-publication.mjs';
import { createReleaseCommit } from './lib/firestore-release-commit.mjs';
import { sanitizeReleaseValue } from './lib/firestore-release-errors.mjs';
const args=process.argv.slice(2),get=key=>{const i=args.indexOf(key);return i<0?null:args[i+1];};
if(args.includes('--help')||!args.length){console.log('--mode preflight|execute --plan <gz> --authorization <json> --service-account <private-json> --receipt <new-private-file> [--quota-report <json>] [--batch-size 25] [--resume <prior-receipt>] [--coordinated-release <verified-Flutter-release-json> --baseline-catalog <gz>]');process.exit(0);}
const allowed=['--mode','--plan','--authorization','--service-account','--receipt','--quota-report','--batch-size','--resume','--coordinated-release','--baseline-catalog'];
if(args.length%2||args.some((v,i)=>i%2===0&&!allowed.includes(v))||new Set(args.filter((_,i)=>i%2===0)).size!==args.length/2)throw Error('Unknown/missing options');
for(const name of allowed.slice(0,5))if(!get(name))throw Error('Missing '+name);
const mode=get('--mode');if(!['preflight','execute'].includes(mode))throw Error('Invalid mode');
const bytes=fs.readFileSync(get('--plan')),plan=JSON.parse(zlib.gunzipSync(bytes)),planSha256=editorialHash(bytes),authorization=JSON.parse(fs.readFileSync(get('--authorization')));validatePublicationPlan(plan);
const coordinated=!!get('--coordinated-release');
let releaseCompatibility,contract,baselineCatalog;
if(coordinated){
 if(!get('--baseline-catalog'))throw Error('Coordinated hash/time catalog required');
 const evidenceBytes=fs.readFileSync(get('--coordinated-release'));
 contract=loadCoordinatedContract(undefined,{testApp:JSON.parse(evidenceBytes).policy==='pr255-test-app-before-mobile-release'});
 const root='docs/audits/liturgical-common-texts-2026-11/v4',sourceBytes=fs.readFileSync(root+'/full-content-plan.json.gz'),published=JSON.parse(fs.readFileSync(root+'/PUBLICATION_RESULT.json'));
 const expectedPlan=selectDaysTemplates(JSON.parse(zlib.gunzipSync(sourceBytes)),published),catalogBytes=fs.readFileSync(get('--baseline-catalog'));
 baselineCatalog=JSON.parse(zlib.gunzipSync(catalogBytes));
 if(baselineCatalog.schema!==1||baselineCatalog.inputs?.sourcePlanBinarySha256!==binarySha256(sourceBytes)||baselineCatalog.inputs?.properResultBinarySha256!==binarySha256(fs.readFileSync(root+'/PUBLICATION_RESULT.json')))throw Error('Catalog provenance mismatch');
 releaseCompatibility=verifyCoordinatedAuthorization({plan,expectedPlan,planBytes:bytes,sourceBytes,catalogBytes,evidenceBytes,authorization,mode,contract});
 if(get('--resume')&&authorization.resumeReceiptSha256!==binarySha256(fs.readFileSync(get('--resume'))))throw Error('Resume receipt binary SHA must be explicitly bound to authorization');
}else if(get('--baseline-catalog'))throw Error('Catalog requires coordinated release evidence');
if(!coordinated&&(authorization.project!=='ibreviaryby'||authorization.planSha256!==planSha256||authorization.action!==mode||authorization.ownerApproved!==true||!authorization.reason||authorization.massRebuildReleaseGateReviewed!==true))throw Error('Concrete owner authorization and compatibility review required');
if(!coordinated&&(plan.compatibility?.policy!=='proper-only-keep-manifest'||plan.documents.some(d=>!d.document.startsWith('liturgicalProperTexts/'))))throw Error('Legacy writer requires proper-only policy; published collections require coordinated release');
const receiptFile=get('--receipt');if(fs.existsSync(receiptFile))throw Error('Never overwrite a prior receipt');
const batchSize=Number(get('--batch-size')||25);if(!Number.isInteger(batchSize)||batchSize<1||batchSize>400)throw Error('Batch size outside bounds');
if(coordinated&&batchSize>25)throw Error('Coordinated release batches must be <=25');
const previous=get('--resume')?JSON.parse(fs.readFileSync(get('--resume'))):{receipts:[]};
if(get('--resume')&&(previous.project!=='ibreviaryby'||previous.planSha256!==planSha256))throw Error('Resume receipt project/plan SHA mismatch');
if(coordinated&&get('--resume')&&(previous.compatibility?.planBinarySha256!==releaseCompatibility.planBinarySha256||(!authorization.preflightCheckpoint&&!authorization.manifestOnlyResume&&previous.compatibility?.releaseEvidenceSha256!==releaseCompatibility.releaseEvidenceSha256)))throw Error('Resume coordinated release bindings changed');
if(coordinated&&authorization.manifestOnlyResume)verifyManifestOnlyResume({plan,previous,authorization,receiptBytes:fs.readFileSync(get('--resume')),contract});
const checkpoint=coordinated&&authorization.preflightCheckpoint?loadVerifiedPreflightCheckpoint({plan,previous,authorization,receiptBytes:fs.readFileSync(get('--resume')),directory:get('--resume')+'.documents'}):null;
const startedAt=new Date().toISOString();let state={...(coordinated?previous:{}),manifestReceipt:null,resumedManifest:false,compatibility:releaseCompatibility,receipts:previous.receipts||[],attempts:coordinated?(previous.attempts||[]):[],resumedFrom:get('--resume')?editorialHash(fs.readFileSync(get('--resume'))):null,batchSize};
const journal=update=>{state={...state,...update};const fd=fs.openSync(receiptFile+'.tmp','w',0o600);try{fs.writeFileSync(fd,JSON.stringify({schema:3,mode,startedAt,project:'ibreviaryby',planSha256,...state},null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(receiptFile+'.tmp',receiptFile);};
let phase='preflight';
try{
 const quota=get('--quota-report')?JSON.parse(fs.readFileSync(get('--quota-report'))):null;
 if(quota){if(quota.project!=='ibreviaryby'||Date.now()-Date.parse(quota.observedAt)>15*60000)throw Error('Quota report stale/wrong project');journal({quotaAssessment:quota.quotaAssessment,quotaReportSha256:editorialHash(fs.readFileSync(get('--quota-report')))});if(quota.quotaAssessment==='daily-free-write-quota-exhausted')throw Error('Current free daily write quota exhausted; no write/retry attempted');}
 const key=JSON.parse(fs.readFileSync(get('--service-account')));if(key.project_id!=='ibreviaryby')throw Error('Wrong Firebase project');
 const {initializeApp,cert}=await import('firebase-admin/app'),{getFirestore}=await import('firebase-admin/firestore');
 const credential=cert(key),app=initializeApp({credential,projectId:'ibreviaryby'}),db=getFirestore(app);
 db.settings({preferRest:true});
 const usage={dataDocumentReads:0,manifestDocumentReads:0,metadataDocumentReads:0,uncachedDocumentReads:0,...previous.firebaseUsage};
 const account=(kind,count)=>{usage[kind]+=count;journal({firebaseUsage:{...usage}});};
 const persist=record=>{
  const file=path.join(receiptFile+'.documents',record.document+'.json');fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const fd=fs.openSync(file+'.tmp','w',0o600);try{fs.writeFileSync(fd,JSON.stringify(record)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(file+'.tmp',file);
 };
 let checkpointUnused=!!checkpoint;
 const read=async names=>{if(checkpointUnused){if(names.length!==checkpoint.size||names.some(n=>!checkpoint.has(n)))throw Error('Checkpoint scope mismatch');checkpointUnused=false;for(const [document,record] of checkpoint)persist({document,...record});journal({preflightCheckpointReusedDocuments:names.length});return checkpoint;}const records=new Map();for(let i=0;i<names.length;i+=100){
  const part=names.slice(i,i+100),docs=await db.getAll(...part.map(n=>db.doc(n)));if(coordinated)account('dataDocumentReads',part.length);
  for(const doc of docs)if(doc.exists){const record={data:doc.data(),updateTime:{seconds:doc.updateTime.seconds,nanoseconds:doc.updateTime.nanoseconds}};records.set(doc.ref.path,record);if(coordinated)persist({document:doc.ref.path,data:toStorable(record.data),updateTime:record.updateTime});}
 }return records;};
 if(coordinated){
  const refs=['contentManifest/days','contentManifest/liturgicalTemplates','contentManifest/liturgicalProperTexts','contentManifest/current'];
  const mapDocs=docs=>new Map(docs.filter(d=>d.exists).map(d=>[d.ref.path,{data:d.data(),updateTime:{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds}}]));
  const readManifest=async()=>{const docs=await db.getAll(...refs.map(n=>db.doc(n)));account('manifestDocumentReads',refs.length);return mapDocs(docs);};
  const commit=createReleaseCommit(credential,{maxAttempts:1,maxTotalRetries:0,initialRequestNumber:Math.max(0,...(previous.attempts||[]).map(e=>e.request?.requestNumber||e.requestNumber||0)),onEvent:async event=>journal({attempts:[...state.attempts,event],state:event.event==='failed-write'?'failed-write':'coordinated-write-in-progress',...(event.failure?{failure:event.failure,classification:event.classification}:event.event==='acknowledged'?{failure:null,classification:null}:{})})});
  const publishManifest=async parameters=>{phase='manifest';return publishCoordinatedManifest(db,{...parameters,onReads:account});};
  try{await executeCoordinatedRelease({plan,adapter:{read,readManifest,commit,publishManifest},contract,authorization,compatibility:releaseCompatibility,baselineCatalog,previous,mode,batchSize,journal});}
  finally{await app.delete();}
  console.log(JSON.stringify({state:state.state,verifiedFields:plan.summary.readyFields,documents:(state.receipts||[]).reduce((n,b)=>n+b.documents.filter(d=>d.writtenFieldMasks?.length).length,0),fields:(state.receipts||[]).reduce((n,b)=>n+b.documents.reduce((m,d)=>m+(d.writtenFieldMasks?.length||0),0),0),manifestWritesAcknowledged:state.manifestReceipt?(state.manifestAttempt?.writeDocuments?.length||0):0,manifestWritesThisRun:state.manifestReceipt&&!state.resumedManifest?(state.manifestAttempt?.writeDocuments?.length||0):0,receipt:receiptFile}));
 }else{
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
 }
}catch(error){journal({state:coordinated?'coordinated-release-blocked':phase==='write'?'failed-write':phase==='readback'?'failed-readback':'preflight-blocked-no-writes',reason:sanitizeReleaseValue(error.message),...(error.releaseFailure?{failure:error.releaseFailure,classification:error.classification}:{}),sdkFailure:error.releaseFailure?null:{code:error.code??null,status:error.status??null,message:sanitizeReleaseValue(error.message),details:sanitizeReleaseValue(error.details??null)},conflicts:error.conflicts||[],writtenDocumentsAcknowledged:(state.receipts||[]).reduce((n,b)=>n+b.documents.filter(d=>!coordinated||d.writtenFieldMasks?.length).length,0),writtenFieldsAcknowledged:(state.receipts||[]).reduce((n,b)=>n+b.documents.reduce((m,d)=>m+(coordinated?(d.writtenFieldMasks?.length||0):d.fields.length),0),0)});console.error(JSON.stringify({state:state.state,status:state.failure?.status,httpStatus:state.failure?.httpStatus,message:state.failure?.message||state.reason,classification:state.classification,acknowledgedDocuments:state.writtenDocumentsAcknowledged}));process.exitCode=1;}

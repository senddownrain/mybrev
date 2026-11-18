/** Separate owner-authorized revision4 ->5 continuation of the existing calendar publisher. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {APPROVED_OPERATIONS_HASH, SOURCE_HASH, exactHash} from '../publish-approved-calendar.mjs';
import {calendarHash} from '../plan-approved-calendar.mjs';
import {createApprovedRest, encodeFirestoreValue, RELEASE_COLLECTIONS} from './approved-calendar-rest.mjs';
const IDS=['liturgicalCelebrations/sv-juan-diego','liturgicalCelebrations/our-lady-guadalupe','liturgicalCalendarMeta/current'];
const fail=message=>{throw Error(message);};
const check=(value,message)=>{if(!value)fail(message);};
export const binarySha=bytes=>createHash('sha256').update(bytes).digest('hex');
const index=state=>new Map(RELEASE_COLLECTIONS.flatMap(n=>state.collections[n].map(d=>[n+'/'+d.id,d])));
export const decemberFingerprint=state=>exactHash([...index(state)].map(([document,d])=>({document,data:d.data,updateTime:d.updateTime})).sort((a,b)=>a.document.localeCompare(b.document)));
const metadata=state=>state.collections.liturgicalCalendarMeta.find(d=>d.id==='current').data;
const metaGuard=(m,revision)=>check(m.schemaVersion===1&&m.revision===revision&&m.notesRevision===6&&m.properTextsRevision===6&&m.templatesRevision===4&&m.sourceSha256===SOURCE_HASH,'Wrong calendar/independent metadata');
export function prepareDecemberPlan(baseline,receipt){
 check(receipt.mode==='PUBLISHED_AND_VERIFIED'&&receipt.revision===4&&receipt.operationsSha256===APPROVED_OPERATIONS_HASH&&receipt.operations.length===71&&receipt.operations.every(o=>o.result==='VERIFIED'),'Verified sealed revision4 receipt required');
 metaGuard(metadata(baseline),4);const docs=index(baseline);
 for(const o of receipt.operations){const d=docs.get(o.path);check(d&&calendarHash(d.data)===o.afterHash&&d.updateTime===o.updateTime,'Revision4 receipt/baseline mismatch');}
 const operations=IDS.map((document,i)=>{const d=docs.get(document);check(d,'Missing December target');if(i<2)check(d.data.enabled===true,'Entry not enabled before patch');return {document,updateTime:d.updateTime,beforeSha256:exactHash(d.data),mask:i<2?['enabled']:['revision'],set:i<2?{enabled:false}:{revision:5},...(i===2?{publishedAtTransform:'REQUEST_TIME'}:{})};});
 return {schema:1,project:'ibreviaryby',policy:'approved-december-two-entry-revision5',ownerApproved:true,ownerAuthorization:'2026-11-18: Разрешаю обе календарные операции',sourcePdfSha256:SOURCE_HASH,revision4ReceiptSha256:exactHash(receipt),revision4Receipt:receipt,baselineSha256:decemberFingerprint(baseline),operations};
}
export function validateDecemberPlan(plan,baseline){
 check(plan.schema===1&&plan.project==='ibreviaryby'&&plan.policy==='approved-december-two-entry-revision5'&&plan.ownerApproved===true&&plan.ownerAuthorization==='2026-11-18: Разрешаю обе календарные операции','Exact owner-authorized December policy required');
 check(plan.sourcePdfSha256===SOURCE_HASH&&plan.revision4ReceiptSha256===exactHash(plan.revision4Receipt),'Revision4/source binding changed');
 check(exactHash(plan)===exactHash(prepareDecemberPlan(baseline,plan.revision4Receipt)),'Plan differs from exact two-enabled-fields + metadata selection');
 return true;
}
export function verifyDecemberBefore(plan,baseline,current){
 validateDecemberPlan(plan,baseline);metaGuard(metadata(current),4);
 check(decemberFingerprint(current)===plan.baselineSha256,'Calendar data/IDs/updateTimes changed; no write');
}
export function buildDecemberWrites(plan){
 return plan.operations.map(o=>({update:{name:'projects/ibreviaryby/databases/(default)/documents/'+o.document,fields:Object.fromEntries(Object.entries(o.set).map(([k,v])=>[k,encodeFirestoreValue(v)]))},updateMask:{fieldPaths:o.mask},currentDocument:{updateTime:o.updateTime},...(o.publishedAtTransform?{updateTransforms:[{fieldPath:'publishedAt',setToServerValue:'REQUEST_TIME'}]}:{})}));
}
export function verifyDecemberAfter(plan,baseline,current,result){
 check(result?.writeResults?.length===3&&result.commitTime,'Incomplete December acknowledgement; reconcile read-only');const serverTimestamp=result.writeResults[2].transformResults?.[0]?.timestampValue;check(serverTimestamp,'Missing server timestamp');
 const expected=index(structuredClone(baseline)),actual=index(current);check(expected.size===335&&actual.size===335&&[...expected.keys()].every(k=>actual.has(k)),'Calendar IDs/count mismatch');
 for(let i=0;i<3;i++){const o=plan.operations[i],d=expected.get(o.document);Object.assign(d.data,o.set);if(i===2)d.data.publishedAt=new Date(serverTimestamp);d.updateTime=result.writeResults[i].updateTime;}
 for(const[k,d]of expected){const a=actual.get(k);check(exactHash(a.data)===exactHash(d.data)&&a.updateTime===d.updateTime,'December readback differs or outside-mask change: '+k);}
 metaGuard(metadata(current),5);const enabled=n=>current.collections[n].filter(d=>d.data.enabled!==false).length;check(enabled('liturgicalCelebrations')===240&&enabled('liturgicalDioceseOverrides')===39&&enabled('liturgicalYearOverrides')===11,'Unexpected active counts');
 return {mode:'PUBLISHED_AND_VERIFIED',project:'ibreviaryby',revision:5,operations:plan.operations.map((o,i)=>({document:o.document,mask:o.mask,result:'VERIFIED',updateTime:result.writeResults[i].updateTime,afterSha256:exactHash(actual.get(o.document).data)})),commitTime:result.commitTime,sourcePdfSha256:SOURCE_HASH,counts:{liturgicalCalendarMeta:1,liturgicalCelebrations:242,liturgicalDioceseOverrides:77,liturgicalYearOverrides:15},enabled:{celebrations:240,dioceseOverrides:39,yearOverrides:11},writes:3,deletes:0,outsideScopeWrites:0};
}
export async function applyDecemberPlan({plan,baseline,transport,recordAttempt}){
 validateDecemberPlan(plan,baseline);const transaction=await transport.begin();let committing=false;
 try{const before=await transport.capture({transaction});verifyDecemberBefore(plan,baseline,before);await recordAttempt({state:'DECEMBER_COMMIT_ATTEMPT_STARTED',planSha256:exactHash(plan),writeCount:3});committing=true;const result=await transport.commit(buildDecemberWrites(plan),transaction);const after=await transport.capture();return {before,after,result,manifest:verifyDecemberAfter(plan,before,after,result)};}catch(error){if(!committing)await transport.release(transaction).catch(()=>{});throw error;}
}
function save(file,value,exclusive=false){fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const fd=fs.openSync(file,exclusive?'wx':'w',0o600);try{fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
export async function runDecember(opts,repo){
 const out=path.resolve(opts['--out']);check(out!==repo&&!out.startsWith(repo+path.sep),'Private output outside repository required');
 const bytes=fs.readFileSync(opts['--plan']),plan=JSON.parse(bytes),baseline=JSON.parse(fs.readFileSync(opts['--baseline']));validateDecemberPlan(plan,baseline);
 if(!opts['--live']){save(out+'/DRY_RUN.json',{status:'passed',writes:3,planBinarySha256:binarySha(bytes),firebaseReads:0,firebaseWrites:0});console.log('DECEMBER_LOCAL_DRY_RUN PASS: exactly three writes; no Firebase access');return;}
 check(opts['--apply']&&opts['--confirm-hash']===binarySha(bytes),'Exact December binary plan SHA and explicit apply required');check(!fs.existsSync(out+'/APPLY_ATTEMPT.private.json'),'Previous December attempt exists; reconcile read-only, never retry');
 const transport=createApprovedRest({allowCommit:true,releasePhase:'december-3'});
 try{const published=await applyDecemberPlan({plan,baseline,transport,recordAttempt:v=>save(out+'/APPLY_ATTEMPT.private.json',v,true)});save(out+'/PRESTATE.private.json',published.before);save(out+'/POSTSTATE.private.json',published.after);save(out+'/COMMIT_RESPONSE.private.json',published.result);save(out+'/PUBLICATION_MANIFEST.json',published.manifest);save(out+'/ROLLBACK_BLUEPRINT.private.json',{requiresSeparateOwnerDecision:true,revision:6,operations:plan.operations.map((o,i)=>({document:o.document,updateTime:published.result.writeResults[i].updateTime,fields:i<2?{enabled:true}:{revision:6},...(i===2?{publishedAtTransform:'REQUEST_TIME'}:{})}))});console.log('PUBLISHED_AND_VERIFIED: revision5; two enabled fields and metadata; no deletes');}finally{save(out+'/REQUEST_LEDGER.json',transport.ledger);}
}

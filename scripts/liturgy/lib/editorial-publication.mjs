/** Pure plan verification and bounded future execution, independently testable. */
import { editorialHash } from './editorial-responsories.mjs';
import { buildFirestoreWrite } from '../audit-doxologies.mjs';
const at=(d,p)=>p.reduce((v,k)=>v?.[k],d);
const sameTime=(a,b)=>a?.seconds===b?.seconds&&a?.nanoseconds===b?.nanoseconds;
export const serverTime=value=>{const m=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/u.exec(value||'');if(!m)throw Error('Invalid server updateTime');return {seconds:Date.parse(m[1]+'Z')/1000,nanoseconds:Number((m[2]||'').padEnd(9,'0'))};};
export function validatePublicationPlan(plan){
 if(plan.schema!==3||plan.network!==false||!Array.isArray(plan.documents))throw Error('Unsupported offline plan');
 const seen=new Set(),docs=new Set();for(const d of plan.documents){
  if(docs.has(d.document))throw Error('Duplicate document');docs.add(d.document);
  if(!/^(?:days|liturgicalTemplates|liturgicalProperTexts|invitatoriums|completoriums)\/[^/]+$/u.test(d.document))throw Error('Document outside allowed collections');
  if(!d.updateTime||!Number.isInteger(d.updateTime.seconds)||!Number.isInteger(d.updateTime.nanoseconds))throw Error('Missing updateTime');
  for(const f of d.fields){const key=d.document+'|'+f.field;if(seen.has(key))throw Error('Duplicate field');seen.add(key);
   if(f.status!=='ready'||f.field!==f.path.join('.')||f.updateMask!==f.field||f.path.some(p=>!/^[_A-Za-z][_A-Za-z0-9]*$/u.test(p)))throw Error('Unsafe field mask');
   if(typeof f.before!=='string'||typeof f.after!=='string'||editorialHash(f.before)!==f.beforeSha256||editorialHash(f.after)!==f.afterSha256)throw Error('Invalid field proof');
  }
 }
 if(seen.size!==plan.summary.readyFields||plan.documents.length!==plan.summary.readyDocuments)throw Error('Summary mismatch');return true;
}
export function prepareFreshPublication(plan,records){
 validatePublicationPlan(plan);const prepared=[],conflicts=[];
 for(const d of plan.documents){const fresh=records.get(d.document);if(!fresh){conflicts.push({document:d.document,reason:'missing-document'});continue;}
  if(!sameTime(fresh.updateTime,d.updateTime)){conflicts.push({document:d.document,reason:'updateTime-changed'});continue;}
  const bad=d.fields.filter(f=>typeof at(fresh.data,f.path)!=='string'||editorialHash(at(fresh.data,f.path))!==f.beforeSha256);
  if(bad.length){conflicts.push(...bad.map(f=>({document:d.document,field:f.field,reason:'beforeSHA-changed'})));continue;}
  prepared.push({plan:d,write:buildFirestoreWrite(fresh.data,d)});
 }
 if(conflicts.length){const error=Error('Fresh preflight conflicts; no writes authorized');error.conflicts=conflicts;throw error;}
 return prepared;
}
export function boundPublicationWrites(prepared,{maxWrites=400,maxBytes=8*1024*1024}={}){
 if(!Number.isInteger(maxWrites)||maxWrites<1||maxWrites>400||maxBytes>8*1024*1024||maxBytes<1)throw Error('Invalid batch bound');
 const batches=[];let batch=[];
 const bytes=items=>Buffer.byteLength(JSON.stringify({writes:items.map(p=>p.write)}));
 for(const item of prepared){if(bytes([item])>maxBytes)throw Error('Single write exceeds 8 MiB');if(batch.length&&(batch.length>=maxWrites||bytes([...batch,item])>maxBytes)){batches.push(batch);batch=[];}batch.push(item);}
 if(batch.length)batches.push(batch);return batches;
}
/** Adapter must persist a journal immediately after every commit, before readback.
 * No automatic retry or rollback; earlier commits may have succeeded on failure. */
export async function executePreparedPublication(prepared,adapter,{maxWrites=400,initialReceipts=[],includeValues=true}={}){
 const receipts=structuredClone(initialReceipts);
 for(const batch of boundPublicationWrites(prepared,{maxWrites})){
  const result=await adapter.commit(batch.map(p=>p.write));
  if(!Array.isArray(result.writeResults)||result.writeResults.length!==batch.length)throw Error('Incomplete commit response; inspect server before continuing');
  const receipt={documents:batch.map((p,i)=>({document:p.plan.document,serverUpdateTime:result.writeResults[i].updateTime,writtenFieldMasks:p.write.updateMask.fieldPaths,fields:p.plan.fields.map(f=>({field:f.field,path:f.path,...(includeValues?{before:f.before,after:f.after}:{}),beforeSha256:f.beforeSha256,afterSha256:f.afterSha256}))})),readback:'pending'};
  receipts.push(receipt);await adapter.journal(receipts);
  const records=await adapter.read(batch.map(p=>p.plan.document));
  for(const item of receipt.documents){const actual=records.get(item.document);if(!actual)throw Error('Readback missing document');
   for(const f of item.fields)if(typeof at(actual.data,f.path)!=='string'||editorialHash(at(actual.data,f.path))!==f.afterSha256)throw Error('Readback conflict '+item.document+'|'+f.field);
   const time=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/u.exec(item.serverUpdateTime||'');
   if(!time||!sameTime(actual.updateTime,{seconds:Date.parse(time[1]+'Z')/1000,nanoseconds:Number((time[2]||'').padEnd(9,'0'))}))throw Error('Readback updateTime conflict '+item.document);
   item.readbackUpdateTime=actual.updateTime;
  }
  receipt.readback='verified';await adapter.journal(receipts);
 }
 return receipts;
}

/** The immutable original plan supplies values; receipts contain hashes only. */
export function preparePublicationResume(plan,records,previous={receipts:[]},{prepare=prepareFreshPublication}={}){
 validatePublicationPlan(plan);
 const owners=new Map(plan.documents.map(d=>[d.document,d])),seen=new Set(),receipts=structuredClone(previous.receipts||[]),done=new Set();
 const recorded=new Set(receipts.flatMap(b=>b.documents.map(d=>d.document)));
 // Acknowledgement is journaled before the aggregate receipt. Recover the
 // narrow crash window using server writeResults, never guessed timestamps.
 for(const ack of (previous.attempts||[]).filter(e=>e.event==='acknowledged')){
  const attempt=(previous.attempts||[]).find(e=>e.event==='attempt'&&e.request.requestNumber===ack.requestNumber);
  if(!attempt||ack.writeResults.length!==attempt.request.documents.length)throw Error('Incomplete acknowledgement journal');
  const missing=attempt.request.documents.filter(n=>!recorded.has(n));if(!missing.length)continue;
  if(missing.length!==attempt.request.documents.length)throw Error('Partial duplicate acknowledgement journal');
  const documents=attempt.request.documents.map((name,i)=>{const d=owners.get(name);if(!d)throw Error('Acknowledgement outside pinned plan');recorded.add(name);return {document:name,serverUpdateTime:ack.writeResults[i].updateTime,writtenFieldMasks:attempt.request.fieldMasks?.[i]||d.fields.map(f=>f.field),fields:d.fields.map(f=>({field:f.field,path:f.path,beforeSha256:f.beforeSha256,afterSha256:f.afterSha256}))};});
  receipts.push({documents,readback:'pending',recoveredFromAcknowledgement:ack.requestNumber});
 }
 for(const batch of receipts)for(const d of batch.documents){
  const source=owners.get(d.document);if(!source||seen.has(d.document))throw Error('Unknown/duplicate resumed document');seen.add(d.document);
  if(d.writtenFieldMasks&&(!Array.isArray(d.writtenFieldMasks)||new Set(d.writtenFieldMasks).size!==d.writtenFieldMasks.length||d.writtenFieldMasks.some(mask=>!source.fields.some(f=>f.field===mask))))throw Error('Resumed write mask outside pinned plan');
  if(!d.serverUpdateTime||d.fields.length!==source.fields.length||d.fields.some(f=>!source.fields.some(s=>s.field===f.field&&s.beforeSha256===f.beforeSha256&&s.afterSha256===f.afterSha256)))throw Error('Resumed receipt differs from pinned plan');
  if(batch.readback==='verified'){done.add(d.document);continue;}
  const current=records.get(d.document);if(!current||source.fields.some(f=>typeof at(current.data,f.path)!=='string'||editorialHash(at(current.data,f.path))!==f.afterSha256))throw Error('Pending committed batch needs manual readback resolution');
  if(!sameTime(current.updateTime,serverTime(d.serverUpdateTime)))throw Error('Pending committed batch updateTime conflict');
  d.readbackUpdateTime=current.updateTime;done.add(d.document);
 }
 for(const batch of receipts)batch.readback='verified';
 const remaining=plan.documents.filter(d=>!done.has(d.document)),reduced={...plan,documents:remaining,summary:{...plan.summary,readyDocuments:remaining.length,readyFields:remaining.reduce((n,d)=>n+d.fields.length,0)}};
 return {prepared:prepare(reduced,records),receipts,alreadyVerifiedDocuments:done.size};
}

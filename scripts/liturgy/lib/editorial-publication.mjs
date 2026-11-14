/** Pure plan verification and bounded future execution, independently testable. */
import { editorialHash } from './editorial-responsories.mjs';
import { buildFirestoreWrite } from '../audit-doxologies.mjs';
const at=(d,p)=>p.reduce((v,k)=>v?.[k],d);
const sameTime=(a,b)=>a?.seconds===b?.seconds&&a?.nanoseconds===b?.nanoseconds;
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
export function boundPublicationWrites(prepared){
 const batches=[];let batch=[];
 const bytes=items=>Buffer.byteLength(JSON.stringify({writes:items.map(p=>p.write)}));
 for(const item of prepared){if(bytes([item])>8*1024*1024)throw Error('Single write exceeds 8 MiB');if(batch.length&&(batch.length>=400||bytes([...batch,item])>8*1024*1024)){batches.push(batch);batch=[];}batch.push(item);}
 if(batch.length)batches.push(batch);return batches;
}
/** Adapter must persist a journal immediately after every commit, before readback.
 * No automatic retry or rollback; earlier commits may have succeeded on failure. */
export async function executePreparedPublication(prepared,adapter){
 const receipts=[];
 for(const batch of boundPublicationWrites(prepared)){
  const result=await adapter.commit(batch.map(p=>p.write));
  if(!Array.isArray(result.writeResults)||result.writeResults.length!==batch.length)throw Error('Incomplete commit response; inspect server before continuing');
  const receipt={documents:batch.map((p,i)=>({document:p.plan.document,serverUpdateTime:result.writeResults[i].updateTime,fields:p.plan.fields.map(f=>({field:f.field,path:f.path,before:f.before,after:f.after,beforeSha256:f.beforeSha256,afterSha256:f.afterSha256}))})),readback:'pending'};
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

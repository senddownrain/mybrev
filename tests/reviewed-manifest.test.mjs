import test from 'node:test';
import assert from 'node:assert/strict';
import { loadReviewedManifest, executeReviewedManifest, REVIEWED_DIR, REVIEWED_PLAN_SHA, reviewedManifestMain } from '../scripts/content/lib/reviewed-manifest.mjs';
import { publicationDecision } from '../scripts/content/publish-manifest.mjs';
const reviewed = () => loadReviewedManifest(REVIEWED_DIR + '/plan.json', REVIEWED_PLAN_SHA);
test('exact final-test plan describes 4473 public docs; ordinary MASS remains closed', () => {
 const r=reviewed();assert.equal(Object.keys(r.catalog).length,4473);assert.equal(r.plan.changedCollections.length,11);assert.equal(r.plan.contentWrites,0);assert.equal(publicationDecision('MASS CONTENT REBUILD').publish,false);
});
test('wrong SHA, path and broad flags are refused before nonexistent credential access', async () => {
 assert.throws(()=>loadReviewedManifest(REVIEWED_DIR+'/plan.json','0'.repeat(64)),/Exact reviewed/);
 assert.throws(()=>loadReviewedManifest('/tmp/plan.json',REVIEWED_PLAN_SHA),/Exact reviewed/);
 await assert.rejects(reviewedManifestMain(['--allow-large-patch','--service-account','/nonexistent']),/Unreviewed flag/);
});
function fakeDb(r,{changedTime=false,conflict=false}={}) {
 const records=new Map(structuredClone([...r.manifests]));const writes=[],events=[];
 const doc=path=>({path});
 const snapshot=(name,record)=>({exists:!!record,ref:doc(name),data:()=>record?.data,updateTime:record?.updateTime});
 const getAll=async(...refs)=>refs.map(ref=>snapshot(ref.path,records.get(ref.path)));
 return {writes,events,doc,getAll,collection:name=>({select:()=>({name})}),runTransaction:async(fn,options)=>{
  assert.equal(options.maxAttempts,1);const queued=[];
  const result=await fn({getAll:async(...refs)=>{if(conflict)records.get('contentManifest/current').data.contentVersion++;return getAll(...refs);},get:async query=>({docs:Object.entries(r.catalog).filter(([p])=>p.startsWith(query.name+'/')).map(([p,e])=>({ref:doc(p),updateTime:changedTime?{seconds:0,nanoseconds:0}:e.updateTime}))}),set:(ref,data)=>{assert(ref.path.startsWith('contentManifest/'));queued.push([ref.path,data]);}});
  for(const [name,data]of queued){writes.push(name);records.set(name,{data,updateTime:{seconds:1794945000,nanoseconds:1}});}return result;
 }};
}
test('same production transaction fence publishes only ten changed metadata docs and readbacks all seventeen',async()=>{
 const r=reviewed(),db=fakeDb(r);let state={};await executeReviewedManifest({db,reviewed:r,journal:u=>{state={...state,...u};}});
 assert.equal(db.writes.length,10);assert.equal(db.writes.at(-1),'contentManifest/current');assert.equal(state.state,'reviewed-manifest-readbacks-verified');assert.equal(Object.keys(state.manifestReceipt).length,17);assert.equal(state.liveDigestGate.projectedDocuments,4473);assert.equal(state.firebaseUsage.metadataDocumentReads,4473);assert.equal(state.firebaseUsage.manifestDocumentReads,34);
 const count=db.writes.length;await executeReviewedManifest({db,reviewed:r,previous:{...state,planSha256:REVIEWED_PLAN_SHA},journal:u=>{state={...state,...u};}});assert.equal(db.writes.length,count);assert.equal(state.resumedManifest,true);
});
test('updateTime drift or root conflict stops without any queued write; no retries',async()=>{
 for(const options of [{changedTime:true},{conflict:true}]){const r=reviewed(),db=fakeDb(r,options);await assert.rejects(executeReviewedManifest({db,reviewed:r,journal:()=>{}}),/budget|CAS/);assert.equal(db.writes.length,0);}
});

test('retired raw-calendar plan cannot execute or resume, before credential/receipt access', async () => {
 await assert.rejects(reviewedManifestMain(['--reviewed-manifest-authorization',REVIEWED_DIR+'/plan.json','--expected-plan-sha',REVIEWED_PLAN_SHA,'--apply','--service-account','/nonexistent','--receipt','/nonexistent','--resume','/nonexistent']),/plan retired/);
});

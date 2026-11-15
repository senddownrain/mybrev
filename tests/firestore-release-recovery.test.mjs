import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { captureFirestoreFailure,classifyFirestoreFailure,sanitizeReleaseValue } from '../scripts/liturgy/lib/firestore-release-errors.mjs';
import { createReleaseCommit } from '../scripts/liturgy/lib/firestore-release-commit.mjs';
import { boundPublicationWrites,preparePublicationResume,executePreparedPublication } from '../scripts/liturgy/lib/editorial-publication.mjs';
import { editorialHash } from '../scripts/liturgy/lib/editorial-responsories.mjs';
const credential={getAccessToken:async()=>({access_token:'SECRET_ACCESS_TOKEN'})};
const errorResponse=(message,details=[])=>new globalThis.Response(JSON.stringify({error:{code:429,status:'RESOURCE_EXHAUSTED',message,details}}),{status:429,headers:{'retry-after':'2',authorization:'Bearer SECRET_ACCESS_TOKEN','x-goog-quota-limit':'per-minute'}});
const write={update:{name:'projects/ibreviaryby/databases/(default)/documents/liturgicalProperTexts/example',fields:{laudesR:{stringValue:'<p>PRIVATE DOCUMENT TEXT</p>'}}},updateMask:{fieldPaths:['laudesR']},currentDocument:{updateTime:'1970-01-01T00:00:01.000000002Z'}};
test('sanitized failures preserve exact API code/quota details and safe headers, never tokens or bodies',()=>{
 const r=errorResponse('Quota exceeded', [{'@type':'type.googleapis.com/google.rpc.QuotaFailure',violations:[{subject:'projects/123',description:'Write requests per day'}]}]);
 const f=captureFirestoreFailure(r,{error:{code:429,status:'RESOURCE_EXHAUSTED',message:'Quota exceeded',details:[{reason:'DAILY_LIMIT_EXCEEDED',metadata:{quota_limit:'WritesPerDay',access_token:'SECRET_ACCESS_TOKEN'}}]}},{bytes:12,authorization:'Bearer SECRET_ACCESS_TOKEN',writes:[write]});
 assert.equal(f.status,'RESOURCE_EXHAUSTED');assert.equal(f.googleCode,429);assert.equal(f.message,'Quota exceeded');assert.equal(f.headers['retry-after'],'2');assert.equal(f.details[0].metadata.quota_limit,'WritesPerDay');assert.ok(!JSON.stringify(f).includes('SECRET_ACCESS_TOKEN'));assert.ok(!JSON.stringify(f).includes('PRIVATE DOCUMENT TEXT'));
 assert.ok(!JSON.stringify(sanitizeReleaseValue({message:'error <p>PRIVATE DOCUMENT TEXT</p>'})).includes('PRIVATE DOCUMENT TEXT'));
});
test('daily quota and unknown RESOURCE_EXHAUSTED stop after one request, with durable failed-write event',async()=>{
 for(const message of ['Daily write quota exhausted','Quota exceeded']){const events=[];let calls=0;
 const commit=createReleaseCommit(credential,{fetchImpl:async()=>{calls++;return errorResponse(message);},onEvent:async e=>events.push(e),wait:async()=>{throw Error('Must not wait/retry');}});
 await assert.rejects(commit([write]),/429/);assert.equal(calls,1);assert.equal(events.at(-1).event,'failed-write');assert.equal(events.at(-1).failure.httpStatus,429);assert.equal(classifyFirestoreFailure(events.at(-1).failure),message.startsWith('Daily')?'quota-exhausted':'unknown-resource-exhaustion');
 }
});
test('definite temporary rate rejection uses bounded backoff and the identical request SHA',async()=>{
 const events=[],delays=[];let calls=0;
 const commit=createReleaseCommit(credential,{fetchImpl:async()=>++calls<3?errorResponse('Write rate limit per minute'):new globalThis.Response(JSON.stringify({writeResults:[{updateTime:'1970-01-01T00:00:02.000000004Z'}]})),onEvent:async e=>events.push(e),wait:async ms=>delays.push(ms),random:()=>0});
 await commit([write]);assert.equal(calls,3);assert.deepEqual(delays,[10000,20000]);assert.equal(new Set(events.filter(e=>e.event==='attempt').map(e=>e.request.sha256)).size,1);assert.ok(!JSON.stringify(events).includes('PRIVATE DOCUMENT TEXT'));assert.ok(!JSON.stringify(events).includes('SECRET_ACCESS_TOKEN'));
});
const field={field:'laudesR',path:['laudesR'],updateMask:'laudesR',before:'old',after:'new',beforeSha256:editorialHash('old'),afterSha256:editorialHash('new'),status:'ready',edits:[{start:0,end:3,value:'new'}]};
const plan={schema:3,network:false,summary:{readyDocuments:2,readyFields:2},documents:['one','two'].map(id=>({document:'liturgicalProperTexts/'+id,updateTime:{seconds:1,nanoseconds:2},fields:[field]}))};
const records=()=>new Map(plan.documents.map(d=>[d.document,{data:{laudesR:'old'},updateTime:{seconds:1,nanoseconds:2}}]));
test('partial publication keeps the first server receipt when a later batch fails, then resumes only remaining docs',async()=>{
 const prepared=preparePublicationResume(plan,records()).prepared;let journaled=[],calls=0;
 await assert.rejects(executePreparedPublication(prepared,{commit:async()=>{if(++calls===2)throw Error('Daily quota');return{writeResults:[{updateTime:'1970-01-01T00:00:02.000000004Z'}]};},read:async names=>new Map(names.map(n=>[n,{data:{laudesR:'new'},updateTime:{seconds:2,nanoseconds:4}}])),journal:async r=>{journaled=structuredClone(r);}},{maxWrites:1,includeValues:false}),/Daily quota/);
 assert.equal(journaled.length,1);assert.equal(journaled[0].readback,'verified');assert.equal(journaled[0].documents[0].fields[0].before,undefined);
 const remaining=new Map([['liturgicalProperTexts/two',records().get('liturgicalProperTexts/two')]]),resumed=preparePublicationResume(plan,remaining,{receipts:journaled});assert.equal(resumed.alreadyVerifiedDocuments,1);assert.equal(resumed.prepared.length,1);assert.equal(resumed.prepared[0].plan.document,'liturgicalProperTexts/two');
 assert.equal(boundPublicationWrites(Array.from({length:226},()=>prepared[0]),{maxWrites:25}).length,10);
});
test('lost aggregate receipt is reconstructed only from acknowledged server timestamps and current hashes',()=>{
 const current=records();current.get('liturgicalProperTexts/one').data.laudesR='new';current.get('liturgicalProperTexts/one').updateTime={seconds:2,nanoseconds:4};
 const previous={receipts:[],attempts:[{event:'attempt',request:{requestNumber:1,documents:['liturgicalProperTexts/one']}},{event:'acknowledged',requestNumber:1,writeResults:[{updateTime:'1970-01-01T00:00:02.000000004Z'}]}]};
 const r=preparePublicationResume(plan,current,previous);assert.equal(r.alreadyVerifiedDocuments,1);assert.equal(r.receipts[0].recoveredFromAcknowledgement,1);assert.equal(r.prepared.length,1);
 current.get('liturgicalProperTexts/one').data.laudesR='other';assert.throws(()=>preparePublicationResume(plan,current,previous),/resolution/);
});

test('hash-only partial receipts rebuild a field-exact rollback from the pinned original plan',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pr245-rollback-'));
 try{const source=zlib.gzipSync(JSON.stringify(plan)),sourceFile=path.join(dir,'source.gz'),receiptFile=path.join(dir,'receipt.json'),out=path.join(dir,'rollback.gz');fs.writeFileSync(sourceFile,source);
 const receipt={schema:3,project:'ibreviaryby',mode:'execute',planSha256:editorialHash(source),receipts:[{readback:'verified',documents:[{document:plan.documents[0].document,serverUpdateTime:'1970-01-01T00:00:02.000000004Z',fields:[{field:field.field,path:field.path,beforeSha256:field.beforeSha256,afterSha256:field.afterSha256}]}]}]};
 fs.writeFileSync(receiptFile,JSON.stringify(receipt));execFileSync(process.execPath,['scripts/liturgy/build-editorial-rollback-v3.mjs','--receipt',receiptFile,'--out',out,'--source-plan',sourceFile],{stdio:'pipe'});
 const rollback=JSON.parse(zlib.gunzipSync(fs.readFileSync(out)));assert.equal(rollback.documents.length,1);assert.equal(rollback.documents[0].fields[0].before,'new');assert.equal(rollback.documents[0].fields[0].after,'old');assert.deepEqual(rollback.documents[0].updateTime,{seconds:2,nanoseconds:4});
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

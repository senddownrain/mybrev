#!/usr/bin/env node
/** FUTURE, separately authorized phase. Never invoked by build/audit/test. */
import fs from 'node:fs';
import zlib from 'node:zlib';
import { editorialHash } from './lib/editorial-responsories.mjs';
import { prepareFreshPublication, executePreparedPublication, boundPublicationWrites } from './lib/editorial-publication.mjs';
const args=process.argv.slice(2),get=key=>{const i=args.indexOf(key);return i<0?null:args[i+1];};
if(args.includes('--help')||!args.length){console.log('FUTURE ONLY: --mode preflight|execute --plan <gz> --authorization <json> --service-account <private-json> --receipt <new-private-file>. No manifest, revision or deploy.');process.exit(0);}
const allowed=['--mode','--plan','--authorization','--service-account','--receipt'];
if(args.length!==10||args.some((v,i)=>i%2===0&&!allowed.includes(v))||new Set(args.filter((_,i)=>i%2===0)).size!==5)throw Error('Unknown/missing options');
const mode=get('--mode');if(!['preflight','execute'].includes(mode))throw Error('Invalid mode');
const file=get('--plan'),bytes=fs.readFileSync(file),plan=JSON.parse(zlib.gunzipSync(bytes)),authorization=JSON.parse(fs.readFileSync(get('--authorization')));
if(authorization.project!=='ibreviaryby'||authorization.planSha256!==editorialHash(bytes)||authorization.action!==mode||authorization.ownerApproved!==true||!authorization.reason||authorization.massRebuildReleaseGateReviewed!==true)throw Error('Separate concrete owner authorization and MASS rebuild gate acknowledgment required');
const receiptFile=get('--receipt');if(fs.existsSync(receiptFile))throw Error('Receipt already exists; never overwrite a prior execution');
const key=JSON.parse(fs.readFileSync(get('--service-account')));if(key.project_id!=='ibreviaryby')throw Error('Wrong Firebase project');
const {initializeApp,cert}=await import('firebase-admin/app'),{getFirestore}=await import('firebase-admin/firestore');
const credential=cert(key),app=initializeApp({credential,projectId:'ibreviaryby'}),db=getFirestore(app);
const read=async names=>{const records=new Map();for(let i=0;i<names.length;i+=100){for(const doc of await db.getAll(...names.slice(i,i+100).map(n=>db.doc(n))))if(doc.exists)records.set(doc.ref.path,{data:doc.data(),updateTime:{seconds:doc.updateTime.seconds,nanoseconds:doc.updateTime.nanoseconds}});}return records;};
const startedAt=new Date().toISOString(),planSha256=editorialHash(bytes);
const journal=data=>fs.writeFileSync(receiptFile,JSON.stringify({schema:3,mode,startedAt,project:'ibreviaryby',planSha256,...data},null,2)+'\n',{mode:0o600});
try{
 const records=await read(plan.documents.map(d=>d.document));
 const prepared=prepareFreshPublication(plan,records); // ALL documents before FIRST write
 if(mode==='preflight'){journal({state:'fresh-preflight-passed-no-writes',documents:prepared.length,batches:boundPublicationWrites(prepared).length});}
 else{
  journal({state:'preflight-passed-write-phase-starting',receipts:[]});
  const commit=async writes=>{const token=await credential.getAccessToken();const response=await fetch('https://firestore.googleapis.com/v1/projects/ibreviaryby/databases/(default)/documents:commit',{method:'POST',headers:{authorization:'Bearer '+token.access_token,'content-type':'application/json'},body:JSON.stringify({writes})});const result=await response.json();if(!response.ok)throw Error('Commit failed '+response.status+'; inspect private receipt, do not retry blindly');return result;};
  const receipts=await executePreparedPublication(prepared,{read,commit,journal:receipts=>journal({state:'in-progress',receipts})});journal({state:'all-field-readbacks-verified',receipts});
 }
 console.log('Receipt saved; no manifest/revision/deploy action performed.');
}catch(error){if(!fs.existsSync(receiptFile))journal({state:'preflight-blocked-no-writes',conflicts:error.conflicts||[],reason:error.message});throw error;}

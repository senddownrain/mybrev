import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {codeProof} from '../src/utils/priestCode.mjs';
import * as firestoreErrors from '../src/utils/firestoreErrors.mjs';
import {quotaSafeTransaction} from '../src/utils/retry.js';

const source=(await readFile(new URL('../src/services/priestAccessService.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/export /g,'');
const code='A2B3-C4D5-E6F7-G8H9-J2K3-L4M5';
function harness({commitError,accepted=false,pending=false,serverError,online=true,legacy=false}={}){
 const rows=new Map(),storage=new Map(),auth={currentUser:{uid:'device'},authStateReady:async()=>{}};
 const snapshot=path=>({id:'device',exists:()=>rows.has(path),data:()=>rows.get(path),metadata:{fromCache:false,hasPendingWrites:pending}});
 let commits=0,operations=[];
 if(legacy)rows.set('priestDeviceGrants/device',{uid:'device',status:'active',activationProof:'old-proof'});
 const bindings={...firestoreErrors,quotaSafeTransaction,reactive:value=>value,codeProof,getPriestAuth:async()=>auth,getPriestActivationDb:()=>({}),priestFirebase:{db:{}},doc:(_db,name,uid)=>`${name}/${uid}`,activationDoc:(_db,name,uid)=>`${name}/${uid}`,activationTimestamp:()=> 'SERVER_TIME',serverTimestamp:()=> 'SERVER_TIME',activationUpdate:async()=>{},
  getDocFromServer:async path=>{if(serverError&&rows.size)throw serverError;return snapshot(path);},onSnapshot:()=>()=>{},updateDoc:async()=>{},
  navigator:{onLine:online,userAgent:'Chrome/',platform:'Windows'},localStorage:{getItem:key=>storage.get(key),removeItem:key=>storage.delete(key)},
  activationBatch:()=>{operations=[];return {set:(path,data)=>operations.push({path,data}),commit:async()=>{commits++;if(!commitError||accepted)for(const {path,data} of operations)rows.set(path,data);if(commitError)throw commitError;}};}};
 const api=new Function(...Object.keys(bindings),`${source}\nreturn {activatePriestAccess,priestAccess};`)(...Object.values(bindings));
 return {...api,rows,get commits(){return commits;},get operations(){return operations;}};
}
test('activation waits for acknowledged batch and server status; readable grant has no proof',async()=>{
 const client=harness();const status=await client.activatePriestAccess(code,'а. Яўгеній');assert.equal(status.active,true);
 assert.equal(client.commits,1);assert.equal(client.rows.size,2);
 assert.equal('activationProof' in status.device,false);assert.equal('activationProof' in client.rows.get('priestDeviceGrants/device'),false);
 assert.equal(client.rows.get('priestActivationClaims/device').activationProof,await codeProof(code));
});
test('denied registration leaves access off and a retry uses the same anonymous UID',async()=>{
 const client=harness({commitError:{code:'permission-denied'}});
 await assert.rejects(client.activatePriestAccess(code,''),/Код няправільны/);assert.equal(client.rows.size,0);assert.equal(client.priestAccess.active,false);
 await assert.rejects(client.activatePriestAccess(code,''));assert.equal(client.commits,2);assert.ok(client.operations.every(op=>op.path.endsWith('/device')));
});
test('lost acknowledgement is not reported as success; retry reads the existing grant without replaying claim',async()=>{
 const client=harness({commitError:{code:'unavailable'},accepted:true});
 await assert.rejects(client.activatePriestAccess(code,''),/злучэнне/);assert.equal(client.priestAccess.active,false);assert.equal(client.rows.size,2);
 assert.equal((await client.activatePriestAccess(code,'')).active,true);assert.equal(client.commits,1);
});
test('pending local writes and failed server confirmation never enable access',async()=>{
 for(const options of [{pending:true},{serverError:{code:'unavailable'}}]){
  const client=harness(options);await assert.rejects(client.activatePriestAccess(code,''));assert.equal(client.priestAccess.active,false);
 }
});
test('offline activation sends no writes; legacy proof-bearing grant is not accepted',async()=>{
 for(const options of [{online:false},{legacy:true}]){
  const client=harness(options);await assert.rejects(client.activatePriestAccess(code,''));assert.equal(client.commits,0);assert.equal(client.priestAccess.active,false);
 }
});

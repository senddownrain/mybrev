import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setImmediate} from 'node:timers';
import * as errors from '../src/utils/firestoreErrors.mjs';
import {retry, retryFirestore, quotaSafeTransaction} from '../src/utils/retry.js';
import {codeProof, validNewCode} from '../src/utils/priestCode.mjs';
const source=(await readFile(new URL('../src/services/priestAccessService.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/export /g,'');
const code='A2B3-C4D5-E6F7-G8H9-J2K3-L4M5';
const fail=code=>Object.assign(new Error('Backend failure'),{code});
test.beforeEach(()=>errors.resetFirestoreQuota());

test('Firestore error classes retain SDK/GRPC codes and Belarusian messages without confusing local disk quota',()=>{
  for(const code of ['resource-exhausted','firestore/resource-exhausted','RESOURCE_EXHAUSTED',8,'8']){
    assert.equal(errors.firestoreErrorCode(fail(code)),'resource-exhausted');
    assert.match(errors.firestoreErrorMessage(fail(code)),/Вычарпана квота/);
  }
  assert.match(errors.firestoreErrorMessage(fail('permission-denied')),/правоў/);
  assert.match(errors.firestoreErrorMessage(fail('unavailable')),/злучэнне/);
  assert.match(errors.firestoreErrorMessage(fail('unauthenticated')),/Увайдзіце/);
  assert.equal(errors.isFirestoreQuotaError(Object.assign(new Error('Quota exceeded.'),{name:'QuotaExceededError'})),false);
  const safe=errors.firestoreActionError(fail(8),'settings-read');
  assert.equal(safe.operation,'settings-read');assert.equal(safe.code,'resource-exhausted');
});
test('Connection failed and Auth/browser network errors remain distinct from quota and permission failures',()=>{
  for(const error of [fail('auth/network-request-failed'),new TypeError('Failed to fetch'),new Error('Connection failed.'),new Error('OFFLINE'),{cause:{code:'ECONNRESET'}}]){
    assert.match(errors.firestoreErrorMessage(error),/злучэнне/);
    assert.equal(errors.isFirestoreQuotaError(error),false);
    errors.noteFirestoreError(error);assert.equal(errors.isFirestoreQuotaBlocked(),false);
  }
  assert.match(errors.firestoreErrorMessage(Object.assign(new Error('Connection failed'),{code:'permission-denied'})),/правоў/);
  assert.match(errors.firestoreErrorMessage(Object.assign(new Error('Connection failed'),{code:'resource-exhausted'})),/Вычарпана квота/);
});
test('quota never retries, even when caller enables retries; later automatic requests fail before network',async()=>{
  let calls=0;
  await assert.rejects(retry(()=>{calls++;throw fail('resource-exhausted');},{delay:0,shouldRetry:()=>true}),{code:'resource-exhausted'});
  assert.equal(calls,1);
  await assert.rejects(retryFirestore(()=>{calls++;return 'bad';},{delay:0}),{code:'resource-exhausted'});
  assert.equal(calls,1);
  errors.resetFirestoreQuota();assert.equal(await retryFirestore(()=>{calls++;return 'ok';}),'ok');assert.equal(calls,2);
});
test('permission failures do not retry; settled unavailable requests have bounded retries',async()=>{
  let calls=0;
  await assert.rejects(retryFirestore(()=>{calls++;throw fail('permission-denied');},{delay:0}),{code:'permission-denied'});assert.equal(calls,1);
  calls=0;assert.equal(await retryFirestore(()=>{if(++calls===1)throw fail('unavailable');return 'ok';},{delay:0}),'ok');assert.equal(calls,2);
});
test('default Firestore retry never overlaps a slow unresolved SDK request',async(t)=>{
  t.mock.timers.enable({apis:['setTimeout']});
  let complete,calls=0;const pending=new Promise(resolve=>{complete=resolve;});
  const request=retryFirestore(()=>{calls++;return pending;});
  t.mock.timers.tick(10000);await new Promise(resolve=>setImmediate(resolve));
  t.mock.timers.tick(1000);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls,1);complete('done');assert.equal(await request,'done');
});
test('transaction disables SDK retry and only retries contention; quota executes exactly once',async()=>{
  let calls=0;
  await assert.rejects(quotaSafeTransaction(async(_db,_fn,options)=>{assert.equal(options.maxAttempts,1);calls++;throw fail('resource-exhausted');},{},()=>{}),{code:'resource-exhausted'});
  assert.equal(calls,1);errors.resetFirestoreQuota();calls=0;
  for(const code of ['aborted','failed-precondition','already-exists']){
    calls=0;assert.equal(await quotaSafeTransaction(async(_db,fn,options)=>{assert.equal(options.maxAttempts,1);if(++calls===1)throw fail(code);return fn();},{},()=> 'confirmed'),'confirmed');assert.equal(calls,2);
  }
});
function service({transactionError,readError,conflict=false}={}){
  errors.resetFirestoreQuota();
  let value={activeCodeProof:'old',changedAt:'previous',helpText:'Contact'},transactions=0,reads=0,writes=0;
  const bindings={...errors,quotaSafeTransaction,codeProof,validNewCode,generateCode:()=>code,ref:value=>({value}),s2Session:{},publicDevice:()=>{},onFirestoreQuotaBlocked:()=>{},
    getPriestEditorDb:async()=>({}),getPriestEditorWriteDb:async()=>({}),doc:(_db,a,b)=>`${a}/${b}`,activationDoc:(_db,a,b)=>`${a}/${b}`,activationTimestamp:()=> 'SERVER_TIMESTAMP',
    runTransaction:async(_db,action,options)=>{transactions++;assert.equal(options.maxAttempts,1);if(transactionError)throw transactionError;let pending;
      const result=await action({get:async()=>({data:()=>value}),set:(path,data)=>{if(path==='priestAccess/settings')pending=data;},update:(_path,data)=>{pending={...value,...data};}});
      value=pending;writes++;return result;
    },activationGet:async()=>{reads++;if(readError)throw readError;return {data:()=>conflict?{...value,activeCodeProof:'newer'}:value};},
  };
  const api=new Function(...Object.keys(bindings),`${source}\nreturn {replacePriestCode,savePriestHelp};`)(...Object.values(bindings));
  return {...api,stats:()=>({transactions,reads,writes,value})};
}
test('acknowledged code survives quota/permission/network failures of the optional verification read',async()=>{
  for(const sdkCode of ['resource-exhausted','permission-denied','unavailable','auth/network-request-failed']){
    const client=service({readError:fail(sdkCode)}),result=await client.replacePriestCode({generate:true});
    assert.equal(result.code,code);assert.equal(result.codeCreated,true);assert.equal(result.verification,'unavailable');assert.equal(result.changedAtPending,true);
    assert.match(result.warning,/Код захаваны серверам/);assert.equal(result.warningCode,sdkCode);
    assert.equal(client.stats().transactions,1);assert.equal(client.stats().reads,1);assert.equal(client.stats().writes,1);
    assert.equal(client.stats().value.activeCodeProof,await codeProof(code));assert.equal('activeCodeProof' in result,false);
  }
});
test('rejected code transaction never returns a plaintext success and does not attempt verification',async()=>{
  for(const sdkCode of ['resource-exhausted','unavailable','auth/network-request-failed']){
    const client=service({transactionError:fail(sdkCode)});
    await assert.rejects(client.replacePriestCode({generate:true}),{code:sdkCode,operation:'code-transaction'});
    assert.equal(client.stats().transactions,1);assert.equal(client.stats().reads,0);assert.equal(client.stats().writes,0);
  }
});
test('verified concurrent replacement is not presented as the active code; normal success includes server date',async()=>{
  await assert.rejects(service({conflict:true}).replacePriestCode({generate:true}),/іншай сесіі/);
  const result=await service().replacePriestCode({generate:true});assert.equal(result.verification,'verified');assert.equal(result.changedAt,'SERVER_TIMESTAMP');
});
test('help save returns only acknowledged metadata without a redundant settings read',async()=>{
  const client=service({readError:fail('resource-exhausted')});const result=await client.savePriestHelp('New contact');
  assert.equal(result.helpText,'New contact');assert.equal('activeCodeProof' in result,false);assert.equal(client.stats().reads,0);assert.equal(client.stats().writes,1);
});

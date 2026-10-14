import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import moment from 'moment';
import {isFirestoreQuotaBlocked,noteFirestoreError,resetFirestoreQuota} from '../src/utils/firestoreErrors.mjs';

const source=(await readFile(new URL('../src/utils/cacheWarmup.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/export /g,'');
const date=new Date(2026,9,14);
function warmup({pathname='/',quotaAfterRead=false}={}){
  resetFirestoreQuota();const hours=[],readings=[];let staticCalls=0;
  const bindings={moment,isFirestoreQuotaBlocked,window:{location:{pathname}},logger:{log(){},error(){}},
    useLiturgicalStore:()=>({fetchContentByDate:async d=>{hours.push(moment(d).format('YYYY-MM-DD'));if(quotaAfterRead)noteFirestoreError({code:'resource-exhausted'});},fetchReadingsByDate:async d=>readings.push(moment(d).format('YYYY-MM-DD'))}),
    warmupStaticLiturgicalCollections:async()=>{staticCalls++;},
  };
  const api=new Function(...Object.keys(bindings),`${source}\nreturn {warmupCache,warmupDateWindow};`)(...Object.values(bindings));
  return {...api,hours,readings,staticCalls:()=>staticCalls};
}
test('automatic warmup fetches only today/tomorrow Hours and preserves static offline collections',async()=>{
  const app=warmup();await app.warmupCache(date);
  assert.deepEqual(app.hours,['2026-10-14','2026-10-15']);assert.deepEqual(app.readings,[]);assert.equal(app.staticCalls(),1);
});
test('admin/login visits do not trigger unrelated liturgical warmup',async()=>{
  for(const pathname of ['/admin','/admin/priest-access','/login']){
    const app=warmup({pathname});await app.warmupCache(date);
    assert.deepEqual(app.hours,[]);assert.deepEqual(app.readings,[]);assert.equal(app.staticCalls(),0);
  }
});
test('explicit public offline prefetch still supports the complete nine-day window',async()=>{
  const app=warmup();await app.warmupDateWindow(date);
  assert.equal(app.hours.length,9);assert.equal(app.readings.length,9);assert.ok(app.hours.includes('2026-10-13'));assert.ok(app.hours.includes('2026-10-21'));
});
test('quota stops later prefetch batches and prevents subsequent automatic warmups',async()=>{
  const app=warmup({quotaAfterRead:true});await app.warmupDateWindow(date);
  assert.equal(app.hours.length,2,'already launched batch may finish; no subsequent batch starts');
  await app.warmupCache(date);assert.equal(app.hours.length,2);assert.equal(app.staticCalls(),0);
});

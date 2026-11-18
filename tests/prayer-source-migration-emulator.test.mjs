import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { buildShortSourcePlan, applySourcePlan, planHash } from '../scripts/lib/prayer-source-plan.mjs';

const emulator = process.env.FIRESTORE_EMULATOR_HOST;
test('source migration and rollback touch only source fields in all access/status collections', { skip: !emulator }, async () => {
  const app = initializeApp({projectId:'demo-rules'}, 'source-migration');
  const db = getFirestore(app);
  const originals = new Map(); const collections = new Map();
  const request = async (suffix, body) => {
    const response = await fetch(`http://${emulator}/v1/projects/demo-rules/databases/(default)/documents${suffix}`, {method:body?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:'Bearer owner'},...(body?{body:JSON.stringify(body)}:{})});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  };
  try {
    for (const collection of ['prayers','priestProtectedPrayers','prayerDrafts']) {
      const data = {title:'Назва',text:'Пс 23, 1–6',source:'«Бог Добры» (Пінск, 2022), с. 135–136',status:collection==='prayerDrafts'?'archived':'published',priestOnly:collection==='priestProtectedPrayers',categoryIds:['keep'],verified:false,unknownField:{keep:'unchanged'}};
      await db.doc(`${collection}/source-migration-test`).set(data);
      originals.set(collection,data);
      const raw = await request(`/${collection}/source-migration-test`);
      collections.set(collection,[{id:'source-migration-test',data,updateTime:raw.updateTime}]);
    }
    const plan = buildShortSourcePlan(collections);
    const api = {
      saveJournal:async()=>{},
      commit:(writes)=>request(':commit',{writes:writes.map((write)=>({...write,update:{...write.update,name:write.update.name.replace('projects/ibreviaryby/','projects/demo-rules/')}}))}),
      readback:async({collection,id})=>(await db.doc(`${collection}/${id}`).get()).data(),
    };
    const journal = await applySourcePlan(plan,api,{batchSize:2});
    assert.equal(journal.committed.length,3);assert.equal(journal.verified.length,2);
    for (const [collection,original] of originals) {
      const actual = (await db.doc(`${collection}/source-migration-test`).get()).data();
      assert.deepEqual(actual,{...original,source:'«Бог Добры» (Пінск, 2022)'});
    }
    await applySourcePlan(plan,{...api,commit:async()=>{throw new Error('Idempotent repeat must not write')}},{journal});
    const rollback = {...plan,changes:journal.committed.map((change)=>({...change,before:change.updates,updates:change.before}))};
    rollback.planSha256=planHash(rollback);
    await applySourcePlan(rollback,api);
    for (const [collection,original] of originals) assert.deepEqual((await db.doc(`${collection}/source-migration-test`).get()).data(),original);
    // The original plan cannot overwrite records after any intervening update.
    await assert.rejects(applySourcePlan(plan,api), /HTTP 400|HTTP 409/);
  } finally {
    await Promise.all([...originals.keys()].map((collection)=>db.doc(`${collection}/source-migration-test`).delete()));
    await deleteApp(app);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore,Timestamp} from 'firebase-admin/firestore';
import {encode} from '../scripts/migrate-priest-access.mjs';
import {grantProofMigrationPlan,applyGrantProofMigration} from '../scripts/migrate-priest-grant-proofs.mjs';
async function snapshot(directory,rows){
 await mkdir(directory,{recursive:true});
 const manifest={schemaVersion:1,projectId:'demo-rules',collections:{}};
 if(rows!==null){manifest.collections.priestDeviceGrants={file:'grants.json',documentCount:rows.length};await writeFile(`${directory}/grants.json`,JSON.stringify({schemaVersion:1,collectionPath:'priestDeviceGrants',documents:rows.map(({id,data})=>({id,data:encode(data)}))}));}
 await writeFile(`${directory}/manifest.json`,JSON.stringify(manifest));
}
test('grant migration refuses uncovered source and reports no proof values',async()=>{
 const directory='reports/priest-access/grant-migration-missing';await snapshot(directory,null);
 assert.equal((await grantProofMigrationPlan(directory)).report.ready,false);
 await snapshot(directory,[{id:'active',data:{status:'active',activationProof:'SYNTHETIC_PRIVATE_PROOF'}},{id:'clean',data:{status:'revoked'}}]);
 const analysis=await grantProofMigrationPlan(directory);assert.equal(analysis.report.total,2);assert.equal(analysis.report.legacyProofs,1);assert.equal(analysis.report.codeRotationRequired,true);
 assert.equal(JSON.stringify(analysis.report).includes('SYNTHETIC_PRIVATE_PROOF'),false);
});
test('emulator field-only migration backs up legacy proof, preserves access and concurrent revocation; stale source fails',{skip:!process.env.FIRESTORE_EMULATOR_HOST},async()=>{
 assert.match(process.env.FIRESTORE_EMULATOR_HOST,/^(127\.0\.0\.1|localhost):\d+$/);
 const app=initializeApp({projectId:'demo-rules'},'grant-migration-test'),db=getFirestore(app);
 const directory='reports/priest-access/grant-migration-complete';
 try {
  await db.recursiveDelete(db.collection('priestDeviceGrants'));
  const rows=[{id:'active',data:{uid:'active',status:'active',label:'old',activationProof:'a'.repeat(64),activatedAt:new Timestamp(1760000000,123456000),extra:{retain:true}}},{id:'revoked',data:{uid:'revoked',status:'revoked',activationProof:'b'.repeat(64),revokedAt:new Timestamp(1760000010,0)}},{id:'clean',data:{uid:'clean',status:'active',label:'clean'}}];
  for(const row of rows)await db.doc(`priestDeviceGrants/${row.id}`).set(row.data);
  await snapshot(directory,rows);const analysis=await grantProofMigrationPlan(directory);
  const race={collection:db.collection.bind(db),doc:db.doc.bind(db),runTransaction:async fn=>{
   await db.doc('priestDeviceGrants/active').update({label:'new',status:'revoked',revokedAt:new Date()});return db.runTransaction(fn);
  }};
  const result=await applyGrantProofMigration(race,analysis);assert.equal(result.writes,2);
  const backed=JSON.parse(await readFile(result.backup,'utf8'));assert.equal(backed.grants[0].data.activationProof,'a'.repeat(64));
  const active=(await db.doc('priestDeviceGrants/active').get()).data();assert.equal('activationProof' in active,false);assert.equal(active.status,'revoked');assert.equal(active.label,'new');assert.equal(active.activatedAt.nanoseconds,123456000);assert.deepEqual(active.extra,{retain:true});
  const revoked=(await db.doc('priestDeviceGrants/revoked').get()).data();assert.equal(revoked.status,'revoked');assert.equal(revoked.revokedAt.seconds,1760000010);assert.equal('activationProof' in revoked,false);
  assert.deepEqual((await db.doc('priestDeviceGrants/clean').get()).data(),rows[2].data);
  assert.equal((await db.collection('priestDeviceGrants').get()).size,3);
  await assert.rejects(applyGrantProofMigration(db,analysis),/differs from snapshot/);
  const cleanRows=(await db.collection('priestDeviceGrants').get()).docs.map(d=>({id:d.id,data:d.data()}));await snapshot(directory,cleanRows);
  assert.deepEqual(await applyGrantProofMigration(db,await grantProofMigrationPlan(directory)),{writes:0,backup:null});
 } finally {await deleteApp(app);}
});

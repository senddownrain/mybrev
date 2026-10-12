import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { generateKeyPairSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { initializeApp,deleteApp } from 'firebase-admin/app';
import { getFirestore,Timestamp,GeoPoint } from 'firebase-admin/firestore';
import { contentCollections,encode,priestMigrationPlan,migrationOperations } from '../scripts/migrate-priest-access.mjs';
import { prayerStoragePlan } from '../src/utils/prayerStoragePlan.mjs';
async function snapshot(directory,map){await mkdir(directory,{recursive:true});const manifest={schemaVersion:1,projectId:'demo-rules',collections:{}};for(const [name,rows] of map){manifest.collections[name]={file:`${name}.json`,documentCount:rows.length};await writeFile(`${directory}/${name}.json`,JSON.stringify({schemaVersion:1,collectionPath:name,documents:rows.map(({id,...data})=>({id,data:encode(data)}))}));}await writeFile(`${directory}/manifest.json`,JSON.stringify(manifest));}
test('incomplete snapshot fails readiness and dry-run never assumes missing categories empty',async()=>{
 const dir='reports/priest-access/migration-incomplete';await snapshot(dir,new Map([['prayers',[{id:'x',text:'PRIVATE',priestOnly:true}]]]));
 const {report}=await priestMigrationPlan([dir]);assert.ok(report.missingCollections.includes('prayerCategories'));assert.ok(!JSON.stringify(report).includes('PRIVATE'));
});
test('maintenance plan quarantines every public row before private/public target writes',()=>{
 const map=new Map([['prayers',[{id:'x',priestOnly:true,text:'PRIVATE'},{id:'p',text:'PUBLIC'}]],['prayerCategories',[]]]);
 const ops=migrationOperations(map,prayerStoragePlan(map),true);assert.deepEqual(ops.slice(0,2).map(op=>op.type),['delete','delete']);assert.equal(ops[2].collection,'priestProtectedPrayers');assert.equal(ops.at(-1).data.text,'PUBLIC');
});
test('explicit category policy closes descendants, preserves Mass and binds approval to policy',async()=>{
 const directory='reports/priest-access/migration-policy-test';
 const map=new Map(contentCollections.map(name=>[name,[]]));map.set('prayers',[{id:'rite',text:'PRIVATE',tags:['priest']},{id:'mass',text:'PUBLIC',tags:['mass']}]);map.set('prayerCategories',[{id:'priest',name:'Priest',tags:['priest']}]);
 await snapshot(directory,map);
 const before=await priestMigrationPlan([directory]);
 const after=await priestMigrationPlan([directory],{categoryFlags:[{id:'priest',priestOnly:true}],mustRemainPublic:['mass']});
 assert.equal(after.report.sourceDigest,before.report.sourceDigest);assert.notEqual(after.report.digest,before.report.digest);
 assert.equal(after.plan.desired.get('prayers')[0].id,'mass');assert.equal(after.plan.desired.get('priestProtectedPrayers')[0].id,'rite');assert.equal(after.plan.desired.get('priestProtectedPrayers')[0].priestOnly,false);
 await assert.rejects(priestMigrationPlan([directory],{categoryFlags:[{id:'priest',priestOnly:true}],mustRemainPublic:['rite']}),/Required public/);
});
test('emulator migration: full backup, large phased transfer, interruption/resume and stale-snapshot refusal',{skip:!process.env.FIRESTORE_EMULATOR_HOST},async()=>{
 assert.match(process.env.FIRESTORE_EMULATOR_HOST,/^(127\.0\.0\.1|localhost):\d+$/);
 const app=initializeApp({projectId:'demo-rules'},'migration-tests'),db=getFirestore(app);
 const directory='reports/priest-access/migration-complete',account='reports/priest-access/emulator-account.json';
 const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
 await writeFile(account,JSON.stringify({project_id:'demo-rules',private_key:privateKey,client_email:'local@example.test'}));
 const map=new Map(contentCollections.map(name=>[name,[]]));map.set('prayers',Array.from({length:550},(_,i)=>({id:`p-${i}`,text:`PRIVATE ${i}`,tags:['closed'],priestOnly:i===0})));map.set('prayerCategories',[{id:'root',tags:['closed'],priestOnly:true}]);
 map.get('prayers')[0].createdAt=new Timestamp(1760000000,123456000);
 map.get('prayers')[0].sourceRef=db.doc('prayers/p-1');
 map.get('prayers')[0].location=new GeoPoint(53.9,27.56);
 map.get('prayers')[0].blob=Buffer.from('unchanged');
 try{
  for(const name of contentCollections)await db.recursiveDelete(db.collection(name));
  for(const [name,rows] of map){for(let start=0;start<rows.length;start+=200){const batch=db.batch();for(const {id,...data} of rows.slice(start,start+200))batch.set(db.doc(`${name}/${id}`),data);await batch.commit();}}
  await db.doc('priestContentControl/state').set({version:0,lockUid:'',updatedAt:new Date()});
  await snapshot(directory,map);const {report}=await priestMigrationPlan([directory]);assert.equal(report.missingCollections.length,0);assert.equal(report.atomic,false);
  const args=['scripts/migrate-priest-access.mjs','--snapshot',directory,'--service-account',account,'--apply','--protected-rules-confirmed','--approve-digest',report.digest,'--allow-maintenance'];
  const stopped=spawnSync(process.execPath,[...args,'--test-stop-after-batch'],{env:process.env,encoding:'utf8'});assert.equal(stopped.status,1,stopped.stdout+stopped.stderr);assert.match(stopped.stderr,/TEST interruption/);
  const state=(await db.doc('priestContentControl/state').get()).data();assert.ok(state.lockUid);assert.equal(state.migrationStep,200);
  const backup=`backups/priest-access/${state.lockUid}.json`;const resumed=spawnSync(process.execPath,[...args,'--resume',backup],{env:process.env,encoding:'utf8'});assert.equal(resumed.status,0,resumed.stdout+resumed.stderr);
  assert.equal((await db.collection('prayers').get()).size,0);assert.equal((await db.collection('priestProtectedPrayers').get()).size,550);assert.equal((await db.doc('priestProtectedPrayers/p-1').get()).data().priestOnly,false);assert.equal((await db.doc('priestContentControl/state').get()).data().lockUid,'');
  const preserved=(await db.doc('priestProtectedPrayers/p-0').get()).data();assert.equal(preserved.createdAt.nanoseconds,123456000);assert.equal(preserved.sourceRef.path,'prayers/p-1');assert.equal(preserved.location.latitude,53.9);assert.equal(preserved.blob.toString(),'unchanged');
  const stale=spawnSync(process.execPath,args,{env:process.env,encoding:'utf8'});assert.equal(stale.status,1);assert.match(stale.stderr,/differs from snapshot/);
 }finally{await deleteApp(app);}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, doc, collection, getDocFromServer, getDocsFromServer, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, Timestamp } from 'firebase/firestore';
import { initializeApp as adminApp, deleteApp as deleteAdmin } from 'firebase-admin/app';
import { getFirestore as adminDb } from 'firebase-admin/firestore';
import { codeProof } from '../src/utils/priestCode.mjs';
import { prayerStoragePlan,canonicalPrayerContent } from '../src/utils/prayerStoragePlan.mjs';

test('Spark Firestore authoritative registration, revocation, legacy compatibility and atomic moves', {skip:!process.env.FIRESTORE_EMULATOR_HOST},async t=>{
 assert.match(process.env.FIRESTORE_EMULATOR_HOST,/^(127\.0\.0\.1|localhost):\d+$/);
 const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':'),projectId='demo-rules';
 const owner=adminApp({projectId},'priest-seed'),seed=adminDb(owner),apps=[];
 const client=uid=>{const app=initializeApp({projectId,apiKey:'demo-key'},`test-${apps.length}`);apps.push(app);const db=getFirestore(app);connectFirestoreEmulator(db,host,Number(port),uid?{mockUserToken:{sub:uid,user_id:uid}}:undefined);return db;};
 const guest=client(),device=client('device'),other=client('other'),manager=client('manager'),editor=client('editor');
 const proof=await codeProof('A2B3-C4D5-E6F7-G8H9-J2K3-L4M5'),nextProof=await codeProof('N2P3-Q4R5-S6T7-U8V9-W2X3-Y4Z5');
 const grant=uid=>({uid,status:'active',deviceName:'Test',client:'Flutter',platform:'Android',label:'',activatedAt:serverTimestamp(),lastActiveAt:serverTimestamp(),revokedAt:null});
 const claim=(uid,activationProof=proof)=>({uid,activationProof,createdAt:serverTimestamp()});
 const activate=(db,uid,activationProof=proof,grantPatch={},claimPatch={})=>{
  const batch=writeBatch(db);batch.set(doc(db,'priestActivationClaims',uid),{...claim(uid,activationProof),...claimPatch});
  batch.set(doc(db,'priestDeviceGrants',uid),{...grant(uid),...grantPatch});return batch.commit();
 };
 const denied=async operation=>assert.rejects(operation,{code:'permission-denied'});
 const read=(db,path)=>getDocFromServer(doc(db,path));
 try {
  await seed.recursiveDelete(seed.collection('priestDeviceGrants'));
  await seed.recursiveDelete(seed.collection('priestActivationClaims'));
  for(const name of ['prayers','prayerCategories','priestProtectedPrayers','priestProtectedCategories']) await seed.recursiveDelete(seed.collection(name));
  await seed.doc('admins/manager').set({name:'Legacy admin'}); await seed.doc('admins/editor').set({role:'admin'});
  await seed.doc('priestAccess/settings').set({activeCodeProof:proof,changedAt:new Date(),helpText:''});
  await seed.doc('priestProtectedPrayers/closed').set({text:'SECRET',priestOnly:true}); await seed.doc('priestProtectedCategories/closed').set({name:'Closed',priestOnly:true});
  await seed.doc('prayers/public').set({text:'PUBLIC',priestOnly:false}); await seed.doc('prayerCategories/public').set({name:'Public',tags:['p']});
  await t.test('unauthenticated and anonymous without grant cannot get or query either protected collection',async()=>{
   for(const db of [guest,device]) for(const name of ['priestProtectedPrayers','priestProtectedCategories']) {await denied(read(db,`${name}/closed`));await denied(getDocsFromServer(collection(db,name)));}
  });
  await t.test('private proof, registry list and nested catch-all paths never open publicly',async()=>{
   for(const name of ['priestAccess','priestDeviceGrants','priestActivationClaims','priestProtectedPrayers','priestProtectedCategories','priestContentControl','priestContentMigrationBackups','priestInstallations','priestActivationAttempts']) {
    await denied(read(guest,`${name}/x/private/y`)); await denied(getDocsFromServer(collection(device,name)));
   }
   await denied(read(device,'priestAccess/settings'));
   for (const admin of [editor,manager]) assert.ok((await read(admin,'priestAccess/settings')).exists());
  });
  await t.test('wrong proof, foreign UID, forged time/status/extra fields rejected',async()=>{
   await denied(activate(device,'device','f'.repeat(64)));
   await denied(activate(device,'other'));
   for(const patch of [{status:'revoked'},{activatedAt:Timestamp.fromMillis(0)},{lastActiveAt:Timestamp.fromMillis(0)},{uid:'other'},{admin:true},{activationProof:proof},{client:'Bad'},{deviceName:''},{label:'x'.repeat(121)}]) await denied(activate(device,'device',proof,patch));
   for(const patch of [{createdAt:Timestamp.fromMillis(0)},{uid:'other'},{extra:true},{activationProof:'bad'}]) await denied(activate(device,'device',proof,{},patch));
   for(const name of ['priestDeviceGrants','priestActivationClaims'])assert.equal((await seed.doc(`${name}/device`).get()).exists,false,'Denied batches leave neither document');
  });
  await t.test('neither grant nor claim can be created alone, even with valid proof',async()=>{
   await denied(setDoc(doc(device,'priestDeviceGrants/device'),grant('device')));
   await denied(setDoc(doc(device,'priestActivationClaims/device'),claim('device')));
   for(const name of ['priestDeviceGrants','priestActivationClaims'])assert.equal((await seed.doc(`${name}/device`).get()).exists,false);
  });
  await t.test('valid Flutter SDK batch creates claim and secret-free grant and reads protected documents',async()=>{
   await activate(device,'device');
   const stored=(await read(device,'priestDeviceGrants/device')).data();assert.equal('activationProof' in stored,false);
   const activation=(await seed.doc('priestActivationClaims/device').get()).data();assert.equal(activation.activationProof,proof);assert.ok(activation.createdAt.isEqual((await seed.doc('priestDeviceGrants/device').get()).data().activatedAt));
   assert.equal((await read(device,'priestProtectedPrayers/closed')).data().text,'SECRET');assert.equal((await getDocsFromServer(collection(device,'priestProtectedCategories'))).size,1);
  });
  await t.test('claims are unreadable and immutable to owner, other users and administrators',async()=>{
   for(const db of [guest,device,other,manager,editor]){
    await denied(read(db,'priestActivationClaims/device'));await denied(getDocsFromServer(collection(db,'priestActivationClaims')));
    await denied(updateDoc(doc(db,'priestActivationClaims/device'),{activationProof:nextProof}));await denied(deleteDoc(doc(db,'priestActivationClaims/device')));
   }
   await denied(read(other,'priestDeviceGrants/device'));
  });
  await t.test('an existing claim cannot authorize a later grant or be overwritten/reused',async()=>{
   const stale=client('stale');await seed.doc('priestActivationClaims/stale').set({uid:'stale',activationProof:proof,createdAt:new Date()});
   await denied(setDoc(doc(stale,'priestDeviceGrants/stale'),grant('stale')));await denied(activate(stale,'stale'));
   assert.equal((await seed.doc('priestDeviceGrants/stale').get()).exists,false);
   await denied(activate(device,'device'));
  });
  await t.test('legacy proof-bearing grant is unreadable to owner until field-only migration',async()=>{
   const legacy=client('legacy');await seed.doc('priestDeviceGrants/legacy').set({...grant('legacy'),activatedAt:new Date(),lastActiveAt:new Date(),activationProof:proof});
   await denied(read(legacy,'priestDeviceGrants/legacy'));
   const {FieldValue}=await import('firebase-admin/firestore');await seed.doc('priestDeviceGrants/legacy').update({activationProof:FieldValue.delete()});
   assert.equal((await read(legacy,'priestDeviceGrants/legacy')).data().status,'active');assert.equal((await read(legacy,'priestProtectedPrayers/closed')).data().text,'SECRET');
   await seed.doc('priestDeviceGrants/legacy').delete();
  });
  await t.test('owner can read own grant but cannot edit protected fields, spam activity, delete or list registry',async()=>{
   assert.equal((await read(device,'priestDeviceGrants/device')).data().status,'active');
   for(const patch of [{label:'forged'},{activationProof:nextProof},{uid:'other'},{activatedAt:serverTimestamp()},{lastActiveAt:serverTimestamp()}]) await denied(updateDoc(doc(device,'priestDeviceGrants/device'),patch));
   await denied(deleteDoc(doc(device,'priestDeviceGrants/device')));await denied(getDocsFromServer(collection(device,'priestDeviceGrants')));
   assert.equal((await getDocsFromServer(collection(manager,'priestDeviceGrants'))).size,1);
  });
  await t.test('old grant survives 400 days, client restart and code rotation; old code fails new registration',async()=>{
   await seed.doc('priestDeviceGrants/device').update({activatedAt:new Date(Date.now()-400*86400000),lastActiveAt:new Date(Date.now()-400*86400000)});
   const restarted=client('device');assert.equal((await read(restarted,'priestProtectedPrayers/closed')).data().text,'SECRET');
   const staleCodeBatch=writeBatch(manager);staleCodeBatch.update(doc(manager,'priestAccess/settings'),{activeCodeProof:nextProof,changedAt:serverTimestamp()});
   staleCodeBatch.set(doc(manager,'priestActivationClaims/manager'),claim('manager'));staleCodeBatch.set(doc(manager,'priestDeviceGrants/manager'),grant('manager'));
   await denied(staleCodeBatch.commit());assert.equal((await seed.doc('priestAccess/settings').get()).data().activeCodeProof,proof);
   await updateDoc(doc(editor,'priestAccess/settings'),{activeCodeProof:nextProof,changedAt:serverTimestamp()});
   assert.equal((await read(device,'priestProtectedPrayers/closed')).data().text,'SECRET');
   await denied(activate(other,'other'));assert.equal((await seed.doc('priestActivationClaims/other').get()).exists,false);await activate(other,'other',nextProof);
   await updateDoc(doc(device,'priestDeviceGrants/device'),{lastActiveAt:serverTimestamp()});
  });
  await t.test('administrative revoke stops reads and cannot be undone by client; label edit works',async()=>{
   await updateDoc(doc(manager,'priestDeviceGrants/device'),{label:'а. Яўгеній'});
   await denied(updateDoc(doc(other,'priestDeviceGrants/device'),{status:'revoked',revokedAt:serverTimestamp()}));
   await updateDoc(doc(editor,'priestDeviceGrants/device'),{status:'revoked',revokedAt:serverTimestamp()});
   await denied(read(device,'priestProtectedPrayers/closed'));await denied(getDocsFromServer(collection(device,'priestProtectedCategories')));
   await denied(updateDoc(doc(device,'priestDeviceGrants/device'),{status:'active',revokedAt:null}));await denied(activate(device,'device',nextProof));await denied(deleteDoc(doc(device,'priestDeviceGrants/device')));
   assert.equal((await read(other,'priestProtectedPrayers/closed')).data().text,'SECRET');
  });
  await t.test('self-disable revokes current installation only',async()=>{
   await updateDoc(doc(other,'priestDeviceGrants/other'),{status:'revoked',revokedAt:serverTimestamp()});await denied(read(other,'priestProtectedPrayers/closed'));
  });
  await t.test('legacy Flutter unfiltered anonymous public queries and direct ID reads remain allowed',async()=>{
   assert.equal((await read(guest,'prayers/public')).data().text,'PUBLIC');assert.ok((await getDocsFromServer(collection(guest,'prayers'))).size>0);assert.ok((await getDocsFromServer(collection(guest,'prayerCategories'))).size>0);
  });
  await t.test('public priestOnly/effective flags prohibited even for admin in valid transaction',async()=>{
   await seed.doc('priestContentControl/state').set({version:0,lockUid:'',updatedAt:new Date()});
   for(const field of ['priestOnly','effectivePriestOnly']) {const batch=writeBatch(editor);batch.set(doc(editor,'prayers/leak'),{text:'SECRET',[field]:true});batch.set(doc(editor,'priestContentControl/state'),{version:1,lockUid:'',updatedAt:serverTimestamp()});await denied(batch.commit());}
   await denied(setDoc(doc(editor,'prayers/uncoordinated'),{text:'PUBLIC'}));
  });
  await t.test('category inheritance closes/reopens dependent documents in one atomic commit preserving own flags',async()=>{
   const state=new Map([['prayers',[{id:'a',text:'PUBLIC A',tags:['root']},{id:'b',text:'PRIVATE B',tags:['child'],priestOnly:true}]],['prayerCategories',[{id:'root',tags:['root'],priestOnly:false},{id:'child',tags:['child'],parentId:'root',priestOnly:false}]]]);
   const initial=prayerStoragePlan(state).desired;
   for(const [name,items] of initial) for(const {id,...data} of items) await seed.doc(`${name}/${id}`).set(data);
   const content=canonicalPrayerContent(initial);content.categories.find(c=>c.id==='root').priestOnly=true;
   const closed=prayerStoragePlan(initial,content);
   async function apply(plan,version){const batch=writeBatch(editor);for(const op of plan.operations){const ref=doc(editor,op.collection,op.id);if(op.type==='delete')batch.delete(ref);else batch.set(ref,op.data);}batch.set(doc(editor,'priestContentControl/state'),{version,lockUid:'',updatedAt:serverTimestamp()});await batch.commit();}
   await apply(closed,1);assert.equal((await read(guest,'prayers/a')).exists(),false);await denied(read(guest,'priestProtectedPrayers/a'));assert.equal((await read(editor,'priestProtectedCategories/child')).data().priestOnly,false);
   const open=canonicalPrayerContent(closed.desired);open.categories.find(c=>c.id==='root').priestOnly=false;await apply(prayerStoragePlan(closed.desired,open),2);
   assert.equal((await read(guest,'prayers/a')).data().text,'PUBLIC A');assert.equal((await read(guest,'prayers/b')).exists(),false);assert.equal((await read(editor,'priestProtectedPrayers/b')).data().priestOnly,true);
  });
  await t.test('400-document atomic commit fits rule access limits; stale version and migration lock refuse changes',async()=>{
   const batch=writeBatch(editor);for(let i=0;i<400;i++)batch.set(doc(editor,'prayers',`stress-${i}`),{text:'PUBLIC',priestOnly:false});batch.set(doc(editor,'priestContentControl/state'),{version:3,lockUid:'',updatedAt:serverTimestamp()});await batch.commit();
   const stale=writeBatch(editor);stale.set(doc(editor,'prayers/stale'),{text:'PUBLIC'});stale.set(doc(editor,'priestContentControl/state'),{version:3,lockUid:'',updatedAt:serverTimestamp()});await denied(stale.commit());
   await seed.doc('priestContentControl/state').update({lockUid:'migration'});const locked=writeBatch(editor);locked.set(doc(editor,'prayers/locked'),{text:'PUBLIC'});locked.set(doc(editor,'priestContentControl/state'),{version:4,lockUid:'',updatedAt:serverTimestamp()});await denied(locked.commit());
  });
  await t.test('manual membership: Public vs Priest vs Admin, removed links and parent changes',async()=>{
   await seed.doc('priestContentControl/state').set({version:0,lockUid:'',updatedAt:new Date()});
   await seed.doc('priestDeviceGrants/device').update({status:'active',revokedAt:null});
   const state=new Map([['prayers',[{id:'manual-matrix',title:'MATRIX PRIVATE',tags:[]}]],['prayerCategories',[
    {id:'manual-public',name:'Matrix public',prayerIds:['manual-matrix'],priestOnly:false},
    {id:'manual-closed',name:'Matrix closed',priestOnly:true},
    {id:'manual-child',name:'Matrix child',parentId:'manual-public',prayerIds:['manual-matrix'],priestOnly:false}
   ]]]);
   let stored=prayerStoragePlan(state).desired;
   for(const [name,items] of stored)for(const {id,...data} of items)await seed.doc(`${name}/${id}`).set(data);
   let version=0;
   const apply=async content=>{const plan=prayerStoragePlan(stored,content),batch=writeBatch(editor);
    for(const op of plan.operations){const ref=doc(editor,op.collection,op.id);if(op.type==='delete')batch.delete(ref);else batch.set(ref,op.data);}
    batch.set(doc(editor,'priestContentControl/state'),{version:++version,lockUid:'',updatedAt:serverTimestamp()});await batch.commit();stored=plan.desired;
   };
   assert.equal((await read(guest,'prayers/manual-matrix')).exists(),true);
   let content=canonicalPrayerContent(stored);content.categories.find(c=>c.id==='manual-child').parentId='manual-closed';await apply(content);
   assert.equal((await read(guest,'prayers/manual-matrix')).exists(),false);
   for(const path of ['priestProtectedPrayers/manual-matrix','priestProtectedCategories/manual-child']){
    await denied(read(guest,path));for(const db of [device,editor])assert.equal((await read(db,path)).exists(),true);
   }
   await denied(updateDoc(doc(device,'priestProtectedCategories/manual-child'),{prayerIds:[]}));
   assert.deepEqual((await read(guest,'prayerCategories/manual-public')).data().prayerIds,['manual-matrix']);
   content=canonicalPrayerContent(stored);content.categories.find(c=>c.id==='manual-child').prayerIds=[];await apply(content);
   assert.equal((await read(guest,'prayers/manual-matrix')).exists(),true);
   assert.equal((await read(editor,'priestProtectedPrayers/manual-matrix')).exists(),false);
   assert.equal((await read(editor,'priestProtectedCategories/manual-child')).data().priestOnly,false);
  });

 } finally {await Promise.all(apps.map(deleteApp));await deleteAdmin(owner);}
});

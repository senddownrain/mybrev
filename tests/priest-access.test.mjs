import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { codeProof, generateCode, normalizeCode, validNewCode } from '../src/utils/priestCode.mjs';
import { canonicalPrayerContent, comparablePrayerValue, prayerStoragePlan } from '../src/utils/prayerStoragePlan.mjs';
import { permittedPrayerContent } from '../src/utils/priestPolicy.mjs';
import { publicAppCollections } from '../scripts/content/lib/app-content.mjs';
export const fixture = new Map([
 ['prayers', [{id:'public',text:'PUBLIC',tags:['public']},{id:'own',text:'SECRET OWN',tags:['public'],priestOnly:true},{id:'inherited',text:'SECRET INHERITED',tags:['child','public']},{id:'childOwn',text:'SECRET CHILD',tags:['child'],priestOnly:true}]],
 ['prayerCategories',[{id:'public',name:'Public',tags:['public']},{id:'closed',name:'Closed',tags:['closed'],priestOnly:true},{id:'child',name:'Child',tags:['child'],parentId:'closed',priestOnly:false},{id:'empty',tags:['empty']}]],
]);
test('24-symbol random code generation and strict manual validation', async () => {
 const unique=new Set();
 for(let i=0;i<100;i++) { const code=generateCode(); assert.match(code,/^([A-HJ-NP-Z2-9]{4}-){5}[A-HJ-NP-Z2-9]{4}$/); assert.equal(normalizeCode(code).length,24); assert.ok(validNewCode(code)); unique.add(code); }
 assert.equal(unique.size,100);
 for(const code of ['','A'.repeat(24),'ABCD2345'.repeat(3),'ABCDEFGHIJKLMNOPQRST2345','A2B3C4D5E6F7G8H9J2K3L4M5 ' .replace('A','I')]) assert.equal(validNewCode(code),false);
});
test('Web and Dart shared SHA-256 vectors',async()=> {
 const vectors=JSON.parse(await readFile(new URL('../shared/priest-code-vectors.json',import.meta.url)));
 for(const vector of vectors) { assert.equal(normalizeCode(vector.input),vector.normalized); if(vector.normalized) assert.equal(await codeProof(vector.input),vector.proof); else await assert.rejects(codeProof(vector.input)); }
});
test('inheritance moves IDs and texts physically and keeps sibling public',()=> {
 const {desired}=prayerStoragePlan(fixture);
 assert.deepEqual(desired.get('prayers').map(p=>p.id),['public']);
 assert.deepEqual(desired.get('priestProtectedPrayers').map(p=>p.id),['own','inherited','childOwn']);
 assert.deepEqual(desired.get('priestProtectedCategories').map(c=>c.id),['closed','child']);
 assert.equal(desired.get('priestProtectedCategories')[1].priestOnly,false);
 assert.equal(permittedPrayerContent(desired.get('prayers'),desired.get('prayerCategories')).categories.length,1);
});
test('reopening parent preserves own child flags; repeated planning is idempotent',()=> {
 const first=prayerStoragePlan(fixture).desired, content=canonicalPrayerContent(first);
 content.categories.find(c=>c.id==='closed').priestOnly=false;
 const second=prayerStoragePlan(first,content);
 assert.deepEqual(second.desired.get('prayers').map(p=>p.id),['public','inherited']);
 assert.equal(second.desired.get('priestProtectedPrayers').find(p=>p.id==='childOwn').priestOnly,true);
 assert.equal(prayerStoragePlan(second.desired).operations.length,0);
});
test('cycles, missing parents and duplicate IDs fail closed',()=> {
 const collections=new Map([['prayers',[{id:'x',text:'SECRET',tags:['a']}]],['prayerCategories',[{id:'a',tags:['a'],parentId:'b'},{id:'b',parentId:'a'}]]]);
 assert.equal(prayerStoragePlan(collections).desired.get('prayers').length,0);
 collections.set('priestProtectedPrayers',[{id:'x'}]); assert.throws(()=>canonicalPrayerContent(collections),/Duplicate/);
});
test('Firestore reference values are compared without traversing SDK cycles',()=> {
 const firestore={};firestore.self=firestore;
 const reference={path:'prayers/source',firestore,withConverter:()=>{}};
 const map=new Map([['prayers',[{id:'x',text:'PUBLIC',sourceRef:reference,priestOnly:false,effectivePriestOnly:false}]],['prayerCategories',[]]]);
 assert.equal(prayerStoragePlan(map).operations.length,0);
 assert.deepEqual(comparablePrayerValue(reference),{__firestoreType:'reference',path:'prayers/source'});
});
test('bundle/manifest/export omit all private namespaces and restricted texts',()=> {
 const collections=new Map(fixture); collections.set('priestDeviceGrants',[{activationProof:'PRIVATE PROOF'}]); collections.set('admins',[{id:'admin'}]); collections.set('priestProtectedPrayers',[{text:'SECRET'}]);
 const publicData=publicAppCollections(collections);
 assert.equal(publicData.has('admins'),false); assert.equal(publicData.has('priestDeviceGrants'),false); assert.equal(publicData.has('priestProtectedPrayers'),false);
 assert.ok(!JSON.stringify([...publicData]).includes('SECRET'));
});

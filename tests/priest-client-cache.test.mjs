import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContentCache } from '../src/utils/contentCache.js';
import { prayerAccessPolicy, permittedPrayerContent } from '../src/utils/priestPolicy.mjs';
import * as firestoreErrors from '../src/utils/firestoreErrors.mjs';
const source=(await readFile(new URL('../src/services/prayerContentService.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/export /g,'');
const publicPrayer={id:'public',text:'Public prayer',tags:['public'],effectivePriestOnly:false};
const privatePrayer={id:'private',text:'Protected prayer',tags:['private'],priestOnly:true};
const category={id:'parent',tags:['private'],priestOnly:false};
function harness({online=true,saved=new Map(),check=async()=>{},onPrivate=()=>{},categories=[]}={}) {
 firestoreErrors.resetFirestoreQuota();
 const navigator={onLine:online}, access={active:false,revision:0};
 const cache=createContentCache({storage:{get:async key=>saved.get(key),set:async(key,entry)=>saved.set(key,entry),keys:async()=>[...saved.keys()]},getRevision:()=> 'test',isOnline:()=>navigator.onLine});
 const getDocsFromServer=async name=> { if(!online) assert.fail('offline query'); if(name.startsWith('priestProtected')) onPrivate(access); const rows=name==='prayers'?[publicPrayer]:name==='prayerCategories'?categories:name==='priestProtectedPrayers'?[privatePrayer]:[]; return {docs:rows.map(({id,...data})=>({id,data:()=>data}))}; };
 const bindings={...firestoreErrors,publicContentCache:cache,publicContentKey:(n,v=1)=>`${n}:${v}`,checkPriestAccess:()=>check(access),priestAccess:access,permittedPrayerContent,prayerAccessPolicy,navigator,collection:(_db,name)=>name,getDocsFromServer,db:{},priestFirebase:{db:{}}};
 const getContent=new Function(...Object.keys(bindings),`${source}\nreturn getPrayerContent;`)(...Object.values(bindings)); return {getContent,saved,access};
}
test('private texts stay in memory; public content survives offline restart',async()=> {
 const saved=new Map(),client=harness({saved,check:async a=>{a.active=true;}});
 assert.equal((await client.getContent()).prayers.length,2); assert.ok(!JSON.stringify([...saved.values()]).includes('Protected prayer'));
 assert.deepEqual((await harness({saved,online:false}).getContent()).prayers,[publicPrayer]);
});
test('public category containing only private prayers reappears after activation',async()=> {
 const client=harness({categories:[category],check:async a=>{a.active=true;}}); const content=await client.getContent(); assert.equal(content.categories[0].id,'parent');
 assert.ok(JSON.stringify([...client.saved.values()]).includes('parent')); assert.ok(!JSON.stringify([...client.saved.values()]).includes('Protected prayer'));
});
test('revoked access prevents any protected query',async()=> {
 const client=harness({onPrivate:()=>assert.fail('private query')}); client.access.active=true;
 assert.deepEqual((await client.getContent()).prayers,[publicPrayer]);
});
test('late response after disable is discarded',async()=> {
 const client=harness({check:async a=>{a.active=true;},onPrivate:a=>{a.active=false;a.revision++;}});
 assert.deepEqual((await client.getContent()).prayers,[publicPrayer]);
});
test('protected quota failure falls back to public data without another grant read or caching private text',async()=> {
 let checks=0,privateQueries=0;
 const client=harness({check:async a=>{checks++;a.active=true;},onPrivate:()=>{privateQueries++;throw Object.assign(new Error('Quota exceeded'),{code:'resource-exhausted'});}});
 assert.deepEqual((await client.getContent()).prayers,[publicPrayer]);assert.equal(checks,1);assert.equal(privateQueries,2);
 assert.ok(!JSON.stringify([...client.saved.values()]).includes('Protected prayer'));
 assert.deepEqual((await client.getContent()).prayers,[publicPrayer]);assert.equal(checks,1);assert.equal(privateQueries,2);
});
test('legacy cache strips own and inherited secrets',async()=> {
 const saved=new Map([['prayers:1',{complete:true,revision:'old',data:[publicPrayer,privatePrayer,{id:'inherited',text:'secret',tags:['child']}]}],['prayerCategories:1',{complete:true,revision:'old',data:[{id:'closed',priestOnly:true},{id:'child',parentId:'closed',tags:['child']}]}]]);
 assert.deepEqual((await harness({online:false,saved}).getContent()).prayers.map(p=>p.id),['public']);
});

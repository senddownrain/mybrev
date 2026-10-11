import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('default restoration uses complete protected/public state and preserves renamed own flags',async()=> {
 const source=await readFile(new URL('../src/services/prayerCategoryService.js',import.meta.url),'utf8');
 const start=source.indexOf('export async function restoreDefaultPrayerCategories'),end=source.indexOf('export async function deletePrayerTagEverywhere');
 const original={id:'existing',name:'Renamed',priestOnly:true,parentId:'protected-parent'};
 const content={categories:[original]};
 const restore=new Function('DEFAULT_CATEGORIES','mutatePrayerContent','categoryPayload','serverTimestamp',`${source.slice(start,end).replace('export ','')}\nreturn restoreDefaultPrayerCategories;`)(
 [{id:'existing',name:'Original'},{id:'missing',name:'Missing'}],async edit=>edit(content),c=>({...c,priestOnly:false}),()=> 'timestamp');
 assert.equal(await restore(),1); assert.equal(content.categories[0],original); assert.equal(content.categories[1].priestOnly,false);
});

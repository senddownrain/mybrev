import test from 'node:test';
import assert from 'node:assert/strict';
import {planManifest} from '../scripts/content/publish-manifest.mjs';
test('scoped publication preserves every unselected collection and its version',()=>{
 const published={contentVersion:1,publishedAt:'old',collections:{prayers:{digest:'a',count:105,bytes:10,version:4},days:{digest:'days',count:735,bytes:3000,version:10}}};
 const {current,changed}=planManifest({prayers:{digest:'b',count:85,bytes:8}},published,2,{partial:true});
 assert.deepEqual(current.collections.days,published.collections.days);assert.equal(current.collections.prayers.version,5);assert.deepEqual(changed,['prayers']);assert.equal(current.contentVersion,2);assert.deepEqual(Object.keys(current.collections),['prayers','days']);
});
test('scoped no-op retains published version; scope cannot initialise an incomplete manifest',()=>{
 const published={contentVersion:1,publishedAt:'old',collections:{prayers:{digest:'a',count:105,bytes:10,version:4}}};
 const {current,changed}=planManifest({prayers:{digest:'a',count:105,bytes:10}},published,2,{partial:true});assert.deepEqual(changed,[]);assert.equal(current.contentVersion,1);
 assert.throws(()=>planManifest({prayers:{digest:'b'}},null,2,{partial:true}),/existing manifest/);
});

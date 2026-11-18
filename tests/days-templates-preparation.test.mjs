import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { selectDaysTemplates } from '../scripts/liturgy/prepare-days-templates.mjs';
import { validatePublicationPlan } from '../scripts/liturgy/lib/editorial-publication.mjs';
import { verifyCompatibleSubset } from '../scripts/liturgy/lib/editorial-compatible-subset.mjs';
import { editorialHash } from '../scripts/liturgy/lib/editorial-responsories.mjs';
const dir='docs/audits/liturgical-common-texts-2026-11/v4',full=JSON.parse(zlib.gunzipSync(fs.readFileSync(dir+'/full-content-plan.json.gz'))),published=JSON.parse(fs.readFileSync(dir+'/PUBLICATION_RESULT.json')),plan=selectDaysTemplates(full,published);
test('select exactly 7791 reviewed fields, exclude Proper and all 843 unresolved fields, retain exact original values/masks',()=>{
 assert.equal(validatePublicationPlan(plan),true);assert.equal(plan.documents.length,749);
 const originals=new Map(full.documents.flatMap(d=>d.fields.map(f=>[d.document+'|'+f.field,f])));
 for(const d of plan.documents)for(const f of d.fields){assert.deepEqual(f,originals.get(d.document+'|'+f.field));assert.equal(editorialHash(f.before),f.beforeSha256);assert.equal(editorialHash(f.after),f.afterSha256);assert.equal(f.updateMask,f.path.join('.'));}
});
test('all 14 captured Advent changes are outside selected masks, with the post-Advent baseline retained',()=>{
 const proof=JSON.parse(fs.readFileSync(dir+'/compatibility-review.json'));assert.equal(proof.advent.reduce((n,d)=>n+d.changedFields.length,0),14);
 for(const a of proof.advent){const d=plan.documents.find(d=>d.document===a.document);assert.equal(d.fields.length,6);assert.ok(a.changedFields.every(f=>!d.fields.some(p=>p.field===f.field)));assert.equal(d.updateTime.seconds,Math.floor(Date.parse(a.serverReadUpdateTime)/1000));}
});
test('owner-approved seasonal responsories agree with canonical source and preserve Easter Alleluia',()=>{
 const templates=new Map(plan.documents.filter(d=>d.document.startsWith('liturgicalTemplates/')).map(d=>[d.document.split('/')[1],d]));
 for(const id of ['church-dedication','holy-men','virgins']){const src=JSON.parse(fs.readFileSync('patchs/db-templates/'+id+'.json'));for(const f of templates.get(id).fields.filter(f=>/vesper1?R$/u.test(f.field)))assert.equal(f.after,f.path.reduce((v,k)=>v[k],src));}
 const easter=templates.get('holy-men').fields.find(f=>f.field==='_seasonalVariants.easter.vesperR').after;assert.ok(easter.includes('аллелюя, аллелюя'));assert.ok(easter.includes('Справялівы'));
});
test('offline readiness never bypasses the existing runtime compatibility gate',()=>{
 assert.equal(plan.compatibility.freshLivePreflight,false);assert.throws(()=>verifyCompatibleSubset(plan,{}),/policy/);
});

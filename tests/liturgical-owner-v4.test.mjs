import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { parse } from 'node-html-parser';
import { editorialHash } from '../scripts/liturgy/lib/editorial-responsories.mjs';
import { expandApprovedEditorial,preEditorialComparison } from '../scripts/liturgy/lib/editorial-policy.mjs';
import { liturgicalText } from '../src/utils/liturgicalSourceHtml.js';
import { validatePublicationPlan } from '../scripts/liturgy/lib/editorial-publication.mjs';
import { verifyCompatibleSubset } from '../scripts/liturgy/lib/editorial-compatible-subset.mjs';
const dir='docs/audits/liturgical-common-texts-2026-11',gz=f=>JSON.parse(zlib.gunzipSync(fs.readFileSync(dir+'/'+f))),proof=gz('v4/source-proofs.json.gz');
const at=(d,p)=>p.split('.').reduce((v,k)=>v?.[k],d);
test('all ten owner decisions plus the mixed-script copied source resolve atomically and idempotently',()=>{
 assert.equal(proof.records.length,11);for(const r of proof.records){const actual=at(JSON.parse(fs.readFileSync(r.file)),r.field);assert.equal(actual,r.afterHtml);assert.equal(editorialHash(actual),r.afterSha256);assert.equal(expandApprovedEditorial(actual,r.field.split('.').at(-1)).value,actual);assert.notEqual(expandApprovedEditorial(actual,r.field.split('.').at(-1)).status,'needs-editor');
  let value=r.beforeHtml;for(const stage of r.stages){assert.equal(stage.before,value);for(const e of [...stage.edits].sort((a,b)=>b.start-a.start)){assert.equal(value.slice(e.start,e.end),e.beforeHtml);value=value.slice(0,e.start)+e.afterHtml+value.slice(e.end);}assert.equal(value,stage.after);}assert.equal(value,actual,'no bytes outside declared spans changed');
 }
 assert.equal(JSON.parse(fs.readFileSync(dir+'/manual-review.json')).cases.length,0);
});
test('U, Cyrillic C, source Справялівы and Easter star are exactly the owner-approved forms',()=>{
 for(const r of proof.records){const lines=parse(r.afterHtml).querySelectorAll('p').map(p=>liturgicalText(p.innerHTML));
  if(r.file.endsWith('/29-07-sv-martha.json'))assert.equal(lines.at(-1),'Н. Наладзілі гасціну ў Бэтаніі.');
  if(r.file.endsWith('/church-dedication.json')){assert.ok(lines.includes('Н. У доме Тваім, Пане.'));assert.ok(!lines.some(t=>/^Н\. [ўЎ]/u.test(t)));}
  if(r.file.endsWith('/holy-men.json')){const n=lines.filter(t=>t.startsWith('Н. '));assert.equal(n[0],r.field.includes('easter')?'Н. Справялівы Пан, і любіць справядлівасць, * аллелюя, аллелюя.':'Н. Справялівы Пан, * і любіць справядлівасць.');assert.equal(n[2],n[0]);if(r.field.includes('easter'))assert.equal(n[1],'Н. Аллелюя, аллелюя.');}
  if(r.file.endsWith('/virgins.json')){assert.ok(!r.afterHtml.includes('cказала'));if(!r.field.includes('easter'))assert.ok(lines.includes('Н. Сказала мая душа.'));}
 }
});
test('all 820 old generated replies receive the requested initial-letter/graph review; only two copies need correction',()=>{
 const review=gz('v4/820-grapheme-review.json.gz');assert.equal(review.checked,820);assert.equal(review.lowercaseInitials,0);assert.equal(review.initialShortU,0);assert.equal(review.mixedScriptCopies.length,2);assert.ok(review.mixedScriptCopies.every(r=>r.caseId==='PR245-490'));
 const old=gz('v3/editorial-source-proofs.json.gz');for(const r of old.records.filter(r=>r.status==='safe-auto')){const current=at(JSON.parse(fs.readFileSync(r.file)),r.field),owner=proof.records.find(x=>x.file===r.file&&x.field===r.field);assert.equal(current,owner?owner.afterHtml:r.afterHtml,'preserve every previous safe source field');}
});
test('source comparison can reverse both editorial layers without modifying printed evidence',()=>{
 for(const r of proof.records){const original=preEditorialComparison(r.afterHtml,r.file,r.field);assert.equal(original,preEditorialComparison(r.beforeHtml,r.file,r.field));}
});
test('publication preserves old ready work, rebases only two shared documents and holds published collections',()=>{
 const p=gz('v4/publication-plan.json.gz'),full=gz('v4/full-content-plan.json.gz'),old=gz('v3/publication-plan.json.gz');assert.equal(validatePublicationPlan(p),true);
 assert.ok(p.documents.every(d=>d.document.startsWith('liturgicalProperTexts/')));assert.equal(p.summary.sourceEditorPending,0);
 const all=new Map(full.documents.flatMap(d=>d.fields.map(f=>[d.document+'|'+f.field,f])));for(const d of old.documents)for(const f of d.fields)assert.ok(all.has(d.document+'|'+f.field));
 assert.equal(p.compatibility.advent.reduce((n,d)=>n+d.changedFields.length,0),14);for(const d of p.compatibility.advent){assert.equal(d.targetFieldCount,6);assert.equal(d.disjoint,true);const rebased=full.documents.find(r=>r.document===d.document);assert.equal(rebased.updateTime.seconds,Math.floor(Date.parse(d.serverReadUpdateTime)/1000));assert.ok(d.changedFields.every(f=>!rebased.fields.some(p=>p.field===f.field)));}
});
test('fresh manifest gate rejects a new Proper introduction, changed digest or a days write',()=>{
 const plan=gz('v4/publication-plan.json.gz'),collections=plan.compatibility.publishedCollections;assert.equal(verifyCompatibleSubset(plan,collections).manifestWrites,0);
 assert.throws(()=>verifyCompatibleSubset(plan,{...collections,liturgicalProperTexts:{version:1}}),/manifest changed/);
 const changed=structuredClone(collections);changed.days.version++;assert.throws(()=>verifyCompatibleSubset(plan,changed),/manifest changed/);
 const wrong=structuredClone(plan);wrong.documents[0].document='days/advent-21-12';assert.throws(()=>verifyCompatibleSubset(wrong,collections),/published collection/);
});

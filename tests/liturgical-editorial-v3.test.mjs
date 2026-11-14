import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { parse } from 'node-html-parser';
import { expandEditorialResponsories,editorialHash } from '../scripts/liturgy/lib/editorial-responsories.mjs';
import { expandApprovedEditorial,preEditorialComparison } from '../scripts/liturgy/lib/editorial-policy.mjs';
import { validatePublicationPlan,prepareFreshPublication,boundPublicationWrites,executePreparedPublication } from '../scripts/liturgy/lib/editorial-publication.mjs';
import { inspectField } from '../scripts/liturgy/lib/common-text-audit.mjs';
import { liturgicalText,normalizeReadingHtml } from '../src/utils/liturgicalSourceHtml.js';
import { getLiturgicalAlternatives } from '../src/utils/liturgicalAlternatives.js';
const dir='docs/audits/liturgical-common-texts-2026-11',gz=f=>JSON.parse(zlib.gunzipSync(fs.readFileSync(dir+'/'+f))),proof=gz('v3/editorial-source-proofs.json.gz');
const ownerProof=gz('v4/source-proofs.json.gz');
const historicalOwnerValue=(value,file,field)=>{const r=ownerProof.records.find(r=>r.file===file&&r.field===field&&r.afterHtml===value);return r?r.beforeHtml:value;};
const historicalOwnerDoc=(doc,file)=>{const d=structuredClone(doc);for(const r of ownerProof.records.filter(r=>r.file===file)){const keys=r.field.split('.'),last=keys.pop(),node=keys.reduce((v,k)=>v[k],d);node[last]=historicalOwnerValue(node[last],file,r.field);}return d;};
const baseline=gz('v3/source-baseline.json.gz'),at=(d,p)=>p.split('.').reduce((v,k)=>v?.[k],d);
const words=s=>(s.toLocaleLowerCase('be').match(/[\p{L}\p{N}]+(?:[’'ʼ][\p{L}\p{N}]+)*/gu)||[]);
for(const kind of ['short','long'])test('every '+kind+' field has exact local span copies, reversible source and idempotent output',()=>{
 for(const r of proof.records.filter(r=>r.kind===kind)){
  const field=r.field.split('.').at(-1),actual=historicalOwnerValue(at(JSON.parse(fs.readFileSync(r.file)),r.field),r.file,r.field),computed=expandEditorialResponsories(r.beforeHtml,field);
  assert.equal(r.beforeSha256,editorialHash(r.beforeHtml));assert.equal(r.afterSha256,editorialHash(r.afterHtml));assert.equal(actual,r.afterHtml,r.caseId);assert.equal(computed.value,actual);
  assert.equal(expandEditorialResponsories(actual,field).edits.length,0,r.caseId);
  let expected=r.beforeHtml;
  for(const e of [...r.edits].sort((a,b)=>b.start-a.start)){
   assert.equal(expected.slice(e.start,e.end),e.beforeHtml);assert.equal(editorialHash(e.beforeHtml),e.beforeSha256);assert.equal(editorialHash(e.afterHtml),e.afterSha256);
   assert.deepEqual(words(liturgicalText(e.sourceHtml)),words(e.expandedReply.replace(/^Н\.\s/u,'')));
   assert.ok(r.blocks.some(b=>b.signature===e.signature&&JSON.stringify(b.sourceParagraphs)===JSON.stringify(e.sourceParagraphs)));
   expected=expected.slice(0,e.start)+e.afterHtml+expected.slice(e.end);
  }
  assert.equal(expected,actual,'no edits outside declared N. paragraphs');
  assert.equal(getLiturgicalAlternatives(actual,'office-reading').length,getLiturgicalAlternatives(r.beforeHtml,'office-reading').length);
  assert.equal(normalizeReadingHtml(actual),actual,'renderer does not expand again');
  if(r.status!=='needs-editor')assert.ok(!inspectField({field,value:actual,container:{[field]:actual}}).some(f=>f.type==='abbreviated-responsory'),'complete structural repeat is not flagged by word count/doxology');
  assert.deepEqual(parse(actual).querySelectorAll('p').filter(p=>/^К\./u.test(liturgicalText(p.innerHTML))).map(p=>p.toString()),parse(r.beforeHtml).querySelectorAll('p').filter(p=>/^К\./u.test(liturgicalText(p.innerHTML))).map(p=>p.toString()),'all verses and doxologies remain byte-identical');
 }
});
test('canonical JSON changes are exactly the 455 proved fields / 820 replies; unrelated values and all exceptions survive',()=>{
 let changed=0;const walk=(before,after,file,path=[])=>{if(typeof before==='string'){if(before!==after){changed++;const row=proof.records.find(r=>r.file===file&&r.field===path.join('.'));assert.ok(row,'Unproved '+file+':'+path.join('.'));assert.equal(row.status,'safe-auto');assert.equal(after,row.afterHtml);assert.equal(before,row.beforeHtml);}return;}if(before&&typeof before==='object'){assert.deepEqual(Object.keys(after),Object.keys(before),file);for(const k of Object.keys(before))walk(before[k],after[k],file,[...path,k]);}else assert.deepEqual(after,before);};
 for(const[file,doc]of Object.entries(baseline))walk(doc,historicalOwnerDoc(JSON.parse(fs.readFileSync(file)),file),file);
 assert.equal(changed,455);assert.equal(proof.records.reduce((n,r)=>n+r.edits.length,0),820);
 assert.deepEqual(proof.records.reduce((tot,r)=>(tot[r.status]=(tot[r.status]||0)+1,tot),{}),{'safe-auto':455,'needs-editor':10,'already-full':2});
});
test('the two specified apostles short examples follow A+B / B / A+B and keep source K. doxology',()=>{
 const doc=JSON.parse(fs.readFileSync('patchs/feasts/common-texts/apostles.json'));
 for(const field of ['laudesR','vesperR']){
  const lines=parse(doc[field]).querySelectorAll('p').map(p=>liturgicalText(p.innerHTML)),k=lines.findIndex(t=>t.startsWith('К. '));
  assert.equal(lines[k+1].slice(3),lines[k].slice(3));assert.equal(lines[k+5].slice(3),lines[k].slice(3));assert.equal(lines[k+4],'К. Хвала Айцу.');
  assert.equal(lines[k+3],field==='laudesR'?'Н. Па ўсёй зямлі.':'Н. Славу Пана.');
 }
});
test('all five named historical proposals are now activated only under v3 authorization',()=>{
 const five=JSON.parse(fs.readFileSync(dir+'/five-reconstruction-candidates.json'));for(const c of five.cases){const r=proof.records.find(r=>r.file===c.file&&r.field===c.field);assert.equal(r.status,'safe-auto');assert.ok(r.edits.some(e=>e.expandedReply===c.proposal.proposedReply));assert.equal(preEditorialComparison(r.afterHtml,r.file,r.field),c.originalHtml);}
});
test('continuation after star remains within its own N. and does not move original paragraphs',()=>{
 const cases=proof.records.filter(r=>r.file.includes('16-11-our-lady-mother-mercy')&&r.field==='officeOfReadingsR2');assert.equal(cases.length,3);for(const r of cases){assert.equal(r.edits[0].expandedReply,'Н. А імя Яго святое.');assert.equal(r.blocks[0].sourceParagraphs.length,2);}
});
test('no cross-boundary, partial-word, wrong role, multiple-star or unknown-signature substitution',()=>{
 const long=(n,k,r)=>`<p>Н. ${n}</p><p>К. ${k}</p><p>Н. ${r}</p>`;
 for(const html of [long('А * Б словы.','Верш.','Іншае.'),long('А * Б словы * іншае.','Верш.','Б.'),long('А * Поўныя словы.','Верш.','Поўн.'),'<p>Н. А * Б словы.</p><p>К. Верш.</p><hr><p>Н. Б.</p>', '<p>Н. А * Б словы.</p><p>К. Верш.</p><p data-alternative-title="other">Або</p><p>Н. Б.</p>'])assert.equal(expandEditorialResponsories(html,'officeOfReadingsR1').value,html);
 const full=long('А * поўны адказ.','Верш.','Поўны адказ!');assert.equal(expandEditorialResponsories(full,'officeOfReadingsR1').value,full);
 assert.equal(expandApprovedEditorial(long('А * Б словы.','Верш.','Б.'),'officeOfReadingsR1').value,long('А * Б словы.','Верш.','Б.'));
 const s='<p>К. А * Б.</p><p>Н. А.</p><p>К. В.</p><p>Н. Б.</p><p>К. Невядома.</p><p>Н. А.</p>';assert.equal(expandEditorialResponsories(s,'laudesR').value,s);
});
test('only ten fields / fifteen replies are sent to the editor; SHA and seasons remain separate',()=>{
 const q=JSON.parse(fs.readFileSync(dir+'/v3/exceptions.json'));assert.equal(q.cases.length,10);assert.equal(q.cases.flatMap(r=>r.replies).length,15);assert.ok(q.cases.every(r=>r.status==='needs-editor'&&r.beforeHtml===r.afterHtml));
 const season=q.cases.filter(r=>r.file.endsWith('/holy-men.json'));assert.equal(season.length,5);assert.equal(new Set(season.map(r=>r.season)).size,5);
 for(const row of q.cases)for(const reply of row.replies){assert.equal(editorialHash(reply.originalHtml),reply.replySha);assert.ok(reply.reason);assert.ok(reply.proposedBodyHtml);}
});
const tiny=()=>{const f={field:'laudesR',path:['laudesR'],updateMask:'laudesR',before:'old',after:'new',beforeSha256:editorialHash('old'),afterSha256:editorialHash('new'),status:'ready',edits:[{start:0,end:3,value:'new'}]};return {schema:3,network:false,summary:{readyDocuments:1,readyFields:1},documents:[{document:'days/example',updateTime:{seconds:1,nanoseconds:2},fields:[f]}]};};
test('publication union keeps every old ready field and exact masks; no held path is writable',()=>{
 const p=gz('v3/publication-plan.json.gz'),old=gz('ready-to-publish-fields.json.gz');assert.equal(validatePublicationPlan(p),true);
 const ready=new Map(p.documents.flatMap(d=>d.fields.map(f=>[d.document+'|'+f.field,f])));assert.equal(ready.size,p.summary.readyFields);assert.equal(old.fields.length,6400);for(const f of old.fields)assert.ok(ready.has(f.document+'|'+f.field));for(const f of p.fields.filter(f=>f.status==='held'))assert.ok(!ready.has(f.document+'|'+f.field));
 for(const d of p.documents)assert.ok(d.fields.every(f=>f.collection===d.document.split('/')[0]&&f.documentId===d.document.split('/')[1]));
});
test('fresh updateTime / hash conflicts and tampered masks fail before the first write',()=>{
 const p=tiny(),records=new Map([['days/example',{data:{laudesR:'old',untouched:'safe'},updateTime:{seconds:1,nanoseconds:2}}]]);
 assert.equal(prepareFreshPublication(p,records).length,1);
 const race=structuredClone(records);race.get('days/example').updateTime.nanoseconds=3;assert.throws(()=>prepareFreshPublication(p,race),/conflicts/);
 const changed=structuredClone(records);changed.get('days/example').data.laudesR='other';assert.throws(()=>prepareFreshPublication(p,changed),/conflicts/);
 const bad=tiny();bad.documents[0].fields[0].updateMask='laudesR,other';assert.throws(()=>prepareFreshPublication(bad,records),/mask/);
});
test('future executor bounds requests, journals committed writes, verifies hashes/time and stops on conflict without retry',async()=>{
 const p=tiny(),records=new Map([['days/example',{data:{laudesR:'old',untouched:'safe'},updateTime:{seconds:1,nanoseconds:2}}]]),prepared=prepareFreshPublication(p,records);
 assert.deepEqual(prepared[0].write.updateMask.fieldPaths,['laudesR']);assert.equal(prepared[0].write.update.fields.untouched,undefined);
 assert.equal(boundPublicationWrites(Array.from({length:801},()=>prepared[0])).length,3);
 let commits=0,journals=0;const adapter={commit:async()=>{commits++;return{writeResults:[{updateTime:'1970-01-01T00:00:02.000000004Z'}]};},journal:async()=>{journals++;},read:async()=>new Map([['days/example',{data:{laudesR:'new',untouched:'safe'},updateTime:{seconds:2,nanoseconds:4}}]])};
 const receipts=await executePreparedPublication(prepared,adapter);assert.equal(commits,1);assert.equal(journals,2);assert.equal(receipts[0].readback,'verified');
 commits=0;journals=0;await assert.rejects(executePreparedPublication(prepared,{...adapter,read:async()=>records}),/Readback conflict/);assert.equal(commits,1);assert.equal(journals,1);
});
test('cache-recovered Proper is expanded by the generator with a separate proof, never a sparse overwrite of days',()=>{
 const derived=gz('v3/derived-generation-proof.json.gz');assert.equal(derived.editorialExpansions.length,1);const row=derived.editorialExpansions[0];assert.equal(row.outputFile,'03-05-sv-philip-james-apostles.json');assert.equal(row.edits.length,1);assert.equal(at(JSON.parse(fs.readFileSync('patchs/db-feasts/'+row.outputFile)),row.field),row.afterHtml);assert.equal(expandApprovedEditorial(row.beforeHtml,row.field).value,row.afterHtml);
});
test('identical rendered text can reverse to distinct printed abbreviations only with exact file/field context',()=>{
 const rows=proof.records.filter(r=>r.file.endsWith('/blessed-virgin-mary.json')&&['vesper1R','_seasonalVariants.advent.vesper1R'].includes(r.field));assert.equal(rows.length,2);assert.equal(rows[0].afterHtml,rows[1].afterHtml);assert.notEqual(rows[0].beforeHtml,rows[1].beforeHtml);assert.equal(preEditorialComparison(rows[0].afterHtml),rows[0].afterHtml);for(const r of rows)assert.equal(preEditorialComparison(r.afterHtml,r.file,r.field),r.beforeHtml);
});

test('reply counters distinguish applied copies, complete replies and field-atomic holds',()=>{
 const s=proof.summary;assert.deepEqual(s.short.replyClassification,{'auto-expanded':396,'already-full':18,'held-safe-candidate':13,'needs-editor':14});assert.deepEqual(s.long.replyClassification,{'auto-expanded':424,'needs-editor':1});for(const kind of ['short','long'])assert.equal(Object.values(s[kind].replyClassification).reduce((a,b)=>a+b,0),s[kind].repeatedReplies);
});

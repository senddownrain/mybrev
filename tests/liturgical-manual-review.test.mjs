import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { atPath, isTwoLineVersicle, reviewLongResponses, reviewAntiphon, reviewHash } from '../scripts/liturgy/lib/manual-common-review.mjs';
import { getLiturgicalAlternatives } from '../src/utils/liturgicalAlternatives.js';
import { inspectField } from '../scripts/liturgy/lib/common-text-audit.mjs';
const dir='docs/audits/liturgical-common-texts-2026-11';
const baseline=JSON.parse(zlib.gunzipSync(fs.readFileSync(dir+'/manual-review-baseline-245.json.gz')));
const reviewed=JSON.parse(zlib.gunzipSync(fs.readFileSync(dir+'/manual-review-followup.json.gz')));

test('the 17 owner-confirmed versicles are excluded without editing any words',()=>{
 const cases=reviewed.cases.filter(c=>c.classification==='two-line-versicle');
 assert.equal(cases.length,17);
 for(const c of cases){const doc=JSON.parse(fs.readFileSync(c.file)),html=atPath(doc,c.field),field=c.field.split('.').at(-1);
  assert.equal(c.originalHtml,html);assert.equal(c.proposedHtml,html);assert.equal(isTwoLineVersicle(html,field),true);
  assert.ok(!inspectField({field,value:html,container:doc}).some(f=>f.type==='abbreviated-responsory'));
 }
 assert.equal(isTwoLineVersicle('<p>К. Слова.</p><p>Н. Адказ.</p>','laudesR'),false);
 assert.equal(isTwoLineVersicle('<p>Кароткі рэспансорый</p><p>К. Слова.</p><p>Н. Адказ.</p>','sext1R'),false);
});

test('all 16 antiphon fields have a preserved, checked classification',()=>{
 const cases=reviewed.cases.filter(c=>c.type==='embedded-antiphon-needs-context');assert.equal(cases.length,16);
 assert.equal(cases.filter(c=>c.classification==='formatting-only').length,9);
 assert.equal(cases.filter(c=>c.classification==='printed-text-variant').length,6);
 assert.equal(cases.filter(c=>c.classification==='owned-alternative-antiphons').length,1);
 for(const c of cases){assert.equal(reviewAntiphon(c.originalHtml,c.dedicatedHtml).classification,c.classification);assert.equal(c.proposedHtml,c.originalHtml);}
 const variants=cases.filter(c=>c.classification==='printed-text-variant');
 assert.ok(variants.some(c=>c.embedded[0].text.includes('які ў нябёсах')));
 assert.ok(variants.some(c=>c.embedded[0].text.includes('гаспадара твайго')));
});

test('long response proposals copy only the local marked words and never apply themselves',()=>{
 const doc=JSON.parse(fs.readFileSync('patchs/feasts/common-texts/martyr-one.json'));
 for(const [field,expected]of [['officeOfReadingsR1','Н. Радуйцеся і весяліцеся, бо вялікая ўзнагарода ваша ў нябёсах.'],['officeOfReadingsR2','Н. Нарэшце рыхтуецца мне вянок справядлівасці.']]){
  const html=doc[field],result=reviewLongResponses(html);assert.equal(result.length,1);assert.equal(result[0].proposedReply,expected);assert.equal(result[0].copyProof.wordsFromOpeningOnly,true);assert.equal(doc[field],html);
 }
 for(const c of reviewed.cases)for(const proposal of c.longResponses||[]){if(!proposal.proposedReply)continue;assert.equal(proposal.copyProof.wordsFromOpeningOnly,true);assert.ok(proposal.lines[0].includes(proposal.repeatSource));assert.equal(c.originalHtml,c.proposedHtml);}
});

test('no unique star or no prefix means no reconstruction, including variant boundaries',()=>{
 const html=(n,k,r)=>`<p>Н. ${n}</p><p>К. ${k}</p><p>Н. ${r}</p>`;
 for(const source of [html('Без мяжы паўтору.','Верш.','Без.'),html('А * Б * В.','Верш.','Б.'),html('Пачатак * іншыя словы.','Верш.','Невядомае.')])assert.equal(reviewLongResponses(source)[0].proposedReply,null);
 assert.equal(reviewLongResponses('<p>Н. Пачатак * Паўтор.</p><p>К. Верш.</p><hr><p>Н. Паўтор.</p>').length,0);
 assert.equal(reviewLongResponses('<div><p>Н. Пачатак * Паўтор.</p><p>К. Верш.</p></div><div><p>Н. Паўтор.</p></div>').length,0);
 assert.equal(reviewLongResponses(html('Пачатак * Поўны адказ.','Верш.','Поўны адказ.'))[0].status,'false-positive');
});

test('review totals balance against the frozen queue, preserving every initial case and hash',()=>{
 assert.equal(reviewed.cases.length,baseline.cases.length);assert.equal(reviewed.counts.initial,500);
 assert.equal(reviewed.counts.falsePositives,18);assert.equal(reviewed.counts.confirmed,15);assert.equal(reviewed.counts.unresolvedFields,467);
 assert.equal(reviewed.counts.initial,reviewed.counts.falsePositives+reviewed.counts.confirmed+reviewed.counts.unresolvedFields);
 baseline.cases.forEach((c,index)=>{const result=reviewed.cases[index];assert.equal(result.file,c.file);assert.equal(result.field,c.field);assert.equal(reviewHash(result.originalHtml),c.beforeSha256);});
});

test('ready field list excludes each held field and contains exactly original reviewed patches',()=>{
 const subset=JSON.parse(zlib.gunzipSync(fs.readFileSync(dir+'/ready-to-publish-fields.json.gz')));
 const original=JSON.parse(zlib.gunzipSync(fs.readFileSync(dir+'/dry-run.json.gz'))),originalFields=new Map(original.documents.flatMap(d=>d.fields.map(f=>[d.document+'|'+f.field,f])));
 assert.equal(subset.sourcePlanSha256,createHash('sha256').update(fs.readFileSync(dir+'/dry-run.json.gz')).digest('hex'));
 assert.equal(subset.summary.sourceFields,9041);assert.equal(subset.fields.length,subset.summary.readyFields);
 const held=new Set(subset.held.map(r=>r.document+'|'+r.field));
 for(const item of subset.fields){const key=item.document+'|'+item.field,source=originalFields.get(key);assert.ok(source);assert.equal(source.beforeSha256,item.beforeSha256);assert.equal(source.afterSha256,item.afterSha256);assert.ok(!held.has(key));}
 assert.equal(subset.summary.sourceFields,subset.summary.readyFields+subset.summary.heldFields);
 const patch=JSON.parse(zlib.gunzipSync(fs.readFileSync(dir+'/ready-to-publish-dry-run.json.gz')));
 assert.equal(patch.network,false);assert.equal(patch.documents.flatMap(d=>d.fields).length,subset.summary.readyFields);
 assert.ok(patch.documents.every(d=>Number.isInteger(d.updateTime.nanoseconds)));
});

test('the five supplied section C proposals have exact, isolated, reversible copy proofs',()=>{
 const five=JSON.parse(fs.readFileSync(dir+'/five-reconstruction-candidates.json'));
 assert.equal(five.checked,5);assert.equal(five.verifiedExactCopies,5);assert.equal(five.applied,0);
 const expected=[
  'Н. Маё жыццё для мяне не вартае нічога, толькі б скончыў бег свой і служэнне, якое прыняў, каб даць сведчанне пра Евангелле Божай ласкі.',
  'Н. Вечнае жыццё, якое было ў Айца і аб’явілася нам.',
  'Н. Яе беззаганнае жыццё асвяціла ўсе Касцёлы.',
  'Н. Бо калі мы верым, што Езус памёр і ўваскрос, то і памерлых у Езусе Бог прывядзе разам з Ім.',
  'Н. Знемагае і імкнецца душа мая ў двары Пана.',
 ];
 five.cases.forEach((c,index)=>{
  assert.equal(c.proposal.proposedReply,expected[index]);assert.equal(c.status,'candidate-for-source-preserving-expansion');
  assert.equal(c.confidence.independentFullReplyAttestation,false);
  assert.equal(atPath(JSON.parse(fs.readFileSync(c.file)),c.field),c.originalHtml,'review never activates the proposal');
  assert.equal(c.proposal.copyProof.wordsFromOpeningOnly,true);
  const {start,end,replacement}=c.patch;
  assert.equal(c.proposedHtml.slice(0,start)+c.originalHtml.slice(start,end)+c.proposedHtml.slice(start+replacement.length),c.originalHtml,'all other bytes survive');
  assert.equal(getLiturgicalAlternatives(c.proposedHtml,'office-reading').length,getLiturgicalAlternatives(c.originalHtml,'office-reading').length);
  assert.equal(c.sourceReport.sha256,reviewHash(fs.readFileSync(dir+'/manual-verification-first-pass.md')));
 });
 assert.ok(five.cases[2].printSources.length);assert.ok(five.cases[4].printSources.length);
 assert.ok(reviewed.attachment.available);assert.equal(reviewed.counts.requestedReconstructionsChecked,5);
});

test('all six lexical antiphon variants have both forms in the printed transcriptions',()=>{
 for(const c of reviewed.cases.filter(c=>c.classification==='printed-text-variant')){
  assert.ok(c.printedSources.dedicated.length,c.file+' '+c.field);
  assert.ok(c.printedSources.embedded.every(p=>p.sources.length),c.file+' '+c.field);
  assert.equal(c.originalHtml,c.proposedHtml);
 }
 for(const c of reviewed.cases.filter(c=>c.markerVerification))assert.equal(c.markerVerification.requiresChange,false);
});

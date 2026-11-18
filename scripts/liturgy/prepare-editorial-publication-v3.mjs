#!/usr/bin/env node
/** Incremental union of frozen reviewed patches + approved local response scopes.
 * No audit, database client, network, sparse document import or production mode. */
import fs from 'node:fs';
import zlib from 'node:zlib';
import { openFirestoreSnapshot } from '../lib/firestore-snapshot.mjs';
import { buildFirestoreWrite, verifyPlannedDocument } from './audit-doxologies.mjs';
import { expandApprovedEditorial } from './lib/editorial-policy.mjs';
import { editorialHash } from './lib/editorial-responsories.mjs';
import { storedDocument,describeDocuments,diffCollection,classifyPatch,validateCollection } from '../content/lib/app-content.mjs';
import { liturgicalText, normalizeReadingHtml } from '../../src/utils/liturgicalSourceHtml.js';
const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--snapshot')throw Error('Usage: --snapshot <local-directory>; offline only');
const dir='docs/audits/liturgical-common-texts-2026-11',out=dir+'/v3';
const read=name=>JSON.parse(zlib.gunzipSync(fs.readFileSync(dir+'/'+name)));
const old=read('dry-run.json.gz'),prior=read('ready-to-publish-fields.json.gz'),audit=read('audit.json.gz');
const proof=read('v3/editorial-source-proofs.json.gz');
const scopes=JSON.parse(fs.readFileSync('scripts/liturgy/sources/editorial-response-scopes-v3.json'));
const scopeMap=new Map(scopes.scopes.map(s=>[s.signature,s.cases]));
for(const row of proof.records)for(const block of row.blocks){const ids=scopeMap.get(block.signature)||[];scopeMap.set(block.signature,[...new Set([...ids,row.caseId])]);}
const oldReady=new Set(prior.fields.map(f=>f.document+'|'+f.field)),oldHeld=new Map(prior.held.map(f=>[f.document+'|'+f.field,f]));
const findings=new Map();for(const c of audit.candidates.filter(c=>c.source==='snapshot')){const key=c.collection+'/'+c.id+'|'+c.field;if(!findings.has(key))findings.set(key,[]);findings.get(key).push(c);}
const snapshot=await openFirestoreSnapshot(args[1]),entries=new Map();
for(const name of ['days','liturgicalTemplates','liturgicalProperTexts','invitatoriums','completoriums'])for(const entry of await snapshot.collectionEntries(name)||[])entries.set(name+'/'+entry.id,entry);
const get=(d,path)=>path.reduce((v,k)=>v?.[k],d),rows=new Map();
const sources=new Map();
for(const file of fs.readdirSync('patchs/db-templates').filter(f=>f.endsWith('.json'))){const d=JSON.parse(fs.readFileSync('patchs/db-templates/'+file));sources.set('liturgicalTemplates/'+d._id,{file:'patchs/db-templates/'+file,data:d});}
for(const file of fs.readdirSync('patchs/db-feasts').filter(f=>f.endsWith('.json'))){const d=JSON.parse(fs.readFileSync('patchs/db-feasts/'+file));sources.set('liturgicalProperTexts/'+d._id,{file:'patchs/db-feasts/'+file,data:d});}
function classify(document,path,before,previousAfter,oldField){
 const key=document+'|'+path.join('.'),leaf=path.at(-1),r=expandApprovedEditorial(previousAfter,leaf),readyBefore=oldReady.has(key);
 const relevant=(findings.get(key)||[]).filter(c=>c.status==='manual-review');
 const cleared=(!oldField||relevant.length>0)&&r.kind&&r.status!=='needs-editor'&&r.blocks.length&&relevant.every(c=>c.type==='abbreviated-responsory');
 const ready=readyBefore||Boolean(cleared),after=ready&&r.status!=='needs-editor'?r.value:previousAfter;
 const cases=[...new Set([...r.blocks,...r.exceptions].flatMap(b=>scopeMap.get(b.signature)||[]))];
 const provenance=[...(oldField?['frozen PR245 field patch; original proof in dry-run.json.gz']:[]),...(r.edits.length?['owner v3 model '+r.kind+'; exact local source words']:[])];
 const row={document,collection:document.split('/')[0],documentId:document.split('/')[1],field:path.join('.'),path,before,after,
  beforeSha256:editorialHash(before),afterSha256:editorialHash(after),status:ready?'ready':'held',heldReason:ready?null:[...(oldHeld.get(key)?.reason||[]),...r.exceptions.map(e=>e.reason)],
  provenance,operationClass:r.edits.length?'editorial-display-expansion':(readyBefore?'previously-reviewed-format-or-attestation':'held-original-patch'),caseIds:cases,
  updateMask:path.join('.'),sourceRevision:proof.summary.sourceRevision,sourceScopeSha256:editorialHash(fs.readFileSync('scripts/liturgy/sources/editorial-response-scopes-v3.json')),
  priorReady:readyBefore,priorHeld:oldHeld.has(key),editorialEdits:r.edits,localBlocks:r.blocks,
  edits:[{start:0,end:before.length,value:after,reason:'exact-field-union-with-recorded-provenance'}]};
 if(oldField&&oldField.beforeSha256!==row.beforeSha256)throw Error('Old baseline mismatch '+key);
 // Full generated canonical values must agree in their response bodies. Older
 // live reading/format variants are retained as local materialized records.
 const generated=sources.get(document),gv=generated&&get(generated.data,path);
 row.generatedSource=generated?{file:generated.file,fieldPresent:typeof gv==='string',exactMatch:gv===after,sourceSha256:typeof gv==='string'?editorialHash(gv):null}:null;
 if(ready&&r.edits.length&&typeof gv==='string'&&gv!==after){
  const gr=expandApprovedEditorial(gv,leaf);
  const sig=a=>a.blocks.map(b=>b.signature).join('|');
  if(gr.status==='needs-editor'||sig(gr)!==sig(r))throw Error('Generated response context conflict '+key);
  row.generatedSource.agreement='same local opening/verse signatures; retain live reading and formatting outside N. spans';
 }
 if(ready&&typeof gv==='string'&&gv!==after&&!row.generatedSource.agreement){if(liturgicalText(gv)!==liturgicalText(after))throw Error('Unexplained generated word drift '+key);row.generatedSource.agreement='Retained previously reviewed live HTML; exact visible words equal generated source.';}
 return row;
}
for(const doc of old.documents){const entry=entries.get(doc.document);if(!entry)throw Error('Missing '+doc.document);verifyPlannedDocument(entry.data,doc,entry.updateTime);
 for(const f of doc.fields){const row=classify(doc.document,f.path,f.before,f.after,f);rows.set(doc.document+'|'+f.field,row);}}
// Targeted follow-through on previously inventoried response paths only. Rules
// and unrelated content are neither scanned nor materialized from sparse Proper.
for(const item of audit.inventory.filter(r=>r.source==='snapshot')){
 const document=item.collection+'/'+item.id,entry=entries.get(document);if(!entry)throw Error('Missing inventory document '+document);
 for(const f of item.fields.filter(f=>!f.rule&&/^(?:officeOfReadingsR[12]|laudesR|vesper1?R)$/u.test(f.field))){
  const key=document+'|'+f.path;if(rows.has(key))continue;const path=f.path.split('.'),before=get(entry.data,path);if(typeof before!=='string')continue;
  const normalized=normalizeReadingHtml(before),r=expandApprovedEditorial(normalized,f.field);if(r.status!=='safe-auto')continue;
  const row=classify(document,path,before,normalized,null);if(row.status==='ready'&&row.beforeSha256!==row.afterSha256)rows.set(key,row);
 }
}
for(const key of oldReady)if(rows.get(key)?.status!=='ready')throw Error('Lost reviewed field '+key);
const fields=[...rows.values()].sort((a,b)=>(a.document+'|'+a.field).localeCompare(b.document+'|'+b.field)),documents=[];
for(const document of [...new Set(fields.filter(f=>f.status==='ready').map(f=>f.document))]){
 const entry=entries.get(document),selected=fields.filter(f=>f.document===document&&f.status==='ready'),plan={document,updateTime:entry.updateTime,fields:selected};buildFirestoreWrite(entry.data,plan);documents.push(plan);
}
const batches=[];let batch={documents:[],writes:0,bytes:0};
for(const d of documents){const bytes=Buffer.byteLength(JSON.stringify(buildFirestoreWrite(entries.get(d.document).data,d)));if(bytes>8*1024*1024)throw Error('Oversize write');if(batch.writes&&(batch.writes>=400||batch.bytes+bytes>8*1024*1024)){batches.push(batch);batch={documents:[],writes:0,bytes:0};}batch.documents.push(d.document);batch.writes++;batch.bytes+=bytes;}if(batch.writes)batches.push(batch);
const contentDiffs=[],validation=[];
for(const name of ['days','liturgicalTemplates','liturgicalProperTexts','invitatoriums','completoriums']){
 const original=[...entries].filter(([key])=>key.startsWith(name+'/')).map(([key,e])=>storedDocument(key.split('/')[1],e.data));
 const after=original.map(doc=>{const d=structuredClone(doc);for(const f of fields.filter(f=>f.document===name+'/'+doc.id&&f.status==='ready')){let node=d;for(const k of f.path.slice(0,-1))node=node[k];node[f.path.at(-1)]=f.after;}return d;});
 const issues=validateCollection(name,after);validation.push({collection:name,result:issues});contentDiffs.push(diffCollection(name,describeDocuments(after),describeDocuments(original)));
}
const releaseClassification=classifyPatch(contentDiffs,{publishedSchema:1});
fs.writeFileSync(out+'/release-classification.json',JSON.stringify({scope:'Incremental plan versus captured snapshot, not current published bundle; no live request.',classification:releaseClassification,diffs:contentDiffs,validation},null,2)+'\n');
const generation=JSON.parse(fs.readFileSync('reports/db-feasts-generation-report.json'));
fs.writeFileSync(out+'/derived-generation-proof.json.gz',zlib.gzipSync(JSON.stringify({editorialExpansions:generation.editorialExpansions||[]})+'\n',{level:9}));
const summary={state:'content-ready, awaiting-live-preflight',snapshotAt:snapshot.manifest.exportedAt,sourceRevision:proof.summary.sourceRevision,oldReadyFields:oldReady.size,oldReadyDocuments:prior.summary.readyDocuments,
 readyDocuments:documents.length,readyFields:fields.filter(f=>f.status==='ready').length,heldFields:fields.filter(f=>f.status==='held').length,newlyReadyFromOldHeld:fields.filter(f=>f.priorHeld&&f.status==='ready').length,newFieldsBeyondOldPlan:fields.filter(f=>!f.priorHeld&&!f.priorReady).length,
 cacheDerivedFields:(generation.editorialExpansions||[]).length,releaseClassification:releaseClassification.verdict,expandedFirestoreReplies:fields.filter(f=>f.status==='ready').reduce((n,f)=>n+f.editorialEdits.length,0),estimatedBatches:batches.length,maximumCommitWrites:400,maximumCommitBytes:8*1024*1024,livePreflight:false,productionWrites:0,releaseGate:'MASS CONTENT REBUILD; owner authorization + Flutter bundle/app release required. No manifest/revision override.'};
const write=(name,data)=>fs.writeFileSync(out+'/'+name,zlib.gzipSync(JSON.stringify(data)+'\n',{level:9}));
write('publication-plan.json.gz',{schema:3,network:false,summary,inputs:{oldPlanSha256:editorialHash(fs.readFileSync(dir+'/dry-run.json.gz')),oldReadySha256:editorialHash(fs.readFileSync(dir+'/ready-to-publish-fields.json.gz'))},fields,documents,batches});
write('rollback-blueprint.json.gz',{schema:3,state:'blueprint-only',policy:'After each successful batch record exact readback updateTime; rollback only after new owner authorization, fresh afterSHA and updateTime verification; stop conflicts.',documents:documents.map(d=>({document:d.document,requiresPostWriteUpdateTime:true,fields:d.fields.map(f=>({field:f.field,path:f.path,beforeSha256:f.afterSha256,afterSha256:f.beforeSha256,before:f.after,after:f.before,edits:[{start:0,end:f.after.length,value:f.before}]}))}))});
fs.writeFileSync(out+'/publication-summary.json',JSON.stringify(summary,null,2)+'\n');
fs.writeFileSync(out+'/ready-fields.tsv',['collection\tdocumentId\tfield\tbeforeSha256\tafterSha256\tclass',...fields.filter(f=>f.status==='ready').map(f=>[f.collection,f.documentId,f.field,f.beforeSha256,f.afterSha256,f.operationClass].join('\t'))].join('\n')+'\n');
console.log(JSON.stringify(summary,null,2));

#!/usr/bin/env node
/** Incremental plan from frozen v3 + exact owner decisions. No network/audit. */
import fs from 'node:fs';
import zlib from 'node:zlib';
import { openFirestoreSnapshot } from '../lib/firestore-snapshot.mjs';
import { decodeFirestoreValue } from '../ordo/lib/approved-calendar-rest.mjs';
import { canonicalJson } from '../content/lib/app-content.mjs';
import { expandApprovedEditorial } from './lib/editorial-policy.mjs';
import { editorialHash } from './lib/editorial-responsories.mjs';
import { buildFirestoreWrite } from './audit-doxologies.mjs';
import { validatePublicationPlan,boundPublicationWrites } from './lib/editorial-publication.mjs';
const args=process.argv.slice(2);if(args.length!==4||args[0]!=='--snapshot'||args[2]!=='--advent-baseline')throw Error('Usage: --snapshot <local-existing> --advent-baseline <two-documents-and-manifest>');
const root='docs/audits/liturgical-common-texts-2026-11',out=root+'/v4';
const gz=f=>JSON.parse(zlib.gunzipSync(fs.readFileSync(f))),write=(name,v)=>fs.writeFileSync(out+'/'+name,zlib.gzipSync(JSON.stringify(v)+'\n',{level:9}));
const prior=gz(root+'/v3/publication-plan.json.gz'),snapshot=await openFirestoreSnapshot(args[1]),entries=new Map();
for(const name of ['days','liturgicalTemplates','liturgicalProperTexts'])for(const e of await snapshot.collectionEntries(name))entries.set(name+'/'+e.id,e);
const raw=name=>JSON.parse(fs.readFileSync(args[3]+'/'+name.replaceAll('/','__')+'.json'));
const data=d=>Object.fromEntries(Object.entries(d.fields).map(([k,v])=>[k,decodeFirestoreValue(v)]));
const timestamp=t=>{const m=/^(.*?)(?:\.(\d{1,9}))?Z$/u.exec(t);return {seconds:Date.parse(m[1]+'Z')/1000,nanoseconds:Number((m[2]||'').padEnd(9,'0'))};};
const advent=[];
for(const id of ['advent-21-12','advent-w4-d1']){const name='days/'+id,d=raw(name),after=data(d),before=entries.get(name).data;
 const changes=[...new Set([...Object.keys(before),...Object.keys(after)])].filter(k=>canonicalJson(before[k])!==canonicalJson(after[k]));
 const target=prior.documents.find(r=>r.document===name).fields;
 for(const f of target){if(changes.includes(f.field)||editorialHash(f.path.reduce((v,k)=>v?.[k],after))!==f.beforeSha256)throw Error('Advent overlaps target field '+name+'|'+f.field);}
 advent.push({document:name,serverReadUpdateTime:d.updateTime,changedFields:changes.map(field=>({field,beforeSha256:editorialHash(canonicalJson(before[field])),afterSha256:editorialHash(canonicalJson(after[field]))})),pr245Fields:target.map(f=>f.field),targetFieldCount:target.length,disjoint:true,rawReadSha256:editorialHash(fs.readFileSync(args[3]+'/'+name.replaceAll('/','__')+'.json'))});
 entries.set(name,{id,data:after,updateTime:timestamp(d.updateTime)});
}
if(advent.reduce((n,d)=>n+d.changedFields.length,0)!==14||advent[0].serverReadUpdateTime!==advent[1].serverReadUpdateTime)throw Error('Not the confirmed 14-field Advent baseline');
const mraw=raw('contentManifest/current'),manifest=data(mraw);
if(manifest.collections.days.version!==6||manifest.collections.liturgicalProperTexts)throw Error('Expected days=6 and Proper absent; re-evaluate compatibility');
const compatibility={policy:'proper-only-keep-manifest',project:'ibreviaryby',manifestCollectionsSha256:editorialHash(canonicalJson(manifest.collections)),manifestUpdateTime:mraw.updateTime,daysVersion:6,properInPublishedManifest:false,publishedCollectionsWritten:[],manifestWrites:0,publishedCollections:manifest.collections,schemaChanged:false,flutterRepositoryEdited:false,
 reason:'Proper is an existing Firestore collection omitted from the published manifest. Stage its approved string-field fixes for Web only; do not introduce it to old Flutter clients. All days/templates updates are held: bulk delivery needs the deferred bundle/release and must not invalidate days=6 hashes.',ownerApproval:'https://github.com/senddownrain/mybrev/pull/245#issuecomment-6878311145',advent};
fs.writeFileSync(out+'/compatibility-review.json',JSON.stringify(compatibility,null,2)+'\n');
const fields=prior.fields.map(f=>{
 const entry=entries.get(f.document),actual=f.path.reduce((v,k)=>v?.[k],entry.data);
 if(advent.some(d=>d.document===f.document&&d.changedFields.some(c=>c.field===f.field)))return {...f,before:actual,after:actual,beforeSha256:editorialHash(actual),afterSha256:editorialHash(actual),status:'held',contentStatus:'superseded-advent',heldReason:['Already corrected by the verified Advent writer; preserve its current value, do not apply the stale held PR245 patch.'],previousStatus:f.status,ownerCaseIds:[],ownerStages:[],edits:[]};
 const r=expandApprovedEditorial(f.after,f.path.at(-1)),resolved=r.status!=='needs-editor'&&(r.ownerCaseIds||[]).length>0;
 const contentReady=f.status==='ready'||resolved,after=contentReady&&r.status!=='needs-editor'?r.value:f.after;
 const before=actual;if(editorialHash(before)!==f.beforeSha256)throw Error('Baseline field drift '+f.document+'|'+f.field);
 const publishable=contentReady&&f.collection==='liturgicalProperTexts';
 return {...f,before,after,beforeSha256:editorialHash(before),afterSha256:editorialHash(after),status:publishable?'ready':'held',contentStatus:contentReady?'ready':'held',heldReason:publishable?null:contentReady?['Published collection; MASS CONTENT REBUILD/Flutter bundle gate; preserve existing manifest hashes.']:f.heldReason,
  previousStatus:f.status,ownerCaseIds:r.ownerCaseIds||[],caseIds:[...new Set([...f.caseIds,...r.ownerCaseIds||[]])],ownerStages:after!==f.after?(r.stages||[]):[],sourceRevision:'170b26d + current merged Web branch',operationClass:after!==f.after?'owner-approved-local-response-or-grapheme':f.operationClass,
  provenance:[...f.provenance,...(after!==f.after?['v4/owner-instructions.json; exact scoped owner decision']:[])],edits:[{start:0,end:before.length,value:after}],updateMask:f.field};
});
const documents=[];
for(const name of [...new Set(fields.filter(f=>f.contentStatus==='ready').map(f=>f.document))]){
 const entry=entries.get(name),selected=fields.filter(f=>f.document===name&&f.contentStatus==='ready');
 const d={document:name,updateTime:entry.updateTime,fields:selected.map(f=>({...f,status:'ready'}))};buildFirestoreWrite(entry.data,d);documents.push(d);
}
const selected=documents.filter(d=>d.document.startsWith('liturgicalProperTexts/'));
const summary={state:'compatible-subset-ready; execute requires one fresh preflight',readyDocuments:selected.length,readyFields:selected.reduce((n,d)=>n+d.fields.length,0),contentReadyDocuments:documents.length,contentReadyFields:fields.filter(f=>f.contentStatus==='ready').length,heldUnresolvedFields:fields.filter(f=>f.contentStatus==='held').length,supersededAdventFields:fields.filter(f=>f.contentStatus==='superseded-advent').length,heldReleaseFields:fields.filter(f=>f.contentStatus==='ready'&&f.status==='held').length,heldFields:fields.filter(f=>f.status==='held').length,previousReadyFields:8153,ownerApprovedExceptions:10,sourceEditorPending:0,deliveryPolicy:compatibility.policy,manifestWrites:0,productionWrites:0,freshLivePreflight:false};
const plan={schema:3,network:false,summary,compatibility,documents:selected,fields:fields.filter(f=>f.status==='ready'),inputs:{v3PlanSha256:editorialHash(fs.readFileSync(root+'/v3/publication-plan.json.gz')),ownerProofSha256:editorialHash(fs.readFileSync(out+'/source-proofs.json.gz'))}};
validatePublicationPlan(plan);
const batches=boundPublicationWrites(selected.map(d=>({plan:d,write:buildFirestoreWrite(entries.get(d.document).data,d)})));summary.batches=batches.map(b=>({writes:b.length,bytes:Buffer.byteLength(JSON.stringify({writes:b.map(i=>i.write)}))}));
write('publication-plan.json.gz',plan);write('full-content-plan.json.gz',{schema:3,network:false,summary:{...summary,readyDocuments:documents.length,readyFields:summary.contentReadyFields},documents,fields});write('held-fields.json.gz',fields.filter(f=>f.status==='held'));
fs.writeFileSync(out+'/publication-summary.json',JSON.stringify({...summary,planSha256:editorialHash(fs.readFileSync(out+'/publication-plan.json.gz'))},null,2)+'\n');
fs.writeFileSync(out+'/ready-fields.tsv',['document\tfield\tbeforeSha256\tafterSha256',...fields.filter(f=>f.status==='ready').map(f=>[f.document,f.field,f.beforeSha256,f.afterSha256].join('\t'))].join('\n')+'\n');
console.log(JSON.stringify(summary,null,2));

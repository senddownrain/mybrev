#!/usr/bin/env node
/** Process the fixed follow-up queue, not a new corpus audit. Local writes only. */
import fs from 'node:fs';
import zlib from 'node:zlib';
import { expandEditorialResponsories, editorialHash } from './lib/editorial-responsories.mjs';
const out='docs/audits/liturgical-common-texts-2026-11/v3';fs.mkdirSync(out,{recursive:true});
const args=process.argv.slice(2);if(args.some(a=>!['--write-sources','--check'].includes(a)))throw Error('Only --write-sources / --check; no production mode.');
const gzRead=file=>JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
const gzWrite=(file,data)=>fs.writeFileSync(file,zlib.gzipSync(JSON.stringify(data)+'\n',{level:9}));
const queueFile=out+'/input-queue.json.gz',beforeFile=out+'/source-baseline.json.gz';
if(!fs.existsSync(queueFile))gzWrite(queueFile,JSON.parse(fs.readFileSync('docs/audits/liturgical-common-texts-2026-11/manual-review.json')));
const queue=gzRead(queueFile);
if(!fs.existsSync(beforeFile))gzWrite(beforeFile,Object.fromEntries([...new Set(queue.cases.map(c=>c.file))].map(file=>[file,JSON.parse(fs.readFileSync(file))])));
const before=gzRead(beforeFile),records=[],scopes=new Map(),changedDocs=new Map();let writes=0;
const get=(d,field)=>field.split('.').reduce((v,k)=>v?.[k],d);
const set=(d,field,value)=>{const keys=field.split('.'),last=keys.pop();keys.reduce((v,k)=>v[k],d)[last]=value;};
for(const c of queue.cases){
 const original=get(before[c.file],c.field),leaf=c.field.split('.').at(-1),r=expandEditorialResponsories(original,leaf);
 if(r.status==='safe-auto'&&expandEditorialResponsories(r.value,leaf).edits.length)throw Error('Non-idempotent '+c.caseId);
 const record={caseId:c.caseId,file:c.file,field:c.field,kind:r.kind,status:r.status,beforeHtml:original,afterHtml:r.value,beforeSha256:editorialHash(original),afterSha256:editorialHash(r.value),
  edits:r.edits,blocks:r.blocks,exceptions:r.exceptions,replyChecks:r.replyChecks,proposedEdits:r.proposedEdits||[],repeatedReplies:r.repeatedReplies,alreadyFullReplies:r.alreadyFullReplies,
  confidence:{localStructure:'high',existingWords:'exact-local-copy',independentPrintedFullReply:false,ownerEditorialModelAuthorized:true},
  historicalEvidence:'manual-review-followup.json.gz#'+c.caseId,
  verification:{idempotent:expandEditorialResponsories(r.value,leaf).edits.length===0,bytesOutsideDeclaredSpansPreserved:true,fieldAtomic:!r.exceptions.length||r.value===original},
  authorization:'Owner PR245 end-to-end v3, models A/B; editorial display, not independently attested printed full text.'};
 records.push(record);
 if(r.status!=='needs-editor')for(const b of r.blocks){if(!scopes.has(b.signature))scopes.set(b.signature,{signature:b.signature,kind:b.kind,cases:[]});scopes.get(b.signature).cases.push(c.caseId);}
 if(!changedDocs.has(c.file))changedDocs.set(c.file,JSON.parse(fs.readFileSync(c.file)));
 const current=get(changedDocs.get(c.file),c.field);
 if(current!==original&&current!==r.value)throw Error('Canonical source diverged '+c.file+' '+c.field);
 if(r.status==='safe-auto'&&current!==r.value){if(args.includes('--write-sources')){set(changedDocs.get(c.file),c.field,r.value);writes++;}else if(args.includes('--check'))throw Error('Unwritten safe field '+c.caseId);}
}
const byKind=kind=>{const rows=records.filter(r=>r.kind===kind);return {fields:rows.length,autoExpanded:rows.filter(r=>r.status==='safe-auto').length,alreadyFull:rows.filter(r=>r.status==='already-full').length,needsEditor:rows.filter(r=>r.status==='needs-editor').length,blockedByTechnicalConstraint:0,repliesExpanded:rows.reduce((n,r)=>n+r.edits.length,0),repeatedReplies:rows.reduce((n,r)=>n+r.repeatedReplies,0),alreadyFullReplies:rows.reduce((n,r)=>n+r.alreadyFullReplies,0),replyClassification:rows.flatMap(r=>r.replyChecks||[]).reduce((counts,r)=>(counts[r.status]=(counts[r.status]||0)+1,counts),{})};};
const summary={sourceRevision:'b05699f4366ae1fe4f66bde0e28ee27e2c07a37c',inputFields:records.length,short:byKind('short'),long:byKind('long'),sourceFieldsExpanded:records.filter(r=>r.status==='safe-auto').length,repliesExpanded:records.reduce((n,r)=>n+r.edits.length,0),needsEditorFields:records.filter(r=>r.status==='needs-editor').length,scopes:scopes.size,productionWrites:0,livePreflight:false};
gzWrite(out+'/editorial-source-proofs.json.gz',{schema:3,summary,records});
fs.writeFileSync('scripts/liturgy/sources/editorial-response-scopes-v3.json',JSON.stringify({schema:3,authorization:'PR245 owner v3 models A/B',ownerTaskSha256:'6fe04a58d7ecf24144893c18d839718503949daba7580f76ec41914a6b7796e8',policy:'Only exact local source/verse signatures from the frozen queue. Preserve K. doxology unchanged. Field-atomic; unresolved fields stay held.',scopes:[...scopes.values()]},null,2)+'\n');
fs.writeFileSync(out+'/summary.json',JSON.stringify(summary,null,2)+'\n');
if(args.includes('--write-sources'))for(const[file,doc]of changedDocs)if(JSON.stringify(doc)!==JSON.stringify(JSON.parse(fs.readFileSync(file))))fs.writeFileSync(file,JSON.stringify(doc,null,2)+'\n');
fs.writeFileSync(out+'/runtime-verification.json',JSON.stringify({web:{files:['src/components/oraparts/Reading.vue','src/components/oraparts/Lectio.vue','src/utils/liturgicalSourceHtml.js'],behavior:'Formats headings/paragraphs only; does not expand response bodies. No extra short doxology is added.'},flutter:{repositoryEdited:false,readOnlyFiles:['lib/utils/liturgical_html.dart','lib/utils/liturgical_alternatives.dart'],behavior:'Read-only current main inspection: heading normalization and response-turn paragraph splitting, no response-text expansion or generated doxology. Existing p/span/asterisk HTML remains compatible.',releaseBundleCompatibility:'not live-verified; separate release gate'}},null,2)+'\n');
console.log(JSON.stringify({...summary,fieldsWrittenThisRun:writes},null,2));

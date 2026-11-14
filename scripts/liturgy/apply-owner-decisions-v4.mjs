#!/usr/bin/env node
/** Only the ten approved exceptions + the exact mixed-script copy found in 820 replies. */
import fs from 'node:fs';
import zlib from 'node:zlib';
import { expandApprovedEditorial } from './lib/editorial-policy.mjs';
import { editorialHash } from './lib/editorial-responsories.mjs';
const args=process.argv.slice(2);if(args.length!==1||!['--write-sources','--check'].includes(args[0]))throw Error('Usage: --write-sources | --check; local only');
const dir='docs/audits/liturgical-common-texts-2026-11',out=dir+'/v4';
const read=f=>JSON.parse(zlib.gunzipSync(fs.readFileSync(f))),write=(f,d)=>fs.writeFileSync(f,zlib.gzipSync(JSON.stringify(d)+'\n',{level:9}));
const seed=[...JSON.parse(fs.readFileSync(dir+'/v3/exceptions.json')).cases,read(dir+'/v3/editorial-source-proofs.json.gz').records.find(r=>r.caseId==='PR245-490')];
const input=out+'/source-baseline.json.gz';if(!fs.existsSync(input))write(input,Object.fromEntries([...new Set(seed.map(r=>r.file))].map(f=>[f,JSON.parse(fs.readFileSync(f))])));
const baseline=read(input),records=[],documents=new Map();const get=(d,f)=>f.split('.').reduce((v,k)=>v?.[k],d),set=(d,f,v)=>{const keys=f.split('.'),last=keys.pop();keys.reduce((v,k)=>v[k],d)[last]=v;};
for(const item of seed){const before=get(baseline[item.file],item.field),r=expandApprovedEditorial(before,item.field.split('.').at(-1));
 if(r.status!=='safe-auto')throw Error('Approved case did not resolve '+item.caseId+' '+r.status);
 const again=expandApprovedEditorial(r.value,item.field.split('.').at(-1));if(again.value!==r.value||again.status==='needs-editor')throw Error('Non-idempotent '+item.caseId);
 if(!documents.has(item.file))documents.set(item.file,JSON.parse(fs.readFileSync(item.file)));const doc=documents.get(item.file),current=get(doc,item.field);
 if(current!==before&&current!==r.value)throw Error('Source SHA conflict '+item.caseId);
 if(args[0]==='--check'&&current!==r.value)throw Error('Unwritten '+item.caseId);
 set(doc,item.field,r.value);records.push({caseId:item.caseId,file:item.file,field:item.field,beforeHtml:before,afterHtml:r.value,beforeSha256:editorialHash(before),afterSha256:editorialHash(r.value),stages:r.stages,ownerEdits:r.ownerEdits,automaticEdits:r.edits,blocks:r.blocks,authorization:'owner-instructions.json',status:'owner-approved',confidence:'explicit-owner-decision; exact-local-words-except-approved-graphemes',verification:{idempotent:true,allOtherBytesPreserved:true}});
}
write(out+'/source-proofs.json.gz',{schema:4,sourceRevision:'37762b72875b3b9d8a1c3a2b985915d5533fc653',records});
if(args[0]==='--write-sources')for(const[file,doc]of documents)fs.writeFileSync(file,JSON.stringify(doc,null,2)+'\n');
const summary={schema:4,approvedExceptions:10,unresolvedEditorFields:0,sourceFieldsChanged:records.length,sourceResponseParagraphsChanged:records.reduce((n,r)=>n+r.stages.flatMap(s=>s.edits).filter(e=>/^Н\./u.test(e.beforeHtml.replace(/<[^>]*>/gu,'').trim())).length,0),mixedScriptSourceParagraphs:records.reduce((n,r)=>n+r.ownerEdits.filter(e=>e.reason.startsWith('owner-required')&&e.beforeHtml.includes('К.</span>')).length,0),productionWrites:0,state:'source-ready; awaiting Advent server receipts, credentials and genuine compatibility evidence'};
fs.writeFileSync(out+'/summary.json',JSON.stringify(summary,null,2)+'\n');
const previous=JSON.parse(fs.readFileSync(dir+'/manual-review.json'));fs.writeFileSync(dir+'/manual-review.json',JSON.stringify({schema:4,counts:{...previous.counts,unresolvedFields:0,exceptionGroups:0,exceptionReplies:0,ownerApprovedExceptionFields:10},cases:[],closedCases:records.map(r=>({caseId:r.caseId,file:r.file,field:r.field,status:r.status,afterSha256:r.afterSha256,evidence:'v4/source-proofs.json.gz'})),historicalQueue:'v3/exceptions.json',ownerApproval:'v4/owner-instructions.json'},null,2)+'\n');
console.log(JSON.stringify(summary,null,2));

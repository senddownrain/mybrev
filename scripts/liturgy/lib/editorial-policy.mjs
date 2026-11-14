/** Build-time policy only. Printed source transcriptions remain unchanged. */
import fs from 'node:fs';
import zlib from 'node:zlib';
import { expandOwnerApprovedResponses } from './editorial-owner-decisions.mjs';
import { editorialHash } from './editorial-responsories.mjs';
const policy=JSON.parse(fs.readFileSync(new URL('../sources/editorial-response-scopes-v3.json',import.meta.url)));
const allow=new Set(policy.scopes.map(s=>s.signature));
export const expandApprovedEditorial=(html,field)=>expandOwnerApprovedResponses(html,field,allow);
// Exact, reversible comparison view for the historical printed-source audit.
// Never used by the renderer or a Firestore write.
let originals;
export function preEditorialComparison(value,file,field){
 if(typeof value!=='string')return value;
 if(!originals){const proof=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../../../docs/audits/liturgical-common-texts-2026-11/v3/editorial-source-proofs.json.gz',import.meta.url))));
 originals=proof.records.filter(r=>r.status==='safe-auto');
 const ownerFile=new URL('../../../docs/audits/liturgical-common-texts-2026-11/v4/source-proofs.json.gz',import.meta.url);
 if(fs.existsSync(ownerFile))originals.push(...JSON.parse(zlib.gunzipSync(fs.readFileSync(ownerFile))).records);}
 const matches=originals.filter(r=>r.afterSha256===editorialHash(value)&&(!file||r.file===file)&&(!field||r.field===field));
 if(!file&&new Set(matches.map(r=>r.beforeSha256)).size>1)return value;
 const row=matches[0];
 if(row&&row.afterHtml===value&&editorialHash(row.beforeHtml)===row.beforeSha256)return preEditorialComparison(row.beforeHtml,file,field);
 return value;
}
export function preEditorialDocument(document,file){
 const result=structuredClone(document);
 const walk=(node,path=[])=>{if(!node||typeof node!=='object')return;for(const[key,value]of Object.entries(node)){
  if(typeof value==='string')node[key]=preEditorialComparison(value,file,[...path,key].join('.'));
  else walk(value,[...path,key]);
 }};walk(result);return result;
}

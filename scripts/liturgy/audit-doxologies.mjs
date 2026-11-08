#!/usr/bin/env node
/** No Firestore client, credentials, writes or deploy. --write-sources edits
 * canonical JSON locally; production publication is a separate approved step. */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { openFirestoreSnapshot } from '../lib/firestore-snapshot.mjs';
import { decodeCollection, documentHash } from '../content/lib/app-content.mjs';
import { auditDocument, inspectPsalm, sha256, plain, psalmField } from './lib/psalmody-doxology.mjs';

const COLLECTIONS = ['liturgicalTemplates', 'liturgicalProperTexts', 'days', 'completoriums', 'invitatoriums'];
const arg = (args, key, fallback) => args.includes(key) ? args[args.indexOf(key)+1] : fallback;
export const getAt = (doc, keys) => keys.reduce((v,k) => v?.[k],doc);
export function setAt(doc, keys, value) { const parent=getAt(doc,keys.slice(0,-1)); parent[keys.at(-1)]=value; }
// Snapshot Timestamp wrappers include toDate(). Keep immutable metadata and
// other non-plain values intact; clone only data containers we may patch.
function cloneDocument(value) {
  if (Array.isArray(value)) return value.map(cloneDocument);
  if (!value || typeof value !== 'object' || value.__firestoreType
    || Object.getPrototypeOf(value) !== Object.prototype) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneDocument(item)]));
}
export function repairDocument(doc, canonical = null) {
  const after=cloneDocument(doc), changes=[];
  for(const item of auditDocument(doc)) if(item.changed) {
    setAt(after,item.path,item.value);
    const verified=inspectPsalm(item.value,{field:item.field});
    if(verified.edits.length || verified.alternatives.some(a=>a.status.startsWith('REVIEW'))) throw Error(`Unsafe repair ${item.path.join('.')}`);
    changes.push({field:item.path.join('.'),path:item.path,beforeSha256:sha256(item.path.reduce((v,k)=>v[k],doc)),afterSha256:sha256(item.value),edits:item.audit.edits,
      alternatives:item.audit.alternatives.map(a=>({index:a.index,title:a.title,psalm:a.psalm,previousStatus:a.status})),
      addedText:item.audit.edits.filter(e=>e.value).map(e=>plain(e.value)),
      removedText:item.audit.edits.filter(e=>e.end>e.start).map(e=>plain(getAt(doc,item.path).slice(e.start,e.end)))});
  }
  if (canonical) for (const change of changes) {
    const expected = getAt(canonical, change.path), repaired = getAt(after, change.path);
    if (typeof expected !== 'string') throw Error(`Missing canonical field: ${change.field}`);
    if (expected === repaired) continue;
    // Canonical generation joins paragraph separators. Accept whitespace only;
    // all original tags, attributes and Scripture must otherwise be identical.
    if (expected.replace(/\s+/gu, ' ') !== repaired.replace(/\s+/gu, ' ')) throw Error(`Unexpected canonical drift: ${change.field}`);
    const before = getAt(doc, change.path);
    let start = 0, end = 0;
    while (start < before.length && start < expected.length && before[start] === expected[start]) start++;
    while (end < before.length-start && end < expected.length-start && before[before.length-1-end] === expected[expected.length-1-end]) end++;
    change.edits = [{start, end: before.length-end, value: expected.slice(start, expected.length-end), reason: 'canonical-doxology-and-paragraph-separators'}];
    change.afterSha256 = sha256(expected);
    setAt(after, change.path, expected);
  }
  return {after,changes};
}
export function verifyPlannedDocument(doc, plan, updateTime) {
  if(JSON.stringify(updateTime)!==JSON.stringify(plan.updateTime)) throw Error('Concurrent document change: updateTime');
  const after=cloneDocument(doc);
  for(const change of plan.fields) {
    const before=getAt(after,change.path);
    if(typeof before!=='string'||sha256(before)!==change.beforeSha256) throw Error(`Concurrent field change: ${change.field}`);
    let value=before;
    for(const edit of [...change.edits].sort((a,b)=>b.start-a.start||b.end-a.end)) value=value.slice(0,edit.start)+edit.value+value.slice(edit.end);
    if(sha256(value)!==change.afterSha256) throw Error(`Invalid patch: ${change.field}`);
    setAt(after,change.path,value);
  }
  return after;
}
/** Pure Firestore REST write builder. No client/network is imported. Each write
 * carries a server-enforced nanosecond updateTime precondition and field mask. */
export function buildFirestoreWrite(document, plan) {
  if (!plan.updateTime || !Number.isInteger(plan.updateTime.seconds) || !Number.isInteger(plan.updateTime.nanoseconds)) throw Error('Missing exact updateTime');
  const after = verifyPlannedDocument(document, plan, plan.updateTime);
  const fields = {};
  for (const change of plan.fields) {
    let target = fields;
    for (const key of change.path.slice(0, -1)) {
      target[key] ||= { mapValue: { fields: {} } };
      target = target[key].mapValue.fields;
    }
    target[change.path.at(-1)] = { stringValue: getAt(after, change.path) };
  }
  const iso = new Date(plan.updateTime.seconds * 1000).toISOString().replace(/\.\d{3}Z$/, '');
  return { update: { name: `projects/ibreviaryby/databases/(default)/documents/${plan.document}`, fields },
    updateMask: { fieldPaths: plan.fields.map(f => f.field) },
    currentDocument: { updateTime: `${iso}.${String(plan.updateTime.nanoseconds).padStart(9, '0')}Z` } };
}
function jsonFiles(root) { return fs.readdirSync(root,{withFileTypes:true}).flatMap(e=>e.isDirectory()?jsonFiles(path.join(root,e.name)):e.name.endsWith('.json')?[path.join(root,e.name)]:[]); }
function documentsIn(value, location='') {
  if(!value||typeof value!=='object')return [];
  // A real document is the lowest object containing psalmody keys. Do not
  // count seasonal deltas again: auditDocument walks these explicitly.
  if(Object.keys(value).some(psalmField) || Object.keys(value._fieldRules || {}).some(psalmField))return [{location,doc:value}];
  return Object.entries(value).filter(([k])=>!['_seasonalVariants','_mainSection','_fieldRules'].includes(k)).flatMap(([k,v])=>documentsIn(v,location?`${location}.${k}`:k));
}
export async function runAudit(args=process.argv.slice(2)) {
  const flags = new Set(['--snapshot','--flutter','--out','--write-sources','--check']);
  for (let i=0; i<args.length; i++) { if (!flags.has(args[i])) throw Error(`Unknown argument: ${args[i]}`); if (['--snapshot','--flutter','--out'].includes(args[i])) { if(!args[++i] || args[i].startsWith('--')) throw Error('Missing option value'); } }
  const root=process.cwd(), rows=[], sources=[], plan=[], written=[], writes=[];
  let scannedJsonFiles=0;
  const scan=(source,id,doc,extra={})=>{
    const found=auditDocument(doc);sources.push({source,id,fields:found.length});
    for(const item of found)rows.push({source,document:id,field:item.path.join('.'),hour:item.field.replace(/Ps\d+$/,''),classification:item.audit.classification,inheritance:item.rule||item.audit.rule||'own-text',alternativeCount:item.audit.alternativeCount||0,alternatives:item.audit.alternatives, ...extra});
    return found;
  };
  for(const file of jsonFiles(path.join(root,'patchs'))) {
    if(file.includes('serviceAccount'))continue;
    const doc=JSON.parse(fs.readFileSync(file,'utf8'));
    scannedJsonFiles++;
    let modified=false;
    for(const {location,doc:item} of documentsIn(doc)) {
      scan('json',`${path.relative(root,file)}${location?'#'+location:''}`,item);
      const canonical = file.startsWith(path.join(root,'patchs','feasts')+path.sep)||file.startsWith(path.join(root,'patchs','json')+path.sep);
      if(canonical&&args.includes('--write-sources')) {
        const {after,changes}=repairDocument(item);
        if(changes.length){Object.assign(item,after);modified=true;written.push({file:path.relative(root,file),location,fields:changes.map(c=>c.field)});}
      }
    }
    if(modified)fs.writeFileSync(file,JSON.stringify(doc,null,2)+'\n');
  }
  console.error('JSON sources scanned:', sources.length);
  const snapshotDir=arg(args,'--snapshot',null);
  if(snapshotDir) {
    const snapshot=await openFirestoreSnapshot(snapshotDir);
    for(const collection of COLLECTIONS) {
      const entries=await snapshot.collectionEntries(collection);
      if(!entries)throw Error(`Missing snapshot collection ${collection}`);
      console.error('Scanning snapshot:', collection, entries.length);
      for(const {id,data,updateTime} of entries) {
        scan('firestore-snapshot',`${collection}/${id}`,data,{updateTime});
        const canonicalDir = collection === 'liturgicalTemplates' ? 'db-templates' : collection === 'liturgicalProperTexts' ? 'db-feasts' : null;
        const canonical = canonicalDir ? JSON.parse(fs.readFileSync(path.join(root,'patchs',canonicalDir,id+'.json'),'utf8')) : null;
        const {after,changes}=repairDocument(data,canonical);
        if(changes.length)plan.push({document:`${collection}/${id}`,updateTime,beforeDocumentHash:documentHash({id,...data}),afterDocumentHash:documentHash({id,...after}),updateMask:changes.map(c=>c.field),fields:changes});
        if(changes.length) writes.push(buildFirestoreWrite(data, plan.at(-1)));
      }
    }
  }
  const flutter=arg(args,'--flutter',null);
  if(flutter)for(const name of COLLECTIONS){
    console.error('Scanning Flutter:', name);
    const payload=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(flutter,'assets','content',`${name}.json.gz`))));
    for(const[id,doc]of Object.entries(decodeCollection(payload)))scan('flutter-bundle',`${name}/${id}`,doc);
  }
  const statuses={};for(const row of rows)for(const alt of row.alternatives)statuses[alt.status]=(statuses[alt.status]||0)+1;
  const summary={scannedJsonFiles,documents:sources.length,fields:rows.length,alternatives:rows.reduce((n,r)=>n+r.alternatives.length,0),statuses,bySource:Object.fromEntries([...new Set(sources.map(s=>s.source))].map(source=>[source,{documents:sources.filter(s=>s.source===source).length,fields:rows.filter(r=>r.source===source).length}])),productionDocuments:plan.length,productionFields:plan.reduce((n,d)=>n+d.fields.length,0),writtenSourceDocuments:written.length};
  const out=arg(args,'--out','reports/doxologies');fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,'audit.json'),JSON.stringify({summary,sources,rows},null,2)+'\n');
  fs.writeFileSync(path.join(out,'dry-run.json'),JSON.stringify({schemaVersion:1,projectId:'ibreviaryby',mode:'dry-run',network:false,writePrecondition:'currentDocument.updateTime == captured updateTime; verify field SHA-256; exact updateMask only',summary,documents:plan},null,2)+'\n');
  const requests=[];let group=[];let bytes=0;
  for(const write of writes){const size=Buffer.byteLength(JSON.stringify(write));if(group.length && (bytes+size>8*1024*1024 || group.length>=400)){requests.push({writes:group});group=[];bytes=0;}group.push(write);bytes+=size;}
  if(group.length)requests.push({writes:group});
  requests.forEach((request,i)=>fs.writeFileSync(path.join(out,`firestore-commit-request-${i+1}.json`),JSON.stringify(request)+'\n'));
  fs.writeFileSync(path.join(out,'source-changes.json'),JSON.stringify(written,null,2)+'\n');
  console.log(JSON.stringify(summary,null,2));
  if(args.includes('--check')&&rows.some(r=>r.classification.startsWith('REVIEW') || r.alternatives.some(a=>['missing','incomplete'].includes(a.status)||a.status.startsWith('REVIEW'))))process.exitCode=1;
  return {summary,rows,plan,written};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) runAudit().catch(e=>{console.error(e.message);process.exitCode=1});

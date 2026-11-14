#!/usr/bin/env node
/** Offline only. No Firestore client or --apply. Snapshots stay private. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { inventoryDocument, repairCommonDocument, sourceResponseEvidence } from './lib/common-text-audit.mjs';
import { openFirestoreSnapshot } from '../lib/firestore-snapshot.mjs';
import { buildFirestoreWrite } from './audit-doxologies.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const value = (key, fallback = null) => args.includes(key) ? args[args.indexOf(key)+1] : fallback;
for (let i=0;i<args.length;i++) {
  if (['--out','--snapshot','--baseline'].includes(args[i])) { if (!args[++i] || args[i].startsWith('--')) throw Error('Missing option value'); }
  else if (!['--write-sources','--check'].includes(args[i])) throw Error(`Unknown argument ${args[i]}`);
}
const out = path.resolve(value('--out', 'reports/common-texts'));
const evidence = sourceResponseEvidence(root), inventory = [], candidates = [], changedFiles = [];
const walk = (dir) => fs.readdirSync(dir, {withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e => e.isDirectory() ? walk(path.join(dir,e.name)) : e.name.endsWith('.json') ? [path.join(dir,e.name)] : []);
const collections = { 'feasts/common-texts':'liturgicalTemplates', 'feasts':'liturgicalProperTexts', 'db-templates':'liturgicalTemplates', 'db-feasts':'liturgicalProperTexts', 'json':'days' };
let pending = 0;
for (const file of walk(path.join(root,'patchs'))) {
  const relative = path.relative(root,file);
  if (relative.includes('serviceAccount') || relative.includes('/sources/')) continue;
  const area = Object.keys(collections).find(k => relative.startsWith(`patchs/${k}/`));
  if (!area) continue;
  const current = JSON.parse(fs.readFileSync(file,'utf8'));
  let before = current;
  if (value('--baseline')) {
    try { before = JSON.parse(execFileSync('git',['show',`${value('--baseline')}:${relative}`],{cwd:root,stdio:['ignore','pipe','ignore']})); } catch { /* new local source */ }
  }
  const result = repairCommonDocument(before,evidence);
  const id = before._id || before.id || path.basename(file,'.json');
  inventory.push({file:relative,collection:collections[area],id,fields:inventoryDocument(current).map(({path,field,value,rule})=>({path:path.join('.'),field,type:typeof value,rule:Boolean(rule),...(typeof value==='string'?{sha256:(result.candidates.find(c=>c.field===path.join('.'))?.afterSha256)}:{})}))});
  candidates.push(...result.candidates.map(c=>({file:relative,collection:collections[area],id,...c})));
  const writable = area === 'feasts' || area === 'feasts/common-texts' || area === 'json';
  const actual = repairCommonDocument(current,evidence);
  if (writable && JSON.stringify(actual.after)!==JSON.stringify(current)) {
    pending++;
    if (args.includes('--write-sources')) {fs.writeFileSync(file,JSON.stringify(actual.after,null,2)+'\n');changedFiles.push(relative);}
  }
}
const plan = {mode:'dry-run',network:false,snapshot:value('--snapshot'),documents:[],blocked:[]};
if (value('--snapshot')) {
  const snapshot = await openFirestoreSnapshot(path.resolve(value('--snapshot')));
  for (const collection of ['liturgicalTemplates','liturgicalProperTexts','days','completoriums','invitatoriums']) {
    const entries = await snapshot.collectionEntries(collection);
    if (!entries) {plan.blocked.push(`missing collection ${collection}`);continue;}
    for (const entry of entries) {
      inventory.push({source:'snapshot',collection,id:entry.id,fields:inventoryDocument(entry.data).map(({path,field,value,rule})=>({path:path.join('.'),field,type:typeof value,rule:Boolean(rule)}))});
      const result = repairCommonDocument(entry.data,evidence);
      candidates.push(...result.candidates.map(c=>({source:'snapshot',collection,id:entry.id,...c})));
      const unique = [...new Map(result.candidates.filter(c=>c.beforeSha256!==c.afterSha256).map(c=>[c.field,c])).values()];
      if (!unique.length) continue;
      const fields = unique.map(c=>({field:c.field,path:c.path,beforeSha256:c.beforeSha256,afterSha256:c.afterSha256,
        before:c.originalHtml,after:c.proposedHtml,edits:[{start:0,end:c.originalHtml.length,value:c.proposedHtml}]}));
      const document = {document:`${collection}/${entry.id}`,updateTime:entry.updateTime,fields};
      if (!Number.isInteger(entry.updateTime?.seconds) || !Number.isInteger(entry.updateTime?.nanoseconds)) {plan.blocked.push(`${document.document}: exact updateTime missing`);continue;}
      document.write = buildFirestoreWrite(entry.data,document);
      plan.documents.push(document);
    }
  }
} else plan.blocked.push('No current local snapshot: live/manifest/bundle publication state unverified.');
fs.mkdirSync(out,{recursive:true});
const counts = Object.fromEntries([...new Set(candidates.map(c=>c.type))].map(type=>[type,candidates.filter(c=>c.type===type).length]));
const summary = {documents:inventory.length,fields:inventory.reduce((n,d)=>n+d.fields.length,0),candidates:candidates.length,counts,pendingSourceDocuments:pending,written:changedFiles.length,snapshotDocumentsToPatch:plan.documents.length};
fs.writeFileSync(path.join(out,'audit.json'),JSON.stringify({summary,inventory,candidates},null,2)+'\n');
fs.writeFileSync(path.join(out,'dry-run.json'),JSON.stringify(plan,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
if(args.includes('--check')&&pending)process.exitCode=1;

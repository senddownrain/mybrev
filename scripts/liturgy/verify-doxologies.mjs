#!/usr/bin/env node
/** Exhaustive local post-migration verification + real Web assembly for a year.
 * No network. The snapshot is left unchanged. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { openFirestoreSnapshot } from '../lib/firestore-snapshot.mjs';
import { repairDocument, verifyPlannedDocument } from './audit-doxologies.mjs';
import { auditDocument, sha256 } from './lib/psalmody-doxology.mjs';
import { contentFor, openLiturgySource } from './lib/snapshot-content.mjs';
const arg=(key, fallback)=>process.argv.includes(key)?process.argv[process.argv.indexOf(key)+1]:fallback;
const dir=arg('--snapshot','backups/firestore-snapshot'), out=arg('--out','reports/doxologies-verification');
const dryRun=JSON.parse(fs.readFileSync(arg('--plan','reports/doxologies-current/dry-run.json')));
const planned=new Map(dryRun.documents.map(d=>[d.document,d]));
const snapshot=await openFirestoreSnapshot(dir);
const failures=[], unique=new Map();let fields=0, alternatives=0, documents=0, patchedFields=0;
const audit=(doc, origin, context={})=>{
  for(const item of auditDocument(doc)) {
    fields++;
    if(item.audit.classification.startsWith('REVIEW')) failures.push({origin,field:item.path.join('.'),classification:item.audit.classification});
    for(const a of item.audit.alternatives){
      alternatives++;
      if(['missing','incomplete'].includes(a.status)||a.status.startsWith('REVIEW'))failures.push({origin,field:item.path.join('.'),...context,...a});
    }
    const key=sha256(JSON.stringify([item.field,item.value,context.inheritance]));
    if(!unique.has(key))unique.set(key,{origin,field:item.path.join('.'),...context,classification:item.audit.classification,alternatives:item.audit.alternatives});
  }
};
for(const collection of ['liturgicalTemplates','liturgicalProperTexts','days','completoriums','invitatoriums']) {
  for(const entry of await snapshot.collectionEntries(collection)){
    const key=`${collection}/${entry.id}`,plan=planned.get(key);
    const after=plan?verifyPlannedDocument(entry.data,plan,entry.updateTime):entry.data;
    assert.equal(repairDocument(after).changes.length,0,`idempotency ${key}`);
    if(plan)patchedFields+=plan.fields.length;
    documents++;audit(after,key);
  }
}
// The same final canonical sources shipped by the Web PR, plus planned legacy days.
const source=await openLiturgySource({snapshotDir:dir});
source.days=source.days.map(doc=>repairDocument(doc).after);
source.daysById=new Map(source.days.map(d=>[d.id,d]));
const samples=[];let assemblies=0;
const year=Number(arg('--year','2026'));
for(let t=Date.UTC(year,0,1);t<Date.UTC(year+1,0,1);t+=86400000){
  const date=new Date(t).toISOString().slice(0,10);
  for(const diocese of ['pinsk','minsk-mohilev','grodno','vitebsk']){
    const c=contentFor(source,date,{diocese});
    for(const option of c.dayOptions)for(const template of option.templates||[{id:option.dayId,day:option.day}]) {
      if(!template.day)continue;
      assemblies++;
      const ctx={date,diocese,option:option.dayId,template:template.id,inheritance:template.day._assembly||null};
      audit(template.day,'web-assembly',ctx);
      if(diocese==='pinsk'&&['2026-11-12','2026-11-02','2026-11-01','2026-11-05','2026-10-31'].includes(date))samples.push({date,diocese,option:option.dayId,template:template.id,day:template.day});
    }
  }
}
const jos=samples.filter(s=>s.date==='2026-11-12'&&s.option.includes('josaphat'));
assert.equal(jos.length,2,'Josaphat both legal Commons');
for(const s of jos)for(const n of [1,2,3])assert.equal(auditDocument(s.day).find(i=>i.field===`officeOfReadingsPs${n}`).audit.alternatives[0].status,'complete');
const dead=samples.find(s=>s.date==='2026-11-02'&&s.option==='office-for-dead');
assert.ok(dead);
for(const prefix of ['officeOfReadings','laudes','sext1','sext2','sext3','vesper'])for(const n of [1,2,3])assert.equal(auditDocument(dead.day).find(i=>i.field===`${prefix}Ps${n}`)?.audit.alternatives.every(a=>a.status==='complete'),true,`${prefix}Ps${n}`);
assert.equal(auditDocument(dead.day).find(i=>i.field==='laudesPs3').audit.alternativeCount,2);
const summary={year,documents,patchedFields,assemblies,fields,alternatives,uniqueFieldValues:unique.size,failures:failures.length,secondRunChanges:0};
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({summary,failures,rows:[...unique.values()]},null,2)+'\n');
fs.writeFileSync(path.join(out,'visual-fixtures.json'),JSON.stringify(samples)+'\n');
console.log(JSON.stringify(summary,null,2));
assert.deepEqual(failures,[],'All real alternatives in every resolved Office must have an ending or a confirmed exception');

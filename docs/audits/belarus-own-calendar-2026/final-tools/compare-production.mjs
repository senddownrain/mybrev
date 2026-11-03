import path from 'node:path';
import {pathToFileURL} from 'node:url';
const arg=n=>{const i=process.argv.indexOf(n);if(i<0||!process.argv[i+1])throw new Error('Required '+n);return path.resolve(process.argv[i+1]);};
const repo=arg('--repo'), work=arg('--work');
const moduleFromRepo=f=>import(pathToFileURL(path.join(repo,f)).href);
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
const {openFirestoreSnapshot} = await moduleFromRepo('scripts/lib/firestore-snapshot.mjs');
const {getBundledCalendarDefinitions,normalizeCalendarDefinitions,setCalendarDefinitions,dateRuleOf} = await moduleFromRepo('src/utils/ordo/definitions.js');
const {normalizeYearOverride,validateYearOverride} = await moduleFromRepo('src/utils/ordo/yearOverrides.js');
const {generateLiturgicalYear,getYearPlan,resolveLiturgicalDate} = await moduleFromRepo('src/utils/ordo/index.js');
const {buildCalendarLayers} = await moduleFromRepo('src/utils/ordo/layers.js');
const W=work;const O=W+'/private';
const s=await openFirestoreSnapshot(O);const bundle=getBundledCalendarDefinitions();
const meta=await s.document('liturgicalCalendarMeta','current');
const source={schemaVersion:meta.schemaVersion,revision:meta.revision,celebrations:await s.collection('liturgicalCelebrations'),dioceseOverrides:await s.collection('liturgicalDioceseOverrides'),yearOverrides:await s.collection('liturgicalYearOverrides')};
const prod=normalizeCalendarDefinitions(source);assert.deepEqual(prod.warnings,[]);
fs.writeFileSync(O+'/production-definitions.json',JSON.stringify(prod,null,2));fs.chmodSync(O+'/production-definitions.json',0o600);
const drop=new Set(['importedAt','createdAt','updatedAt']);
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).filter(k=>!drop.has(k)).sort().map(k=>[k,canonical(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const differences=[];const matches=[];
for(const field of ['celebrations','dioceseOverrides']){
 const a=new Map(bundle[field].map(x=>[x.id,x])),b=new Map(prod[field].map(x=>[x.id,x]));
 assert.deepEqual([...a.keys()].sort(),[...b.keys()].sort());
 for(const [id,x] of a){const same=hash(x)===hash(b.get(id));(same?matches:differences).push({collection:field,id,bundledHash:hash(x),productionHash:hash(b.get(id)),same});}
}
assert.equal(differences.length,0);
const yearDiff=prod.yearOverrides.map(x=>{
 const old=bundle.yearOverrides.find(z=>z.id===x.id);const n=normalizeYearOverride(x);const fields=['id','year','scope','dioceseId','targetCelebrationId','action','originalDate','computedDate','effectiveDate','from','to','source','status','enabled'];
 const safe=Object.fromEntries(fields.filter(k=>n[k]!==undefined).map(k=>[k,n[k]]));
 return {...safe,existsInBundle:!!old,legacyFields:!x.originalDate||!x.effectiveDate,validation:validateYearOverride(x),behaviorEqualToBundled:old?fields.filter(k=>!['computedDate'].includes(k)).every(k=>JSON.stringify(normalizeYearOverride(old)[k])===JSON.stringify(n[k])):null,sourceEvidenceIds:x.evidence||[],transferRule:x.transferRule||null};
});assert.ok(yearDiff.every(x=>x.validation.length===0));
const dias=['minsk-mohilev','vitebsk','pinsk','grodno'];
const summary={meta:{schemaVersion:meta.schemaVersion,revision:meta.revision,notesRevision:meta.notesRevision,publishedAt:meta.publishedAt.toISOString()},bundledRevision:bundle.revision,bundledNotesRevision:6,permanentEqual:matches.length,permanentDifferent:differences.length,canonicalIgnoredMetadata:[...drop],yearOverrides:yearDiff,models:{},roleStats:{},dayDifferences:[],runtimeRuleWitnesses:[],transfers:[],yearCases:[],boundedSnapshotRequests:6};
const dayMaps=new Map(),roleMaps={},effective={};
const compact=day=>({date:day.date,period:day.period,phase:day.periodPhase,primary:{id:day.primary.id,rank:day.primary.rank,title:day.primary.title},alternatives:day.alternatives.map(x=>({id:x.id,rank:x.rank})),commemorations:day.commemorations.map(x=>({id:x.id,rank:x.rank})),suppressed:day.suppressed.map(x=>({id:x.id,rank:x.rank,reason:x.reason,transferredTo:x.transferredTo||null})),officePrimary:day.sources.office.optionId,firstVespers:day.officeResolution.firstVespers,evening:day.officeResolution.evening});
for(const [model,defs] of [['web-bundle',bundle],['production',prod],['web-selected-current',{...bundle,yearOverrides:prod.yearOverrides}]]){
 setCalendarDefinitions(defs);let daysTotal=0;const roles={primary:0,alternative:0,commemoration:0,suppressed:0};roleMaps[model]={};const all=[];
 for(const dia of dias){
  if(model==='production')effective[dia]=[...buildCalendarLayers({diocese:dia}).celebrations.values()];
  for(let year=2025;year<=2035;year++){
   const plan=getYearPlan(year,{diocese:dia});
   if(model==='production')for(const t of plan.transfers)summary.transfers.push({diocese:dia,year,celebrationId:t.celebrationId,from:t.from,to:t.to,computedDate:t.computedDate,rule:t.rule,storedOverrideId:t.override?.id||null,storedStatus:t.override?.status||null});
   for(const d of generateLiturgicalYear(year,{diocese:dia})){
    daysTotal++;const c=compact(d),key=dia+'|'+d.date;
    all.push({diocese:dia,...c});
    if(model==='web-bundle')dayMaps.set(key,c);
    else {const before=dayMaps.get(key);if(JSON.stringify(before)!==JSON.stringify(c))summary.dayDifferences.push({model,diocese:dia,date:d.date,before,after:c});}
    for(const [role,arr] of [['primary',[d.primary]],['alternative',d.alternatives],['commemoration',d.commemorations],['suppressed',d.suppressed]])for(const x of arr){
     roles[role]++;const stateKey=dia+'|'+x.id;const st=roleMaps[model][stateKey] ||= {counts:{primary:0,alternative:0,commemoration:0,suppressed:0},examples:{},title:x.title};st.counts[role]++;
     st.examples[role] ||= {date:d.date,period:d.period,phase:d.periodPhase,primary:d.primary.id,rank:x.rank,reason:x.reason||null};
    }
    if(model==='production'){
     const visible=[d.primary,...d.alternatives];
     const mother=visible.some(x=>x.id==='mary-mother-church'&&x.rank==='memoria');const heart=visible.some(x=>x.id==='immaculate-heart'&&x.rank==='memoria');
     if((mother||heart)&&visible.some(x=>x.category==='saint'&&x.rank==='memoria'))summary.runtimeRuleWitnesses.push({diocese:dia,date:d.date,id:mother?'mary-mother-church':'immaculate-heart',primary:c.primary,alternatives:c.alternatives,defaultWrong:heart,weekdayAvailable:visible.some(x=>x.kind==='temporal')});
    }
   }
  }
 }
 summary.models[model]={days:daysTotal,roleCounts:roles};
 fs.writeFileSync(W+'/'+model+'-days.json.gz',gzipSync(JSON.stringify(all)));
}
setCalendarDefinitions(prod);
for(const o of yearDiff){
 const dioceseList=o.dioceseId?[o.dioceseId]:dias;
 for(const dia of dioceseList)for(const date of [...new Set([o.originalDate,o.effectiveDate])]){
  const withStored=compact(resolveLiturgicalDate(date,{diocese:dia}));const without=compact(resolveLiturgicalDate(date,{diocese:dia,dataYearOverrides:false}));
  summary.yearCases.push({id:o.id,diocese:dia,date,withStored,withoutStored:without});
 }
}
setCalendarDefinitions(null);
assert.equal(summary.dayDifferences.length,0,'Production differs from bundle in user-visible daily model');
assert.equal(summary.runtimeRuleWitnesses.length,23);
fs.writeFileSync(O+'/effective-production.json',JSON.stringify(effective,null,2));
fs.writeFileSync(W+'/production-summary.json',JSON.stringify(summary,null,2)+'\n');
fs.writeFileSync(W+'/role-stats.json',JSON.stringify(roleMaps,null,2)+'\n');
fs.writeFileSync(W+'/canonical-comparison.json',JSON.stringify({ignoredMetadata:[...drop],matches,differences},null,2)+'\n');
console.log(JSON.stringify({permanentEqual:matches.length,permanentDifferent:differences.length,models:summary.models,dayDifferences:summary.dayDifferences.length,yearOverrides:yearDiff.length,extraAuto:yearDiff.filter(x=>!x.existsInBundle).length,ruleWitnesses:summary.runtimeRuleWitnesses.length,materializedTransferOccurrences:summary.transfers.filter(x=>x.storedOverrideId).length},null,2));

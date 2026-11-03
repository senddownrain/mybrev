/** Read-only witness of the baseline's stale memo after a synthetic publication. */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const i=process.argv.indexOf('--repo');
if(i<0)throw new Error('--repo required');
const repo=path.resolve(process.argv[i+1]);
const mod=file=>import(pathToFileURL(path.join(repo,file)).href);
const {resolveRuntimeDay}=await mod('src/utils/ordo/runtime.js');
const {resolveLiturgicalDate}=await mod('src/utils/ordo/index.js');
const {getBundledCalendarDefinitions,setCalendarDefinitions}=await mod('src/utils/ordo/definitions.js');
const defs=getBundledCalendarDefinitions();const diocese='pinsk',date='2026-07-02';
const before=resolveRuntimeDay(date,{diocese});
try {
 setCalendarDefinitions({...defs,revision:defs.revision+1,dioceseOverrides:defs.dioceseOverrides.filter(x=>x.id!=='pinsk--our-lady-budslav')});
 const fresh=resolveLiturgicalDate(date,{diocese});const cached=resolveRuntimeDay(date,{diocese});
 assert.equal(fresh.primary.rank,'feria');assert.equal(cached.primary.rank,'memoria');assert.equal(before,cached);
 console.log(JSON.stringify({status:'BASELINE_DEFECT_REPRODUCED',date,diocese,syntheticPublicationOnly:true,before:{id:before.primary.id,rank:before.primary.rank},fresh:{id:fresh.primary.id,rank:fresh.primary.rank,alternatives:fresh.alternatives.map(x=>x.id)},cached:{id:cached.primary.id,rank:cached.primary.rank},sameObject:before===cached},null,2));
} finally {setCalendarDefinitions(null);}

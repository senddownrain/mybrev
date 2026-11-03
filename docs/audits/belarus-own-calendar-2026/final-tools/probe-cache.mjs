import path from 'node:path';
import {pathToFileURL} from 'node:url';
const arg=n=>{const i=process.argv.indexOf(n);if(i<0||!process.argv[i+1])throw new Error('Required '+n);return path.resolve(process.argv[i+1]);};
const repo=arg('--repo'), work=arg('--work');
const moduleFromRepo=f=>import(pathToFileURL(path.join(repo,f)).href);
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { createServer } = await moduleFromRepo('node_modules/vite/dist/node/index.js');
const { createContentCache } = await moduleFromRepo('src/utils/contentCache.js');
const { selectCalendarSource,selectNotesSource } = await moduleFromRepo('src/utils/ordoCalendarSource.js');
const { resolveRuntimeDay } = await moduleFromRepo('src/utils/ordo/runtime.js');
const { resolveLiturgicalDate } = await moduleFromRepo('src/utils/ordo/index.js');
const { getBundledCalendarDefinitions,setCalendarDefinitions } = await moduleFromRepo('src/utils/ordo/definitions.js');
const out=[];
function record(id,facts){out.push({id,status:'BASELINE_BEHAVIOR_REPRODUCED',...facts});}
const bundle=getBundledCalendarDefinitions();
try {
 const before=resolveRuntimeDay('2026-07-02',{diocese:'pinsk'});
 setCalendarDefinitions({...bundle,revision:4,dioceseOverrides:bundle.dioceseOverrides.filter(x=>x.id!=='pinsk--our-lady-budslav')});
 const fresh=resolveLiturgicalDate('2026-07-02',{diocese:'pinsk'}),cached=resolveRuntimeDay('2026-07-02',{diocese:'pinsk',epoch:999});
 assert.equal(before,cached);assert.equal(fresh.primary.rank,'feria');assert.equal(cached.primary.rank,'memoria');record('D-MEMO',{cachedRank:cached.primary.rank,freshRank:fresh.primary.rank,callerEpochIgnored:true});
} finally {setCalendarDefinitions(null);}
const disk=new Map();const cache=()=>createContentCache({storage:{get:async k=>disk.get(k),set:async(k,v)=>disk.set(k,v),keys:async()=>[...disk.keys()]},getRevision:()=> 'same-app-content-revision',isOnline:()=>true});
await cache().read('ordo-calendar',async()=>({data:{metaRevision:3},complete:true}));
let network=0;const app=cache();await app.prime(['ordo-calendar']);
const stale=await app.read('ordo-calendar',async()=>{network++;return {data:{metaRevision:4},complete:true};});assert.equal(network,0);assert.equal(stale.data.metaRevision,3);record('D-REVALIDATE',{simulatedServerRevision:4,clientObservedRevision:stale.data.metaRevision,networkCallsAtStartup:network,condition:'complete local entry, unchanged CONTENT_REVISION/refresh token'});
const fresh=await app.read('ordo-calendar',async()=>{network++;return {data:{metaRevision:4},complete:true};},{fresh:true});assert.equal(network,0);record('D-FRESH-FLAG',{freshFlagAloneForcesNetwork:false,networkCalls:network});
await app.read('ordo-calendar',async()=>{network++;return {data:{metaRevision:4},complete:true};},{revalidate:true});assert.equal(network,1);record('D-REVALIDATE-CONTROL',{revalidateTrueCallsLoader:true});
assert.equal(selectCalendarSource({bundled:bundle,cached:{schemaVersion:99,revision:4,celebrations:[{id:'synthetic'}]}}),'firestore');record('D-CACHED-SCHEMA',{unsupportedCachedSchemaSelected:true,scope:'local cache path; network loader separately guards future schema'});
assert.equal(selectNotesSource({bundledRevision:6,meta:{notesRevision:4}}),'bundled');record('NOTES-CURRENT',{productionNotesRevision:4,bundledNotesRevision:6,selected:'bundled'});
const server=await createServer({configFile:false,cacheDir:path.join(work,'vite-cache'),root:repo,server:{middlewareMode:true},optimizeDeps:{noDiscovery:true,entries:[]}});
try {
 const helpers=await server.ssrLoadModule('/src/utils/ordoCalendarCache.js');const defs=await server.ssrLoadModule('/src/utils/ordo/definitions.js');
 const base=defs.getBundledCalendarDefinitions();defs.setCalendarDefinitions({...base,revision:4});
 const next=helpers.definitionsFromCache({calendar:{revision:3,meta:{revision:3}},overrides:{items:base.yearOverrides},bundled:base});defs.setCalendarDefinitions(next);
 assert.equal(defs.getCalendarDefinitions().revision,4);record('D-DOWNGRADE',{serverMetadataRevision:3,activeRevisionAfterApply:4,meaning:'Lowering meta is not a reliable rollback in an already active session'});defs.setCalendarDefinitions(null);
 const loader=await server.ssrLoadModule('/src/utils/ordoNotesLoader.js');let first=0,second=0;
 const a=await loader.loadOrdoNotes(async()=>{first++;return [{id:'synthetic-notes-v7'}];});
 const b=await loader.loadOrdoNotes(async()=>{second++;return [{id:'synthetic-notes-v8'}];});
 assert.equal(a,b);assert.equal(second,0);record('D-NOTES-PROMISE',{firstPublishedReaderCalls:first,nextPublishedReaderCalls:second,condition:'successful loader promise held for session; future notes update'});
} finally {await server.close();}
fs.writeFileSync(path.join(work,'cache-probes.json'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({probes:out.length,results:out},null,2));

#!/usr/bin/env node
/** Offline selection from the reviewed immutable plan. No Firebase client. */
import fs from 'node:fs';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { openFirestoreSnapshot } from '../lib/firestore-snapshot.mjs';
import { decodeFirestoreValue } from '../ordo/lib/approved-calendar-rest.mjs';
import { validatePublicationPlan,boundPublicationWrites } from './lib/editorial-publication.mjs';
import { verifyPlannedDocument,buildFirestoreWrite } from './audit-doxologies.mjs';
import { editorialHash } from './lib/editorial-responsories.mjs';
import { liturgicalText } from '../../src/utils/liturgicalSourceHtml.js';
const root='docs/audits/liturgical-common-texts-2026-11/v4';
export function selectDaysTemplates(full,published){
 const documents=structuredClone(full.documents.filter(d=>/^(days|liturgicalTemplates)\/[^/]+$/u.test(d.document)));
 const written=new Set(published.documents.flatMap(d=>d.fields.map(f=>d.document+'|'+f.field)));
 const held=new Set(full.fields.filter(f=>f.contentStatus==='held').map(f=>f.document+'|'+f.field));
 for(const d of documents)for(const f of d.fields){const key=d.document+'|'+f.field;if(written.has(key)||held.has(key)||f.contentStatus!=='ready')throw Error('Scope conflict '+key);}
 const count=documents.reduce((n,d)=>n+d.fields.length,0);
 if(count!==7791||held.size!==843||written.size!==406||!published.allReadbacksVerified)throw Error('Reviewed scope/receipt count changed');
 const plan={schema:3,network:false,summary:{state:'content-prepared-offline; blocked-by-bundle-and-fresh-preflight',readyDocuments:documents.length,readyFields:count,heldUnconfirmedFields:843,productionWrites:0},
  // The existing publisher rejects this policy. Preparing content is not a
  // declaration of Flutter compatibility or permission to publish a manifest.
  compatibility:{policy:'days-templates-awaiting-compatible-bundle',freshLivePreflight:false,manifestPublicationAuthorized:false},documents};
 validatePublicationPlan(plan);return plan;
}
export async function verifyLocalBaseline(plan,snapshotPath,adventPath){
 const snapshot=await openFirestoreSnapshot(snapshotPath),entries=new Map();
 for(const name of ['days','liturgicalTemplates'])for(const e of await snapshot.collectionEntries(name))entries.set(name+'/'+e.id,e);
 for(const id of ['advent-21-12','advent-w4-d1']){
  const raw=JSON.parse(fs.readFileSync(adventPath+'/days__'+id+'.json')),m=/^(.*?)(?:\.(\d{1,9}))?Z$/u.exec(raw.updateTime);
  entries.set('days/'+id,{data:Object.fromEntries(Object.entries(raw.fields).map(([k,v])=>[k,decodeFirestoreValue(v)])),updateTime:{seconds:Date.parse(m[1]+'Z')/1000,nanoseconds:Number((m[2]||'').padEnd(9,'0'))}});
 }
 const writes=[];let formattingDifferences=0;
 for(const d of plan.documents){const entry=entries.get(d.document);if(!entry)throw Error('Missing local baseline '+d.document);
  // Compare exact captured timestamps; wrapper metadata is not a timestamp.
  if(entry.updateTime.seconds!==d.updateTime.seconds||entry.updateTime.nanoseconds!==d.updateTime.nanoseconds)throw Error('Local updateTime drift '+d.document);
  verifyPlannedDocument(entry.data,d,d.updateTime);
  const write=buildFirestoreWrite(entry.data,d);writes.push({plan:d,write});
  if(d.document.startsWith('liturgicalTemplates/')){const src=JSON.parse(fs.readFileSync('patchs/db-templates/'+d.document.split('/')[1]+'.json'));
   for(const f of d.fields){const value=f.path.reduce((v,k)=>v?.[k],src);if(value===f.after)continue;if(typeof value!=='string'||value.trimEnd()!==f.after.trimEnd()||liturgicalText(value)!==liturgicalText(f.after))throw Error('Canonical template drift '+d.document+'|'+f.field);formattingDifferences++;}
  }
 }
 return {checkedDocuments:plan.documents.length,checkedFields:plan.summary.readyFields,formattingOnlyTrailingNewlineDifferences:formattingDifferences,batchesOf25:boundPublicationWrites(writes,{maxWrites:25}).length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const a=process.argv.slice(2);if(a.length!==6||a[0]!=='--snapshot'||a[2]!=='--advent-baseline'||a[4]!=='--out'||!a[5].startsWith('backups/'))throw Error('Usage: --snapshot <existing-local> --advent-baseline <existing-local> --out backups/<plan.gz>');
 const source=fs.readFileSync(root+'/full-content-plan.json.gz'),full=JSON.parse(zlib.gunzipSync(source)),published=JSON.parse(fs.readFileSync(root+'/PUBLICATION_RESULT.json'));
 const plan=selectDaysTemplates(full,published),verification=await verifyLocalBaseline(plan,a[1],a[3]);
 plan.inputs={fullPlanSha256:editorialHash(source),publishedReceiptSha256:published.receiptSha256};
 const output=zlib.gzipSync(JSON.stringify(plan)+'\n',{level:9});fs.writeFileSync(a[5],output,{mode:0o600});
 console.log(JSON.stringify({...plan.summary,...verification,planSha256:editorialHash(output),output:a[5],firebaseReads:0,firebaseWrites:0},null,2));
}

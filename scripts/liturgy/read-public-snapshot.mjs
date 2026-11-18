#!/usr/bin/env node
/** Explicit, bounded, public read-only alternative when no Admin key exists.
 * Run only with owner approval of snapshot reads. No credentials or writes.
 * Subcollections, private/admin/auth data and Flutter are never requested. */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createHash } from 'node:crypto';
const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--out')throw Error('Usage: node scripts/liturgy/read-public-snapshot.mjs --out backups/<new-directory>');
const out=path.resolve(args[1]);
if(!out.startsWith(path.resolve('backups')+path.sep))throw Error('Snapshot must stay inside ignored backups/');
if(fs.existsSync(out))throw Error('Output exists; never replace an analysis snapshot');
const projectId='ibreviaryby',base=`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
const collections=['days','liturgicalTemplates','liturgicalProperTexts','invitatoriums','completoriums','liturgicalCalendarMeta','liturgicalCelebrations','liturgicalDioceseOverrides','liturgicalYearOverrides','liturgicalOrdoNotes','contentManifest'];
const timestamp=iso=>{const [whole,fraction='']=iso.replace(/Z$/u,'').split('.');return{__firestoreType:'timestamp',seconds:Date.parse(whole+'Z')/1000,nanoseconds:Number(fraction.padEnd(9,'0'))};};
const decode=value=>{
 if('nullValue'in value)return null;
 if('stringValue'in value)return value.stringValue;
 if('booleanValue'in value)return value.booleanValue;
 if('integerValue'in value)return Number(value.integerValue);
 if('doubleValue'in value)return value.doubleValue;
 if('timestampValue'in value)return timestamp(value.timestampValue);
 if('arrayValue'in value)return(value.arrayValue.values||[]).map(decode);
 if('mapValue'in value)return Object.fromEntries(Object.entries(value.mapValue.fields||{}).map(([k,v])=>[k,decode(v)]));
 throw Error(`Unsupported type ${Object.keys(value).join(',')}`);
};
fs.mkdirSync(out,{recursive:true});const descriptors={};
for(const collection of collections){
 let pageToken='',documents=[];
 do{
  const url=new URL(`${base}/${collection}`);url.searchParams.set('pageSize','1000');if(pageToken)url.searchParams.set('pageToken',pageToken);
  // curl honours the managed environment's HTTPS proxy. Fail on 403/429;
  // never retry via a more privileged credential or an unapproved endpoint.
  const page=JSON.parse(execFileSync('curl',['--fail','--silent','--show-error','--max-time','60',url.href],{maxBuffer:100*1024*1024,encoding:'utf8'}));pageToken=page.nextPageToken||'';
  documents.push(...(page.documents||[]).map(doc=>({id:doc.name.split('/').at(-1),data:Object.fromEntries(Object.entries(doc.fields||{}).map(([k,v])=>[k,decode(v)])),updateTime:timestamp(doc.updateTime)})));
 }while(pageToken);
 documents.sort((a,b)=>a.id.localeCompare(b.id));
 const payload=JSON.stringify({schemaVersion:1,collectionPath:collection,documents})+'\n',file=collection+'.json';fs.writeFileSync(path.join(out,file),payload);
 descriptors[collection]={file,documentCount:documents.length,bytes:Buffer.byteLength(payload),sha256:createHash('sha256').update(payload).digest('hex')};
 console.log(`${collection}: ${documents.length} documents`);
}
const exportedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({schemaVersion:1,projectId,exportedAt,snapshotVersion:exportedAt.replace(/[-:.TZ]/gu,''),scope:'selected-public-collections',transport:'unauthenticated REST GET',selectedCollections:collections,collections:descriptors,totalDocuments:Object.values(descriptors).reduce((n,d)=>n+d.documentCount,0)},null,2)+'\n');
console.log('Private local snapshot complete; no writes or manifest publication.');

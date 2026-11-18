#!/usr/bin/env node
/** Reproduces the exact Git bundle/local-snapshot reconciliation. No Firebase. */
import fs from'node:fs';import zlib from'node:zlib';
import{selectDaysTemplates}from'./prepare-days-templates.mjs';
import{openFirestoreSnapshot}from'../lib/firestore-snapshot.mjs';
import{decodeCollection,storedDocument,describeDocuments}from'../content/lib/app-content.mjs';
import{loadCoordinatedContract,binarySha256,valueSha256}from'./lib/coordinated-release.mjs';
const args=process.argv.slice(2);if(args.length!==6||args[0]!=='--snapshot'||args[2]!=='--flutter-bundle'||args[4]!=='--out'||!args[5].startsWith('backups/'))throw Error('Use --snapshot <existing-local> --flutter-bundle <exact-PR113-assets> --out backups/<supplement.gz>');
const root='docs/audits/liturgical-common-texts-2026-11/v4',contract=loadCoordinatedContract(),snapshot=await openFirestoreSnapshot(args[1]);
const sourceBytes=fs.readFileSync(root+'/full-content-plan.json.gz');if(binarySha256(sourceBytes)!==contract.report.sourcePlanSha256)throw Error('Wrong source plan binary SHA');
const source=JSON.parse(zlib.gunzipSync(sourceBytes)),held=new Set(source.fields.filter(f=>f.contentStatus==='held').map(f=>f.document+'|'+f.field));
const planned=selectDaysTemplates(source,JSON.parse(fs.readFileSync(root+'/PUBLICATION_RESULT.json'))),selected=new Set(planned.documents.flatMap(d=>d.fields.map(f=>d.document+'|'+f.field)));
const groups={
 'days/28-10-sv-simon-jude-apostles':{fields:['vesper1Inter','vesperInter','checked','allowedAlleluia'],reference:'docs/investigations/2026-10-28-vesperInter.md',basis:'preserve-existing-legacy-variant-and-metadata'},
 'days/feast-christthehighpriest':{fields:[1,2,3].flatMap(i=>['Hymn','Ps1','Ps2','Ps3'].map(f=>'sext'+i+f)),reference:'scripts/content/high-priest-targeted-plan.mjs',basis:'published-daytime-psalter-from-day-references'},
 'days/ordinary-w11-d1':{fields:Object.keys(JSON.parse(fs.readFileSync('scripts/liturgy/sources/xi-sunday-first-vespers-by.json')).fields),reference:'scripts/liturgy/sources/xi-sunday-first-vespers-by.json',basis:'existing-reviewed-XI-first-vespers-source'},
 'days/ordinary-w30-d6':{fields:['Hymn','Ant1','Ant2','Ant3','Ps1','Ps2','Ps3','AntMag','Inter','Pr'].map(f=>'vesper'+f),reference:'docs/liturgy/issue-198-friday-vespers.md',basis:'published-Friday-psalter-II-vespers'},
};
const changes=[],before={},after={},snapshotEntries=new Map();
for(const name of ['days','liturgicalTemplates','liturgicalProperTexts']){
 const bytes=fs.readFileSync(args[3]+'/'+name+'.json.gz');if(binarySha256(bytes)!==contract.report.files[name+'.json.gz'].sha256)throw Error('Wrong exact Flutter input');
 const docs=decodeCollection(JSON.parse(zlib.gunzipSync(bytes))),next=structuredClone(docs);before[name]=describeDocuments(Object.values(docs));
 for(const entry of await snapshot.collectionEntries(name))snapshotEntries.set(name+'/'+entry.id,entry);
 for(const[doc,group]of Object.entries(groups).filter(([doc])=>doc.startsWith(name+'/'))){const id=doc.split('/')[1],web=storedDocument(id,snapshotEntries.get(doc).data);
  for(const field of group.fields){if(selected.has(doc+'|'+field))throw Error('Supplement may not change the 7791 fields');const value=web[field];if(JSON.stringify(docs[id][field])===JSON.stringify(value))throw Error('Expected scoped drift missing');
   if(doc==='days/feast-christthehighpriest'&&value!=='from-day')throw Error('Unexpected daytime reference');
   if(doc==='days/ordinary-w11-d1'&&value!==JSON.parse(fs.readFileSync(group.reference)).fields[field])throw Error('XI source mismatch');
   if(doc==='days/ordinary-w30-d6'&&value!==storedDocument('ordinary-w2-d6',snapshotEntries.get('days/ordinary-w2-d6').data)[field])throw Error('Friday source mismatch');
   changes.push({document:doc,field,path:[field],beforeSha256:valueSha256({present:Object.hasOwn(docs[id],field),value:docs[id][field]??null}),afterSha256:valueSha256({present:true,value}),value,
    purpose:held.has(doc+'|'+field)?'preserve-existing-Web-baseline-without-editorial-expansion':group.basis,
    editorialHeld:held.has(doc+'|'+field),source:{reference:group.reference,binarySha256:binarySha256(fs.readFileSync(group.reference)),snapshotUpdateTime:snapshotEntries.get(doc).updateTime}});
   next[id][field]=value;
  }
 }
 if(name!=='days')for(const[id,data]of Object.entries(docs)){const doc=name+'/'+id,entry=snapshotEntries.get(doc),web=storedDocument(id,entry.data);if(Object.hasOwn(data,'importedAt')||typeof web.importedAt!=='number')throw Error('Unexpected metadata baseline');const value=web.importedAt;
  changes.push({document:doc,field:'importedAt',path:['importedAt'],beforeSha256:valueSha256({present:false,value:null}),afterSha256:valueSha256({present:true,value}),value,purpose:'preserve-existing-Web-bookkeeping-for-exact-sizes',editorialHeld:false,source:{snapshotUpdateTime:entry.updateTime}});next[id].importedAt=value;
 }
 after[name]=describeDocuments(Object.values(next));
}
const artifact={schema:1,scope:'flutter-bundle-baseline-only',status:'offline-reconciliation-requires-reviewed-Flutter-rebuild-and-live-gates',firestoreWrites:0,sourcePlanBinarySha256:contract.report.sourcePlanSha256,
 flutterSourceMergeSha:'bb145d8e366236af930b7d1086c24b3d1c52256a',bundleFiles:Object.fromEntries(Object.entries(contract.report.files).filter(([n])=>['manifest.json','days.json.gz','liturgicalTemplates.json.gz','liturgicalProperTexts.json.gz'].includes(n))),
 snapshotManifestBinarySha256:binarySha256(fs.readFileSync(args[1]+'/manifest.json')),
 summary:{baselineFields:37,bookkeepingFields:307,totalFields:344,additionalEditorialExpansions:0,heldWebValuesChanged:0,heldBaselineCopies:1},before,after,changes};
if(changes.length!==344||changes.filter(f=>f.editorialHeld).length!==1)throw Error('Reconciliation scope drift');
fs.writeFileSync(args[5],zlib.gzipSync(JSON.stringify(artifact)+'\n',{level:9}));
console.log(JSON.stringify({summary:artifact.summary,collections:Object.fromEntries(Object.entries(after).map(([n,d])=>[n,{count:d.count,digest:d.digest,bytes:d.bytes}]))},null,2));

#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { readFile,mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openFirestoreSnapshot } from './lib/firestore-snapshot.mjs';
import { canonicalPrayerContent,prayerStoragePlan,PRAYER_STORAGE,CONTENT_CONTROL,MAX_ATOMIC_CONTENT_WRITES } from '../src/utils/prayerStoragePlan.mjs';

export const contentCollections=Object.entries(PRAYER_STORAGE).flat();
// Lossless private backup representation, shared by snapshot comparison/resume.
export function encode(value) {
 if(value===null||value===undefined)return value;
 if(Array.isArray(value))return value.map(encode);
 if(value.__firestoreType)return Object.fromEntries(Object.entries(value).filter(([,v])=>typeof v!=='function'));
 if(typeof value.toDate==='function'&&typeof value.seconds==='number')return {__firestoreType:'timestamp',seconds:value.seconds,nanoseconds:value.nanoseconds};
 if(value instanceof Date)return {__firestoreType:'date',iso:value.toISOString()};
 if(Buffer.isBuffer(value))return {__firestoreType:'bytes',base64:value.toString('base64')};
 if(value.firestore&&value.path)return {__firestoreType:'reference',path:value.path};
 if(typeof value.latitude==='number'&&typeof value.longitude==='number')return {__firestoreType:'geopoint',latitude:value.latitude,longitude:value.longitude};
 if(typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,encode(v)]));
 return value;
}
const digest=value=>createHash('sha256').update(JSON.stringify(encode(value))).digest('hex');
const ordered=map=>contentCollections.map(name=>[name,[...(map.get(name)||[])].sort((a,b)=>a.id.localeCompare(b.id))]);
export function migrationOperations(collections,plan,maintenance=false) {
 if(!maintenance)return plan.operations;
 // Empty both public catalogs first, then private targets, then safe public
 // targets. Partial failure never publishes newly restricted text.
 const quarantine=['prayers','prayerCategories'].flatMap(name=>(collections.get(name)||[]).map(item=>({type:'delete',collection:name,id:item.id})));
 const privateWrites=plan.operations.filter(op=>Object.values(PRAYER_STORAGE).includes(op.collection));
 const publish=['prayers','prayerCategories'].flatMap(name=>plan.desired.get(name).map(({id,...data})=>({type:'set',collection:name,id,data})));
 return [...quarantine,...privateWrites,...publish];
}
export async function priestMigrationPlan(snapshotDirs,policy={}) {
 const collections=new Map();let projectId;
 for(const directory of snapshotDirs){const snapshot=await openFirestoreSnapshot(directory);
  if(projectId&&snapshot.manifest.projectId!==projectId)throw new Error('Snapshot project mismatch');projectId=snapshot.manifest.projectId;
  for(const name of contentCollections){const entries=await snapshot.collectionEntries(name);if(entries===null)continue;
   const rows=entries.map(({id,data})=>({...data,id}));if(collections.has(name)&&digest(collections.get(name))!==digest(rows))throw new Error(`Conflicting snapshots: ${name}`);collections.set(name,rows);
  }
 }
 if(Object.keys(policy).some(key=>!['categoryFlags','mustRemainPublic'].includes(key)))throw new Error('Unsupported migration policy field');
 const content=canonicalPrayerContent(collections);
 for(const flag of policy.categoryFlags||[]){
  if(typeof flag.id!=='string'||typeof flag.priestOnly!=='boolean'||Object.keys(flag).some(key=>!['id','priestOnly'].includes(key)))throw new Error('Invalid category flag policy');
  const category=content.categories.find(item=>item.id===flag.id);if(!category)throw new Error(`Policy category not found: ${flag.id}`);category.priestOnly=flag.priestOnly;
 }
 const plan=prayerStoragePlan(collections,content);
 for(const id of policy.mustRemainPublic||[]){if(typeof id!=='string'||!plan.desired.get('prayers').some(item=>item.id===id))throw new Error(`Required public prayer would be missing/restricted: ${id}`);}
 const missingCollections=contentCollections.filter(name=>!collections.has(name));
 const sourceDigest=digest(ordered(collections));
 const report={analysisSource:'local-firestore-snapshot',projectId,missingCollections,ready:missingCollections.length===0,
  before:Object.fromEntries(contentCollections.map(name=>[name,collections.has(name)?collections.get(name).length:null])),after:Object.fromEntries([...plan.desired].map(([name,rows])=>[name,missingCollections.length?null:rows.length])),
  writes:plan.operations.length,atomic:missingCollections.length?null:plan.operations.length<=MAX_ATOMIC_CONTENT_WRITES&&Buffer.byteLength(JSON.stringify(plan.operations))<7000000,
  changes:plan.operations.map(({type,collection,id})=>({type,collection,id})),
  sourceDigest,policy,digest:Object.keys(policy).length?digest({sourceDigest,policy}):sourceDigest,notes:['Own flags and IDs retained except explicit category flags in policy. Grants/settings untouched. Missing collection is NOT an empty collection.','Private rules must be deployed before apply; do not reopen public collections before verification.']};
 return {collections,plan,report};
}
function decode(value,db,admin) {
 if(Array.isArray(value))return value.map(v=>decode(v,db,admin));
 if(!value||typeof value!=='object')return value;
 switch(value.__firestoreType){case 'timestamp':return new admin.firestore.Timestamp(value.seconds,value.nanoseconds);case 'date':return new Date(value.iso);case 'bytes':return Buffer.from(value.base64,'base64');case 'reference':return db.doc(value.path);case 'geopoint':return new admin.firestore.GeoPoint(value.latitude,value.longitude);}
 return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,decode(v,db,admin)]));
}
function simulate(original,operations,count) {
 const map=new Map(original.map(([name,rows])=>[name,new Map(rows.map(row=>[row.id,row]))]));
 for(const op of operations.slice(0,count)){if(op.type==='delete')map.get(op.collection).delete(op.id);else map.get(op.collection).set(op.id,{...op.data,id:op.id});}
 return new Map([...map].map(([name,rows])=>[name,[...rows.values()]]));
}
async function main(){
 const options={snapshots:[],serviceAccount:'patchs/serviceAccountKey.json'};
 const args=process.argv.slice(2);for(let i=0;i<args.length;i++){
  const arg=args[i];if(arg==='--snapshot')options.snapshots.push(args[++i]);else if(['--service-account','--approve-digest','--resume','--policy'].includes(arg))options[arg.slice(2)]=args[++i];
  else if(['--apply','--allow-maintenance','--protected-rules-confirmed','--test-stop-after-batch'].includes(arg))options[arg.slice(2)]=true;else throw new Error(`Unknown argument: ${arg}`);
 }
 const policy=options.policy?JSON.parse(await readFile(options.policy,'utf8')):{};
 const analysis=await priestMigrationPlan(options.snapshots.length?options.snapshots:['backups/firestore-snapshot'],policy);
 await mkdir('reports/priest-access',{recursive:true});await writeFile('reports/priest-access/migration.json',JSON.stringify(analysis.report,null,2)+'\n');
 console.log(`Local dry-run: ${analysis.report.writes} writes; uncovered: ${analysis.report.missingCollections.join(', ')||'none'}. Report has no texts or proofs.`);
 if(!options.apply)return;
 if(!options['protected-rules-confirmed'])throw new Error('Apply refused: deploy reviewed protective rules first, then explicitly acknowledge --protected-rules-confirmed.');
 if(!options.resume&&(analysis.report.missingCollections.length||options['approve-digest']!==analysis.report.digest))throw new Error('Apply refused: complete four-collection snapshot and matching --approve-digest required. No live reads performed.');
 const {default:admin}=await import('firebase-admin');const account=JSON.parse(await readFile(options['service-account']||options.serviceAccount,'utf8'));
 const app=admin.initializeApp({credential:admin.credential.cert(account),projectId:account.project_id},'priest-migration');
 try {
  const db=admin.firestore(app);const control=db.doc(CONTENT_CONTROL);let backup,backupPath;
  if(options['test-stop-after-batch']&&(!/^demo-/.test(account.project_id)||!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||'')))throw new Error('Fault injection is permitted only in a local demo emulator.');
  async function readCollections(tx){return new Map(await Promise.all(contentCollections.map(async name=>[name,(await (tx?tx.get(db.collection(name)):db.collection(name).get())).docs.map(d=>({...d.data(),id:d.id}))])));}
  if(options.resume){backupPath=path.resolve(options.resume);const root=path.resolve('backups')+path.sep;if(!backupPath.startsWith(root))throw new Error('Resume backup must stay under private backups/.');backup=JSON.parse(await readFile(backupPath,'utf8'));if(backup.projectId!==account.project_id)throw new Error('Backup project mismatch');}
  else {
   if(analysis.report.projectId!==account.project_id)throw new Error('Snapshot/project mismatch');
   const maintenance=!analysis.report.atomic;if(maintenance&&!options['allow-maintenance'])throw new Error('Large migration requires --allow-maintenance: public online catalog temporarily becomes empty; public offline copies stay available.');
   const original=await readCollections();if(digest(ordered(original))!==analysis.report.sourceDigest)throw new Error('Firestore differs from snapshot; abort and obtain a reviewed new snapshot.');
   backup={schemaVersion:2,projectId:account.project_id,nonce:randomUUID(),maintenance,policy,original:encode(ordered(original)),operations:encode(migrationOperations(original,analysis.plan,maintenance)),
    settings:encode((await db.collection('priestAccess').get()).docs.map(d=>({id:d.id,data:d.data()}))),grants:encode((await db.collection('priestDeviceGrants').get()).docs.map(d=>({id:d.id,data:d.data()})))};
   await mkdir('backups/priest-access',{recursive:true});backupPath=path.resolve('backups/priest-access',`${backup.nonce}.json`);await writeFile(backupPath,JSON.stringify(backup),{flag:'wx'});
   await db.runTransaction(async tx=>{const current=await tx.get(control);const actual=await readCollections(tx);if(current.data()?.lockUid||digest(ordered(actual))!==analysis.report.sourceDigest)throw new Error('Concurrent change; backup retained, no migration writes.');
    tx.set(control,{version:(current.data()?.version||0)+1,lockUid:backup.nonce,updatedAt:admin.firestore.FieldValue.serverTimestamp(),migrationStep:0});});
  }
  console.log(`Private backup: ${backupPath}. On failure keep lock and resume this exact file; never copy it into public/.`);
  let state=(await control.get()).data();if(state?.lockUid!==backup.nonce)throw new Error('Missing/wrong migration lock. No resume writes.');
  const expected=simulate(backup.original,backup.operations,state.migrationStep);
  if(digest(ordered(await readCollections()))!==digest(ordered(expected)))throw new Error('Unexpected content change during migration; manual recovery required. Lock retained.');
  while(state.migrationStep<backup.operations.length){let end=state.migrationStep,bytes=0;
   const max=backup.maintenance?200:MAX_ATOMIC_CONTENT_WRITES;
   while(end<backup.operations.length&&end-state.migrationStep<max){const size=Buffer.byteLength(JSON.stringify(backup.operations[end]));if(size>7000000)throw new Error('Oversized document; lock retained.');if(end>state.migrationStep&&bytes+size>7000000)break;bytes+=size;end++;}
   await db.runTransaction(async tx=>{const current=await tx.get(control);if(current.data().lockUid!==backup.nonce||current.data().migrationStep!==state.migrationStep)throw new Error('Concurrent migration runner; stop.');
    for(const op of backup.operations.slice(state.migrationStep,end)){const ref=db.doc(`${op.collection}/${op.id}`);if(op.type==='delete')tx.delete(ref);else tx.set(ref,decode(op.data,db,admin));}
    tx.set(control,{...current.data(),version:current.data().version+1,migrationStep:end,updatedAt:admin.firestore.FieldValue.serverTimestamp()});});
   state=(await control.get()).data();console.log(`Applied ${state.migrationStep}/${backup.operations.length} operations.`);
   if(options['test-stop-after-batch'])throw new Error('TEST interruption: server progress retained for resume.');
  }
  const final=await readCollections();if(digest(ordered(final))!==digest(ordered(simulate(backup.original,backup.operations,backup.operations.length))))throw new Error('Post-verification failed; lock retained.');
  const verify=prayerStoragePlan(final);if(verify.operations.length)throw new Error('Storage separation verification failed; lock retained.');
  await db.runTransaction(async tx=>{const current=await tx.get(control);if(current.data().lockUid!==backup.nonce)throw new Error('Migration lock changed');tx.set(control,{version:current.data().version+1,lockUid:'',updatedAt:admin.firestore.FieldValue.serverTimestamp()});});
  console.log('Verified and unlocked. IDs/own flags preserved; registry and activation settings untouched. Deploy final public-compatible rules only after independent review.');
  console.log('Next: npm run content:manifest; only SAFE CONTENT PATCH may use -- --apply. Mass/schema changes require content:app-release and owner review.');
 } finally{await app.delete();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});

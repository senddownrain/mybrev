#!/usr/bin/env node
import {createHash,randomUUID} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {openFirestoreSnapshot} from './lib/firestore-snapshot.mjs';
import {encode} from './migrate-priest-access.mjs';

export const grantDigest=rows=>createHash('sha256').update(JSON.stringify(encode([...rows].sort((a,b)=>a.id.localeCompare(b.id))))).digest('hex');
export async function grantProofMigrationPlan(directory){
 const snapshot=await openFirestoreSnapshot(directory);
 const entries=await snapshot.collectionEntries('priestDeviceGrants');
 const rows=entries?.map(({id,data})=>({id,data}));
 const targets=rows?.filter(row=>Object.hasOwn(row.data,'activationProof'))||[];
 return {rows,targets,report:{analysisSource:'local-firestore-snapshot',projectId:snapshot.manifest.projectId,ready:entries!==null,
  total:rows?.length??null,legacyProofs:entries===null?null:targets.length,active:rows?.filter(row=>row.data.status==='active').length??null,
  revoked:rows?.filter(row=>row.data.status==='revoked').length??null,ids:targets.map(row=>row.id),digest:rows?grantDigest(rows):null,
  codeRotationRequired:targets.length>0,notes:['Only activationProof is deleted. Grants, UIDs, statuses and other fields are retained. No claims are fabricated.','Deploy protected claim/legacy-read rules first, then scrub grants and rotate the code separately. No production writes without owner confirmation.']}};
}
export async function applyGrantProofMigration(db,analysis,{backupRoot='backups/priest-grant-proofs'}={}){
 if(!analysis.report.ready)throw new Error('Complete grant snapshot required');
 const readAll=async()=> (await db.collection('priestDeviceGrants').get()).docs.map(d=>({id:d.id,data:d.data()}));
 const before=await readAll();
 if(grantDigest(before)!==analysis.report.digest)throw new Error('Firestore differs from snapshot; no writes');
 if(!analysis.targets.length)return {writes:0,backup:null};
 const root=path.resolve(backupRoot),privateRoot=path.resolve('backups')+path.sep;
 if(!root.startsWith(privateRoot))throw new Error('Backup must remain under private backups/');
 await mkdir(root,{recursive:true});
 const backup=path.join(root,`${randomUUID()}.json`);
 await writeFile(backup,JSON.stringify({schemaVersion:1,projectId:analysis.report.projectId,createdAt:new Date().toISOString(),grants:encode(before)}),{flag:'wx'});
 const {FieldValue}=await import('firebase-admin/firestore');
 for(let start=0;start<analysis.targets.length;start+=200){
  const chunk=analysis.targets.slice(start,start+200);
  await db.runTransaction(async tx=>{
   const current=await Promise.all(chunk.map(row=>tx.get(db.doc(`priestDeviceGrants/${row.id}`))));
   for(let i=0;i<chunk.length;i++){
    const snapshot=current[i],row=chunk[i];
    if(!snapshot.exists || snapshot.data().activationProof!==row.data.activationProof)throw new Error('Concurrent legacy proof change; stop and re-plan. Backup retained');
   }
   // Field-only updates preserve concurrent activity, labels and revocations.
   for(const row of chunk)tx.update(db.doc(`priestDeviceGrants/${row.id}`),{activationProof:FieldValue.delete()});
  });
 }
 const after=await readAll();
 if(after.some(row=>Object.hasOwn(row.data,'activationProof')) || before.some(row=>!after.some(item=>item.id===row.id)))throw new Error('Post-verification failed; inspect private backup');
 return {writes:analysis.targets.length,backup};
}
async function main(){
 const options={snapshot:'backups/firestore-snapshot',serviceAccount:'patchs/serviceAccountKey.json'};
 const args=process.argv.slice(2);
 for(let i=0;i<args.length;i++){
  if(['--snapshot','--service-account','--approve-digest'].includes(args[i]))options[args[i].slice(2)]=args[++i];
  else if(['--apply','--protected-rules-confirmed'].includes(args[i]))options[args[i].slice(2)]=true;
  else throw new Error(`Unknown argument: ${args[i]}`);
 }
 const analysis=await grantProofMigrationPlan(options.snapshot);
 await mkdir('reports/priest-access',{recursive:true});
 await writeFile('reports/priest-access/grant-proof-migration.json',JSON.stringify(analysis.report,null,2)+'\n');
 console.log(`Local grant dry-run: ${analysis.report.total??'uncovered'} grants; ${analysis.report.legacyProofs??'unknown'} legacy fields. Report excludes proofs.`);
 if(!options.apply)return;
 if(!options['protected-rules-confirmed'] || !analysis.report.ready || options['approve-digest']!==analysis.report.digest)throw new Error('Apply requires reviewed rules, complete snapshot and matching approval digest. No live reads performed');
 const {default:admin}=await import('firebase-admin');
 const account=JSON.parse(await readFile(options['service-account']||options.serviceAccount,'utf8'));
 if(account.project_id!==analysis.report.projectId)throw new Error('Snapshot/project mismatch');
 const app=admin.initializeApp({credential:admin.credential.cert(account),projectId:account.project_id},'grant-proof-migration');
 try {
  const result=await applyGrantProofMigration(admin.firestore(app),analysis);
  console.log(`Verified ${result.writes} field-only removals. Private backup: ${result.backup||'not needed'}.`);
  console.log('Existing access preserved. Rotate activation code separately; do not revoke grants. No content manifest needed.');
 } finally {await app.delete();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});

#!/usr/bin/env node
// Offline only: source inventory + private local snapshot counts. No Firebase SDK.
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {openFirestoreSnapshot} from './lib/firestore-snapshot.mjs';

export function scenarioBudgets({hoursReads=10,readingsReads=8,staticReads=30,publicPrayers=85,publicCategories=4,protectedPrayers=21,protectedCategories=1,grants=4}={}) {
  // Explicit illustrative inputs, not measurements of the live database.
  const h=hoursReads,r=readingsReads,s=staticReads,p=publicPrayers+publicCategories;
  return {
    inputs:{hoursReads:h,readingsReads:r,staticReads:s,publicPrayers,publicCategories,protectedPrayers,protectedCategories,grants},
    coldLaunchBefore:{reads:p+s+9*(h+r)+2,writes:0},
    coldLaunchAfter:{reads:p+s+2*h+2,writes:0},
    warmLaunch:{reads:p,writes:0,note:'Prayer catalog remains server-revalidated for access safety; other complete public entries are revision-cached.'},
    calendarMonth:{incrementalContentReads:0,note:'Bundled pure calendar; initial meta/year override reads counted in launch. Newer remote definitions add returned docs.'},
    newReadingsDate:{reads:r,writes:0},
    dayEditor:{reads:'1 + proper-text doc + optional Invitatorium query + optional Compline doc',writes:'only changed documents on save'},
    priestAdminBefore:{reads:1+Math.max(grants,1),writes:0,note:'All pages loaded automatically; an empty final page costs at least one query read.'},
    priestAdminAfter:{reads:1+Math.max(Math.min(grants,25),1),writes:0},
    codeChange:{reads:2,writes:1,note:'One transaction read + one optional verification read; contention retries add reads. No grant writes.'},
    helpSave:{reads:1,writes:2},
    prayerEdit:{reads:publicPrayers+publicCategories+protectedPrayers+protectedCategories+3,writes:'changed/moved documents + control doc'},
    deviceActivation:{reads:2,writes:2,note:'Existing grant probe + authoritative status read, plus listener/Rules reads and optional hourly activity write.'},
    exclusions:'Dependent Security Rules reads, retries on contention, index-entry charges, listeners/reconnections, concurrent requests and unrelated visitors must be added. Empty queries cost >=1 read.',
  };
}
async function walk(directory) {
  const entries=await readdir(directory,{withFileTypes:true});
  const nested=await Promise.all(entries.map(e=>e.isDirectory()?walk(path.join(directory,e.name)):[path.join(directory,e.name)]));
  return nested.flat();
}
export async function auditFirestoreUsage({root=process.cwd(),snapshots=[]}={}) {
  if(!snapshots.length)throw new Error('A local --snapshot is required; this audit never reads production.');
  const observations=[];
  for(const directory of snapshots){
    const snapshot=await openFirestoreSnapshot(directory);
    const counts={};
    for(const name of snapshot.collectionPaths)counts[name]=(await snapshot.collectionEntries(name)).length;
    observations.push({snapshot:path.basename(snapshot.root),projectId:snapshot.manifest.projectId,exportedAt:snapshot.manifest.exportedAt,counts});
  }
  const candidates=[];
  for(const directory of ['src','scripts'])for(const file of await walk(path.join(root,directory))){
    if(!/\.(?:m?js|vue)$/.test(file))continue;
    const source=await readFile(file,'utf8');
    if(!/firebase|firestore|\.collection\(/i.test(source))continue;
    source.split(/\r?\n/).forEach((line,index)=>{
      const apis=[...line.matchAll(/\b(getDoc(?:s|FromServer|sFromServer|FromCache|sFromCache|OfflineAware|sOfflineAware)?|onSnapshot|runTransaction|quotaSafeTransaction|withFirestoreQuota|activationGet|activationGetMany|activationUpdate|activationBatch|writeBatch|setDoc|updateDoc|deleteDoc)\s*\(/g)].map(m=>m[1]);
      if(/\.(?:collection|doc)\(.*\.get\(/.test(line))apis.push('admin-get');
      if(/\b(?:batch|transaction|tx)\.(?:set|update|delete|commit)\(/.test(line))apis.push('batch/transaction-write');
      if(apis.length)candidates.push({file:path.relative(root,file).replaceAll('\\','/'),line:index+1,apis});
    });
  }
  return {analysisSource:'local-snapshots-and-source',productionReads:0,productionWrites:0,observations,candidates,
    exampleBudgets:scenarioBudgets(),inventoryLimit:'Static call candidates, not runtime counts; wrappers/dynamic calls require the accompanying manual audit. Snapshot counts are dated historical coverage, never current production usage.'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const snapshots=[];let output='reports/quota-audit/static-usage.json';
  for(let i=2;i<process.argv.length;i++){
    if(process.argv[i]==='--snapshot')snapshots.push(process.argv[++i]);
    else if(process.argv[i]==='--output')output=process.argv[++i];
    else throw new Error('Supported: --snapshot <local directory> [--output <report.json>]');
  }
  const report=await auditFirestoreUsage({snapshots});
  await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log(`Offline audit: ${report.candidates.length} source call sites; ${report.observations.length} local snapshots. Zero production reads/writes. Report: ${output}`);
}

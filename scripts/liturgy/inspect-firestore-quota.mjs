#!/usr/bin/env node
/** Read API/quota/Monitoring metadata only. Zero Firestore document reads/writes. */
import fs from 'node:fs';
import path from 'node:path';
import { initializeApp,cert } from 'firebase-admin/app';
import { sanitizeReleaseValue } from './lib/firestore-release-errors.mjs';
const a=process.argv.slice(2);if(a.length!==4||a[0]!=='--service-account'||a[2]!=='--out')throw Error('Usage: --service-account <private-key> --out <protected-report>');
const key=JSON.parse(fs.readFileSync(a[1]));if(key.project_id!=='ibreviaryby')throw Error('Wrong project');
const credential=cert(key);initializeApp({credential,projectId:key.project_id});
const now=new Date(),start=new Date(now-48*3600000),report={project:'ibreviaryby',observedAt:now.toISOString(),window:{start:start.toISOString(),end:now.toISOString()},quotaResetTimeZone:'America/Los_Angeles',documentReads:0,writes:0,api:{},metrics:{}};
const access=await credential.getAccessToken();
async function get(label,url){
 try{const response=await fetch(url,{headers:{authorization:'Bearer '+access.access_token},signal:globalThis.AbortSignal.timeout(30000)});const data=await response.json();report.api[label]={httpStatus:response.status,...(!response.ok?{error:sanitizeReleaseValue(data.error)}:{})};return response.ok?data:null;}
 catch(e){report.api[label]={error:sanitizeReleaseValue(e.message)};return null;}
}
const db=await get('database','https://firestore.googleapis.com/v1/projects/ibreviaryby/databases/(default)');
if(db)report.database=Object.fromEntries(['name','locationId','type','databaseEdition','freeTier','concurrencyMode'].filter(k=>k in db).map(k=>[k,db[k]]));
const billing=await get('billing','https://cloudbilling.googleapis.com/v1/projects/ibreviaryby/billingInfo');if(billing)report.billing={billingEnabled:billing.billingEnabled};
const project=await get('project','https://cloudresourcemanager.googleapis.com/v3/projects/ibreviaryby');
const projectNumber=project?.name?.split('/').at(-1);
if(projectNumber){const quota=await get('consumerQuota','https://serviceusage.googleapis.com/v1beta1/projects/'+projectNumber+'/services/firestore.googleapis.com/consumerQuotaMetrics?view=FULL&pageSize=200');if(quota)report.consumerQuotaMetrics=sanitizeReleaseValue(quota.metrics||[]);}
const descriptorUrl=new URL('https://monitoring.googleapis.com/v3/projects/ibreviaryby/metricDescriptors');descriptorUrl.searchParams.set('filter','metric.type = starts_with("firestore.googleapis.com/")');descriptorUrl.searchParams.set('pageSize','200');
const descriptors=await get('metricDescriptors',descriptorUrl);if(descriptors)report.metricDescriptors=(descriptors.metricDescriptors||[]).map(d=>({type:d.type,metricKind:d.metricKind,unit:d.unit,labels:d.labels,description:d.description}));
async function metric(name,filter,alignment='ALIGN_SUM'){
 const url=new URL('https://monitoring.googleapis.com/v3/projects/ibreviaryby/timeSeries');url.searchParams.set('filter',filter);url.searchParams.set('interval.startTime',start.toISOString());url.searchParams.set('interval.endTime',now.toISOString());url.searchParams.set('aggregation.alignmentPeriod','3600s');url.searchParams.set('aggregation.perSeriesAligner',alignment);url.searchParams.set('pageSize','1000');
 const data=await get(name,url);if(data)report.metrics[name]={timeSeries:sanitizeReleaseValue(data.timeSeries||[]),nextPageTokenPresent:Boolean(data.nextPageToken)};
}
await metric('writes','metric.type="firestore.googleapis.com/document/write_count"');
await metric('reads','metric.type="firestore.googleapis.com/document/read_count"');
await metric('requests','metric.type="firestore.googleapis.com/api/request_count"');
await metric('quotaUsage','metric.type="serviceruntime.googleapis.com/quota/allocation/usage" AND resource.labels.service="firestore.googleapis.com"','ALIGN_MAX');
// Free-tier daily counts reset at Pacific midnight; request exact current-day
// aggregation as well, rather than treating a rolling 24h sum as daily usage.
const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
const offset=Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute,+parts.second)-Math.floor(now/1000)*1000;
const midnight=new Date(Date.UTC(+parts.year,+parts.month-1,+parts.day)-offset);report.currentQuotaDayStart=midnight.toISOString();
const dailyUrl=new URL('https://monitoring.googleapis.com/v3/projects/ibreviaryby/timeSeries');dailyUrl.searchParams.set('filter','metric.type="firestore.googleapis.com/document/write_count"');dailyUrl.searchParams.set('interval.startTime',midnight.toISOString());dailyUrl.searchParams.set('interval.endTime',now.toISOString());dailyUrl.searchParams.set('aggregation.alignmentPeriod',String(Math.max(60,Math.ceil((now-midnight)/1000)))+'s');dailyUrl.searchParams.set('aggregation.perSeriesAligner','ALIGN_SUM');dailyUrl.searchParams.set('pageSize','1000');
const daily=await get('dailyWrites',dailyUrl);if(daily){report.currentDayWriteSeries=sanitizeReleaseValue(daily.timeSeries||[]);report.currentDayWriteCount=(daily.timeSeries||[]).flatMap(s=>s.points||[]).reduce((n,p)=>n+Number(p.value?.int64Value||0),0);report.dailyWriteCountComplete=!daily.nextPageToken;}
report.quotaAssessment=report.billing?.billingEnabled===false&&report.database?.freeTier===true&&report.dailyWriteCountComplete&&report.currentDayWriteCount>=20000?'daily-free-write-quota-exhausted':report.dailyWriteCountComplete&&report.currentDayWriteCount<19000?'writes-below-free-daily-limit':'not-conclusively-identified';
fs.mkdirSync(path.dirname(a[3]),{recursive:true,mode:0o700});fs.writeFileSync(a[3],JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({assessment:report.quotaAssessment,observedAt:report.observedAt,database:report.database,billing:report.billing,currentDayWriteCount:report.currentDayWriteCount,api:report.api},null,2));

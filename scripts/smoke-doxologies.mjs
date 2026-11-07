/** Real Web reader, offline cache populated with real assembled local data.
 * Start Vite on 5191, then node scripts/smoke-doxologies.mjs.
 * Every non-local browser request is aborted. No production access. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { contentFor, openLiturgySource } from './liturgy/lib/snapshot-content.mjs';
import { repairDocument } from './liturgy/audit-doxologies.mjs';
import { contentDayMap } from '../src/utils/ordoDayOptions.js';
import { openFirestoreSnapshot } from './lib/firestore-snapshot.mjs';
import { CONTENT_REVISION, CONTENT_CACHE_SCHEMA } from '../src/constants/contentRevision.js';
const base=process.env.SMOKE_BASE_URL||'http://127.0.0.1:5191';
const out='audit-evidence/doxologies';fs.mkdirSync(out,{recursive:true});
const source=await openLiturgySource({snapshotDir:'backups/firestore-snapshot'});
source.days=source.days.map(d=>repairDocument(d).after);source.daysById=new Map(source.days.map(d=>[d.id,d]));
const snapshot=await openFirestoreSnapshot('backups/firestore-snapshot');
const cache=[];
for(const date of ['2026-10-31','2026-11-01','2026-11-02','2026-11-03','2026-11-05','2026-11-06','2026-11-12','2026-11-13']) {
 const c=contentFor(source,date,{diocese:'pinsk'}),d=c.daysResult;
 const all=[...d.periodDays,...d.fixedDateDays,...(d.extraFixedDays||[]),...[...d.dynamicDaysByFeast.values()].flat(),d.periodFallback,d.officeForDead].filter(Boolean);
 cache.push([['content',date,'pinsk'],{context:c.context,ordo:c.ordo,itemsDays:[...contentDayMap(all,c.dayOptions).values()],dayOptions:c.dayOptions}]);
}
for(const name of ['completoriums','invitatoriums'])cache.push([['static',name],await snapshot.collection(name)]);
const jos=cache.find(([key])=>key[1]==='2026-11-12')[1].dayOptions.find(o=>o.dayId.includes('josaphat'));
const regular=cache.find(([key])=>key[1]==='2026-11-05')[1].dayOptions.find(o=>o.dayId!=='office-for-dead');
const saint=cache.find(([key])=>key[1]==='2026-11-01')[1].dayOptions[0];
const scenarios=[
 ...jos.templates.map(t=>({name:'josaphat-'+t.choice,date:'2026-11-12',id:t.id,hour:'lectionis'})),
 ...['lectionis','laudes','terz','sext','non','vesper','completorium'].map(hour=>({name:'dead-'+hour,date:'2026-11-02',id:'office-for-dead',hour})),
 {name:'ordinary',date:'2026-11-05',id:regular.dayId,hour:'laudes'},
 {name:'daniel',date:'2026-11-01',id:saint.dayId,hour:'laudes',daniel:true},
 {name:'solemnity-II',date:'2026-11-01',id:saint.dayId,hour:'vesper'},
 {name:'solemnity-I',date:'2026-10-31',id:cache.find(([k])=>k[1]==='2026-10-31')[1].dayOptions[0].dayId,hour:'vesper'},
];
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const results=[];
try {
 for(const profile of [{width:390,height:844,theme:'light',mode:'left-break'},{width:1280,height:900,theme:'dark',mode:'alternating-stanzas'},{width:390,height:844,theme:'dark',mode:'left-break-indent',scale:1.5}]) {
  const context=await browser.newContext({viewport:profile,colorScheme:profile.theme,serviceWorkers:'block',reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
  await page.goto(base+'/__doxology-fixture');
  await page.evaluate(async({cache,project,revision,schema,profile})=>{
   localStorage.setItem('ordoDiocese','pinsk');localStorage.setItem('ordoDioceses',JSON.stringify(['pinsk']));localStorage.setItem('themePreference',profile.theme);localStorage.setItem('psalmodyMode',profile.mode);localStorage.setItem('fontSizeMultiplier',String(profile.scale||1));
   const db=await new Promise((resolve,reject)=>{const r=window.indexedDB.open(`mybrev-public-${project}-v${schema}`,1);r.onupgradeneeded=()=>r.result.createObjectStore('entries');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
   await new Promise((resolve,reject)=>{const tx=db.transaction('entries','readwrite');for(const[key,data]of cache)tx.objectStore('entries').put(JSON.stringify({data,complete:true,revision:revision+':'}),JSON.stringify(key));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();
  },{cache,project:process.env.VITE_FIREBASE_PROJECT_ID,revision:CONTENT_REVISION,schema:CONTENT_CACHE_SCHEMA,profile});
  for(const s of scenarios){
   await page.goto(`${base}/day/${s.date}/ora/${s.id}/${s.hour}`,{waitUntil:'domcontentloaded'});
   const psalms=page.locator('.ora-psalm .psalmody-text');await psalms.first().waitFor({state:'visible',timeout:20000});
   const texts=await psalms.allTextContents();
   const counts=texts.map(t=>(t.match(/Хвала Айцу і Сыну/gu)||[]).length);
   const expected=s.daniel?[1,0,1]:counts.map(()=>1);
   assert.deepEqual(counts,expected,`${s.name} ${profile.width}`);
   const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>window.innerWidth,markers:[...document.querySelectorAll('.ora-psalm .psalm-marker')].slice(-2).map(e=>getComputedStyle(e).color)}));
   assert.equal(metrics.overflow,false,s.name);
   assert.ok(metrics.markers.length===2 && metrics.markers.every(c=>{const [r,g,b]=c.match(/\d+/g).map(Number);return r>g*1.5&&r>b*1.5}),JSON.stringify(metrics));
   // The Dead's third Lauds choice is checked and captured separately.
   const variants=s.name==='dead-laudes'?[0,1]:[0];
   for(const alt of variants){
    if(s.name==='dead-laudes')await page.getByRole('tablist',{name:'Выбар трэцяга псальма'}).getByRole('tab').nth(alt).click();
    if(s.name==='dead-laudes')assert.equal((await psalms.nth(2).textContent()).match(/Хвала Айцу і Сыну/gu)?.length,1);
    const shownPsalm=psalms.nth(s.name==='dead-laudes'?2:s.daniel?1:0);
    const ending=s.daniel?shownPsalm.locator('p').last():shownPsalm.locator('p').filter({hasText:'Хвала Айцу і Сыну'}).first();
    await ending.scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(out,`${profile.width}-${profile.theme}-${profile.mode}-${s.name}-${alt}.png`)});
    results.push({scenario:s.name,alternative:alt,profile,counts,metrics,url:page.url()});
   }
  }
  assert.deepEqual(errors,[]);await context.close();
 }
}finally{await browser.close();}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify({screenshots:results.length,allPassed:true}));

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
import { getBundledCalendarDefinitions } from '../src/utils/ordo/definitions.js';
import { repairCommonDocument, sourceResponseEvidence } from './liturgy/lib/common-text-audit.mjs';
import { CONTENT_REVISION, CONTENT_CACHE_SCHEMA } from '../src/constants/contentRevision.js';
const base=process.env.SMOKE_BASE_URL||'http://127.0.0.1:5191';
const out='docs/audits/liturgical-common-texts-2026-11/web';fs.mkdirSync(out,{recursive:true});
const source=await openLiturgySource({snapshotDir:'backups/firestore-snapshot-public'});
const evidence=sourceResponseEvidence(process.cwd());
source.days=source.days.map(d=>repairCommonDocument(repairDocument(d).after,evidence).after);source.daysById=new Map(source.days.map(d=>[d.id,d]));
const snapshot=await openFirestoreSnapshot('backups/firestore-snapshot-public');
const cache=[];
for(const date of ['2026-10-31','2026-11-01','2026-11-02','2026-11-03','2026-11-05','2026-11-06','2026-11-12','2026-11-13']) {
 const c=contentFor(source,date,{diocese:'pinsk'}),d=c.daysResult;
 const all=[...d.periodDays,...d.fixedDateDays,...(d.extraFixedDays||[]),...[...d.dynamicDaysByFeast.values()].flat(),d.periodFallback,d.officeForDead].filter(Boolean);
 cache.push([['content',date,'pinsk',`calendar:${getBundledCalendarDefinitions().revision}:0`],{context:c.context,ordo:c.ordo,itemsDays:[...contentDayMap(all,c.dayOptions).values()],dayOptions:c.dayOptions}]);
}
for(const name of ['completoriums','invitatoriums'])cache.push([['static',name],await snapshot.collection(name)]);
const jos=cache.find(([key])=>key[1]==='2026-11-12')[1].dayOptions.find(o=>o.dayId.includes('josaphat'));
const regular=cache.find(([key])=>key[1]==='2026-11-05')[1].dayOptions.find(o=>o.dayId!=='office-for-dead');
const saint=cache.find(([key])=>key[1]==='2026-11-01')[1].dayOptions[0];
const captureMode=process.env.SMOKE_CAPTURE==='readings';
const scenarios=[
 ...jos.templates.flatMap(t=>['lectionis','laudes','terz','sext','non','vesper'].map(hour=>({name:'josaphat-'+t.choice+'-'+hour,date:'2026-11-12',id:t.id,hour}))),
 ...['lectionis','laudes','terz','sext','non','vesper','completorium'].map(hour=>({name:'dead-'+hour,date:'2026-11-02',id:'office-for-dead',hour})),
 {name:'ordinary',date:'2026-11-05',id:regular.dayId,hour:'laudes'},
 {name:'daniel',date:'2026-11-01',id:saint.dayId,hour:'laudes',daniel:true},
 {name:'solemnity-II',date:'2026-11-01',id:saint.dayId,hour:'vesper'},
 {name:'solemnity-I',date:'2026-10-31',id:cache.find(([k])=>k[1]==='2026-10-31')[1].dayOptions[0].dayId,hour:'vesper'},
];
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const results=[];
try {
 const checkedScenarios=captureMode?scenarios.filter(s=>['josaphat-martyr-one-laudes','josaphat-martyr-one-vesper','josaphat-pastors-laudes'].includes(s.name)):scenarios;
 for(const profile of [{width:390,height:844,theme:'light',mode:'left-break'},{width:1280,height:900,theme:'dark',mode:'alternating-stanzas'},{width:390,height:844,theme:'dark',mode:'left-break-indent',scale:1.5}]) {
  const context=await browser.newContext({viewport:profile,colorScheme:profile.theme,serviceWorkers:'block',reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
  await page.goto(base+'/__doxology-fixture');
  await page.evaluate(async({cache,project,revision,schema,profile})=>{
   localStorage.setItem('ordoDiocese','pinsk');localStorage.setItem('ordoDioceses',JSON.stringify(['pinsk']));localStorage.setItem('themePreference',profile.theme);localStorage.setItem('psalmodyMode',profile.mode);localStorage.setItem('fontSizeMultiplier',String(profile.scale||1));
   const db=await new Promise((resolve,reject)=>{const r=window.indexedDB.open(`mybrev-public-${project}-v${schema}`,1);r.onupgradeneeded=()=>r.result.createObjectStore('entries');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
   await new Promise((resolve,reject)=>{const tx=db.transaction('entries','readwrite');for(const[key,data]of cache)tx.objectStore('entries').put(JSON.stringify({data,complete:true,revision:revision+':'}),JSON.stringify(key));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();
  },{cache,project:'demo-mybrev-audit',revision:CONTENT_REVISION,schema:CONTENT_CACHE_SCHEMA,profile});
  for(const s of checkedScenarios){
   console.log('checking',profile.width,profile.theme,s.name);
   await page.goto(`${base}/day/${s.date}/ora/${s.id}/${s.hour}`,{waitUntil:'domcontentloaded'});
   const psalms=page.locator('.ora-psalm .psalmody-text');
   try { await psalms.first().waitFor({state:'visible',timeout:20000}); } catch(error) {
    await page.screenshot({path:path.join(out,'failure.png')});
    fs.writeFileSync(path.join(out,'failure.txt'),(await page.locator('body').innerText())+'\n'+errors.join('\n'));throw error;
   }
   const texts=await psalms.allTextContents();
   const counts=texts.map(t=>(t.match(/Хвала Айцу і Сыну/gu)||[]).length);
   const expected=texts.map(text=>/Благаславім Айца і Сына/u.test(text)?0:1);
   assert.deepEqual(counts,expected,`${s.name} ${profile.width}`);
   const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>window.innerWidth,markers:[...document.querySelectorAll('.ora-psalm .psalm-marker')].slice(-2).map(e=>getComputedStyle(e).color)}));
   assert.equal(metrics.overflow,false,s.name);
   if(captureMode){
    const replies=await page.locator('p').filter({hasText:/^КАРОТКІ РЭСПАНСОРЫЙ/u}).first().evaluate(el=>{const lines=[];for(let p=el.nextElementSibling;p&&lines.length<6;p=p.nextElementSibling){if(/^[КН]\. /u.test(p.textContent.trim()))lines.push(p.textContent.trim());}return lines;});
    assert.equal(replies.length,6);assert.match(replies[4],/Хвала Айцу і Сыну, і Духу Святому/u);
    assert.ok(replies[1].length>30&&replies[5].length>30,'full attested answers');
   }
   const roles=await page.locator('.intercessions__response').allTextContents();
   if(s.name.includes('josaphat-martyr-one-vesper'))assert.equal(roles.length,0,'repeated refrains do not turn petitions into responses');
   const headings=await page.locator('p').filter({hasText:/^КАРОТКАЕ ЧЫТАННЕ/u}).count();
   if(['laudes','terz','sext','non','vesper'].includes(s.hour))assert.ok(headings>=1,s.name+' short reading heading');
   assert.ok(metrics.markers.length===2 && metrics.markers.every(c=>{const [r,g,b]=c.match(/\d+/g).map(Number);return r>g*1.5&&r>b*1.5}),JSON.stringify(metrics));
   // The Dead's third Lauds choice is checked and captured separately.
   const variants=s.name==='dead-laudes'?[0,1]:[0];
   for(const alt of variants){
    if(s.name==='dead-laudes')await page.getByRole('tablist',{name:'Выбар трэцяга псальма'}).getByRole('tab').nth(alt).click();
    if(s.name==='dead-laudes')assert.equal((await psalms.nth(2).textContent()).match(/Хвала Айцу і Сыну/gu)?.length,1);
    const shownPsalm=psalms.nth(s.name==='dead-laudes'?2:s.daniel?1:0);
    const ending=s.daniel?shownPsalm.locator('p').last():shownPsalm.locator('p').filter({hasText:'Хвала Айцу і Сыну'}).first();
    await ending.scrollIntoViewIfNeeded();
    await page.waitForFunction(p => Number(getComputedStyle(p).opacity) > 0.9, await ending.elementHandle());
    if(captureMode||['josaphat-martyr-one-laudes','josaphat-martyr-one-vesper','josaphat-pastors-lectionis','dead-laudes','ordinary'].includes(s.name)){
     const anchor=page.locator('.intercessions').first();if(captureMode)await page.locator('p').filter({hasText:/^КАРОТКІ РЭСПАНСОРЫЙ/u}).first().scrollIntoViewIfNeeded();else if(await anchor.count())await anchor.scrollIntoViewIfNeeded();
     await page.screenshot({path:path.join(out,`${captureMode?'reading-':''}${profile.width}-${profile.theme}-${s.name}-${alt}.png`),animations:'disabled'});
    }
    results.push({scenario:s.name,alternative:alt,profile,counts,metrics,headings,responseParagraphs:roles.length,url:page.url()});
   }
  }
  assert.deepEqual(errors,[]);await context.close();
 }
}finally{await browser.close();}
fs.writeFileSync(path.join(out,captureMode?'results-short-responsories.json':'results.json'),JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify({states:results.length,allPassed:true}));

// Exercises real hour routes from cached fixtures. Zero Firebase requests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { getCalendarDefinitions } from '../src/utils/ordo/definitions.js';
import { CONTENT_REVISION, CONTENT_CACHE_SCHEMA } from '../src/constants/contentRevision.js';
const base=process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4174';
const output=process.env.OFFICE_EVIDENCE_DIR || 'outputs/office-presentation';
fs.mkdirSync(output,{recursive:true});
const day=JSON.parse(fs.readFileSync('patchs/json/ordinary-w5-d1-fixed-day.json','utf8'));
day.id=day._id;
const short='<p><span style="color:red">КАРОТКАЕ ЧЫТАННЕ Рым 13, 11б. 12–13а</span></p><p>Нязменены тэкст чытання.</p><p>Кароткі рэспансорый</p><p style="margin-bottom:30px"><span style="color:red">К.</span> Першы адказ * з працягам.</p><p><br></p><p style="margin-top:30px"><span style="color:red">Н.</span> Другі адказ.</p><div><span style="color:red">К.</span> Хвала Айцу і Сыну.<br><span style="color:red">Н.</span> І Духу Святому.</div>';
for(const key of ['laudesR','vesperR','vesper1R','sext1R','sext2R','sext3R']) day[key]=short;
day.officeOfReadingsR1='<p>З Кнігі прарока Ісаі</p><p>Словы першага чытання.</p>'+short.replace('КАРОТКАЕ ЧЫТАННЕ Рым 13, 11б. 12–13а','Рэспансорый 1 Ян 3, 1а–2');
day.officeOfReadingsR2=day.officeOfReadingsR1.replace('першага','другога');
const date='2026-02-08';
const content={context:{periodType:'ordinary',periodWeek:5,dayOfWeek:1},itemsDays:[day],dayOptions:[{key:day.id,dayId:day.id,title:day._dayName,day,templates:[{id:day.id,day}]}]};
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true});
const results=[];
try {
 for(const theme of ['light','dark','marian']) {
  const context=await browser.newContext({viewport:{width:390,height:900},serviceWorkers:'block'});
  await context.route('**/*', route=>new URL(route.request().url()).origin!==new URL(base).origin?route.abort():route.continue());
  const page=await context.newPage();
  page.setDefaultTimeout(20000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.setFixedTime(new Date(`${date}T12:00:00Z`));
  await page.goto(base);
  await page.evaluate(async ({content,date,theme,revision,schema,project,calendar})=>{
   localStorage.setItem('themePreference',theme);
   const req=window.indexedDB.open(`mybrev-public-${project}-v${schema}`,1);
   const db=await new Promise((resolve,reject)=>{req.onupgradeneeded=()=>req.result.createObjectStore('entries');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
   await new Promise((resolve,reject)=>{const tx=db.transaction('entries','readwrite');tx.objectStore('entries').put(JSON.stringify({data:content,complete:true,revision:`${revision}:`}),JSON.stringify(['content',date,'minsk-mohilev',calendar]));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
  },{content,date,theme,revision:CONTENT_REVISION,schema:CONTENT_CACHE_SCHEMA,project:process.env.VITE_FIREBASE_PROJECT_ID,calendar:`calendar:${getCalendarDefinitions().revision}:0`});
  await context.addInitScript(()=>Object.defineProperty(navigator,'onLine',{get:()=>false}));
  for(const hour of ['laudes','lectionis','vesper','sext']) {
   await page.goto(`${base}/day/${date}/ora/${day.id}/${hour}`);
   await page.locator('[data-office-reference]').first().waitFor().catch(async e=>{console.log(await page.locator('body').innerText());console.log(errors);throw e;});
   for(const width of [320,360,390,768,1440]) for(const scale of [1,2]) {
    await page.setViewportSize({width,height:900});
    await page.evaluate(scale=>{document.documentElement.style.setProperty('--font-size-multiplier',scale); document.querySelector('.v-application').style.setProperty('--font-size-multiplier',scale);},scale);
    const metrics=await page.evaluate(()=>{
     const refs=[...document.querySelectorAll('[data-office-reference]')].map(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect(),p=el.parentElement.getBoundingClientRect();return {text:el.textContent,transform:s.textTransform,weight:s.fontWeight,align:s.textAlign,right:r.right,parentRight:p.right,font:s.fontSize,y:r.y,labelBottom:el.previousElementSibling?.getBoundingClientRect().bottom,color:s.color};});
     const responses=[...document.querySelectorAll('[data-office-response]')].map(el=>({margin:getComputedStyle(el).marginTop,padding:getComputedStyle(el).paddingTop}));
     const headings=[...document.querySelectorAll('.liturgical-hour-column .ora-title,.liturgical-hour-column .ora-header,.liturgical-hour-column [data-liturgical-heading]')].map(el=>{const s=getComputedStyle(el);return [s.fontFamily,s.fontSize,s.fontWeight,s.fontStyle,s.textTransform].join('|');});
     return {refs,responses,headings,overflow:document.documentElement.scrollWidth>window.innerWidth};
    });
    assert.equal(metrics.overflow,false,`${theme}/${hour}/${width}/${scale} overflow`);
    assert.equal(new Set(metrics.headings).size,1,JSON.stringify(metrics.headings));
    assert.ok(metrics.refs.every(r=>r.transform==='none'&&r.weight==='400'&&r.align==='right'&&Math.abs(r.right-r.parentRight)<2),JSON.stringify(metrics.refs));
    assert.ok(metrics.responses.length>=4);
    assert.ok(metrics.responses.every(r=>r.margin==='0px'&&r.padding==='0px'));
    if(width===320&&scale===2) assert.ok(metrics.refs.some(r=>r.y>=r.labelBottom-1),JSON.stringify({theme,hour,width,scale,refs:metrics.refs}));
    results.push({theme,hour,width,scale,metrics});
    if(width===320&&scale===2) await page.locator('.liturgical-hour-column').screenshot({path:`${output}/${theme}-${hour}-320-200.png`});
   }
  }
  assert.deepEqual(errors,[]);await context.close();
 }
 fs.writeFileSync(`${output}/results.json`,JSON.stringify({base,revision:CONTENT_REVISION,cases:results.length,results},null,2));
 console.log(`PASS ${results.length} real-hour theme/viewport/font cases; Firebase requests blocked`);
} finally {await browser.close();}

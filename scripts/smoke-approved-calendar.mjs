import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright-core';
const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4173';
const out = process.env.SOURCE_EVIDENCE_DIR || 'reports/ordo-approved/ui';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const results=[];
try {
  for(const theme of ['light','dark','marian']) for(const width of [320,390,768,1440]){
    const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
    await context.addInitScript(({theme})=>{localStorage.setItem('themePreference',theme);localStorage.setItem('ordoDiocese','vitebsk');localStorage.setItem('ordoDioceses','["vitebsk"]');},{theme});
    await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${base}/documents/proper-calendar`);
    await page.locator('.calendar-page').last().waitFor();
    const november=await page.locator('[data-page="12"]').innerText();
    assert.match(november.replace(/\s+/gu,' '),/У Мінска-Магілёўскай архідыяцэзіі, Пінскай і Віцебскай дыяцэзіі:/u);
    assert.equal(await page.locator('.calendar-page').count(),13);
    const pdf=await context.request.get(`${base}/documents/proper-calendar.pdf`);
    assert.equal(pdf.status(),200);
    assert.equal(createHash('sha256').update(await pdf.body()).digest('hex'),'a55dc34c89317bd0a4b683ea84b46941213aa2b981d0a9de1fe3ebeb71dc9696');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    await page.locator('[data-page="12"]').screenshot({path:`${out}/november-${width}-${theme}.png`});
    await page.goto(`${base}/ordo/2026-09-08`);
    await page.locator('.ordo-day').waitFor();
    await page.getByText('Найсв. Панны Марыі Браслаўскай',{exact:true}).first().waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    await page.screenshot({path:`${out}/braslau-${width}-${theme}.png`,fullPage:true});
    // Exercise the actual mounted view and runtime module, not a new page.
    await page.evaluate(async()=>{const {setOrdoDioceses}=await import('/src/utils/ordoDiocese.js');setOrdoDioceses(['minsk-mohilev']);});
    await page.getByText('Нараджэнне Найсв. Панны Марыі',{exact:true}).first().waitFor();
    assert.doesNotMatch(await page.locator('.ordo-day').innerText(),/Браслаўскай/);
    await page.evaluate(async()=>{const {setOrdoDioceses}=await import('/src/utils/ordoDiocese.js');setOrdoDioceses(['vitebsk']);});
    await page.getByText('Найсв. Панны Марыі Браслаўскай',{exact:true}).first().waitFor();
    const memo=await page.evaluate(async()=>{
      const d=await import('/src/utils/ordo/definitions.js');const runtime=await import('/src/utils/ordo/runtime.js');
      const old=runtime.resolveRuntimeDay('2026-09-08',{diocese:'vitebsk'});const bundle=d.getBundledCalendarDefinitions();
      d.setCalendarDefinitions({...bundle,revision:bundle.revision+1,dioceseOverrides:bundle.dioceseOverrides.map(x=>x.celebrationId==='our-lady-braslau'?{...x,title:'Тэставае абнаўленне Браслаўскай'}:x)});
      const next=runtime.resolveRuntimeDay('2026-09-08',{diocese:'vitebsk'});
      return {changed:old!==next,title:next.primary.title};
    });
    assert.deepEqual(memo,{changed:true,title:'Тэставае абнаўленне Браслаўскай'});
    await page.getByText('Тэставае абнаўленне Браслаўскай',{exact:true}).first().waitFor();
    await page.evaluate(async()=>{const d=await import('/src/utils/ordo/definitions.js');const bundle=d.getBundledCalendarDefinitions();d.setCalendarDefinitions({...bundle,revision:bundle.revision+2});});
    await page.getByText('Найсв. Панны Марыі Браслаўскай',{exact:true}).first().waitFor();
    await context.setOffline(true);
    const offline=await page.evaluate(async()=>{const r=await import('/src/utils/ordo/runtime.js');return r.resolveRuntimeDay('2027-11-16',{diocese:'vitebsk'}).primary.rank;});
    assert.equal(offline,'memoria');
    assert.deepEqual(errors,[]);
    results.push({width,theme,documentPages:13,pdfHash:'MATCH',november16:'MATCH',dioceseSwitch:'PASS',mountedEpochUpdate:'PASS',monotonicRollback:'PASS',warmOffline:'PASS',overflow:false,pageErrors:errors});
    console.log(`${width}/${theme}: new PDF URL, 16 November text, mounted diocese/epoch/rollback and warm offline: PASS`);
    await context.close();
  }
}finally{await browser.close();}
await fs.writeFile(`${out}/approved-ui-results.json`,JSON.stringify(results,null,2)+'\n');

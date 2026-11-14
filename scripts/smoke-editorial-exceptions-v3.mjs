/** Offline viewer/export/SHA guard smoke. Exports test decisions only to /tmp. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'mybrev-exceptions-'));
const out='docs/audits/liturgical-common-texts-2026-11/v3/web';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1000,height:850},acceptDownloads:true}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
 // Managed Chromium blocks file navigation; run the exact standalone bytes
 // in a blank local page, with all network requests still blocked.
 await page.setContent(fs.readFileSync('docs/audits/liturgical-common-texts-2026-11/v3/exceptions.html','utf8'));
 assert.equal(await page.locator('article').count(),10);assert.equal(await page.locator('select').count(),15);
 await page.locator('summary').first().click();assert.ok(await page.locator('.source').first().isVisible());
 const download=page.waitForEvent('download');await page.locator('#export').click();const file=path.join(temporary,'decisions.json');await(await download).saveAs(file);
 const json=JSON.parse(fs.readFileSync(file));assert.equal(json.decisions.length,15);assert.ok(json.decisions.every(d=>d.status==='defer'));
 execFileSync(process.execPath,['scripts/liturgy/import-editorial-decisions-v3.mjs','--decisions',file,'--out',path.join(temporary,'validated.json')]);
 json.decisions[0].fieldSha='0'.repeat(64);fs.writeFileSync(file,JSON.stringify(json));assert.throws(()=>execFileSync(process.execPath,['scripts/liturgy/import-editorial-decisions-v3.mjs','--decisions',file,'--out',path.join(temporary,'stale.json')],{stdio:'pipe'}));
 assert.deepEqual(errors,[]);await page.screenshot({path:path.join(out,'exceptions.png'),fullPage:false});
 fs.writeFileSync(out+'/exception-viewer-smoke.json',JSON.stringify({passed:true,groups:10,fields:10,replies:15,export:'15 defer decisions in temporary directory only; no owner decisions inferred',validShaImport:'passed-local-plan-only',staleShaImport:'rejected',network:'blocked',sourceWrites:0,productionWrites:0},null,2)+'\n');
}finally{await browser.close();fs.rmSync(temporary,{recursive:true,force:true});}

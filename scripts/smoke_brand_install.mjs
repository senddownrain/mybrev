// Verify the built manifest, install and launch the PWA in an isolated profile,
// then check the new drawer brand in light/dark. Remote services are blocked.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.join(root,'branding/validation');
const base='http://127.0.0.1:4173/';
const manifestId=base;
const executablePath=process.env.BENCHMARK_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
await mkdir(output,{recursive:true});
const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'preview','--host','127.0.0.1','--port','4173','--strictPort'],{cwd:root,stdio:'ignore',windowsHide:true});
let context, browserSession, installed=false;
const results={manifest: {}, install:false, standalone:false, themes:[], remoteRequestsBlocked:0};
try {
  for(let i=0;i<80;i++) {
    try { if((await fetch(base)).ok) break; } catch {}
    await new Promise(resolve=>setTimeout(resolve,500));
    if(i===79) throw Error('Preview server failed to become ready');
  }
  const manifest=await (await fetch(new URL('manifest.webmanifest',base))).json();
  assert.equal(manifest.name,'Каталіцкі малітоўнік');
  assert.equal(manifest.short_name,'Малітоўнік');
  assert.equal(manifest.start_url,'.');
  assert.equal(manifest.display,'standalone');
  assert.equal(manifest.theme_color,'#6B4A32');
  assert.equal(manifest.background_color,'#F5F1E8');
  assert.deepEqual(manifest.icons.filter(x=>x.purpose==='maskable').map(x=>x.sizes).sort(),['192x192','512x512']);
  for(const icon of manifest.icons) {
    const response=await fetch(new URL(icon.src,base));
    assert.equal(response.status,200,icon.src);
    assert.equal(sha(Buffer.from(await response.arrayBuffer())),sha(await readFile(path.join(root,'public',icon.src))),icon.src);
  }
  results.manifest={name:manifest.name,short_name:manifest.short_name,icons:manifest.icons.length,identity:manifestId};
  context=await chromium.launchPersistentContext(path.join(output,'chrome-profile'),{
    executablePath,headless:true,viewport:{width:390,height:844},
    args:['--no-first-run','--no-default-browser-check'],timeout:90000,
  });
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(['127.0.0.1','localhost'].includes(url.hostname) || ['data:','blob:'].includes(url.protocol)) return route.continue();
    results.remoteRequestsBlocked++;
    return route.abort();
  });
  await context.addInitScript(()=>{
    if(location.protocol==='http:' && !localStorage.getItem('themePreference')) localStorage.setItem('themePreference','light');
  });
  const page=await context.newPage();
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:90000});
  await page.locator('.v-application').waitFor({timeout:60000});
  const pageSession=await context.newCDPSession(page);
  const browserManifest=await pageSession.send('Page.getAppManifest');
  assert.equal(browserManifest.errors.length,0,JSON.stringify(browserManifest.errors));
  await page.evaluate(async()=>{
    const registration=await navigator.serviceWorker.ready;
    if(!navigator.serviceWorker.controller) await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
    return Boolean(registration.active);
  });
  browserSession=await context.browser().newBrowserCDPSession();
  await browserSession.send('PWA.install',{manifestId,installUrlOrBundleUrl:base});
  installed=true;
  results.install=true;
  await browserSession.send('PWA.changeAppUserSettings',{manifestId,displayMode:'standalone'});
  results.osState=await browserSession.send('PWA.getOsAppState',{manifestId});
  const installedPagePromise=context.waitForEvent('page',{timeout:30000});
  await browserSession.send('PWA.launch',{manifestId});
  const installedPage=await installedPagePromise;
  await installedPage.waitForLoadState('domcontentloaded',{timeout:60000});
  await installedPage.locator('.v-application').waitFor({timeout:60000});
  await installedPage.waitForFunction(()=>matchMedia('(display-mode: standalone)').matches,{},{timeout:15000});
  results.standalone=await installedPage.evaluate(()=>matchMedia('(display-mode: standalone)').matches);
  assert.ok(results.standalone,'The installed app must launch as standalone');
  for(const mode of ['light','dark']) {
    await installedPage.evaluate(mode=>localStorage.setItem('themePreference',mode),mode);
    await installedPage.reload({waitUntil:'domcontentloaded'});
    await installedPage.locator('.v-application').waitFor();
    const trigger=installedPage.getByRole('button',{name:/меню/i}).first();
    await trigger.click();
    const logo=installedPage.locator('.drawer-logo');
    await logo.waitFor({state:'visible'});
    await logo.evaluate(image=>image.decode());
    assert.equal(await logo.getAttribute('src'),'/app-brand-96.png');
    assert.equal(await logo.evaluate(image=>image.naturalWidth),96);
    const appearance=await installedPage.evaluate(()=>document.documentElement.dataset.appearance || 'light');
    assert.equal(appearance,mode);
    await installedPage.screenshot({path:path.join(output,`pwa-installed-${mode}.png`)});
    results.themes.push({mode,drawerLogo:true,appearance});
  }
  results.pageErrors=pageErrors;
  assert.deepEqual(pageErrors,[],'Page must initialise without script errors');
  await writeFile(path.join(output,'pwa-install.json'),JSON.stringify(results,null,2)+'\n');
  console.log('PASS: built icon bytes; manifest identity; PWA installed and launched standalone; approved drawer brand in light/dark.');
} finally {
  if(installed && browserSession) await browserSession.send('PWA.uninstall',{manifestId}).catch(()=>{});
  await context?.close();
  server.kill();
}

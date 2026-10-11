/** Real Vue, Firebase Auth/Firestore SDKs and local emulators only. */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { initializeApp,deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { codeProof } from '../src/utils/priestCode.mjs';
import { prayerStoragePlan } from '../src/utils/prayerStoragePlan.mjs';

for(const name of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST'])assert.match(process.env[name]||'',/^(127\.0\.0\.1|localhost):\d+$/,'Local emulators required; live requests forbidden');
const firestoreHost=process.env.FIRESTORE_EMULATOR_HOST,authHost=process.env.FIREBASE_AUTH_EMULATOR_HOST,projectId='demo-rules';
const registration=await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'priest-ui@example.test',password:'Local-test-password-2345',returnSecureToken:true})});
const result=await registration.json();
if(!registration.ok)throw new Error(`Auth emulator user setup failed: ${result.error?.message}`);
const primaryUid=result.localId;
const owner=initializeApp({projectId},'priest-ui-seed'),db=getFirestore(owner);
const initialCode='A2B3-C4D5-E6F7-G8H9-J2K3-L4M5';
await db.doc(`admins/${primaryUid}`).set({priestAccess:true});
for(const name of ['prayers','prayerCategories','priestProtectedPrayers','priestProtectedCategories','priestDeviceGrants'])await db.recursiveDelete(db.collection(name));
const content=new Map([['prayers',[{id:'public',title:'Публічная малітва',text:'Публічны тэкст малітвы дастатковай даўжыні.',tags:['public'],priestOnly:false},{id:'closed',title:'Закрытая малітва',text:'Тэставы закрыты тэкст',tags:['closed'],priestOnly:true}]],['prayerCategories',[{id:'public',name:'Публічная катэгорыя',tags:['public'],priestOnly:false},{id:'closed',name:'Закрытая катэгорыя',tags:['closed'],priestOnly:true},{id:'child',name:'Даччыная катэгорыя',tags:['child'],parentId:'closed',priestOnly:false}]]]);
for(const [name,rows] of prayerStoragePlan(content).desired)for(const {id,...data} of rows)await db.doc(`${name}/${id}`).set(data);
await db.doc('priestContentControl/state').set({version:0,lockUid:'',updatedAt:new Date()});
await db.doc('priestAccess/settings').set({activeCodeProof:await codeProof(initialCode),changedAt:new Date(),helpText:''});
await db.doc('priestDeviceGrants/flutter-fixture').set({uid:'flutter-fixture',status:'active',deviceName:'Samsung Galaxy S23',client:'Flutter',platform:'Android',label:'а. Яўгеній',activatedAt:new Date(),lastActiveAt:new Date(),revokedAt:null,activationProof:await codeProof(initialCode)});
const firebaseModule=`import {initializeApp} from 'firebase/app';import {initializeFirestore,memoryLocalCache,connectFirestoreEmulator} from 'firebase/firestore';import {getAuth,connectAuthEmulator,signInWithEmailAndPassword} from 'firebase/auth';
export const firebaseApp=initializeApp({projectId:'demo-rules',apiKey:'demo-key',authDomain:'demo-rules.firebaseapp.com'});export const db=initializeFirestore(firebaseApp,{localCache:memoryLocalCache()});connectFirestoreEmulator(db,'${firestoreHost.split(':')[0]}',${firestoreHost.split(':')[1]});
const auth=getAuth(firebaseApp);connectAuthEmulator(auth,'http://${authHost}',{disableWarnings:true});await auth.authStateReady();if(!auth.currentUser)await signInWithEmailAndPassword(auth,'priest-ui@example.test','Local-test-password-2345');`;
const server=await createServer({configFile:false,resolve:{alias:{'@':fileURLToPath(new URL('../src',import.meta.url))}},optimizeDeps:{noDiscovery:true,entries:[],include:['vue','pinia','vue-router','vuetify','vuetify/components','markdown-it','firebase/app','firebase/auth','firebase/firestore']},server:{host:'127.0.0.1',port:5173,strictPort:true},plugins:[vue(),vuetify({styles:false}),{
 name:'priest-local-emulator-only',enforce:'pre',configureServer(server){server.middlewares.use((req,res,next)=>{if(!req.url.startsWith('/__priest_ui'))return next();res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="app"></div><script type="module" src="/tests/ui/priest-harness.mjs"></script></body></html>');});},
 transform(source,id){const file=id.replaceAll('\\','/').split('?')[0];
  if(file.endsWith('/src/plugins/firebase.js'))return firebaseModule;
  if(file.endsWith('/src/stores/auth.js'))return `import {defineStore} from 'pinia';export const useAuthStore=defineStore('auth',()=>({isAdmin:true,canManagePriestAccess:true,loading:false,init:async()=>{}}));`;
  if(file.endsWith('/src/plugins/priestFirebase.js'))return `import {connectFirestoreEmulator} from 'firebase/firestore';import {connectAuthEmulator} from 'firebase/auth';const testAuth=auth=>{connectAuthEmulator(auth,'http://${authHost}',{disableWarnings:true});return auth;};\n`+source
   .replace("return { app, db: initializeFirestore(app, { localCache: memoryLocalCache() }) };",`const db=initializeFirestore(app,{localCache:memoryLocalCache()});connectFirestoreEmulator(db,'${firestoreHost.split(':')[0]}',${firestoreHost.split(':')[1]});return {app,db};`)
   .replace('initializeAuth(priestFirebase.app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] })','testAuth(initializeAuth(priestFirebase.app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] }))')
   .replace('initializeAuth(priestEditorFirebase.app, { persistence: inMemoryPersistence })','testAuth(initializeAuth(priestEditorFirebase.app, { persistence: inMemoryPersistence }))');
 }}]});
await server.listen();
const browser=await chromium.launch({executablePath:process.env.BENCHMARK_BROWSER_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context=await browser.newContext({viewport:{width:1280,height:900}});
await context.route(/https?:\/\//,route=>{const url=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(url.hostname)?route.continue():route.abort();});
const page=await context.newPage();page.setDefaultTimeout(60000);const failures=[];
page.on('pageerror',error=>{failures.push(error.message);console.log('UI runtime error:',error.stack);});
await mkdir('reports/priest-access',{recursive:true});
try {
 await page.goto('http://127.0.0.1:5173/__priest_ui',{waitUntil:'domcontentloaded'});
 await page.getByText('Samsung Galaxy S23',{exact:true}).waitFor();
 await page.screenshot({path:'reports/priest-access/admin-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Згенераваць новы код'}).click();await page.getByRole('dialog').getByText('Раней зарэгістраваныя прылады захаваюць доступ.',{exact:false}).waitFor();await page.getByRole('dialog').getByRole('button',{name:'Змяніць код',exact:true}).click();
 await page.locator('.new-code').waitFor();let currentCode=await page.locator('.new-code').innerText();assert.equal((await db.doc('priestDeviceGrants/flutter-fixture').get()).data().status,'active');
 await page.getByRole('button',{name:'Схаваць',exact:true}).click();
 await page.getByLabel('Дзе атрымаць код?',{exact:true}).fill('Звярніцеся да адміністратара парафіі.');await page.getByRole('button',{name:'Захаваць інструкцыю',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('button.v-btn--loading'));
 assert.equal((await db.doc('priestAccessPublic/help').get()).data().helpText,'Звярніцеся да адміністратара парафіі.');
 currentCode=await page.evaluate(async()=>{const service=await import('/src/services/priestAccessService.js');const [replacement]=await Promise.all([service.replacePriestCode({generate:true}),service.savePriestHelp('Кантакт адміністратара парафіі.')]);return replacement.code;});
 assert.equal((await db.doc('priestAccessPublic/help').get()).data().helpText,'Кантакт адміністратара парафіі.');assert.equal((await db.doc('priestDeviceGrants/flutter-fixture').get()).data().status,'active');
 await page.getByLabel('Подпіс',{exact:true}).fill('а. Андрэй');await page.getByRole('button',{name:'Захаваць подпіс',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('button.v-btn--loading'));assert.equal((await db.doc('priestDeviceGrants/flutter-fixture').get()).data().label,'а. Андрэй');
 await page.getByRole('button',{name:'Адклікаць доступ',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Адклікаць',exact:true}).click();await page.getByText('Статус: Адкліканы',{exact:true}).waitFor();
 await page.getByRole('dialog').waitFor({state:'hidden'});
 const closeNotice=page.getByRole('button',{name:'Закрыць',exact:true});if(await closeNotice.isVisible()){await closeNotice.click();await closeNotice.waitFor({state:'hidden'});}
 for(const width of [320,390]){await page.setViewportSize({width,height:844});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`reports/priest-access/admin-mobile-${width}.png`,fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'No mobile overflow');}
 await page.evaluate(()=>window.__priestUi.router.push('/categories'));await page.getByRole('heading',{name:'Катэгорыі і тэгі',exact:true}).waitFor();
 await page.getByLabel('Рэдагаваць катэгорыю Публічная катэгорыя').click();await page.getByRole('dialog').getByLabel('Толькі для святароў',{exact:true}).check();await page.getByRole('dialog').getByRole('button',{name:'Захаваць',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
 assert.equal((await db.doc('prayers/public').get()).exists,false);assert.equal((await db.doc('priestProtectedPrayers/public').get()).exists,true);assert.equal((await db.doc('priestProtectedCategories/child').get()).data().priestOnly,false);
 await page.screenshot({path:'reports/priest-access/categories-mobile.png',fullPage:true});
 await page.evaluate(()=>window.__priestUi.router.push('/settings'));await page.getByLabel('Код актывацыі',{exact:true}).fill(currentCode);await page.getByLabel('Назва прылады / імя',{exact:true}).fill('Тэставая вэб-прылада');await page.getByRole('button',{name:'Адкрыць доступ',exact:true}).click();await page.getByText('Доступ актываваны',{exact:false}).waitFor();
 const identity=await page.evaluate(async()=>{const {getAuth}=await import('/node_modules/.vite/deps/firebase_auth.js');const {firebaseApp}=await import('/src/plugins/firebase.js');const {getPriestAuth}=await import('/src/plugins/priestFirebase.js');return {admin:getAuth(firebaseApp).currentUser.uid,device:(await getPriestAuth()).currentUser.uid};});
 assert.equal(identity.admin,primaryUid);assert.notEqual(identity.device,primaryUid);
 await page.reload({waitUntil:'domcontentloaded'});await page.getByText('Доступ актываваны',{exact:false}).waitFor();
 const restored=await page.evaluate(async()=>{const {getPriestAuth}=await import('/src/plugins/priestFirebase.js');const {getAuth}=await import('/node_modules/.vite/deps/firebase_auth.js');const {firebaseApp}=await import('/src/plugins/firebase.js');return {device:(await getPriestAuth()).currentUser.uid,admin:getAuth(firebaseApp).currentUser.uid};});assert.deepEqual(restored,identity);
 await page.screenshot({path:'reports/priest-access/settings-active.png',fullPage:true});
 await page.getByRole('button',{name:'Выключыць доступ',exact:true}).click();await page.getByRole('button',{name:'Адкрыць доступ',exact:true}).waitFor();
 await page.waitForFunction(()=>!document.querySelector('button.v-btn--loading'));assert.equal((await db.doc(`priestDeviceGrants/${identity.device}`).get()).data().status,'revoked');
 const remaining=await page.evaluate(async()=>{const {getPriestAuth}=await import('/src/plugins/priestFirebase.js');return (await getPriestAuth()).currentUser;});assert.equal(remaining,null);assert.deepEqual(failures,[]);
 console.log('PASS UI: real admin/device Auth separation and persistence, SDK activation/disable, code rotation, registry labels/revoke, atomic category movement, mobile 320/390 and desktop. No live requests.');
} catch(error){console.log('Visible text:',(await page.locator('body').innerText()).slice(0,2500));await page.screenshot({path:'reports/priest-access/ui-failure.png',fullPage:true}).catch(()=>{});throw error;}
finally{await context.close();await browser.close();await server.close();await deleteApp(owner);}

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
const uiPort=Number(process.env.PRIEST_UI_PORT||5173);
const registration=await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'priest-ui@example.test',password:'Local-test-password-2345',returnSecureToken:true})});
const result=await registration.json();
if(!registration.ok)throw new Error(`Auth emulator user setup failed: ${result.error?.message}`);
const primaryUid=result.localId;
const owner=initializeApp({projectId},'priest-ui-seed'),db=getFirestore(owner);
const initialCode='A2B3-C4D5-E6F7-G8H9-J2K3-L4M5';
await db.doc(`admins/${primaryUid}`).set({priestAccess:true});
for(const name of ['prayers','prayerCategories','priestProtectedPrayers','priestProtectedCategories','priestDeviceGrants','priestActivationClaims'])await db.recursiveDelete(db.collection(name));
const content=new Map([['prayers',[{id:'public',title:'Публічная малітва',text:'Публічны тэкст малітвы дастатковай даўжыні.',tags:['public'],priestOnly:false},{id:'closed',title:'Закрытая малітва',text:'Тэставы закрыты тэкст',tags:['closed'],priestOnly:true}]],['prayerCategories',[{id:'public',name:'Публічная катэгорыя',tags:['public'],priestOnly:false},{id:'closed',name:'Закрытая катэгорыя',tags:['closed'],priestOnly:true},{id:'child',name:'Даччыная катэгорыя',tags:['child'],parentId:'closed',priestOnly:false}]]]);
for(const [name,rows] of prayerStoragePlan(content).desired)for(const {id,...data} of rows)await db.doc(`${name}/${id}`).set(data);
await db.doc('priestContentControl/state').set({version:0,lockUid:'',updatedAt:new Date()});
await db.doc('priestAccess/settings').set({activeCodeProof:await codeProof(initialCode),changedAt:new Date(),helpText:''});
await db.doc('priestDeviceGrants/flutter-fixture').set({uid:'flutter-fixture',status:'active',deviceName:'Samsung Galaxy S23',client:'Flutter',platform:'Android',label:'а. Яўгеній',activatedAt:new Date(),lastActiveAt:new Date(),revokedAt:null});
const firebaseModule=`import {initializeApp} from 'firebase/app';import {initializeFirestore,memoryLocalCache,connectFirestoreEmulator} from 'firebase/firestore';import {getAuth,connectAuthEmulator,signInWithEmailAndPassword} from 'firebase/auth';
export const firebaseApp=initializeApp({projectId:'demo-rules',apiKey:'demo-key',authDomain:'demo-rules.firebaseapp.com'});export const db=initializeFirestore(firebaseApp,{localCache:memoryLocalCache()});connectFirestoreEmulator(db,'${firestoreHost.split(':')[0]}',${firestoreHost.split(':')[1]});
const auth=getAuth(firebaseApp);connectAuthEmulator(auth,'http://${authHost}',{disableWarnings:true});await auth.authStateReady();if(!auth.currentUser)await signInWithEmailAndPassword(auth,'priest-ui@example.test','Local-test-password-2345');`;
const server=await createServer({configFile:false,cacheDir:'node_modules/.vite-priest-ui',resolve:{alias:{'@':fileURLToPath(new URL('../src',import.meta.url))}},optimizeDeps:{noDiscovery:true,entries:[],include:['vue','pinia','vue-router','vuetify','vuetify/components','markdown-it','firebase/app','firebase/auth','firebase/firestore','firebase/firestore/lite']},server:{host:'127.0.0.1',port:uiPort,strictPort:true},plugins:[vue(),vuetify({styles:false}),{
 name:'priest-local-emulator-only',enforce:'pre',configureServer(server){server.middlewares.use((req,res,next)=>{if(!req.url.startsWith('/__priest_ui'))return next();res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="app"></div><script type="module" src="/tests/ui/priest-harness.mjs"></script></body></html>');});},
 transform(source,id){const file=id.replaceAll('\\','/').split('?')[0];
  if(file.endsWith('/src/services/priestAccessService.js'))return source
   .replace('async function guardedRead(read, operation) {',`async function guardedRead(read, operation) { if(operation==='device-list'&&window.__priestUi)window.__priestUi.devicePageCalls=(window.__priestUi.devicePageCalls||0)+1; if(operation==='code-verification'&&window.__priestUi?.failNextVerification){const code=window.__priestUi.failNextVerification;delete window.__priestUi.failNextVerification;throw firestoreActionError({code},operation);}`)
   .replaceAll('quotaSafeTransaction(runTransaction, db,',`quotaSafeTransaction(async(...args)=>{if(window.__priestUi){window.__priestUi.transactionCalls=(window.__priestUi.transactionCalls||0)+1;if(window.__priestUi.failNextTransaction){const code=window.__priestUi.failNextTransaction;delete window.__priestUi.failNextTransaction;throw Object.assign(new Error('Local injected failure'),{code});}}return runTransaction(...args);}, db,`);
  if(file.endsWith('/src/plugins/firebase.js'))return firebaseModule;
  if(file.endsWith('/src/stores/auth.js'))return `import {defineStore} from 'pinia';export const useAuthStore=defineStore('auth',()=>({isAdmin:true,canManagePriestAccess:true,loading:false,init:async()=>{}}));`;
  if(file.endsWith('/src/plugins/priestFirebase.js'))return `import {connectFirestoreEmulator} from 'firebase/firestore';import {connectFirestoreEmulator as connectActivationEmulator} from 'firebase/firestore/lite';import {connectAuthEmulator} from 'firebase/auth';let activationEmulatorConnected=false,editorWriteEmulatorConnected=false;const testAuth=auth=>{connectAuthEmulator(auth,'http://${authHost}',{disableWarnings:true});return auth;};\n`+source
   .replace('return getActivationFirestore(priestFirebase.app);',`const db=getActivationFirestore(priestFirebase.app);if(!activationEmulatorConnected){connectActivationEmulator(db,'${firestoreHost.split(':')[0]}',${firestoreHost.split(':')[1]});activationEmulatorConnected=true;}return db;`)
   .replace('return getActivationFirestore(priestEditorFirebase.app);',`const db=getActivationFirestore(priestEditorFirebase.app);if(!editorWriteEmulatorConnected){connectActivationEmulator(db,'${firestoreHost.split(':')[0]}',${firestoreHost.split(':')[1]});editorWriteEmulatorConnected=true;}return db;`)
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
 // The UI assertion below waits for the app and its Firestore data. Waiting
 // for every Vite module here adds a separate, shorter cold-start deadline.
 await page.goto(`http://127.0.0.1:${uiPort}/__priest_ui`,{waitUntil:'commit'});
 await page.getByText('Samsung Galaxy S23',{exact:true}).waitFor({timeout:120000});
 await page.screenshot({path:'reports/priest-access/admin-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Згенераваць новы код'}).click();await page.getByRole('dialog').getByText('Раней зарэгістраваныя прылады захаваюць доступ.',{exact:false}).waitFor();await page.getByRole('dialog').getByRole('button',{name:'Змяніць код',exact:true}).click();
 await page.locator('.new-code').waitFor();let currentCode=await page.locator('.new-code').innerText();assert.equal((await db.doc('priestDeviceGrants/flutter-fixture').get()).data().status,'active');
 await page.getByRole('button',{name:'Схаваць',exact:true}).click();
 const beforeQuota=(await db.doc('priestAccess/settings').get()).data().activeCodeProof;
 const callsBefore=await page.evaluate(()=>{window.__priestUi.failNextTransaction='resource-exhausted';return window.__priestUi.transactionCalls;});
 await page.getByRole('button',{name:'Згенераваць новы код'}).click();await page.getByRole('dialog').getByRole('button',{name:'Змяніць код',exact:true}).click();
 await page.getByText('Вычарпана квота Firebase.',{exact:false}).waitFor();await page.getByRole('dialog').waitFor({state:'hidden'});
 assert.equal(await page.locator('.new-code').count(),0);assert.equal((await db.doc('priestAccess/settings').get()).data().activeCodeProof,beforeQuota);
 assert.equal(await page.evaluate(()=>window.__priestUi.transactionCalls),callsBefore+1,'quota write failure is attempted exactly once');
 await page.evaluate(()=>{window.__priestUi.failNextVerification='resource-exhausted';});
 await page.getByRole('button',{name:'Згенераваць новы код'}).click();await page.getByRole('dialog').getByRole('button',{name:'Змяніць код',exact:true}).click();
 await page.getByText('Код захаваны серверам.',{exact:false}).waitFor();currentCode=await page.locator('.new-code').innerText();
 assert.equal((await db.doc('priestAccess/settings').get()).data().activeCodeProof,await codeProof(currentCode));
 assert.equal(await page.getByRole('button',{name:'Згенераваць новы код'}).isEnabled(),false);
 assert.equal(await page.getByRole('button',{name:'Капіяваць',exact:true}).isEnabled(),true);
 await page.getByRole('button',{name:'Абнавіць',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('button.v-btn--loading'));
 assert.equal(await page.locator('.new-code').innerText(),currentCode,'manual metadata refresh cannot discard the one-time code');
 await page.screenshot({path:'reports/priest-access/quota-acknowledged-code.png',fullPage:true});
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
 const pageFixtures=Array.from({length:25},(_,i)=>`page-fixture-${String(i).padStart(2,'0')}`);
 const seedPages=db.batch();for(const uid of pageFixtures)seedPages.set(db.doc(`priestDeviceGrants/${uid}`),{uid,status:'active',deviceName:uid,client:'Web',platform:'Test',label:'',activatedAt:new Date(),lastActiveAt:new Date(),revokedAt:null});await seedPages.commit();
 const pagesBefore=await page.evaluate(()=>window.__priestUi.devicePageCalls);
 await page.getByRole('button',{name:'Абнавіць',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.device-row').length===25&&!document.querySelector('button.v-btn--loading'));
 assert.equal(await page.evaluate(()=>window.__priestUi.devicePageCalls),pagesBefore+1,'initial registry load requests only one page');
 assert.equal(await page.getByText('page-fixture-24',{exact:true}).count(),0);
 await page.getByRole('button',{name:'Паказаць яшчэ',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.device-row').length===26&&!document.querySelector('button.v-btn--loading'));
 assert.equal(await page.evaluate(()=>window.__priestUi.devicePageCalls),pagesBefore+2,'remaining page requires an explicit click');
 const removePages=db.batch();for(const uid of pageFixtures)removePages.delete(db.doc(`priestDeviceGrants/${uid}`));await removePages.commit();
 await page.getByRole('button',{name:'Абнавіць',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.device-row').length===1&&!document.querySelector('button.v-btn--loading'));
 for(const width of [320,390]){await page.setViewportSize({width,height:844});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`reports/priest-access/admin-mobile-${width}.png`,fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'No mobile overflow');}
 await page.evaluate(()=>window.__priestUi.router.push('/categories'));await page.getByRole('heading',{name:'Катэгорыі і тэгі',exact:true}).waitFor();
 await page.getByLabel('Рэдагаваць катэгорыю Публічная катэгорыя').click();await page.getByRole('dialog').getByLabel('Толькі для святароў',{exact:true}).check();await page.getByRole('dialog').getByRole('button',{name:'Захаваць',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
 assert.equal((await db.doc('prayers/public').get()).exists,false);assert.equal((await db.doc('priestProtectedPrayers/public').get()).exists,true);assert.equal((await db.doc('priestProtectedCategories/child').get()).data().priestOnly,false);
 await page.screenshot({path:'reports/priest-access/categories-mobile.png',fullPage:true});
 await page.evaluate(()=>window.__priestUi.router.push('/settings'));await page.getByLabel('Код актывацыі',{exact:true}).fill(currentCode);await page.getByLabel('Назва прылады / імя',{exact:true}).fill('Тэставая вэб-прылада');await page.getByRole('button',{name:'Адкрыць доступ',exact:true}).click();await page.getByText('Доступ актываваны',{exact:false}).waitFor();
 const identity=await page.evaluate(async()=>{const {getAuth}=await import('/node_modules/.vite-priest-ui/deps/firebase_auth.js');const {firebaseApp}=await import('/src/plugins/firebase.js');const {getPriestAuth}=await import('/src/plugins/priestFirebase.js');return {admin:getAuth(firebaseApp).currentUser.uid,device:(await getPriestAuth()).currentUser.uid};});
 assert.equal(identity.admin,primaryUid);assert.notEqual(identity.device,primaryUid);
 const grantData=(await db.doc(`priestDeviceGrants/${identity.device}`).get()).data();assert.equal('activationProof' in grantData,false);
 const claimData=(await db.doc(`priestActivationClaims/${identity.device}`).get()).data();assert.equal(claimData.uid,identity.device);assert.equal(claimData.activationProof,await codeProof(currentCode));
 const localClaim=await page.evaluate(uid=>window.__priestUi.localClaim(uid),identity.device);
 assert.equal(localClaim,null,'Proof-bearing claim never enters the reader SDK cache');
 assert.equal(await page.evaluate(uid=>window.__priestUi.claimDenied(uid),identity.device),true,'Real Anonymous owner cannot read claim from server');
 await page.reload({waitUntil:'domcontentloaded'});await page.getByText('Доступ актываваны',{exact:false}).waitFor();
 const restored=await page.evaluate(async()=>{const {getPriestAuth}=await import('/src/plugins/priestFirebase.js');const {getAuth}=await import('/node_modules/.vite-priest-ui/deps/firebase_auth.js');const {firebaseApp}=await import('/src/plugins/firebase.js');return {device:(await getPriestAuth()).currentUser.uid,admin:getAuth(firebaseApp).currentUser.uid};});assert.deepEqual(restored,identity);
 await page.screenshot({path:'reports/priest-access/settings-active.png',fullPage:true});
 await page.getByRole('button',{name:'Выключыць доступ',exact:true}).click();await page.getByRole('button',{name:'Адкрыць доступ',exact:true}).waitFor();
 await page.waitForFunction(()=>!document.querySelector('button.v-btn--loading'));assert.equal((await db.doc(`priestDeviceGrants/${identity.device}`).get()).data().status,'revoked');
 const remaining=await page.evaluate(async()=>{const {getPriestAuth}=await import('/src/plugins/priestFirebase.js');return (await getPriestAuth()).currentUser;});assert.equal(remaining,null);assert.deepEqual(failures,[]);
 console.log('PASS UI: quota write fails once; acknowledged code survives verification quota and refresh; concurrent code/help save; registry manual pagination; real admin/device Auth separation and persistence, SDK activation/disable, labels/revoke, atomic category movement, mobile 320/390 and desktop. No live requests.');
} catch(error){console.log('Visible text:',(await page.locator('body').innerText()).slice(0,2500));await page.screenshot({path:'reports/priest-access/ui-failure.png',fullPage:true}).catch(()=>{});throw error;}
finally{await context.close();await browser.close();await server.close();await deleteApp(owner);}

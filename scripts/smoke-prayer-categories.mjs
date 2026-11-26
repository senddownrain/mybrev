/** Real Vue, Firebase Auth/Firestore SDKs and local emulators only. */
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
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
const registration=await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'categories-ui@example.test',password:'Local-test-password-2345',returnSecureToken:true})});
const result=await registration.json();
if(!registration.ok)throw new Error(`Auth emulator user setup failed: ${result.error?.message}`);
const primaryUid=result.localId;
const owner=initializeApp({projectId},'categories-ui-seed'),db=getFirestore(owner);
const initialCode='A2B3-C4D5-E6F7-G8H9-J2K3-L4M5';
await db.doc(`admins/${primaryUid}`).set({priestAccess:true});
for(const name of ['prayers','prayerCategories','priestProtectedPrayers','priestProtectedCategories','priestDeviceGrants','priestActivationClaims'])await db.recursiveDelete(db.collection(name));
const fixture=JSON.parse(await readFile(new URL('../shared/prayer-categories/fixture.json',import.meta.url)));
const content=new Map([['prayers',[...fixture.prayers.map(p=>({...p,text:'Synthetic local fixture text, not production content.'})),...Array.from({length:75},(_,i)=>({id:`catalog-${i}`,title:`Каталог ${String(i).padStart(2,'0')}`,tags:[],text:'Synthetic local catalog fixture.'}))]],['prayerCategories',fixture.categories]]);
content.get('prayerCategories').push({id:'nav-folder',name:'Fixture grouping folder',parentId:'root',order:30,tags:[],prayerIds:[],iconKey:'church'},{id:'nav-folder-child',name:'Fixture grouping child',parentId:'nav-folder',order:0,tags:[],prayerIds:['catalog-74'],iconKey:'candle'});
const commentTitle = 'Пра малітву';
const commentText = [
  '## Перад пачаткам',
  'Гэты прыклад паказвае, як выглядаюць **вылучэнні** ў каментарыі да раздзела. Тэкст можна прачытаць у зручным для сябе памеры.',
  '> Чытайце павольна і ўважліва.',
  '- Знайдзіце ціхую хвіліну.\n- Прачытайце _тэкст_ да канца.',
  ':::rubric\nМожна зрабіць кароткую паўзу.\n:::',
].join('\n\n');
content.get('prayerCategories').find(({ id }) => id === 'closed-child').comment = { content: 'PRIVATE COMMENT FIXTURE' };
content.get('prayerCategories').push({
  id: 'unpublished-comment', name: 'Unpublished fixture', tags: [], prayerIds: [], status: 'draft',
  comment: { content: 'UNPUBLISHED COMMENT FIXTURE' },
});
for(const [name,rows] of prayerStoragePlan(content).desired)for(const {id,...data} of rows)await db.doc(`${name}/${id}`).set(data);
await db.doc('priestContentControl/state').set({version:0,lockUid:'',updatedAt:new Date()});
await db.doc('priestAccess/settings').set({activeCodeProof:await codeProof(initialCode),changedAt:new Date(),helpText:''});
const firebaseModule=`import {initializeApp} from 'firebase/app';import {initializeFirestore,memoryLocalCache,connectFirestoreEmulator} from 'firebase/firestore';import {getAuth,connectAuthEmulator,signInWithEmailAndPassword} from 'firebase/auth';
export const firebaseApp=initializeApp({projectId:'demo-rules',apiKey:'demo-key',authDomain:'demo-rules.firebaseapp.com'});export const db=initializeFirestore(firebaseApp,{localCache:memoryLocalCache()});connectFirestoreEmulator(db,'${firestoreHost.split(':')[0]}',${firestoreHost.split(':')[1]});
const auth=getAuth(firebaseApp);connectAuthEmulator(auth,'http://${authHost}',{disableWarnings:true});await auth.authStateReady();if(!auth.currentUser)await signInWithEmailAndPassword(auth,'categories-ui@example.test','Local-test-password-2345');`;
const server=await createServer({configFile:false,cacheDir:'node_modules/.vite-categories-ui',resolve:{alias:{'@':fileURLToPath(new URL('../src',import.meta.url))}},optimizeDeps:{noDiscovery:true,entries:[],include:['vue','pinia','vue-router','vuetify','vuetify/components','markdown-it','node-html-parser','turndown','firebase/app','firebase/auth','firebase/firestore','firebase/firestore/lite']},server:{host:'127.0.0.1',port:uiPort,strictPort:true,warmup:{clientFiles:['tests/ui/prayer-categories-harness.mjs','src/views/admin/PrayerCategories.vue','src/components/prayers/PrayersList.vue','src/components/prayers/PrayerView.vue']}},plugins:[vue(),vuetify({styles:false}),{
 name:'category-local-emulator-only',enforce:'pre',configureServer(server){server.middlewares.use((req,res,next)=>{if(!req.url.startsWith('/__category_ui'))return next();res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="app"></div><script type="module" src="/tests/ui/prayer-categories-harness.mjs"></script></body></html>');});},
 transform(source,id){const file=id.replaceAll('\\','/').split('?')[0];
  if(file.endsWith('/src/plugins/firebase.js'))return firebaseModule;
  if(file.endsWith('/src/stores/auth.js'))return `import {defineStore} from 'pinia';import {ref} from 'vue';export const useAuthStore=defineStore('auth',()=>({isAdmin:ref(sessionStorage.getItem('categoryPublic')!=='true'),canManagePriestAccess:true,loading:false,user:ref({uid:'fixture-admin'}),init:async()=>{}}));`;
  if(file.endsWith('/src/plugins/priestFirebase.js'))return `import {connectFirestoreEmulator} from 'firebase/firestore';import {connectFirestoreEmulator as connectActivationEmulator} from 'firebase/firestore/lite';import {connectAuthEmulator} from 'firebase/auth';let activationEmulatorConnected=false,editorWriteEmulatorConnected=false;const testAuth=auth=>{connectAuthEmulator(auth,'http://${authHost}',{disableWarnings:true});return auth;};\n`+source
   .replace('return getActivationFirestore(priestFirebase.app);',`const db=getActivationFirestore(priestFirebase.app);if(!activationEmulatorConnected){connectActivationEmulator(db,'${firestoreHost.split(':')[0]}',${firestoreHost.split(':')[1]});activationEmulatorConnected=true;}return db;`)
   .replace('return getActivationFirestore(priestEditorFirebase.app);',`const db=getActivationFirestore(priestEditorFirebase.app);if(!editorWriteEmulatorConnected){connectActivationEmulator(db,'${firestoreHost.split(':')[0]}',${firestoreHost.split(':')[1]});editorWriteEmulatorConnected=true;}return db;`)
   .replace("return { app, db: initializeFirestore(app, { localCache: memoryLocalCache() }) };",`const db=initializeFirestore(app,{localCache:memoryLocalCache()});connectFirestoreEmulator(db,'${firestoreHost.split(':')[0]}',${firestoreHost.split(':')[1]});return {app,db};`)
   .replace('initializeAuth(priestFirebase.app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] })','testAuth(initializeAuth(priestFirebase.app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] }))')
   .replace('initializeAuth(priestEditorFirebase.app, { persistence: inMemoryPersistence })','testAuth(initializeAuth(priestEditorFirebase.app, { persistence: inMemoryPersistence }))');
 }}]});
await server.listen();
await server.waitForRequestsIdle();
const browser=await chromium.launch({executablePath:process.env.BENCHMARK_BROWSER_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1280,height:900}});
await context.route(/https?:\/\//,route=>{const url=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(url.hostname)?route.continue():route.abort();});
const page=await context.newPage();page.setDefaultTimeout(20000);page.setDefaultNavigationTimeout(120000);const failures=[];
page.on('pageerror',error=>{failures.push(error.message);console.error(error.stack);});
page.on('console',msg=>{if(msg.type()==='error')console.error('Browser:',msg.text());});
await mkdir('reports/prayer-categories',{recursive:true});
const evidence=process.env.CATEGORY_UI_EVIDENCE || 'docs/prayer-category-evidence';await mkdir(evidence,{recursive:true});
const commentEvidence = 'reports/prayer-categories/comments';
await mkdir(commentEvidence, { recursive: true });
const overflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'No document overflow');
const adminDialog=()=>page.getByRole('dialog').filter({has:page.getByText('Рэдагаванне катэгорыі',{exact:true})});
try {
 await page.goto(`http://127.0.0.1:${uiPort}/__category_ui`,{waitUntil:'domcontentloaded'});
 await page.getByLabel('Рэдагаваць катэгорыю Марыйныя малітвы',{exact:true}).waitFor({timeout:120000});
 await page.getByLabel('Рэдагаваць катэгорыю Таямніцы ружанца',{exact:true}).waitFor();
 // Create a comment-only leaf with the actual category form and CodeMirror editor.
 await page.getByLabel('Дадаць падкатэгорыю: Fixture grouping folder', { exact: true }).click();
 const newCategory = page.getByRole('dialog').filter({ has: page.getByText('Новая катэгорыя', { exact: true }) });
 await newCategory.getByLabel('Назва катэгорыі', { exact: true }).fill('Прыклад раздзела');
 await newCategory.getByLabel('Загаловак каментарыя', { exact: true }).fill(commentTitle);
 await newCategory.getByRole('button', { name: 'Markdown', exact: true }).click();
 await newCategory.getByRole('textbox', { name: 'Каментарый', exact: true }).fill(commentText);
 await newCategory.getByLabel('Крыніца каментарыя', { exact: true }).fill('Ойча наш');
 await page.getByRole('option', { name: /Ойча наш/ }).click();
 await newCategory.getByRole('button', { name: 'Захаваць', exact: true }).click();
 await newCategory.waitFor({ state: 'hidden' });
 const created = (await db.collection('prayerCategories').where('name', '==', 'Прыклад раздзела').get()).docs[0];
 assert.ok(created);
 const commentCategoryId = created.id;
 assert.equal(created.data().parentId, 'nav-folder');
 assert.deepEqual(created.data().prayerIds, []);
 assert.deepEqual(created.data().comment, { title: commentTitle, content: commentText, sourceId: 'ojcha-nash-2022' });
 await page.reload();
 await page.getByLabel('Рэдагаваць катэгорыю Прыклад раздзела', { exact: true }).click();
 await adminDialog().getByRole('button', { name: 'Markdown', exact: true }).click();
 assert.equal(await adminDialog().getByLabel('Загаловак каментарыя', { exact: true }).inputValue(), commentTitle);
 await adminDialog().getByText(/Малітоўнік «Ойча наш»/).waitFor();
 assert.ok((await adminDialog().getByRole('textbox', { name: 'Каментарый', exact: true }).innerText()).includes('**вылучэнні**'));
 // A blank title uses the neutral default. Keep the original text and source.
 await adminDialog().getByLabel('Загаловак каментарыя', { exact: true }).fill(' ');
 await adminDialog().getByRole('button', { name: 'Захаваць', exact: true }).click();
 await adminDialog().waitFor({ state: 'hidden' });
 assert.deepEqual((await created.ref.get()).data().comment, { content: commentText, sourceId: 'ojcha-nash-2022' });
 assert.equal(await page.locator('.category-list [aria-expanded]').count(),0,'admin hierarchy has no disclosure controls');
 await page.getByLabel('Пошук па назве або тэгу',{exact:true}).fill('Таямніцы ружанца');
 await page.getByLabel('Рэдагаваць катэгорыю Таямніцы ружанца',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('Рэдагаваць катэгорыю Марыйныя малітвы',{exact:true}).count(),1,'search preserves context');
 await page.getByLabel('Пошук па назве або тэгу',{exact:true}).fill('');
 await page.getByLabel('Рэдагаваць катэгорыю Марыйныя малітвы',{exact:true}).click();
 await adminDialog().locator('.icon-picker__trigger').click();
 assert.equal(await adminDialog().getByRole('radio').count(),48);
 await adminDialog().locator('[data-icon-key=immaculate-heart]').click();
 await adminDialog().getByText('Выніковы склад · 4',{exact:true}).waitFor();
 await adminDialog().getByRole('button',{name:'Выбраць малітвы',exact:true}).click();
 const picker=page.getByRole('dialog').filter({has:page.getByLabel('Пошук малітваў па назве',{exact:true})});
 assert.ok(await picker.locator('.picker-list input[type=checkbox]').count() <= 30,'picker DOM is paginated');
 await picker.getByLabel('Пошук малітваў па назве',{exact:true}).fill('Каталог 01');
 await picker.getByLabel('Каталог 01',{exact:true}).check();
 await picker.getByRole('button',{name:'Скасаваць',exact:true}).click();
 await adminDialog().getByRole('button',{name:'Выбраць малітвы',exact:true}).click();
 await picker.getByLabel('Пошук малітваў па назве',{exact:true}).fill('Каталог 01');
 assert.equal(await picker.getByLabel('Каталог 01',{exact:true}).isChecked(),false,'cancel discards selection');
 await picker.getByLabel('Каталог 01',{exact:true}).check();
 await picker.getByLabel('Пошук малітваў па назве',{exact:true}).fill('Fixture both');
 await picker.getByLabel('Fixture both',{exact:true}).uncheck();
 await picker.getByLabel('Толькі выбраныя',{exact:true}).check();
 assert.equal(await picker.locator('.picker-list input[type=checkbox]').count(),0,'removed tag member is absent from selected-only');
 await picker.getByLabel('Пошук малітваў па назве',{exact:true}).fill('');
 await picker.getByLabel('Fixture manual',{exact:true}).waitFor();
 assert.equal(await picker.getByLabel('Fixture manual',{exact:true}).isChecked(),true);
 await picker.getByRole('button',{name:'Гатова',exact:true}).click();
 await adminDialog().getByText('Выніковы склад · 5',{exact:true}).waitFor();
 assert.ok((await adminDialog().locator('.membership-list').innerText()).includes('Fixture both'),'tag member remains');
 await adminDialog().getByLabel('Парадак',{exact:true}).fill('12');
 await adminDialog().getByRole('button',{name:'Захаваць',exact:true}).click();
 await page.getByRole('dialog').waitFor({state:'hidden'});
 let root=(await db.doc('prayerCategories/root').get()).data();
 assert.deepEqual(root.prayerIds,['manual','shared-private','catalog-1']);assert.equal(root.order,12);assert.equal(root.iconId,'folder');assert.equal(root.iconKey,'immaculate-heart');
 assert.deepEqual((await db.doc('prayers/both').get()).data().tags,['root-tag']);
 await page.reload();await page.getByLabel('Рэдагаваць катэгорыю Марыйныя малітвы',{exact:true}).click();
 await adminDialog().getByText('Асобныя малітвы · 3',{exact:true}).waitFor();
 await adminDialog().getByRole('button',{name:'Скасаваць',exact:true}).click();
 await page.getByLabel('Выдаліць катэгорыю Марыйныя малітвы',{exact:true}).click();
 assert.equal(await page.getByRole('dialog').getByRole('button',{name:'Выдаліць',exact:true}).isDisabled(),true);
 await page.getByRole('dialog').getByRole('button',{name:'Скасаваць',exact:true}).click();
 // Real atomic manual membership transfer via the admin editor.
 await page.getByLabel('Рэдагаваць катэгорыю Марыйныя малітвы',{exact:true}).click();
 await adminDialog().getByLabel('Толькі для святароў',{exact:true}).check();
 await adminDialog().getByRole('button',{name:'Захаваць',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
 assert.equal((await db.doc('prayers/manual').get()).exists,false);assert.equal((await db.doc('priestProtectedPrayers/manual').get()).exists,true);
 assert.equal((await db.doc('priestProtectedCategories/leaf').get()).data().priestOnly,false);
 await page.getByLabel('Рэдагаваць катэгорыю Марыйныя малітвы',{exact:true}).click();
 await adminDialog().getByLabel('Толькі для святароў',{exact:true}).uncheck();
 await adminDialog().getByRole('button',{name:'Захаваць',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
 assert.equal((await db.doc('prayers/manual').get()).exists,true);
 // Empty folder validation and metadata persistence.
 await page.getByRole('button',{name:'Новая катэгорыя',exact:true}).click();
 await page.getByRole('dialog').getByLabel('Назва катэгорыі',{exact:true}).fill('Fixture new folder');
 await page.getByRole('dialog').getByRole('button',{name:'Захаваць',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
 const folder=(await db.collection('prayerCategories').where('name','==','Fixture new folder').get()).docs[0];assert.deepEqual(folder.data().tags,[]);assert.deepEqual(folder.data().prayerIds,[]);
 // Last tag removal in the actual UI preserves both parent and descendants.
 await page.getByRole('tab',{name:'Тэгі',exact:true}).click();
 await page.getByLabel('Выдаліць тэг root-tag з усіх малітваў',{exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Выдаліць усюды',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
 assert.equal((await db.doc('prayerCategories/root').get()).exists,true);assert.equal((await db.doc('prayerCategories/middle').get()).exists,true);
 assert.deepEqual((await db.doc('prayerCategories/root').get()).data().tags,[]);
 assert.ok((await db.doc('prayerCategories/root').get()).data().prayerIds.includes('manual'));
 // Restore only synthetic local fixtures for repeatable visual and public navigation checks.
 await db.doc('prayerCategories/root').update({tags:['root-tag']});for(const id of ['tagged','both'])await db.doc(`prayers/${id}`).update({tags:['root-tag']});
 await page.getByRole('tab',{name:'Катэгорыі',exact:true}).click();
 for(const theme of ['light','dark','marian'])for(const width of [320,375,768,1280]){
  await page.setViewportSize({width,height:900});await page.evaluate(theme=>{window.__categoryUi.settings.themePreference=theme;},theme);
  await page.locator(`.v-theme--${theme}`).first().waitFor();await overflow();
  await page.screenshot({path:`reports/prayer-categories/admin-${theme}-${width}.png`,fullPage:true});
  if(theme==='light'&&width===1280)await page.screenshot({path:`${evidence}/admin-light-1280.png`,fullPage:true});
 }
 await page.setViewportSize({width:375,height:850});await page.evaluate(()=>{window.__categoryUi.settings.themePreference='dark';});
 await page.getByLabel('Рэдагаваць катэгорыю Марыйныя малітвы',{exact:true}).click();await overflow();
 await adminDialog().locator('.dialog-fields').evaluate(el=>{el.scrollTop=el.scrollHeight;});
 await page.screenshot({path:`${evidence}/editor-dark-375.png`,fullPage:true});
 for(const theme of ['light','dark','marian'])for(const width of [320,375,768,1280]){
  await page.setViewportSize({width,height:900});await page.evaluate(theme=>{window.__categoryUi.settings.themePreference=theme;},theme);await overflow();
  assert.ok(await adminDialog().getByRole('button',{name:'Захаваць',exact:true}).isVisible());
 }
 await adminDialog().getByRole('button',{name:'Скасаваць',exact:true}).click();
 // The public path uses actual stores, public SDK reads, drawer and reader.
 await page.evaluate(async()=>{sessionStorage.setItem('categoryPublic','true');window.__categoryUi.auth.isAdmin=false;await window.__categoryUi.router.push('/prayers');});
 await page.waitForFunction(()=>!window.__categoryUi.prayers.isLoading&&!window.__categoryUi.categories.isLoading);
 assert.ok(!JSON.stringify(await page.evaluate(()=>window.__categoryUi.prayers.prayers)).includes('PRIVATE'));
 await page.getByRole('button',{name:'Меню катэгорый',exact:true}).click();
 const drawer=page.locator('.app-drawer');
 const rootLink=drawer.getByRole('link',{name:'Марыйныя малітвы',exact:true});
 assert.equal(await drawer.getByRole('link',{name:'Ружанец',exact:true}).count(),0,'sidebar only contains roots');
 assert.equal(await drawer.locator('[aria-expanded]').count(),0);
 assert.equal(await rootLink.locator('.category-icon-svg svg').count(),1,'stored SVG icon is rendered');
 await rootLink.focus();await page.keyboard.press('Enter');await page.waitForURL(/category=root/);
 await page.getByRole('heading',{name:'Марыйныя малітвы',exact:true}).waitFor();
 await page.getByText('Fixture manual',{exact:true}).waitFor();
 assert.equal(await page.getByText('Fixture leaf prayer',{exact:true}).count(),0,'parent direct list excludes descendants');
 assert.equal(await page.getByText('Малітвы гэтай катэгорыі',{exact:true}).count(),0);
 assert.equal(await page.locator('#category-row-middle .category-icon-svg svg').count(),1,'rosary has its own icon');
 const childBeforePrayer=await page.evaluate(()=>Boolean(document.querySelector('.subcategory-list').compareDocumentPosition(document.querySelector('.prayer-options-list'))&window.Node.DOCUMENT_POSITION_FOLLOWING));
 assert.equal(childBeforePrayer,true);
 for(const theme of ['light','dark','marian'])for(const width of [320,375,768,1280]){
  await page.setViewportSize({width,height:900});await page.evaluate(theme=>{window.__categoryUi.settings.themePreference=theme;},theme);await overflow();
  await page.screenshot({path:`reports/prayer-categories/category-page-${theme}-${width}.png`,fullPage:true});
  if(theme==='marian'&&width===320)await page.screenshot({path:`${evidence}/category-page-marian-320.png`,fullPage:true});
 }
 // Required route: Mary -> Rosary -> prayer; both levels retain their own direct content.
 await page.setViewportSize({width:375,height:450});
 await page.evaluate(()=>{window.scrollTo(0,160);document.querySelector('#category-row-middle').addEventListener('click',()=>{window.__categoryReturnScroll=window.scrollY;},{once:true,capture:true});});
 await page.locator('#category-row-middle').click();await page.waitForURL(/category=middle/);
 await page.getByText('Тэставая малітва ружанца',{exact:true}).click();await page.locator('.prayer-title').filter({hasText:'Тэставая малітва ружанца'}).waitFor();
 await page.goBack();await page.waitForURL(/category=middle/);await page.waitForFunction(()=>document.activeElement?.id==='prayer-row-rosary-prayer');
 await page.goForward();await page.locator('.prayer-title').filter({hasText:'Тэставая малітва ружанца'}).waitFor();
 await page.goBack();await page.waitForURL(/category=middle/);await page.waitForFunction(()=>document.activeElement?.id==='prayer-row-rosary-prayer');
 await page.goBack();await page.waitForURL(/category=root/);await page.waitForFunction(()=>document.activeElement?.id==='category-row-middle');
 await page.waitForFunction(()=>Math.abs(window.scrollY-window.__categoryReturnScroll)<5);
 assert.ok(await page.evaluate(()=>window.__categoryReturnScroll>0),'parent history test exercises a nonzero scroll');
 await page.goForward();await page.waitForURL(/category=middle/);
 // A further level works identically, and history restores the clicked category row.
 await page.locator('#category-row-leaf').click();await page.waitForURL(/category=leaf/);await page.getByText('Fixture leaf prayer',{exact:true}).waitFor();
 await page.goBack();await page.waitForURL(/category=middle/);await page.waitForFunction(()=>document.activeElement?.id==='category-row-leaf');
 await page.goForward();await page.waitForURL(/category=leaf/);await page.getByText('Fixture leaf prayer',{exact:true}).waitFor();
 await page.goBack();await page.waitForURL(/category=middle/);await page.waitForFunction(()=>document.activeElement?.id==='category-row-leaf');
 await page.goForward();await page.waitForURL(/category=leaf/);
 await page.locator('.category-parent-link').click();await page.waitForURL(/category=middle/);
 await page.locator('.category-parent-link').click();await page.waitForURL(/category=root/);
 await page.locator('#category-row-nav-folder').click();await page.waitForURL(/category=nav-folder/);
 await page.getByRole('link',{name:'Fixture grouping child',exact:true}).waitFor();
 assert.equal(await page.locator('.prayer-list-item').count(),0);
 assert.equal(await page.getByText('Малітвы не знойдзены',{exact:true}).count(),0,'folder with children is not falsely empty');
 await page.locator('.category-parent-link').click();await page.waitForURL(/category=root/);
 await page.reload();await page.getByText('Fixture manual',{exact:true}).waitFor();
 assert.equal(await page.getByText('PRIVATE SHARED FIXTURE',{exact:true}).count(),0);
 await page.evaluate(async()=>{await window.__categoryUi.router.push('/prayers?category=leaf');});
 await page.reload();await page.getByRole('heading',{name:'Таямніцы ружанца',exact:true}).waitFor();
 await page.getByText('Fixture leaf prayer',{exact:true}).waitFor();
 await page.evaluate(async()=>{await window.__categoryUi.router.push('/prayers?category=root');});await page.getByText('Fixture manual',{exact:true}).waitFor();
 // Extra tag filters survive reader/back without changing manual membership.
 await page.evaluate(()=>window.__categoryUi.filters.setSelectedTags(['root-tag']));
 assert.equal(await page.getByText('Fixture manual',{exact:true}).count(),0);
 await page.getByText('Fixture tagged',{exact:true}).click();await page.locator('.prayer-title').filter({hasText:'Fixture tagged'}).waitFor();await page.goBack();
 await page.getByText('Fixture tagged',{exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>window.__categoryUi.filters.selectedTags),['root-tag']);
 assert.equal(await page.getByText('Fixture manual',{exact:true}).count(),0);
 await page.evaluate(()=>{window.__categoryUi.filters.setSelectedTags([]);window.__categoryUi.settings.addCategory({name:'Fixture personal',tags:['root-tag']});});
 await page.getByRole('button',{name:'Меню катэгорый',exact:true}).click();
 await drawer.getByRole('link',{name:'Fixture personal',exact:true}).click();
 await page.waitForURL(url=>url.hash==='#/prayers');
 await page.getByText('Fixture both',{exact:true}).waitFor();assert.equal(await page.getByText('Fixture manual',{exact:true}).count(),0);
 const bothRow=page.locator('#prayer-row-both');await bothRow.getByLabel('Дадаць у абраныя',{exact:true}).click();
 assert.ok(await page.evaluate(()=>window.__categoryUi.settings.favoritePrayers.includes('both')));
 await page.getByLabel('Пошук малітваў',{exact:true}).fill('Fixture tagged');
 await page.waitForFunction(()=>document.querySelectorAll('.prayer-list-item').length===1);
 await page.getByLabel('Пошук малітваў',{exact:true}).fill('');
 await page.getByRole('button',{name:'Меню катэгорый',exact:true}).click();
 await page.evaluate(()=>window.__categoryUi.settings.hideGlobalPrayerCategory('root'));
 assert.equal(await drawer.getByRole('link',{name:'Марыйныя малітвы',exact:true}).count(),0);
 await drawer.getByRole('link',{name:'Ружанец',exact:true}).waitFor();
 await drawer.getByLabel('Закрыць меню',{exact:true}).click();
 await page.evaluate(async()=>{await window.__categoryUi.router.push('/prayers?category=closed');});
 await page.getByRole('heading',{name:'Катэгорыя недаступная',exact:true}).waitFor();
 assert.equal(await page.locator('.prayer-list-item').count(),0);
 assert.equal(await page.getByText('Fixture protected',{exact:true}).count(),0);
 await page.evaluate(async code=>{await (await import('/src/services/priestAccessService.js')).activatePriestAccess(code,'Local category fixture');},initialCode);
 await page.waitForFunction(()=>!window.__categoryUi.prayers.isLoading&&window.__categoryUi.prayers.prayers.some(p=>p.id==='inherited-private'));
 await page.getByRole('heading',{name:'Fixture protected',exact:true}).waitFor();
 await page.getByText('PRIVATE SHARED FIXTURE',{exact:true}).waitFor();
 await page.locator('#category-row-closed-child').click();await page.waitForURL(/category=closed-child/);
 await page.getByText('PRIVATE INHERITED FIXTURE',{exact:true}).waitFor();
 const privateComment = page.getByRole('button', { name: 'Пра гэты раздзел', exact: true });
 await privateComment.click();
 await page.getByText('PRIVATE COMMENT FIXTURE', { exact: true }).waitFor();
 await page.evaluate(async()=>{await (await import('/src/services/priestAccessService.js')).disablePriestAccess();});
 await page.waitForFunction(()=>!window.__categoryUi.prayers.isLoading&&!window.__categoryUi.prayers.prayers.some(p=>p.id==='inherited-private'));
 assert.equal(await page.getByText('PRIVATE INHERITED FIXTURE',{exact:true}).count(),0);
 assert.equal(await page.getByText('PRIVATE COMMENT FIXTURE', { exact: true }).count(), 0);

 const goToCategory = id => page.evaluate(id => window.__categoryUi.router.push(`/prayers?category=${id}`), id);
 await goToCategory('unpublished-comment');
 await page.getByRole('heading', { name: 'Катэгорыя недаступная', exact: true }).waitFor();
 assert.equal(await privateComment.count(), 0);
 await goToCategory('nav-folder');
 await page.getByRole('link', { name: 'Прыклад раздзела', exact: true }).click();
 await page.getByRole('heading', { name: 'Прыклад раздзела', exact: true }).waitFor();
 const toggle = page.getByRole('button', { name: 'Пра гэты раздзел', exact: true });
 const panel = page.getByRole('region', { name: 'Пра гэты раздзел', exact: true });
 assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
 assert.equal(await page.locator('.prayer-list-item').count(), 0);
 assert.equal(await page.getByText('Малітвы не знойдзены', { exact: true }).count(), 0);
 await toggle.focus();
 await page.keyboard.press('Space');
 await panel.getByRole('heading', { name: 'Перад пачаткам', exact: true }).waitFor();
 assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
 assert.equal(await panel.locator('blockquote').count(), 1);
 assert.equal(await panel.locator('li').count(), 2);
 assert.equal(await panel.locator('strong, em, aside.prayer-rubric').count(), 3);
 await panel.getByText(/Малітоўнік «Ойча наш»/).waitFor();
 await page.keyboard.press('Enter');
 await panel.waitFor({ state: 'hidden' });

 for (const [width, theme, label] of [[390, 'light', 'mobile'], [768, 'marian', 'tablet'], [1280, 'dark', 'wide']]) {
   await page.setViewportSize({ width, height: 900 });
   await page.evaluate(theme => { window.__categoryUi.settings.themePreference = theme; }, theme);
   await page.locator(`.v-theme--${theme}`).first().waitFor();
   await overflow();
   await page.screenshot({ path: `${commentEvidence}/${label}-collapsed.png`, fullPage: true });
   await toggle.click();
   await panel.waitFor();
   await overflow();
   await page.screenshot({ path: `${commentEvidence}/${label}-expanded.png`, fullPage: true });
   await toggle.click();
 }

 await page.setViewportSize({ width: 320, height: 850 });
 await toggle.click();
 const prose = panel.locator('.category-comment__prose');
 const fontSize = () => prose.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
 const normalSize = await fontSize();
 await page.evaluate(() => { window.__categoryUi.settings.fontSizeMultiplier = 1.8; });
 assert.ok(await fontSize() > normalSize * 1.7);
 await overflow();
 await page.locator('.category-parent-link').click();
 await page.getByRole('link', { name: 'Прыклад раздзела', exact: true }).click();
 assert.equal(await toggle.getAttribute('aria-expanded'), 'false', 'a new visit starts collapsed');
 await page.reload();
 await page.getByRole('heading', { name: 'Прыклад раздзела', exact: true }).waitFor();
 assert.equal(await toggle.getAttribute('aria-expanded'), 'false');

 await page.evaluate(() => sessionStorage.removeItem('categoryPublic'));
 await page.goto(`http://127.0.0.1:${uiPort}/__category_ui`, { waitUntil: 'domcontentloaded' });
 await page.getByLabel('Рэдагаваць катэгорыю Прыклад раздзела', { exact: true }).click();
 await adminDialog().getByRole('button', { name: 'Ачысціць каментарый', exact: true }).click();
 await adminDialog().getByRole('button', { name: 'Захаваць', exact: true }).click();
 await adminDialog().waitFor({ state: 'hidden' });
 const cleared = await db.doc(`prayerCategories/${commentCategoryId}`).get();
 assert.equal(cleared.exists, true);
 assert.equal(Object.hasOwn(cleared.data(), 'comment'), false);
 assert.deepEqual(cleared.data().prayerIds, []);
 assert.equal((await db.doc('prayers/catalog-74').get()).exists, true);
 console.log('PASS: category comments save, reopen, clear, visibility, authorization, formatting, source, keyboard, re-entry, reader scaling and responsive layout.');
 assert.deepEqual(failures,[]);
 console.log('PASS: admin persistence, manual/tag union, atomic access, empty folder, tag removal, hierarchical pages, root-only sidebar, 48 icons, priest grant/revoke, keyboard, reader/back/forward, reload, 36 viewport/theme checks.');
}catch(error){await page.screenshot({path:'reports/prayer-categories/failure.png',fullPage:true});console.error((await page.locator('body').innerText()).slice(-10000));throw error;}finally{await browser.close();await server.close();await deleteApp(owner);}

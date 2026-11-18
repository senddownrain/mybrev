/** Offline browser proof: real loaders, assembly, reader and IndexedDB; mocked SDK read boundary. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { chromium } from 'playwright-core';
import { openFirestoreSnapshot } from './lib/firestore-snapshot.mjs';
import { decodeFirestoreValue } from './ordo/lib/approved-calendar-rest.mjs';
import { liturgicalText } from '../src/utils/liturgicalSourceHtml.js';
const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000';
const source = await openFirestoreSnapshot('backups/firestore-snapshot-public');
const fixtures = {};
for (const collection of ['days', 'liturgicalTemplates']) {
  for (const entry of await source.collectionEntries(collection)) {
    if (collection === 'days' && !['ordinary-w33-d2', 'ordinary-w1-d2', 'office-for-dead', 'advent-21-12', 'advent-w4-d1', 'advent-w4-d2'].includes(entry.id)) continue;
    fixtures[`${collection}/${entry.id}`] = entry.data;
  }
}
for (const id of ['advent-21-12', 'advent-w4-d1']) {
  const raw = JSON.parse(fs.readFileSync(`backups/pr245-after-advent/days__${id}.json`));
  fixtures[`days/${id}`] = Object.fromEntries(Object.entries(raw.fields).map(([k, v]) => [k, decodeFirestoreValue(v)]));
}
const plan = JSON.parse(zlib.gunzipSync(fs.readFileSync('backups/pr245-days-templates-prepared.json.gz')));
const planned = plan.documents.find((d) => d.document === 'days/ordinary-w33-d2');
const field = planned.fields.find((f) => f.field === 'laudesR');
assert.ok(field);
const browser = await chromium.launch({ executablePath: process.env.BENCHMARK_BROWSER_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ serviceWorkers: 'block' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (msg) => { if (msg.type() === 'error') console.error(msg.text()); });
await context.route(/https:\/\/.*(googleapis\.com|firebaseio\.com)/u, (route) => route.abort());
await context.route('**/__web-correction-fixtures', (route) => route.fulfill({ json: fixtures }));
await context.route('**/src/utils/firestoreRead.js*', (route) => route.fulfill({ contentType: 'application/javascript', body: `
const fixtures = await fetch('/__web-correction-fixtures').then(r => r.json());
window.__fixtureReads = [];
function item(path) { const parts=path.split('/'); const data=fixtures[path]; return {id:parts.at(-1),ref:{parent:{id:parts[0]}},exists:()=>data!==undefined,data:()=>data,metadata:{fromCache:false,hasPendingWrites:false}}; }
function observe(snapshot,session,path) { window.__fixtureReads.push(path); return session ? session.observe(snapshot) : snapshot; }
export async function getDocOfflineAware(ref,session) { return observe(item(ref.path),session,ref.path); }
export async function getDocsOfflineAware(ref,session) {
 const q=ref._query; const collection=q.path.canonicalString();
 const filters=q.filters||[];
 const docs=Object.keys(fixtures).filter(p=>p.split('/')[0]===collection).filter(p=>filters.every(f=>{
   const key=f.field.canonicalString(), value=f.value.stringValue??Number(f.value.integerValue??f.value.doubleValue);
   return fixtures[p][key]===value;
 })).map(item);
 return observe({docs,metadata:{fromCache:false,hasPendingWrites:false}},session,collection);
}
` }));
try {
  await page.goto(`${base}/day/2026-11-16/ora/ordinary-w33-d2/laudes`, { waitUntil: 'networkidle' });
  await page.locator('.liturgical-hour-column').waitFor({ timeout: 30000 });
  const text = (await page.locator('.liturgical-hour-column').innerText()).replace(/\s+/gu, ' ');
  const ending = liturgicalText(field.after).replace(/\s+/gu, ' ').slice(-180);
  assert.ok(text.includes(ending), 'reader renders the approved expanded ending');
  const state = await page.evaluate(async () => {
    const { useLiturgicalStore } = await import('/src/stores/liturgical.js');
    const { getLiturgicalTemplates } = await import('/src/services/staticLiturgicalService.js');
    const { findDayByPeriod } = await import('/src/services/liturgicalDayService.js');
    const { applyWebLiturgicalCorrections } = await import('/src/utils/webLiturgicalCorrections.js');
    const templates = await getLiturgicalTemplates();
    const content = await useLiturgicalStore().fetchContentByDate('2026-11-16');
    const raw = await findDayByPeriod('ordinary', 33, 2);
    const advent = await applyWebLiturgicalCorrections('days', { id: 'advent-21-12', ...(await fetch('/__web-correction-fixtures').then(r=>r.json()))['days/advent-21-12'] });
    return { reading: content.itemsDays.find(d=>d.id==='ordinary-w33-d2').laudesR, raw: raw.laudesR, template: templates.get('church-dedication').vesperR, rawTemplate: (await getLiturgicalTemplates({webCorrections:false})).get('church-dedication').vesperR, advent };
  });
  assert.equal(state.reading, field.after);
  assert.equal(state.raw, field.before, 'editor/picker reads retain the original data');
  const template = plan.documents.find(d=>d.document==='liturgicalTemplates/church-dedication').fields.find(f=>f.field==='vesperR');
  assert.equal(state.template, template.after);
  assert.equal(state.rawTemplate, template.before, 'template editor sees the original value');
  const adventPlan = plan.documents.find(d=>d.document==='days/advent-21-12');
  const expectedAdvent = structuredClone(fixtures['days/advent-21-12']);
  for (const f of adventPlan.fields) expectedAdvent[f.field] = f.after;
  assert.deepEqual(state.advent, { id:'advent-21-12', ...expectedAdvent });
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.liturgical-hour-column').waitFor();
  assert.ok((await page.locator('.liturgical-hour-column').innerText()).replace(/\s+/gu, ' ').includes(ending), 'corrected reader survives reload');
  assert.equal(await page.evaluate(() => window.__fixtureReads.filter(path=>/^(days|liturgicalTemplates)(\/|$)/u.test(path)).length), 0, 'reload uses existing public content cache without days/templates SDK reads');
  assert.deepEqual(errors, []);
  console.log('PASS: real reader + loader/assembly, template, Advent preserved, raw editor, IndexedDB reload with zero days/templates SDK reads; all real Firebase requests blocked.');
} catch (error) { console.error('Browser errors:', errors, 'DOM:', (await page.locator('body').innerText()).slice(0,2500)); throw error; } finally { await context.close(); await browser.close(); }

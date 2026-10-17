/**
 * Responsive regression check for the five audited defects (RESPONSIVE_AUDIT.md
 * #1-#5) in real Chromium against the real app, local emulator only.
 *
 *   npm run smoke:responsive
 *
 * It starts a Firestore emulator (`firebase emulators:exec`), seeds it from LOCAL
 * snapshots (never production), serves the real app with Vite (only the Firebase
 * module is swapped for an emulator-connected one, in memory) and measures:
 *   1. Mass reading-set buttons do not overlap or overflow (25.12 has 3 sets);
 *   2. «Гэта слова Божае/Пана» scales like the body text at 0.7 / 1.0 / 1.8;
 *   3. the section label «Рэспансарыйны псальм» is not clipped at 320 px / 1.8;
 *   4. dioceses form a 2 x 2 grid with equal cells and keep multi-select;
 *   5. a closed drawer casts no shadow into the viewport, an open one does.
 * plus: no horizontal overflow of the document or clipped content inside cards.
 *
 * Env: RESPONSIVE_SNAPSHOT (default backups/firestore-snapshot-readings-sets),
 * RESPONSIVE_STATIC_SNAPSHOT (default backups/firestore-snapshot-static),
 * RESPONSIVE_LABEL (before|after, names the screenshot folder), RESPONSIVE_PORT,
 * RESPONSIVE_FAST=1 (fewer widths), RESPONSIVE_ONLY=readings,settings,picker,drawer (subset), BENCHMARK_BROWSER_PATH (Chromium executable).
 * Exit code is the number of failed assertions (capped at 1).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { initializeApp } from 'firebase-admin/app';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { openFirestoreSnapshot } from './lib/firestore-snapshot.mjs';

const host = process.env.FIRESTORE_EMULATOR_HOST || '';
assert.match(host, /^(127\.0\.0\.1|localhost):\d+$/, 'A local Firestore emulator is required (npm run smoke:responsive)');
const [emulatorHost, emulatorPort] = host.split(':');
const projectId = 'demo-responsive';
const label = process.env.RESPONSIVE_LABEL || 'after';
const port = Number(process.env.RESPONSIVE_PORT || 5188);
const base = `http://127.0.0.1:${port}`;
const output = path.resolve('outputs/responsive', label);
fs.mkdirSync(output, { recursive: true });

// ---- seed the emulator from local snapshots -------------------------------------
function toAdmin(value) {
  if (Array.isArray(value)) return value.map(toAdmin);
  if (value instanceof Date || !value || typeof value !== 'object') return value;
  if (value.__firestoreType === 'timestamp') return new Timestamp(value.seconds, value.nanoseconds);
  if (value.__firestoreType === 'date') return new Date(value.iso);
  if (value.__firestoreType === 'bytes') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toAdmin(item)]));
}

const db = getFirestore(initializeApp({ projectId }, 'responsive-seed'));
let seeded = 0;
for (const dir of [process.env.RESPONSIVE_SNAPSHOT || 'backups/firestore-snapshot-readings-sets', process.env.RESPONSIVE_STATIC_SNAPSHOT || 'backups/firestore-snapshot-static']) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const snapshot = await openFirestoreSnapshot(dir);
  for (const name of Object.keys(manifest.collections)) {
    const docs = await snapshot.collection(name);
    const writer = db.bulkWriter();
    for (const { id, ...data } of docs || []) { writer.set(db.doc(`${name}/${id}`), toAdmin(data)); seeded += 1; }
    await writer.close();
  }
}
console.log(`seeded ${seeded} documents into the emulator`);

// ---- serve the real app with an emulator-connected Firebase module --------------
const firebaseModule = `import { initializeApp } from 'firebase/app';
import { initializeFirestore, memoryLocalCache, connectFirestoreEmulator } from 'firebase/firestore';
import { createFirestoreCacheRecovery } from '/src/utils/firestoreCacheRecovery.js';
export const firebaseApp = initializeApp({ projectId: '${projectId}', apiKey: 'demo-key', authDomain: '${projectId}.firebaseapp.com' });
export const firestoreCacheRecovery = createFirestoreCacheRecovery({ projectId: '${projectId}', storage: () => window.sessionStorage, reload: () => window.location.reload(), isOnline: () => true });
export const db = initializeFirestore(firebaseApp, { localCache: memoryLocalCache() });
connectFirestoreEmulator(db, '${emulatorHost}', ${emulatorPort});`;
const server = await createServer({
  configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)),
  cacheDir: 'node_modules/.vite-responsive',
  logLevel: 'error',
  server: { host: '127.0.0.1', port, strictPort: true },
  plugins: [{
    name: 'responsive-local-emulator-only',
    enforce: 'pre',
    transform(source, id) {
      return id.replaceAll('\\', '/').split('?')[0].endsWith('/src/plugins/firebase.js') ? firebaseModule : null;
    },
  }],
});
await server.listen();

// ---- measurement helpers ---------------------------------------------------------
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: Boolean(ok), detail }); if (!ok) console.log(`FAIL ${name} ${detail}`); };
const fast = process.env.RESPONSIVE_FAST === '1';
const widths = fast ? [320, 390, 768, 1440] : [320, 360, 375, 390, 412, 430, 768, 1024, 1440];
const scales = [0.7, 1, 1.8];
const browser = await chromium.launch(process.env.BENCHMARK_BROWSER_PATH ? { executablePath: process.env.BENCHMARK_BROWSER_PATH } : {});

async function open(width, scale, theme = 'light') {
  const context = await browser.newContext({ viewport: { width, height: width >= 768 ? 900 : 780 }, colorScheme: theme, reducedMotion: 'reduce', serviceWorkers: 'block' });
  await context.addInitScript(({ scale, theme }) => {
    localStorage.setItem('fontSizeMultiplier', String(scale));
    localStorage.setItem('themePreference', theme);
  }, { scale, theme });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return { context, page, errors };
}
const settle = (page, scale) => page.evaluate((m) => {
  document.documentElement.style.setProperty('--font-size-multiplier', String(m));
  return document.fonts?.ready;
}, scale).catch(() => {});

const noPageOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const clippedInside = (page, selector) => page.evaluate((selector) => {
  const out = [];
  for (const card of document.querySelectorAll(selector)) {
    const box = card.getBoundingClientRect();
    for (const el of card.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width && r.height && (r.right > box.right + 1 || r.left < box.left - 1)) out.push(`${el.className || el.tagName}:${Math.round(r.right - box.right)}`);
    }
  }
  return out.slice(0, 5);
}, selector);
async function scenario(name, run) {
  const only = process.env.RESPONSIVE_ONLY?.split(',');
  if (only && !only.includes(name.split(' ')[0])) return;
  try { await run(); } catch (error) { check(`scenario completed: ${name}`, false, String(error.message).split('\n')[0]); }
}
const overlap = (a, b) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;

try {
  // 1-3: readings (25.12 has three Mass sets)
  for (const width of widths) {
    for (const scale of scales) await scenario(`readings ${width}px x${scale}`, async () => {
      const { context, page, errors } = await open(width, scale);
      await page.goto(`${base}/readings/2026-12-25`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.set-choice__button', { timeout: 30000 });
      await page.waitForSelector('.parsed-reading, .section-text', { timeout: 30000 });
      await settle(page, scale);
      const tag = `${width}px x${scale}`;

      const buttons = await page.$$eval('.set-choice__button', (list) => list.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height, overflowX: el.scrollWidth - el.clientWidth, overflowY: el.scrollHeight - el.clientHeight };
      }));
      check(`mass sets: three buttons present (${tag})`, buttons.length === 3, `got ${buttons.length}`);
      let touching = 0;
      for (let i = 0; i < buttons.length; i += 1) for (let j = i + 1; j < buttons.length; j += 1) if (overlap(buttons[i], buttons[j])) touching += 1;
      check(`mass sets: buttons do not overlap (${tag})`, touching === 0, `${touching} pairs`);
      check(`mass sets: no text overflow inside buttons (${tag})`, buttons.every((b) => b.overflowX <= 1 && b.overflowY <= 1), JSON.stringify(buttons.map((b) => [b.overflowX, b.overflowY])));
      check(`mass sets: buttons stay inside the viewport (${tag})`, buttons.every((b) => b.x >= -0.5 && b.x + b.width <= width + 0.5));

      const sizes = await page.evaluate(() => {
        const fs = (el) => parseFloat(getComputedStyle(el).fontSize);
        const text = document.querySelector('.section-text');
        const standalone = [...document.querySelectorAll('.reading-acclamation')].filter((el) => !el.closest('.section-text, .alleluia-verse'));
        const nested = [...document.querySelectorAll('.section-text .reading-acclamation, .alleluia-verse .reading-acclamation')];
        return { text: text ? fs(text) : null, standalone: standalone.map(fs), nested: nested.map((el) => [fs(el), fs(el.closest('.section-text, .alleluia-verse'))]) };
      });
      check(`acclamation: a body text exists (${tag})`, sizes.text > 0);
      check(`acclamation: standalone ones match the body text size (${tag})`, sizes.standalone.every((s) => Math.abs(s - sizes.text) <= 0.5), JSON.stringify(sizes));
      check(`acclamation: nested ones are not scaled twice (${tag})`, sizes.nested.every(([own, parent]) => Math.abs(own - parent) <= 0.5), JSON.stringify(sizes.nested));

      const labels = await page.$$eval('.section-label', (list) => list.map((el) => ({ text: el.textContent.trim(), overflowX: el.scrollWidth - el.clientWidth, right: el.getBoundingClientRect().right, card: el.closest('.parsed-reading')?.getBoundingClientRect().right ?? 0 })));
      check(`section labels: none clipped (${tag})`, labels.every((l) => l.overflowX <= 1 && l.right <= l.card + 0.5), JSON.stringify(labels.filter((l) => l.overflowX > 1 || l.right > l.card + 0.5)));
      const psalm = labels.find((l) => /псальм/i.test(l.text));
      check(`section labels: the psalm label exists (${tag})`, Boolean(psalm));
      const lefts = await page.evaluate(() => ['.reading-choice', '.cycle-choice', '.readings-content > .parsed-reading'].map((q) => document.querySelector(q)?.getBoundingClientRect().left).filter((x) => x !== undefined));
      check(`readings: cards share the same side gutter (${tag})`, lefts.length >= 2 && lefts.every((x) => Math.abs(x - lefts[0]) <= 1), JSON.stringify(lefts));
      const dot = await page.evaluate(() => {
        const date = document.querySelector('.readings-date');
        const marker = document.querySelector('.readings-date__marker');
        if (!date || !marker) return null;
        const walker = document.createTreeWalker(date, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node && !node.textContent.trim()) node = walker.nextNode();
        if (!node) return null;
        const range = document.createRange();
        range.selectNodeContents(node);
        const first = range.getClientRects()[0];
        const m = marker.getBoundingClientRect();
        return first ? Math.abs((m.top + m.height / 2) - (first.top + first.height / 2)) : null;
      });
      check(`readings: the date marker sits on the first line of the date (${tag})`, dot !== null && dot <= 3, String(dot));
      check(`readings: no horizontal page overflow (${tag})`, (await noPageOverflow(page)) <= 1);
      const clipped = await clippedInside(page, '.parsed-reading');
      check(`readings: nothing is clipped inside cards (${tag})`, clipped.length === 0, clipped.join(', '));
      check(`readings: no page errors (${tag})`, errors.length === 0, errors.join('; '));

      if ([320, 390, 768, 1440].includes(width) && (scale === 1 || (scale === 1.8 && width === 320))) {
        await page.screenshot({ path: path.join(output, `readings-1225-${width}-x${scale}.png`) });
      }
      await context.close();
    });
  }

  // 4: settings, dioceses
  for (const width of widths) {
    for (const theme of ['light', 'dark']) await scenario(`settings ${width}px ${theme}`, async () => {
      const { context, page } = await open(width, 1, theme);
      await page.goto(`${base}/settings`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-test="settings-dioceses"] button', { timeout: 30000 });
      const tag = `${width}px ${theme}`;
      const cells = await page.$$eval('[data-test="settings-dioceses"] button', (list) => list.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), overflow: el.scrollWidth - el.clientWidth };
      }));
      check(`dioceses: four options (${tag})`, cells.length === 4);
      const xs = [...new Set(cells.map((c) => c.x))];
      const ys = [...new Set(cells.map((c) => c.y))];
      check(`dioceses: 2 x 2 grid (${tag})`, xs.length === 2 && ys.length === 2, JSON.stringify(cells));
      check(`dioceses: equal cells (${tag})`, cells.every((c) => Math.abs(c.w - cells[0].w) <= 1 && Math.abs(c.h - cells[0].h) <= 1), JSON.stringify(cells));
      check(`dioceses: labels fit their cells (${tag})`, cells.every((c) => c.overflow <= 1));
      check(`dioceses: inside the viewport (${tag})`, cells.every((c) => c.x >= 0 && c.x + c.w <= width));
      if (theme === 'light') {
        // Multi-select keeps working and the last selected diocese cannot be switched off.
        const buttons = await page.$$('[data-test="settings-dioceses"] button');
        const state = () => page.$$eval('[data-test="settings-dioceses"] button', (list) => list.map((el) => el.getAttribute('aria-checked') === 'true'));
        const before = await state();
        const index = before.findIndex((on) => !on);
        await buttons[index].click();
        const grown = await state();
        check(`dioceses: a second diocese can be selected (${tag})`, grown.filter(Boolean).length === before.filter(Boolean).length + 1);
        const heights = await page.$$eval('[data-test="settings-dioceses"] button', (list) => list.map((el) => el.getBoundingClientRect().height));
        check(`dioceses: selecting does not change cell height (${tag})`, heights.every((h) => Math.abs(h - cells[0].h) <= 1), JSON.stringify(heights));
        for (let i = 0; i < 4; i += 1) { if ((await state()).filter(Boolean).length > 1) { const on = (await state()).findIndex(Boolean); await buttons[on].click({ force: true }); } }
        const last = await state();
        check(`dioceses: the last selected one stays on (${tag})`, last.filter(Boolean).length === 1);
        await buttons[last.findIndex(Boolean)].click({ force: true });
        check(`dioceses: it cannot be switched off (${tag})`, (await state()).filter(Boolean).length === 1);
        const themeLayout = await page.$eval('.theme-options:not(.diocese-options)', (el) => getComputedStyle(el).display);
        check(`dioceses: the theme switch keeps its own layout (${tag})`, themeLayout === 'flex', themeLayout);
      }
      check(`settings: no horizontal page overflow (${tag})`, (await noPageOverflow(page)) <= 1);
      if ([320, 390, 768, 1440].includes(width)) await page.screenshot({ path: path.join(output, `settings-${width}-${theme}.png`) });
      await context.close();
    });
  }

  // P3: picker page, header and cards share one side gutter
  for (const width of widths) await scenario(`picker ${width}px`, async () => {
    const { context, page } = await open(width, 1);
    await page.goto(`${base}/picker`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.picker-hero', { timeout: 30000 });
    const edges = await page.evaluate(() => ['.picker-eyebrow', '.picker-controls', '.picker-tabs'].map((q) => document.querySelector(q)?.getBoundingClientRect().left).filter((x) => x !== undefined));
    check(`picker: header and cards share the side gutter (${width}px)`, edges.length === 3 && edges.every((x) => Math.abs(x - edges[0]) <= 1), JSON.stringify(edges));
    check(`picker: no horizontal page overflow (${width}px)`, (await noPageOverflow(page)) <= 1);
    if ([320, 390].includes(width)) await page.screenshot({ path: path.join(output, `picker-${width}.png`) });
    await context.close();
  });

  // 5: drawer shadow
  for (const width of widths) {
    for (const theme of ['light', 'dark']) await scenario(`drawer ${width}px ${theme}`, async () => {
      const { context, page } = await open(width, 1, theme);
      await page.goto(`${base}/about`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.app-drawer', { state: 'attached', timeout: 30000 });
      const tag = `${width}px ${theme}`;
      const closed = await page.$eval('.app-drawer', (el) => { const r = el.getBoundingClientRect(); return { shadow: getComputedStyle(el).boxShadow, right: r.right }; });
      check(`drawer: closed drawer is off screen (${tag})`, closed.right <= 0.5, JSON.stringify(closed));
      check(`drawer: closed drawer casts no shadow (${tag})`, closed.shadow === 'none', closed.shadow);
      await page.getByLabel('Адкрыць меню').first().click();
      await page.waitForFunction(() => document.querySelector('.app-drawer')?.classList.contains('v-navigation-drawer--active'));
      await page.waitForTimeout(500);
      const opened = await page.$eval('.app-drawer', (el) => { const r = el.getBoundingClientRect(); return { shadow: getComputedStyle(el).boxShadow, left: r.left, visible: r.width > 100 }; });
      check(`drawer: open drawer is visible and keeps its shadow (${tag})`, opened.visible && opened.left >= -0.5 && opened.shadow !== 'none', JSON.stringify(opened));
      if ([320, 1440].includes(width)) await page.screenshot({ path: path.join(output, `drawer-open-${width}-${theme}.png`) });
      await context.close();
    });
  }
} finally {
  await browser.close();
  await server.close();
}

const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ label, passed: results.length - failed.length, failed: failed.length, failures: failed }, null, 2));
console.log(`responsive checks [${label}]: ${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);

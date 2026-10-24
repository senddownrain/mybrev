// Offline acceptance of the five complete, private sources. No Firestore reads.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { parse } from 'node-html-parser';
import {
  buildDevotionalOfficeDocument, devotionalDisplayItems, devotionalBlockHtml,
  devotionalSpeakerHtml, devotionalResponsoryHtml, devotionalDeadIntentions,
  devotionalDeadSelection, devotionalOfficeChoices, devotionalSelectedBlocks,
} from '../src/utils/devotionalOffice.js';

assert.ok(process.env.MYBREV_DEVOTIONAL_SOURCE_DIR, 'Set MYBREV_DEVOTIONAL_SOURCE_DIR to the private audit directory');
assert.ok(process.env.MYBREV_GADZINKI_SOURCE, 'Set MYBREV_GADZINKI_SOURCE to the complete original Markdown');
const fixtures = ['office-for-dead', 'blessed-virgin-mary'].flatMap(name => ['laudes', 'vesper'].map(profile => {
  const id = `mybrev-devotion-${name}-${profile}`;
  return { id, profile, text: readFileSync(path.join(process.env.MYBREV_DEVOTIONAL_SOURCE_DIR, `${id}.md`), 'utf8') };
}));
fixtures.push({ id: 'catholicby-yearcycle-100116', profile: 'gadzinki', text: readFileSync(process.env.MYBREV_GADZINKI_SOURCE, 'utf8') });
const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4174';
const output = path.resolve('outputs/devotional-office/real');
mkdirSync(output, { recursive: true });
// Keep full sources in memory: the served entry contains no private text.
const entryUrl = `/outputs/devotional-office/real-entry-${process.pid}.js`;
const entry = path.resolve(`.${entryUrl}`);
writeFileSync(entry, `
import { createApp, h, reactive } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import vuetify from '/src/plugins/vuetify.js';
import Reader from '/src/components/prayers/DevotionalOfficeReader.vue';
import { useSettingsStore } from '/src/stores/settings.js';
import '/src/styles/main.scss';
import '/node_modules/vuetify/lib/styles/main.css';
const props = reactive({ text: '', format: 'mybrev-markdown', profile: 'gadzinki', prayerId: '' });
const app = createApp({ setup() {
  window.readerTest = { props, settings: useSettingsStore() };
  return () => h('main', { class: 'prayer-content-area', style: 'max-width:600px;margin:auto;padding:12px 0' }, [h(Reader, { ...props, key: props.prayerId })]);
} });
app.use(createPinia()).use(vuetify).use(createRouter({ history: createMemoryHistory(), routes: [] }));
await app.config.globalProperties.$router.push('/');
await app.config.globalProperties.$router.isReady();
app.mount('#app');
`);
const normal = text => text.replace(/\s/gu, '');
const htmlText = html => parse(html).textContent;
function expectedText(section) {
  return normal(devotionalDisplayItems(section).flatMap((block, index) => {
    if ((index === 0 && section.title && block.kind !== 'sectionHeading') || block.kind === 'separator') return [];
    if (block.kind === 'sectionHeading') return [block.text, block.reference || ''];
    if (block.level || ['readingTitle', 'responseTitle', 'psalmTitle'].includes(block.kind)) return [block.text];
    return [htmlText(block.kind === 'responsoryBody' ? devotionalResponsoryHtml(block)
      : block.kind === 'psalmBody' || block.kind === 'psalmMeta' ? devotionalBlockHtml(block) : devotionalSpeakerHtml(block))];
  }).join(''));
}
const browser = await chromium.launch({ executablePath: process.env.BENCHMARK_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    if (url.pathname === '/__devotional_real') return route.fulfill({ contentType: 'text/html', body: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><script type="module" src="${entryUrl}"></script></body></html>` });
    return route.continue();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
  await page.goto(`${base}/__devotional_real`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.readerTest, null, { timeout: 120000 });
  console.log('Offline reader mounted');
  for (const fixture of fixtures) {
    await page.evaluate(f => Object.assign(window.readerTest.props, f, { prayerId: f.id }), fixture);
    await page.locator(`[data-office-profile="${fixture.profile}"]`).waitFor();
    const document = buildDevotionalOfficeDocument(fixture.text, 'mybrev-markdown', fixture.profile);
    const sections = document.sections.filter(s => !(fixture.profile !== 'gadzinki' && s.type === 'alternatives')
      && !(s.id === 'office-intro' && s.blocks.every(b => b.level === 1)));
    const domSections = page.locator('.devotional-office > .ora');
    assert.equal(await domSections.count(), sections.length, fixture.id);
    const intentions = devotionalDeadIntentions(fixture.id);
    if (intentions.length) assert.equal(await page.locator('.devotional-office__context').count(), 2);
    const verifySection = async (index, blocks, alternative = false) => {
      const section = sections[index];
      if (alternative) blocks = blocks.filter(b => !/^(?:Або|Або іншыя):$/iu.test(b.text?.trim() || ''));
      // DOM order and every word/sign must match the selected source blocks.
      assert.equal(normal(await domSections.nth(index).locator('.ora-text').textContent()), expectedText({ ...section, blocks }), `${fixture.id}: ${section.title}`);
    };
    for (const [index, section] of sections.entries()) {
      if (intentions.length && ['hymn', 'prayer'].includes(section.type)) continue;
      await verifySection(index, section.blocks);
      const choices = devotionalOfficeChoices(fixture.id, section);
      for (const option of choices) {
        await domSections.nth(index).getByRole('button', { name: option.label, exact: true }).click();
        await verifySection(index, devotionalSelectedBlocks(section, option.sourceIndex), option.sourceIndex > 0);
      }
    }
    for (const intention of intentions) {
      await page.getByRole('button', { name: intention.label, exact: true }).click();
      for (const [index, section] of sections.entries()) if (['hymn', 'prayer'].includes(section.type)) {
        await verifySection(index, devotionalDeadSelection(section, intention));
      }
    }
    if (fixture.profile === 'gadzinki') {
      assert.equal(sections.length, 8);
      assert.equal(await page.locator('h2.ora-title').filter({ hasText: /^Гімн$/ }).count(), 7);
      assert.equal(await page.getByRole('button').count(), 0);
    } else {
      assert.equal(await page.locator('.devotional-office__psalm-title').count(), 3);
      assert.equal(await page.locator('.devotional-office__reading-reference').count(), 1);
      const section = sections.find(s => s.type === 'reading');
      const body = devotionalDisplayItems(section).find(b => b.kind === 'responsoryBody');
      const labels = parse(devotionalResponsoryHtml(body)).querySelectorAll('[data-office-speaker]').map(n => n.textContent);
      assert.deepEqual(await page.locator('.devotional-office__responsory [data-office-speaker]').allTextContents(), labels);
      assert.equal(await page.locator('.devotional-office__meta').count(), fixture.id.endsWith('mary-laudes') ? 6 : 0);
    }
    const content = normal(await page.locator('.devotional-office').textContent());
    for (const theme of ['light', 'dark']) for (const width of [390, 320]) for (const size of [1, 2]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(({ theme, size }) => {
        document.body.classList.remove('v-theme--light', 'v-theme--dark');
        document.body.classList.add(`v-theme--${theme}`);
        window.readerTest.settings.setThemePreference(theme);
        // The normal app shell sets the viewport canvas; reproduce it here.
        document.documentElement.style.setProperty('--app-viewport-background', `rgb(${getComputedStyle(document.body).getPropertyValue('--v-theme-background')})`);
        window.readerTest.settings.fontSizeMultiplier = size;
      }, { theme, size });
      for (const layout of ['alignedLeft', 'alternatingIndent']) for (const mode of ['inline', 'breakAfterMarker']) {
        await page.evaluate(({ layout, mode }) => {
          window.readerTest.settings.psalmVerseLayout = layout;
          window.readerTest.settings.psalmMarkerBreakMode = mode;
        }, { layout, mode });
        assert.equal(normal(await page.locator('.devotional-office').textContent()), content, 'settings preserve all text');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${fixture.id}: overflow at ${width}, ${theme}, ${size}`);
      }
      if (theme === 'dark' && width === 320 && size === 2) {
        await page.screenshot({ path: path.join(output, `${fixture.id}.png`), fullPage: true });
        const focus = fixture.profile === 'gadzinki' ? domSections.nth(2) : page.locator('.devotional-office__responsory');
        await focus.scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(output, `${fixture.id}-detail.png`) });
      }
    }
    console.log(`${fixture.id}: full source, variants, roles, metadata and 32 layout combinations passed`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  rmSync(entry, { force: true });
}

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { parse } from 'node-html-parser';
import { commons, responsoryReferenceParagraphs } from '../tests/fixtures/liturgical-rubrics.mjs';
import { getLiturgicalAlternatives } from '../src/utils/liturgicalAlternatives.js';
import { removeLectionSectionHeading } from '../src/utils/liturgicalHtml.js';

// Run against `npm run dev -- --host 127.0.0.1 --port 4174`.
// Real Vue components and application CSS, with public local texts and all
// external requests blocked: no Firestore reads, emulator or deploy.
const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4174';
const output = path.resolve('outputs/liturgical-rubrics');
const entry = path.resolve('.cache/liturgical-rubrics-entry.js');
mkdirSync(output, { recursive: true });
mkdirSync(path.dirname(entry), { recursive: true });
writeFileSync(entry, `
import { createApp, h, reactive, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import vuetify from '/src/plugins/vuetify.js';
import Reading from '/src/components/oraparts/Reading.vue';
import Lectio from '/src/components/oraparts/Lectio.vue';
import Psalms from '/src/components/oraparts/Psalms.vue';
import Hymnus from '/src/components/oraparts/Hymnus.vue';
import '/src/styles/main.scss';
const state = reactive({ component: 'Reading', props: {}, key: 0 });
const components = { Reading, Lectio, Psalms, Hymnus };
const router = createRouter({ history: createMemoryHistory(), routes: [
  { path: '/day/:day/ora/:id/laudes', component: Reading },
] });
await router.push('/day/2026-11-02/ora/office-for-dead/laudes');
const app = createApp({ render: () => h('main', { class: 'prayer-content-area' }, [
  h('div', { class: 'liturgical-hour-column', style: 'max-width:760px;margin:auto' }, [
    h(components[state.component], { ...state.props, key: state.key }),
  ]),
]) });
app.use(createPinia()).use(vuetify).use(router).mount('#app');
window.rubricsTest = {
  async show(component, props) { state.component = component; state.props = props; state.key++; await nextTick(); },
  async theme(name) { vuetify.theme.change(name); document.body.className = 'v-theme--' + name; await nextTick(); },
};
`);

const browser = await chromium.launch({ executablePath: process.env.BENCHMARK_BROWSER_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    if (url.pathname === '/__liturgical_rubrics_test') return route.fulfill({ contentType: 'text/html', body: '<html lang="be"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><script type="module" src="/.cache/liturgical-rubrics-entry.js"></script></body></html>' });
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/__liturgical_rubrics_test`);
  await page.waitForFunction(() => window.rubricsTest);

  const show = (component, props) => page.evaluate(({ component, props }) => window.rubricsTest.show(component, props), { component, props });
  const headingStyles = () => page.locator('p[data-liturgical-heading]').evaluateAll(nodes => nodes.map(node => {
    const properties = n => {
      const s = getComputedStyle(n);
      return { fontSize: s.fontSize, fontWeight: s.fontWeight, color: s.color, textAlign: s.textAlign };
    };
    return { ...properties(node), children: [...node.querySelectorAll('*')].map(properties) };
  }));
  const assertStyles = styles => {
    assert.ok(styles.length > 0);
    const { children: _children, ...expected } = styles[0];
    assert.equal(expected.textAlign, 'left');
    assert.equal(expected.fontWeight, '700');
    // Both themes use the existing red rubric palette.
    const rgb = expected.color.match(/\d+/gu).map(Number);
    assert.ok(rgb[0] > rgb[1] && rgb[0] > rgb[2], expected.color);
    for (const { children, ...style } of styles) {
      assert.deepEqual(style, expected, 'all structural headings have identical typography');
      children.forEach(child => assert.deepEqual(child, expected, 'inline fragments inherit the heading style'));
    }
  };

  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => window.rubricsTest.theme(theme), theme);
    for (const width of [390, 320, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      for (const [id, field] of [
        ['office-for-dead', 'laudesR'], ['blessed-virgin-mary', 'laudesR'],
        ['doctors-of-church', 'laudesR'], ['virgins', 'laudesR'],
        ['church-dedication', 'sext1R'], ['church-dedication', 'sext3R'],
        ['pastors', 'laudesR'], ['pastors', 'sext1R'], ['office-for-dead', 'sext1R'],
        ['apostles', 'vesper1R'],
      ]) {
        const source = commons[id][field];
        const options = getLiturgicalAlternatives(source, 'reading');
        await show('Reading', { text: source });
        if (options.length > 1) assert.deepEqual(await page.locator('.alternative-tab__title').allTextContents(), options.map(o => o.title));
        for (let index = 0; index < options.length; index++) {
          if (options.length > 1) await page.getByRole('tab').nth(index).click();
          const expected = options[index].html.replace(/<[^>]*>/gu, '').replace(/\s/gu, '');
          assert.equal((await page.getByRole('tabpanel').textContent()).replace(/\s/gu, ''), expected);
          const styles = await headingStyles();
          const referenceCaptions = parse(options[index].html).querySelectorAll('p')
            .filter(p => /^(?:Кароткі\s+)?рэспансорый.+/iu.test(p.text.trim()));
          for (const caption of referenceCaptions) {
            assert.equal(await page.locator('p[data-liturgical-heading]').filter({ hasText: caption.text.trim() }).count(), 1);
          }
          // The church-dedication alternative is a bare Scripture reference.
          if (styles.length) assertStyles(styles);
          const plainBody = page.locator('[role="tabpanel"] p:not([data-liturgical-heading]):not([data-liturgical-subheading])').first();
          const sizes = await plainBody.evaluate(n => [getComputedStyle(n).fontSize, getComputedStyle(n.closest('.ora-text')).fontSize]);
          assert.equal(sizes[0], sizes[1], 'Scripture stays at ordinary reader size');
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${id}/${field}: no overflow`);
          if (width === 390) await page.screenshot({ path: path.join(output, `${theme}-${id}-${field}-${index}.png`), fullPage: true });
        }
      }

      // Render every newly covered source caption, including all seasonal
      // duplicates and multi-span labels, through the production component.
      const captionCorpus = responsoryReferenceParagraphs.map(field => field.html).join('\n');
      await show('Reading', { text: captionCorpus });
      assert.equal(await page.locator('p[data-liturgical-heading]').count(), 183);
      assert.equal(await page.locator('p[data-liturgical-subheading]').count(), 0);
      assertStyles(await headingStyles());
      assert.equal((await page.getByRole('tabpanel').textContent()).replace(/\s/gu, ''), parse(captionCorpus).text.replace(/\s/gu, ''));

      // Real long readings: title removal, option titles and the entire active
      // text stay unchanged, including the responsory that follows each body.
      for (const [id, field] of [['apostles', 'officeOfReadingsR1'], ['blessed-virgin-mary', 'officeOfReadingsR2']]) {
        const title = field.endsWith('1') ? 'Першае чытанне' : 'Другое чытанне';
        const source = commons[id][field];
        const options = getLiturgicalAlternatives(removeLectionSectionHeading(source, title), 'office-reading');
        await show('Lectio', { text: source, title, field });
        if (options.length > 1) assert.deepEqual(await page.locator('.alternative-tab__title').allTextContents(), options.map(o => o.title));
        for (let index = 0; index < options.length; index++) {
          if (options.length > 1) await page.getByRole('tab').nth(index).click();
          const expected = parse(options[index].html);
          assert.equal((await page.getByRole('tabpanel').textContent()).replace(/\s/gu, ''), expected.text.replace(/\s/gu, ''));
          const captions = expected.querySelectorAll('p').filter(p => /^рэспансорый/iu.test(p.text.trim()));
          assert.ok(captions.length > 0);
          assert.equal(await page.locator('[role="tabpanel"] [data-liturgical-heading]').count(), captions.length);
          assertStyles(await headingStyles());
          if (width === 390 && index === 0) await page.screenshot({ path: path.join(output, `${theme}-${id}-${field}-responsory.png`), fullPage: true });
        }
      }

      const mixed = '<p><span style="color:red">Кароткі рэспан</span><span style="color:red">сорый Ян 13, 35</span></p>'
        + '<p><span style="color:red">Н.</span> Любіце адзін аднаго.</p>'
        + '<p><span style="color:red">Рэспансорый Ян 13, 35<br>Н. Любіце адзін аднаго.</span></p>';
      await show('Reading', { text: mixed });
      assert.equal(await page.locator('[data-liturgical-heading]').count(), 1, 'mixed paragraphs and replies are not section headings');
      assert.equal(await page.locator('[data-liturgical-subheading]').count(), 0);
      assertStyles(await headingStyles());
      const bodies = await page.locator('[role="tabpanel"] p:not([data-liturgical-heading])').evaluateAll(nodes => nodes.map(n => {
        const style = getComputedStyle(n);
        return { size: style.fontSize, readerSize: getComputedStyle(n.closest('.ora-text')).fontSize, align: style.textAlign };
      }));
      bodies.forEach(body => { assert.equal(body.size, body.readerSize); assert.equal(body.align, 'left'); });
      await show('Reading', { text: '<p><span style="color:red">Рэспансорый Ян 13, 35<br>Н. Любіце адзін аднаго.</span></p>' });
      assert.equal(await page.locator('[data-liturgical-heading], [data-liturgical-subheading]').count(), 0, 'even the first fully red mixed paragraph stays body text');

      // Each Office reading alternative gets its own leading metadata budget.
      const choices = [1, 2].map(n => `<p><span style="color:red">Другое чытанне</span></p><p><em>Крыніца ${n}</em></p><p><span style="color:red">Тэма ${n}</span></p><p>Звычайны тэкст ${n}.</p>`).join('<hr>');
      await show('Lectio', { text: choices, title: 'Другое чытанне', field: 'officeOfReadingsR2' });
      assert.equal(await page.getByRole('tab').count(), 2);
      for (const index of [0, 1]) {
        await page.getByRole('tab').nth(index).click();
        assert.equal(await page.locator('[data-liturgical-heading]').count(), 1, 'no repeated section title');
        assert.equal(await page.locator('[data-liturgical-subheading]').count(), 2, 'each variant has its own source and theme');
        assertStyles(await headingStyles());
      }
      await page.getByRole('tab').nth(1).focus();
      await page.keyboard.press('ArrowLeft');
      assert.equal(await page.getByRole('tab').nth(0).getAttribute('aria-selected'), 'true');

      await show('Psalms', { ps1: commons['office-for-dead'].officeOfReadingsPs1, ps2: commons['office-for-dead'].laudesPs2 });
      const captions = await page.locator('.ora-psalm [data-liturgical-subheading]').evaluateAll(nodes => nodes.map(n => ({ align: getComputedStyle(n).textAlign, size: parseFloat(getComputedStyle(n).fontSize), bodySize: parseFloat(getComputedStyle(n.closest('.ora-text')).fontSize) })));
      assert.ok(captions.length > 1);
      captions.forEach(c => { assert.equal(c.align, 'center'); assert.ok(c.size < c.bodySize); });
      if (width === 390) await page.screenshot({ path: path.join(output, `${theme}-psalm-canticle.png`), fullPage: true });
      await show('Hymnus', { text: commons['office-for-dead'].laudesHymn });
      assert.equal(await page.locator('[data-liturgical-subheading]').count(), 0, 'hymn stanzas are untouched');
      console.log(`${theme}/${width}px: readings, alternatives, lections, psalm/canticle captions and hymn passed`);
    }
  }
  assert.deepEqual(errors, []);
  console.log(`Screenshots: ${output}`);
} finally {
  await browser.close();
  rmSync(entry, { force: true });
}

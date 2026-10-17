import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createMemoryHistory, createRouter } from 'vue-router';
import {
  buildAdventDateOptions,
  buildChristmasDateOptions,
} from '../src/utils/liturgicalPicker.js';

test('feast search survives reader Back without extra entries for query/filter edits', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const server = await createServer({
    configFile: false, root, plugins: [vue()],
    cacheDir: 'node_modules/.cache/picker-navigation-test-vite',
    resolve: { alias: { '@': `${root}/src` } },
    server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, entries: [] },
  });
  try {
    const { default: FeastsPicker } = await server.ssrLoadModule('/src/components/liturgical/FeastsPicker.vue');
    const empty = { render: () => h('div') };
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/', component: empty }, { path: '/picker', component: empty }, { path: '/reader', component: empty },
    ] });
    await router.push('/');
    await router.push('/picker?tab=feasts&mode=readings');
    let state;
    const app = createSSRApp({ setup() {
      state = FeastsPicker.setup({ year: 2026, mode: 'readings' }, { expose() {}, emit() {} });
      return () => h('div');
    } });
    app.use(router);
    await renderToString(app);
    const navigate = (action) => new Promise((resolve, reject) => {
      const remove = router.afterEach((_to, _from, failure) => { remove(); failure ? reject(failure) : resolve(); });
      action();
    });
    await navigate(() => { state.searchQuery.value = '06.12'; });
    await navigate(() => { state.sourceFilter.value = 'fixed'; });
    assert.equal(state.filteredFeasts.value.length, 1);
    assert.equal(state.filteredFeasts.value[0].optionId, 'sv-nicholas');
    await router.push('/reader');
    await navigate(() => router.back());
    assert.equal(state.searchQuery.value, '06.12');
    assert.equal(state.sourceFilter.value, 'fixed');
    assert.equal(router.currentRoute.value.query.mode, 'readings');
    await router.replace({ query: { ...router.currentRoute.value.query, tab: 'period' } });
    await router.replace({ query: { ...router.currentRoute.value.query, tab: 'feasts' } });
    assert.equal(state.searchQuery.value, '06.12');
    assert.equal(state.sourceFilter.value, 'fixed');
    await navigate(() => state.resetFilters());
    assert.equal(state.searchQuery.value, '');
    assert.equal(state.sourceFilter.value, 'all');
    await navigate(() => router.back());
    assert.equal(router.currentRoute.value.path, '/', 'typing, filters and tabs replace the same picker history entry');
    await router.push('/picker?filter=unexpected');
    assert.equal(state.sourceFilter.value, 'all');
  } finally {
    await server.close();
  }
});

test('period selection emits the reader directly without an intermediate options list', () => {
  const picker = readFileSync(new URL('../src/components/liturgical/PeriodPicker.vue', import.meta.url), 'utf8');
  const template = picker.split('<script setup>')[0];
  assert.doesNotMatch(template, /result-card|result-list|варыянты|readingCount/);
  assert.match(picker, /fetchReadingsByDate\(date, \{ periodOnly: true \}\)/);
  assert.match(picker, /getLiturgicalContentForDate\(date, currentOrdoDiocese\(\), \{ periodOnly: true \}\)/);
  assert.match(picker, /emit\('day-selected', \{ dayId: option\.dayId, date, periodOnly: true/);
  for (const file of ['components/oraparts/DayTitle.vue', 'components/readings/ReadingsView.vue', 'components/liturgical/FeastsPicker.vue']) {
    assert.doesNotMatch(readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'), /Апорная дата|Даведачны рэжым|Прагляд тэкстаў, а не/);
  }
});

test('offers every privileged Advent date from 17 through 24 December', () => {
  const dates = buildAdventDateOptions(2026);
  assert.equal(dates.length, 8);
  assert.equal(dates[0].isoDate, '2026-12-17');
  assert.equal(dates.at(-1).isoDate, '2026-12-24');
});

test('offers Christmas exclusively as dates from 25 December through the Baptism', () => {
  const dates = buildChristmasDateOptions(2026);
  assert.equal(dates.length, 17);
  assert.equal(dates[0].isoDate, '2026-12-25');
  assert.equal(dates[6].isoDate, '2026-12-31');
  assert.equal(dates[7].isoDate, '2027-01-01');
  assert.equal(dates.at(-1).isoDate, '2027-01-10');
  assert.deepEqual(
    [...new Set(dates.map((item) => `${item.monthFull} ${item.year}`))],
    ['снежань 2026', 'студзень 2027'],
  );
  assert.equal(new Set(dates.map((item) => item.isoDate)).size, dates.length);
});

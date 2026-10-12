import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHashHistory, RouterView } from 'vue-router';
import { VApp, VMain } from 'vuetify/components';
import vuetify from '/src/plugins/vuetify.js';
import '/src/styles/main.scss';
import PrayersList from '/src/components/prayers/PrayersList.vue';
import PrayerView from '/src/components/prayers/PrayerView.vue';
import { usePrayersStore } from '/src/stores/prayers.js';
import { usePrayersFiltersStore } from '/src/stores/prayersFilters.js';
import { useSettingsStore } from '/src/stores/settings.js';
import { buildPrayerCategoryMenu } from '/src/utils/prayerCategoryMenu.js';
import { fixture } from '/__yearcycle-fixture.mjs';

const router = createRouter({ history: createWebHashHistory(), routes: [
  { path: '/', component: PrayersList, name: 'PrayersList' },
  { path: '/prayer/:id', component: PrayerView, name: 'PrayerView' },
] });
const app = createApp({ setup() {
  const prayers = usePrayersStore(), filters = usePrayersFiltersStore(), settings = useSettingsStore();
  prayers.init();
  window.__yearcycleUi = { router, settings };
  const menu = buildPrayerCategoryMenu(fixture.categories, [], [], fixture.prayers);
  return () => h(VApp, {}, { default: () => h(VMain, {}, { default: () => [
    h('nav', { style: 'display:flex;gap:16px;padding:16px;flex-wrap:wrap' }, [
      h('button', { onClick: () => { filters.clearFilters(); router.push('/'); } }, 'Малітвы'),
      ...menu.map((category) => h('button', { onClick: () => { filters.setSelectedCategory(category); router.push('/'); } }, category.name)),
      h('button', { onClick: () => { document.documentElement.style.setProperty('--font-size-multiplier', '1.4'); } }, 'Павялічыць тэкст'),
    ]),
    h('div', { style: 'max-width:960px;margin:auto;padding:12px' }, [h(RouterView)]),
  ] }) });
} });
app.use(createPinia()).use(vuetify).use(router).mount('#app');

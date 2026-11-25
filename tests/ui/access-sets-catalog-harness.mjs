import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHashHistory, RouterView } from 'vue-router';
import { VApp } from 'vuetify/components';
import vuetify from '/src/plugins/vuetify.js';
import 'vuetify/dist/vuetify.min.css';
import '/src/styles/main.scss';
import PrayersList from '/src/components/prayers/PrayersList.vue';
import PrayerView from '/src/components/prayers/PrayerView.vue';
import FavoritePrayers from '/src/views/FavoritePrayers.vue';
import { usePrayersStore } from '/src/stores/prayers.js';
import { usePrayerCategoriesStore } from '/src/stores/prayerCategories.js';
import { installPrayerCatalogEntitlements } from '/src/services/prayerCatalogAccess.js';

const content = (id, payload) => ({ id, ...payload, accessSchemaVersion: 2,
  accessSets: ['marian'], effectiveAccessSets: ['marian'], contentHash: '1'.repeat(64) });
const prayers = [
  content('private-prayer', { title: 'Synthetic private title', text: 'Synthetic private body', categoryId: 'private-category' }),
  content('direct-only', { title: 'Synthetic direct title', text: 'Synthetic direct body' }),
];
const categories = [content('private-category', { name: 'Synthetic private category', parentId: 'public-category' })];
const gateway = {
  async listIds(kind) { return { ids: (kind === 'prayers' ? prayers.slice(0, 1) : categories).map((row) => row.id), cursor: null }; },
  async readContent(kind, id) { return (kind === 'prayers' ? prayers : categories).find((row) => row.id === id) ?? null; },
};
let allowedSets = ['marian'];
let invalidate;
installPrayerCatalogEntitlements({
  async confirm() { return { mode: 'canonical', uid: 'synthetic', allowedSets, gateway }; },
  subscribe(callback) { invalidate = callback; return () => { invalidate = undefined; }; },
});

const router = createRouter({ history: createWebHashHistory(), routes: [
  { path: '/', component: PrayersList, name: 'Prayers' },
  { path: '/all', component: PrayersList, name: 'PrayersList' },
  { path: '/prayers/:id', component: PrayerView, name: 'PrayerView' },
  { path: '/favorites', component: FavoritePrayers, name: 'FavoritePrayers' },
  { path: '/feedback', component: { render: () => 'Synthetic feedback' }, name: 'Feedback' },
] });
window.catalogHarness = {
  go: (to) => router.push(to),
  revoke() { allowedSets = []; invalidate(); },
};

createApp({
  setup() {
    usePrayersStore().init();
    usePrayerCategoriesStore().init();
    return () => h(VApp, () => h(RouterView));
  },
}).use(createPinia()).use(router).use(vuetify).mount('#app');

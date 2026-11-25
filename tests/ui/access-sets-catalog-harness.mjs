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
const calls = { confirm: 0, list: 0, get: 0 };
const gateway = {
  async listIds(kind) { calls.list++; return { ids: (kind === 'prayers' ? prayers.slice(0, 1) : categories).map((row) => row.id), cursor: null }; },
  async readContent(kind, id) { calls.get++; return (kind === 'prayers' ? prayers : categories).find((row) => row.id === id) ?? null; },
};
let allowedSets = ['marian'];
let invalidate;
installPrayerCatalogEntitlements({
  async confirm() { calls.confirm++; return { mode: 'canonical', uid: 'synthetic', allowedSets, gateway }; },
  subscribe(callback) { invalidate = callback; return () => { invalidate = undefined; }; },
});

const router = createRouter({ history: createWebHashHistory(), routes: [
  { path: '/', component: PrayersList, name: 'Prayers' },
  { path: '/home', component: { render: () => 'Synthetic home' }, name: 'Home' },
  { path: '/all', component: PrayersList, name: 'PrayersList' },
  { path: '/prayers/:id', component: PrayerView, name: 'PrayerView' },
  { path: '/favorites', component: FavoritePrayers, name: 'FavoritePrayers' },
  { path: '/feedback', component: { render: () => 'Synthetic feedback' }, name: 'Feedback' },
] });
window.catalogHarness = {
  go: (to) => router.push(to),
  revoke() { allowedSets = []; invalidate(); },
  counts: () => ({ ...calls }),
};

createApp({
  setup() {
    const prayerStore = usePrayersStore();
    const categoryStore = usePrayerCategoriesStore();
    window.catalogHarness.openMenu = () => { prayerStore.init(); categoryStore.init(); };
    window.catalogHarness.publicReady = () => !prayerStore.isLoading && !categoryStore.isLoading;
    return () => h(VApp, () => h(RouterView));
  },
}).use(createPinia()).use(router).use(vuetify).mount('#app');

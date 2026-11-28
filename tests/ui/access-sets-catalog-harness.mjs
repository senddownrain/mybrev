import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHashHistory, RouterView } from 'vue-router';
import { VApp } from 'vuetify/components';
import vuetify from '/src/plugins/vuetify.js';
import 'vuetify/dist/vuetify.min.css';
import '/src/styles/main.scss';
import PrayersList from '/src/components/prayers/PrayersList.vue';
import PrayerView from '/src/components/prayers/PrayerView.vue';
import PrayerForm from '/src/components/prayers/PrayerForm.vue';
import PrayerCategories from '/src/views/admin/PrayerCategories.vue';
import NavigationDrawer from '/src/layouts/default/NavigationDrawer.vue';
import Settings from '/src/views/Settings.vue';
import { useUiStore } from '/src/stores/ui.js';
import { useSettingsStore } from '/src/stores/settings.js';
import { authFixture } from '/src/stores/auth.js';
import { installPrayerCatalogEntitlements } from '/src/services/prayerCatalogAccess.js';

const content = (id, set, payload) => ({
  id, accessSchemaVersion: 2, accessSets: [set], effectiveAccessSets: [set], contentHash: '1'.repeat(64), ...payload,
});
const sets = [
  { id: 'priest', name: 'Святарскі доступ', status: 'active' },
  { id: 'marian', name: 'Марыянскія малітвы', status: 'active' },
  { id: 'another', name: 'Трэці набор', status: 'active' },
];
const publicPrayer = { id: 'public-prayer', title: 'Synthetic public title', text: 'Synthetic public body', categoryId: 'public-category' };
const publicCategory = { id: 'public-category', name: 'Synthetic public category' };
const categories = sets.flatMap(({ id: set }, n) => Array.from({ length: [8, 1, 2][n] }, (_, i) => content(
  set + '-category-' + i, set, {
    name: i ? set + ' category ' + i : ['Для святара', 'Для марыянаў', 'Трэці зборнік'][n], order: i,
    ...(i && { parentId: set + '-category-0', accessSets: [] }),
    ...(set === 'marian' && { prayerIds: Array.from({ length: 56 }, (_, i) => 'marian-prayer-' + i) }),
    ...(!i && { comment: { content: `Synthetic ${set} category commentary` } }),
  },
)));
const prayers = sets.flatMap(({ id: set }, n) => Array.from({ length: [46, 56, 1][n] }, (_, i) => content(
  set + '-prayer-' + i, set, {
    title: set + ' prayer ' + i, text: set + ' synthetic prayer text ' + i,
    categoryId: set + '-category-' + (n === 0 ? i % 7 : 0),
    ...(set === 'marian' && i === 2 && { text: 'Л. За нашую краіну\nУ. Пане, пачуй нас.\n\n_Прыёмка рубрыкі._', textFormat: 'mybrev-markdown' }),
  },
)));
const calls = { confirm: 0, list: 0, get: 0 };
const gateway = {
  async listIds(kind, setId, { pageSize, after }) {
    calls.list++;
    const rows = (kind === 'prayers' ? prayers : categories).filter((row) => row.effectiveAccessSets.includes(setId));
    const start = after ? rows.findIndex((row) => row.id === after) + 1 : 0;
    const ids = rows.slice(start, start + pageSize).map((row) => row.id);
    return { ids, cursor: ids.length === pageSize ? ids.at(-1) : null };
  },
  async readContent(kind, id) {
    calls.get++;
    return (kind === 'prayers' ? prayers : categories).find((row) => row.id === id) ?? null;
  },
};
let allowedSets = [];
let invalidate;
let legacy = false;
let suspended = false;
let finishRefresh;
let resumeChecks = 0;
installPrayerCatalogEntitlements({
  refresh() {
    resumeChecks++;
    return new Promise((resolve) => { finishRefresh = resolve; });
  },
  async confirm() {
    calls.confirm++;
    if (suspended) return { mode: 'suspended' };
    if (legacy) return { mode: 'legacy', legacyActive: true, readLegacy: async () => ({
      prayers: prayers.filter((row) => row.effectiveAccessSets.includes('priest')),
      categories: categories.filter((row) => row.effectiveAccessSets.includes('priest')),
    }) };
    return { mode: 'canonical', uid: 'synthetic', allowedSets, gateway };
  },
  subscribe(callback) { invalidate = callback; return () => { invalidate = undefined; }; },
});

const dummy = { render: () => 'Synthetic link target' };
const navRoutes = ['Today', 'Readings', 'Ordo', 'Bible', 'Compendium', 'Songs', 'About', 'Feedback']
  .map((name) => ({ path: '/' + name.toLowerCase(), component: dummy, name }));
const router = createRouter({ history: createWebHashHistory(), routes: [
  ...navRoutes,
  { path: '/', component: PrayersList, name: 'Prayers' },
  { path: '/home', component: { render: () => 'Synthetic home' }, name: 'Home' },
  { path: '/settings', component: Settings, name: 'Settings' },
  { path: '/all', component: PrayersList, name: 'PrayersList' },
  { path: '/prayers/:id', alias: '/prayer/:id', component: PrayerView, name: 'PrayerView' },
  { path: '/favorites', component: { render: () => 'Favorites' }, name: 'FavoritePrayers' },
  { path: '/admin/prayers', component: PrayersList, name: 'AdminPrayers', props: { editorial: true } },
  { path: '/admin/categories', component: PrayerCategories, name: 'AdminPrayerCategories' },
  { path: '/prayer/edit/:id', component: PrayerForm, name: 'PrayerEdit' },
  { path: '/prayer/add', component: PrayerForm, name: 'PrayerAdd' },
] });
window.catalogHarness = {
  go: (to) => router.push(to),
  visibility(hidden) {
    Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
    document.dispatchEvent(new globalThis.Event('visibilitychange'));
  },
  resumeChecks: () => resumeChecks,
  finishRefresh: () => finishRefresh?.(),
  confirm(allowed) {
    suspended = allowed === 'suspended';
    legacy = allowed === 'legacy';
    allowedSets = Array.isArray(allowed) ? allowed : [];
    invalidate();
  },
  counts: () => ({ ...calls }),
  editor() { Object.assign(authFixture, { isAdmin: true, user: { uid: 'synthetic-editor' }, canManageAccessSetsV2: true }); },
  sets,
  adminContent: () => ({ prayers: [publicPrayer, ...prayers], categories: [publicCategory, ...categories], mode: 'canonical' }),
};

createApp({
  setup() {
    const ui = useUiStore();
    const settings = useSettingsStore();
    window.catalogHarness.theme = (name) => { settings.themePreference = name; };
    window.catalogHarness.fontSize = (amount) => { settings.fontSizeMultiplier = amount; };
    window.catalogHarness.openMenu = () => { ui.isDrawerOpen = true; };
    window.catalogHarness.closeMenu = () => { ui.isDrawerOpen = false; };
    return () => h(VApp, () => [h(NavigationDrawer), h(RouterView)]);
  },
}).use(createPinia()).use(router).use(vuetify).mount('#app');

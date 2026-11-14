import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHashHistory, RouterView } from 'vue-router';
import { VApp, VMain, VBtn } from 'vuetify/components';
import vuetify from '/src/plugins/vuetify.js';
import 'vuetify/dist/vuetify.min.css';
import '/src/styles/main.scss';
import NavigationDrawer from '/src/layouts/default/NavigationDrawer.vue';
import { useUiStore } from '/src/stores/ui.js';
import { useAuthStore } from '/src/stores/auth.js';
import { useSettingsStore } from '/src/stores/settings.js';
import { usePrayerCategoriesStore } from '/src/stores/prayerCategories.js';
import { usePrayersFiltersStore } from '/src/stores/prayersFilters.js';
import { usePrayersStore } from '/src/stores/prayers.js';
import { vReaderProse } from '/src/directives/readerProse.js';
const Dummy = { render: () => h('p', 'Fixture destination') };
const router = createRouter({ history: createWebHashHistory(), scrollBehavior: (_to, _from, saved) => saved || { top: 0, left: 0 }, routes: [
  { path: '/', component: () => import('/src/views/admin/PrayerCategories.vue'), name: 'Admin' },
  { path: '/prayers', component: () => import('/src/components/prayers/PrayersList.vue'), name: 'Prayers' },
  { path: '/prayers/list', component: () => import('/src/components/prayers/PrayersList.vue'), name: 'PrayersList' },
  { path: '/prayer/:id', component: () => import('/src/components/prayers/PrayerView.vue'), name: 'PrayerView' },
  { path: '/prayer/edit/:id', component: Dummy, name: 'PrayerEdit' },
  { path: '/prayer/add', component: Dummy, name: 'PrayerAdd' },
  ...['Today','Readings','Ordo','Bible','Compendium','Songs','FavoritePrayers','Settings','About','Login','Feedback'].map(name=>({path:`/fixture/${name}`,component:Dummy,name})),
] });
const app=createApp({setup(){
  const ui=useUiStore(),auth=useAuthStore(),settings=useSettingsStore(),categories=usePrayerCategoriesStore(),prayers=usePrayersStore();
  window.__categoryUi={router,ui,auth,settings,categories,prayers,filters:usePrayersFiltersStore()};
  return ()=>h(VApp,{},()=>[h(NavigationDrawer),h(VMain,{},()=>[h(VBtn,{onClick:()=>ui.toggleDrawer()},()=> 'Меню катэгорый'),h(RouterView)])]);
}});
app.use(createPinia()).use(vuetify).use(router).directive('reader-prose',vReaderProse).mount('#app');

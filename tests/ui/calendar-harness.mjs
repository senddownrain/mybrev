import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHashHistory, RouterView } from 'vue-router';
import { VApp } from 'vuetify/components';
import vuetify from '/src/plugins/vuetify.js';
import '/src/styles/main.scss';
import BottomNav from '/src/layouts/default/BottomNav.vue';
import ReadingsBottomNav from '/src/layouts/default/ReadingsBottomNav.vue';
import OrdoBottomNav from '/src/layouts/default/OrdoBottomNav.vue';

// Actual calendar entry components, with no application data/auth bootstrap.
const router = createRouter({ history: createWebHashHistory(), routes: [
  { path: '/day/:day', name: 'SelectedDay', component: BottomNav },
  { path: '/readings/:date', name: 'ReadingsByDate', component: ReadingsBottomNav },
  { path: '/ordo/:date', name: 'OrdoByDate', component: OrdoBottomNav },
] });
await router.replace('/day/2026-10-04');
createApp({ render: () => h(VApp, null, { default: () => [
  h('div', { style: 'position:fixed;top:0;left:0;z-index:1004' }, 'Background toolbar'),
  h(RouterView),
] }) }).use(createPinia()).use(vuetify).use(router).mount('#app');
window.calendarUi = { router, theme: vuetify.theme };

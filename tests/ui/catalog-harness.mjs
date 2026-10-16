import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHashHistory, RouterView } from 'vue-router';
import { VApp, VMain } from 'vuetify/components';
import vuetify from '/src/plugins/vuetify.js';
import '/src/styles/main.scss';
import LiturgicalPicker from '/src/views/LiturgicalPicker.vue';
import PickerBottomNav from '/src/layouts/default/PickerBottomNav.vue';
import { setOrdoDioceses } from '/src/utils/ordoDiocese.js';
setOrdoDioceses(['minsk-mohilev', 'pinsk', 'grodno', 'vitebsk']);
const Destination = { render: () => h('p', 'Каляндарная пазіцыя') };
const router = createRouter({ history: createWebHashHistory(), routes: [
  { path: '/picker', name: 'LiturgicalPicker', components: { default: LiturgicalPicker, bottomNav: PickerBottomNav } },
  { path: '/', name: 'Today', component: Destination },
  { path: '/readings', name: 'Readings', component: Destination },
  { path: '/day/:day', name: 'SelectedDay', component: Destination },
  { path: '/readings/:date', name: 'ReadingsByDate', component: Destination },
] });
await router.replace({ name: 'LiturgicalPicker', query: { tab: 'feasts' } });
createApp({ render: () => h(VApp, null, { default: () => [
  h(VMain, { class: 'app-main--bottom-nav' }, { default: () => h(RouterView) }),
  h(RouterView, { name: 'bottomNav' }),
] }) })
  .use(createPinia()).use(vuetify).use(router).mount('#app');
window.catalogUi = { router, theme: vuetify.theme };

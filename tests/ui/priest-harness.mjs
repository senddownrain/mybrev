import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHashHistory } from 'vue-router';
import AdminLayout from '/src/layouts/admin/Admin.vue';
import vuetify from '/src/plugins/vuetify.js';
import 'vuetify/dist/vuetify.min.css';
import '/src/styles/main.scss';
import PriestAccess from '/src/views/admin/PriestAccess.vue';
import {doc,getDocFromCache,getDocFromServer} from 'firebase/firestore';
import {priestFirebase} from '/src/plugins/priestFirebase.js';
const PrayerCategories = () => import('/src/views/admin/PrayerCategories.vue');
const PrayerForm = () => import('/src/components/prayers/PrayerForm.vue');
const PriestAccessSettings = () => import('/src/components/prayers/PriestAccessSettings.vue');
const router = createRouter({ history: createWebHashHistory(), routes: [
  { path: '/', component: PriestAccess, name: 'Admin' },
  { path: '/categories', component: PrayerCategories },
  { path: '/prayer/edit/:id', component: PrayerForm, name: 'PrayerEdit' },
  { path: '/settings', component: PriestAccessSettings },
  { path: '/today', component: PriestAccessSettings, name: 'Today' },
  { path: '/prayers', component: PriestAccessSettings, name: 'PrayersList' },
  { path: '/prayer/:id', component: PriestAccessSettings, name: 'PrayerView' },
] });
window.__priestUi = { router,
  async localClaim(uid){try{return (await getDocFromCache(doc(priestFirebase.db,'priestActivationClaims',uid))).data()||null;}catch(error){if(error.code==='unavailable')return null;throw error;}},
  async claimDenied(uid){try{await getDocFromServer(doc(priestFirebase.db,'priestActivationClaims',uid));return false;}catch(error){if(error.code==='permission-denied')return true;throw error;}},
};
createApp({ render: () => h(AdminLayout) }).use(createPinia()).use(vuetify).use(router).mount('#app');

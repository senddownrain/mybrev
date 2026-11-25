import { createApp } from 'vue';
import { doc, getDocFromCache, getDocFromServer } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import 'vuetify/dist/vuetify.min.css';
import '/src/styles/main.scss';
import vuetify from '/src/plugins/vuetify.js';
import { firebaseApp } from '/src/plugins/firebase.js';
import { getPriestAuth, priestFirebase } from '/src/plugins/priestFirebase.js';
import { accessSetsSession, startPriestAccess } from '/src/services/priestAccessService.js';
import PriestAccessSettings from '/src/components/prayers/PriestAccessSettings.vue';

window.__s2 = {
  session: accessSetsSession,
  async uid() {
    const auth = await getPriestAuth();
    await auth.authStateReady();
    return auth.currentUser?.uid ?? null;
  },
  adminUid: () => getAuth(firebaseApp).currentUser.uid,
  refresh: () => startPriestAccess(),
  async modeReadable() {
    try {
      await getDocFromServer(doc(priestFirebase.db, 'priestContentControl', 'accessSetsV2'));
      return true;
    } catch (error) {
      if (error.code === 'permission-denied') return false;
      throw error;
    }
  },
  async legacyText() {
    if (!accessSetsSession.legacyActive) return null;
    return (await getDocFromServer(doc(priestFirebase.db, 'priestProtectedPrayers', 's2-fixture'))).data().text;
  },
  async cachedClaim(collection, uid) {
    try {
      return (await getDocFromCache(doc(priestFirebase.db, collection, uid))).data() ?? null;
    } catch (error) {
      if (error.code === 'unavailable') return null;
      throw error;
    }
  },
};

createApp(PriestAccessSettings).use(vuetify).mount('#app');

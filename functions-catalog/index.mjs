import { defineString } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { bindCanonicalCatalogCallable } from './bind.mjs';

const region = defineString('S4_CATALOG_REGION', { default: 'europe-west1' });
const serviceAccount = 'mybrev-catalog-writer@ibreviaryby.iam.gserviceaccount.com';

async function loadHandler() {
  const [{ getApps, initializeApp }, { getAuth }, { getFirestore, setLogFunction },
    { createCanonicalCatalogHandler }, { createCatalogAuthorization }] = await Promise.all([
    import('firebase-admin/app'), import('firebase-admin/auth'), import('firebase-admin/firestore'),
    import('../scripts/lib/access-sets-v2-writer.mjs'), import('./authorization.mjs'),
  ]);
  const app = getApps().find((app) => app.name === 'canonical-catalog') ?? initializeApp(undefined, 'canonical-catalog');
  const db = getFirestore(app);
  db.settings({ useBigInt: true });
  setLogFunction(null);
  return createCanonicalCatalogHandler({ db, HttpsError, authorize: createCatalogAuthorization({ db, auth: getAuth(app), HttpsError }) });
}

export const canonicalCatalog = bindCanonicalCatalogCallable({
  onCall, HttpsError, loadHandler,
  options: {
    region, serviceAccount, timeoutSeconds: 60,
    cors: [
      'https://malitounik.by', 'https://www.malitounik.by',
      'https://ibreviaryby.web.app', 'https://ibreviaryby.firebaseapp.com',
    ],
  },
});

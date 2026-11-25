import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from '@/plugins/firebase';
import { createCanonicalPrayerSaveApi } from './prayerStorageService';

export function connectCanonicalPrayerSaveApi(region = 'europe-west1') {
  // The primary admin app supplies both Firebase Auth and App Check. The
  // named reader app uses a separate identity and never invokes this API.
  const invoke = httpsCallable(getFunctions(firebaseApp, region), 'canonicalCatalog');
  return createCanonicalPrayerSaveApi(async (request) => (await invoke(request)).data);
}

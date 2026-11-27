import { initializeApp } from "firebase/app";
import { initializeFirestore, memoryLocalCache, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { createFirestoreCacheRecovery } from '../utils/firestoreCacheRecovery';
import { initializeClientAppCheck } from './firebaseAppCheck';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  databaseUrl: import.meta.env.VITE_FIREBASE_DATABASE_URL,
};

export const firebaseApp = initializeApp(firebaseConfig);
initializeClientAppCheck(firebaseApp, import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY);

export const firestoreCacheRecovery = createFirestoreCacheRecovery({
  projectId: firebaseConfig.projectId,
  storage: () => typeof window !== 'undefined' ? window.sessionStorage : undefined,
  reload: () => window.location.reload(),
  isOnline: () => typeof navigator !== 'undefined' && navigator.onLine !== false,
});

// Persistent local cache limited to 100MB to prevent excessive memory usage.
// CACHE_SIZE_UNLIMITED is intentionally avoided.
export const db = initializeFirestore(firebaseApp, {
  localCache: firestoreCacheRecovery.usesMemoryCache() ? memoryLocalCache() : persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
    cacheSizeBytes: 100 * 1024 * 1024, // 100MB
  }),
});

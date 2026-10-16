import { getApp, getApps, initializeApp } from 'firebase/app';
import { initializeFirestore, memoryLocalCache, setLogLevel } from 'firebase/firestore';
import { getFirestore as getActivationFirestore, setLogLevel as setActivationLogLevel } from 'firebase/firestore/lite';
import { firebaseApp } from './firebase';

// SDK diagnostics can include a failed REST write's complete payload/proof.
// Keep application error handling, but never let SDK logging print secrets.
setLogLevel('silent');
setActivationLogLevel('silent');

// Separate app names also isolate Firebase Auth persistence. Never sign the
// primary administrator Auth in anonymously. Protected Firestore is memory-only.
function memoryApp(name) {
  const app = getApps().some((item) => item.name === name) ? getApp(name) : initializeApp(firebaseApp.options, name);
  return { app, db: initializeFirestore(app, { localCache: memoryLocalCache() }) };
}
export const priestFirebase = memoryApp('mybrev-priest');
export const priestEditorFirebase = memoryApp('mybrev-priest-editor');
// Lite uses the same app/Auth but has no local store or offline write queue.
// The proof-bearing claim must never enter the long-lived reader SDK cache.
export function getPriestActivationDb() {
  return getActivationFirestore(priestFirebase.app);
}
let deviceAuthPromise;
export function getPriestAuth() {
  deviceAuthPromise ||= import('firebase/auth').then(({ initializeAuth, indexedDBLocalPersistence, browserLocalPersistence }) =>
    initializeAuth(priestFirebase.app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] }));
  return deviceAuthPromise;
}
let editorAuthPromise;
export async function getPriestEditorDb() {
  const { getAuth, initializeAuth, inMemoryPersistence, updateCurrentUser } = await import('firebase/auth');
  const primary = getAuth(firebaseApp);
  await primary.authStateReady();
  if (!primary.currentUser) throw new Error('Патрэбна аўтарызацыя адміністратара.');
  editorAuthPromise ||= Promise.resolve(initializeAuth(priestEditorFirebase.app, { persistence: inMemoryPersistence }));
  const editor = await editorAuthPromise;
  // Copy the authenticated User in memory using the SDK, never its password or
  // a custom token. This does not modify the primary Auth or device Auth.
  await updateCurrentUser(editor, primary.currentUser);
  return priestEditorFirebase.db;
}

// Same authenticated administrator and Rules, without a queued/offline write
// or a Listen stream for one-shot administrative metadata reads.
export async function getPriestEditorWriteDb() {
  await getPriestEditorDb();
  return getActivationFirestore(priestEditorFirebase.app);
}

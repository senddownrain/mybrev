import { defineStore } from 'pinia';
import { ref } from 'vue';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/plugins/firebase';
import { logger } from '@/utils/logger';
import { retryFirestore } from '@/utils/retry';
import { ADMIN_UIDS } from '@/constants/admin';
import router from '@/router';

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null);
  /** True while an explicitly requested auth/admin check is resolving. */
  const loading = ref(false);
  /** Reactive admin flag — updated asynchronously after auth state change */
  const isAdmin = ref(false);
  let authReadyPromise = null;

  /**
   * Check admin status: Firestore `admins/{uid}` first, fallback to hardcoded ADMIN_UIDS.
   * Add a document `{ email, name }` to the `admins` collection (doc ID = uid) to grant access.
   * @param {string} uid
   * @returns {Promise<boolean>}
   */
  async function checkIsAdmin(uid) {
    // Hardcoded fallback (bootstrap / emergency access)
    if (ADMIN_UIDS.includes(uid)) return true;

    try {
      const adminDoc = await getDoc(doc(db, 'admins', uid));
      return adminDoc.exists();
    } catch (error) {
      logger.error('[auth] Failed to check admin status in Firestore, falling back to constants:', error);
      return false;
    }
  }

  const init = () => {
    if (authReadyPromise) return authReadyPromise;

    loading.value = true;
    authReadyPromise = import('firebase/auth').then(({ getAuth, onAuthStateChanged }) => (
      new Promise((resolve) => {
        let firstStateResolved = false;
        onAuthStateChanged(getAuth(), async (firebaseUser) => {
          loading.value = true;
          user.value = firebaseUser;

          if (firebaseUser) {
            isAdmin.value = await checkIsAdmin(firebaseUser.uid);
          } else {
            isAdmin.value = false;
          }

          loading.value = false;
          if (!firstStateResolved) {
            firstStateResolved = true;
            resolve();
          }
        });
      })
    )).catch((error) => {
      loading.value = false;
      authReadyPromise = null;
      throw error;
    });

    return authReadyPromise;
  };

  const login = async (email, password) => {
    const { getAuth, signInWithEmailAndPassword, signOut } = await import('firebase/auth');
    const auth = getAuth();
    loading.value = true;
    try {
      const credential = await retryFirestore(
        () => signInWithEmailAndPassword(auth, email, password)
      );
      const hasAdminAccess = await checkIsAdmin(credential.user.uid);
      if (!hasAdminAccess) {
        await signOut(auth);
        const accessError = new Error('Admin access required');
        accessError.code = 'auth/not-admin';
        throw accessError;
      }
      user.value = credential.user;
      isAdmin.value = true;
    } catch (error) {
      logger.error('[auth] Login error:', error);
      throw error;
    } finally {
      loading.value = false;
    }
  };

  const logout = async () => {
    const { getAuth, signOut } = await import('firebase/auth');
    const auth = getAuth();
    await signOut(auth);
    await router.push('/');
  };

  return { user, loading, isAdmin, init, login, logout };
});

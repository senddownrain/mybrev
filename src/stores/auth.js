import { defineStore } from 'pinia';
import { ref } from 'vue';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/plugins/firebase';
import { logger } from '@/utils/logger';
import { retryFirestore } from '@/utils/retry';
import { NO_ACCESS, resolveAdminAccess } from '@/utils/adminAccess';
import router from '@/router';

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null);
  /** True while an explicitly requested auth/admin check is resolving. */
  const loading = ref(false);
  /** Reactive admin flag — updated asynchronously after auth state change */
  const isAdmin = ref(false);
  /** 'admin' | 'superadmin' | null — resolved by resolveAdminAccess() only. */
  const role = ref(null);
  const isSuperAdmin = ref(false);
  const canManagePriestAccess = ref(false);
  const canManageAccessSetsV2 = ref(false);
  let authReadyPromise = null;
  let accessCheckId = 0;

  function applyAccess(access) {
    isAdmin.value = access.isAdmin;
    role.value = access.role;
    isSuperAdmin.value = access.isSuperAdmin;
    canManagePriestAccess.value = access.canManagePriestAccess;
    canManageAccessSetsV2.value = access.canManageAccessSetsV2;
  }

  /**
   * Read Firestore `admins/{uid}` and resolve the role (see utils/adminAccess.js).
   * Pure: does not touch store state. ADMIN_UIDS stay as admin fallback when the read fails.
   * @param {string} uid
   */
  async function fetchAccess(uid) {
    try {
      const adminDoc = await getDoc(doc(db, 'admins', uid));
      return resolveAdminAccess(uid, {
        exists: adminDoc.exists(),
        data: adminDoc.data(),
        fromCache: adminDoc.metadata.fromCache || adminDoc.metadata.hasPendingWrites,
      });
    } catch (error) {
      logger.error('[auth] Failed to check admin status in Firestore:', error);
      return resolveAdminAccess(uid, { failed: true });
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
          const checkId = ++accessCheckId;
          user.value = firebaseUser;
          // Drop previous privileges immediately: nothing leaks while the new account resolves.
          applyAccess(NO_ACCESS);

          if (firebaseUser) {
            const access = await fetchAccess(firebaseUser.uid);
            if (checkId === accessCheckId) applyAccess(access);
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
      const checkId = ++accessCheckId;
      const access = await fetchAccess(credential.user.uid);
      if (!access.isAdmin) {
        await signOut(auth);
        const accessError = new Error('Admin access required');
        accessError.code = 'auth/not-admin';
        throw accessError;
      }
      user.value = credential.user;
      if (checkId === accessCheckId) applyAccess(access);
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
    accessCheckId += 1;
    applyAccess(NO_ACCESS);
    await router.push('/');
  };

  return { user, loading, isAdmin, role, isSuperAdmin, canManagePriestAccess, canManageAccessSetsV2, init, login, logout };
});

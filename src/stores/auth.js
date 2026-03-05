import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/plugins/firebase';
import router from '@/router';
import { logger } from '@/utils/logger';
import { retryFirestore } from '@/utils/retry';
import { ADMIN_UIDS } from '@/constants/admin';

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null);
  /** True until both auth state and admin check are resolved */
  const loading = ref(true);
  /** Reactive admin flag — updated asynchronously after auth state change */
  const isAdmin = ref(false);

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
    const auth = getAuth();
    onAuthStateChanged(auth, async (firebaseUser) => {
      user.value = firebaseUser;

      if (firebaseUser) {
        // Keep loading = true until admin check resolves so router guard waits
        isAdmin.value = await checkIsAdmin(firebaseUser.uid);
      } else {
        isAdmin.value = false;
      }

      loading.value = false;
    });
  };

  const login = async (email, password) => {
    const auth = getAuth();
    try {
      await retryFirestore(
        () => signInWithEmailAndPassword(auth, email, password)
      );
      await router.push('/');
    } catch (error) {
      logger.error('[auth] Login error:', error);
      throw error;
    }
  };

  const logout = async () => {
    const auth = getAuth();
    await signOut(auth);
    await router.push('/');
  };

  return { user, loading, isAdmin, init, login, logout };
});

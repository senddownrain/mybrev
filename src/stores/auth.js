import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import router from '@/router';
import { logger } from '@/utils/logger';
import { retryFirestore } from '@/utils/retry';

const ADMIN_UIDS = ['64MeSP56IWVotVFG7bu8YKeLis12'];

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null);
  const loading = ref(true);

  const isAdmin = computed(() => user.value && ADMIN_UIDS.includes(user.value.uid));

  const init = () => {
    const auth = getAuth();
    onAuthStateChanged(auth, (firebaseUser) => {
      user.value = firebaseUser;
      loading.value = false;
    });
  };

  const login = async (email, password) => {
    const auth = getAuth();
    try {
      await retryFirestore(
        () => signInWithEmailAndPassword(auth, email, password)
      );
      setTimeout(() => {
        router.push('/');
      }, 100);
    } catch (error) {
      logger.error("Памылка ўваходу:", error);
      throw error;
    }
  };

  const logout = async () => {
    const auth = getAuth();
    await signOut(auth);
    router.push('/');
  };

  return { user, loading, isAdmin, init, login, logout };
});
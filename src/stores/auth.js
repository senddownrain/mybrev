import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import router from '@/router'; // ✅ Возвращаем импорт роутера

const ADMIN_UIDS = ['64MeSP56IWVotVFG7bu8YKeLis12']; // ❗️ Не забудьте вставить ваш реальный UID

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null);
  const loading = ref(true);

  const isAdmin = computed(() => user.value && ADMIN_UIDS.includes(user.value.uid));

  // Слушатель onAuthStateChanged остается без изменений
  const init = () => {
    const auth = getAuth();
    onAuthStateChanged(auth, (firebaseUser) => {
      user.value = firebaseUser;
      loading.value = false;
    });
  };

  /**
   * Login с использованием setTimeout
   */
  const login = async (email, password) => {
    const auth = getAuth();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // Успешный вход. Теперь используем трюк с setTimeout
      setTimeout(() => {
        router.push('/');
      }, 100); // 100мс - более чем достаточно для обновления Vue
    } catch (error) {
      console.error("Памылка ўваходу:", error);
      alert(`Памылка ўваходу: ${error.code}`);
      throw error; // Пробрасываем ошибку, чтобы компонент мог ее поймать
    }
  };

  const logout = async () => {
    const auth = getAuth();
    await signOut(auth);
    // При выходе всегда отправляем на главную
    router.push('/');
  };

  return { user, loading, isAdmin, init, login, logout };
});
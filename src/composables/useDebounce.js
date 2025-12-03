import { ref, watch, onUnmounted } from 'vue';

export function useDebounce(source, delay = 300) {
  const debounced = ref(source.value);
  let timeoutId = null;

  const stopWatcher = watch(source, (newValue) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      debounced.value = newValue;
    }, delay);
  }, { immediate: true });

  onUnmounted(() => {
    stopWatcher();
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });

  return debounced;
}


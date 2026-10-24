import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { createReadingChoiceStore, readingChoiceContext } from '@/utils/readingChoice';

const safeSessionStorage = () => {
  try { return globalThis.sessionStorage; } catch { return null; }
};

let store = null;
const revision = ref(0);

/**
 * The picked reading of one Office field for the day and Office option in the route. The store lives for the
 * browser session; the context (date + option id) resets it when the day, the period or the Proper/Common changes.
 */
export function useReadingChoice(field, count) {
  const route = useRoute();
  store ||= createReadingChoiceStore(safeSessionStorage());
  const context = computed(() => readingChoiceContext(route.params.day, route.params.id));
  return computed({
    get: () => { void revision.value; return store.get(field(), context.value, count()); },
    set: (index) => { store.set(field(), context.value, index); revision.value += 1; },
  });
}

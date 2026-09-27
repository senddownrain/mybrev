import { nextTick, watch } from 'vue';
import { onBeforeRouteLeave, useRoute } from 'vue-router';
import { useCompendiumStore } from '@/stores/compendium';

/**
 * Browser Back already restores scroll through the router's savedPosition when
 * the content is in memory. This covers the remaining case: the page was left
 * before the dataset finished loading, so the saved offset is applied once it
 * is rendered.
 */
export function useCompendiumScroll() {
  const store = useCompendiumStore();
  const route = useRoute();
  const key = route.fullPath;
  onBeforeRouteLeave(() => { store.saveScroll(key, window.scrollY); });
  if (store.ready) return;
  const stop = watch(() => store.ready, async (ready) => {
    if (!ready) return;
    stop();
    const top = store.savedScroll(key);
    if (top) { await nextTick(); window.scrollTo({ top }); }
  });
}

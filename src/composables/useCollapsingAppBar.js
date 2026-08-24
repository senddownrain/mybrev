import { onMounted, onUnmounted, ref } from 'vue';

/**
 * Shows the compact app-bar title once the large page title starts scrolling away.
 * The project scrolls the body element on mobile, while some desktop browsers use
 * window/documentElement, so all three positions are observed.
 */
export function useCollapsingAppBar(threshold = 24) {
  const isAppBarTitleVisible = ref(false);

  const update = () => {
    const scrollTop = Math.max(
      window.scrollY || 0,
      document.documentElement?.scrollTop || 0,
      document.body?.scrollTop || 0,
    );
    isAppBarTitleVisible.value = scrollTop > threshold;
  };

  onMounted(() => {
    update();
    window.addEventListener('scroll', update, { passive: true });
    document.body?.addEventListener('scroll', update, { passive: true });
  });

  onUnmounted(() => {
    window.removeEventListener('scroll', update);
    document.body?.removeEventListener('scroll', update);
  });

  return { isAppBarTitleVisible };
}

// Persistent Compendium search controller (used by CompendiumShell).
// Only imports `vue`, so `node --test` can drive it with a memory router.
//
// - The query text is session state (`query`, the store's searchQuery).
// - Results are open when the current Compendium route carries `?q=`. Opening
//   pushes one history entry on the current page; typing only replaces it. So
//   Back from an opened result returns to the results, and Back from the
//   results returns to the page the user was on.
// - Clearing the query closes the results and restores the page scroll.
// - Back/Forward to a `?q=` entry puts its query back into the dock.
import { computed, nextTick, watch } from 'vue';

const queryOf = (route) => (typeof route.query.q === 'string' ? route.query.q : '');

export function createCompendiumSearchSync({
  router,
  query,
  getScroll = () => 0,
  setScroll = () => {},
}) {
  const route = router.currentRoute;
  const routeQuery = computed(() => queryOf(route.value));
  const resultsOpen = computed(() => routeQuery.value.trim().length > 0);
  const pageScroll = new Map();

  const withQuery = (q) => {
    const next = { ...route.value.query };
    if (q) next.q = q;
    else delete next.q;
    return { path: route.value.path, query: next, hash: route.value.hash };
  };

  const afterNavigation = (navigate) => new Promise((resolve) => {
    const stop = router.afterEach(() => { stop(); resolve(); });
    navigate();
  });

  async function sync() {
    const value = query.value;
    if (value.trim()) {
      if (!resultsOpen.value) {
        pageScroll.set(route.value.path, getScroll());
        await router.push(withQuery(value));
        await nextTick();
        setScroll(0);
      } else if (routeQuery.value !== value) {
        await router.replace(withQuery(value));
      }
      return;
    }
    if (!resultsOpen.value) return;
    const target = router.resolve(withQuery(null)).fullPath;
    if (router.options.history.state?.back === target) {
      // The page is the previous history entry: Back restores its saved scroll.
      await afterNavigation(() => router.back());
      return;
    }
    const top = pageScroll.get(route.value.path) ?? 0;
    await router.replace(withQuery(null));
    await nextTick();
    setScroll(top);
  }

  // Route updates are serialised so fast typing never pushes twice.
  let queue = Promise.resolve();
  const enqueue = () => {
    queue = queue.then(sync).catch(() => {});
    return queue;
  };

  const stopFromRoute = watch(routeQuery, (q) => {
    if (q.trim() && q !== query.value) query.value = q;
  }, { immediate: true });
  const stopFromQuery = watch(query, enqueue);

  return {
    resultsOpen,
    /** Reopen the results of a kept query (e.g. when the dock is focused). */
    reopen: () => (query.value.trim() && !resultsOpen.value ? enqueue() : queue),
    /** Resolves when pending route updates are done (tests). */
    settled: () => queue,
    stop: () => { stopFromRoute(); stopFromQuery(); },
  };
}

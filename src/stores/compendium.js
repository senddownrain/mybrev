import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import { loadBundledCompendium, loadCompendium, loadCompendiumAliases } from '@/services/compendiumService';
import { indexCompendium } from '@/utils/compendiumData';
import { createCompendiumSearchIndex, searchCompendium } from '@/utils/compendiumSearch';

/** Read-only Compendium state. Independent of prayers, songs and the Bible. */
export const useCompendiumStore = defineStore('compendium', () => {
  const index = shallowRef(null);
  const searchIndex = shallowRef(null);
  const source = ref(null);
  const isLoading = ref(false);
  const error = ref(null);
  const refreshError = ref(null);
  const searchQuery = ref('');
  // View state kept for the session: expanded rows per reading group and
  // scroll offsets per route, restored when the user comes back.
  const expanded = ref({});
  const scrollPositions = new Map();
  let pending = null;

  const ready = computed(() => Boolean(index.value));
  const parts = computed(() => index.value?.parts || []);
  const questions = computed(() => index.value?.questions || []);
  const meta = computed(() => index.value?.meta || null);
  // The search index is built once per dataset; each keystroke only scans it.
  const searchResults = computed(() => (searchIndex.value ? searchCompendium(searchIndex.value, searchQuery.value) : []));

  function apply(dataset, aliases) {
    if (index.value?.meta?.checksum === dataset.meta.checksum) return;
    const next = indexCompendium(dataset);
    index.value = next;
    searchIndex.value = createCompendiumSearchIndex(next.questions, aliases);
  }

  /**
   * Offline-first: the bundled dataset is rendered as soon as its chunk is
   * loaded; the Firestore check runs in the background and only swaps in a
   * strictly newer, valid copy. A slow or failing network never blocks reading.
   */
  async function init(options = {}) {
    if (pending) return pending;
    if (index.value && !options.fresh) return undefined;
    isLoading.value = true;
    error.value = null;
    pending = (async () => {
      let aliases;
      try {
        let bundled;
        [bundled, aliases] = await Promise.all([loadBundledCompendium(), loadCompendiumAliases()]);
        if (!index.value) { apply(bundled, aliases); source.value = 'bundled'; }
      } catch (err) {
        error.value = err;
        return;
      } finally {
        isLoading.value = false;
        pending = null;
      }
      loadCompendium(options).then((result) => {
        apply(result.dataset, aliases);
        source.value = result.source;
        refreshError.value = result.refreshError;
      }).catch((err) => { refreshError.value = err; });
    })();
    return pending;
  }

  const getQuestion = (number) => index.value?.getQuestion(number) || null;
  const getGroup = (id) => index.value?.getGroup(id) || null;
  const getPart = (id) => index.value?.getPart(id) || null;
  const isExpanded = (groupId, number) => Boolean(expanded.value[groupId]?.includes(number));
  function toggleExpanded(groupId, number) {
    const current = expanded.value[groupId] || [];
    expanded.value = {
      ...expanded.value,
      [groupId]: current.includes(number) ? current.filter((item) => item !== number) : [...current, number],
    };
  }
  const saveScroll = (key, top) => { scrollPositions.set(key, top); };
  const savedScroll = (key) => scrollPositions.get(key);

  return {
    index, source, isLoading, error, refreshError, ready, parts, questions, meta,
    searchQuery, searchResults, init, getQuestion, getGroup, getPart,
    isExpanded, toggleExpanded, saveScroll, savedScroll,
  };
});

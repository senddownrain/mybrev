import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { usePrayers } from './usePrayers';
import { createAccessAdminClient } from '@/components/admin/accessSets/client';
import { comparePrayerCategories } from '@/utils/prayerCategoryMembership.mjs';
import { readAdminPrayerContent } from '@/services/prayerStorageService';
import * as prayerService from '@/services/prayerService';

export function useAdminPrayerCatalog() {
  const auth = useAuthStore();
  const { getTitle, getText } = usePrayers();
  const uid = computed(() => auth.isAdmin ? auth.user?.uid : null);
  const content = shallowRef(null);
  const sets = shallowRef([]);
  const isLoading = ref(true);
  const error = shallowRef(null);
  let generation = 0;

  async function reload() {
    const owner = uid.value;
    const request = ++generation;
    content.value = null;
    error.value = null;
    isLoading.value = Boolean(owner) || auth.loading;
    if (!owner) return;
    try {
      const result = await readAdminPrayerContent();
      if (request === generation && owner === uid.value) content.value = result;
    } catch (cause) {
      if (request === generation) error.value = cause;
    } finally {
      if (request === generation) isLoading.value = false;
    }
  }

  watch(uid, reload, { immediate: true, flush: 'sync' });
  watch(uid, async (owner, _, onCleanup) => {
    let current = true;
    onCleanup(() => { current = false; });
    sets.value = [];
    if (!owner) return;
    try {
      const client = createAccessAdminClient(owner);
      const result = [];
      let after;
      do {
        const page = await client.list('sets', { after });
        if (!current) return;
        result.push(...page.rows);
        after = page.next;
      } while (after);
      sets.value = result;
    } catch { /* Do not expose internal IDs when the registry is unavailable. */ }
  }, { immediate: true, flush: 'sync' });

  onScopeDispose(() => { generation++; content.value = null; sets.value = []; });

  function mergeSaved(owner, prayer) {
    if (owner !== uid.value || !content.value || !prayer) return;
    content.value = { ...content.value, prayers: [prayer, ...content.value.prayers.filter((row) => row.id !== prayer.id)] };
  }

  async function addPrayer(data) {
    const owner = uid.value;
    const saved = await prayerService.addPrayer(data);
    mergeSaved(owner, saved.prayer);
    return saved;
  }

  async function updatePrayer(id, data) {
    const owner = uid.value;
    const saved = await prayerService.updatePrayer(id, data);
    mergeSaved(owner, saved.prayer);
    return saved;
  }

  async function deletePrayer(id) {
    await prayerService.deletePrayer(id);
    await reload();
  }

  return {
    prayers: computed(() => content.value?.prayers || []),
    categories: computed(() => [...(content.value?.categories || [])].sort(comparePrayerCategories)),
    allTags: computed(() => [...new Set(content.value?.prayers.flatMap((row) => row.tags || []))]),
    mode: computed(() => content.value?.mode),
    sets, isLoading, error, reload, getTitle, getText, addPrayer, updatePrayer, deletePrayer,
  };
}

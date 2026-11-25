import { onScopeDispose, ref, shallowRef } from 'vue';
import { firestoreErrorCode } from '@/utils/firestoreErrors.mjs';
import { errorMessage } from './model.mjs';

export function useAdminAction() {
  const busy = ref(false);
  const error = ref('');
  let alive = true;
  onScopeDispose(() => { alive = false; });

  async function run(action) {
    if (busy.value || !alive) return;
    busy.value = true;
    error.value = '';
    try {
      const result = await action();
      return alive ? result : undefined;
    } catch (cause) {
      if (alive) error.value = errorMessage(firestoreErrorCode(cause));
      return undefined;
    } finally {
      busy.value = false;
    }
  }

  return { busy, error, run, isAlive: () => alive };
}

export function useRegistryPage(client, kind) {
  const { busy, error, run } = useAdminAction();
  const rows = shallowRef([]);
  const next = ref(null);
  const cursors = ref([null]);
  let currentFilters = {};

  async function load(filters = currentFilters, history = cursors.value) {
    if (busy.value) return;
    currentFilters = filters;
    cursors.value = history;
    rows.value = [];
    next.value = null;
    const result = await run(() => client.list(kind(), { ...filters, after: history.at(-1) }));
    if (result) {
      rows.value = result.rows;
      next.value = result.next;
    }
  }

  return {
    busy, error, rows, next, cursors,
    load,
    search: filters => load(filters, [null]),
    previous: () => load(currentFilters, cursors.value.slice(0, -1)),
    more: () => load(currentFilters, [...cursors.value, next.value]),
  };
}

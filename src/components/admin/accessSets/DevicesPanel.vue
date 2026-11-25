<template>
  <section class="access-admin__section" aria-labelledby="devices-heading">
    <div class="access-admin__box">
      <h2 id="devices-heading">Прылады</h2>
      <p>Паказаны пацверджаны серверам стан дазволу. Для V2 фактычны доступ таксама залежыць ад статусу профілю і яго набораў.</p>
      <p v-if="legacyAllowed"><router-link :to="{ name: 'AdminPriestAccess' }">Код і налады legacy-доступу</router-link></p>
      <form class="access-admin__filters" @submit.prevent="search">
        <label v-if="legacyAllowed">Тып дазволу
          <select v-model="input.kind" :disabled="busy">
            <option value="v2">V2</option>
            <option value="legacy">Legacy</option>
          </select>
        </label>
        <label>Статус дазволу
          <select v-model="input.status" :disabled="busy">
            <option value="">Усе статусы</option>
            <option v-for="(label, status) in GRANT_STATUSES" :key="status" :value="status">{{ label }}</option>
          </select>
        </label>
        <label>Дакладны UID прылады
          <input v-model.trim="input.id" maxlength="128" :disabled="busy">
        </label>
        <button type="submit" :disabled="busy || loading">Шукаць</button>
      </form>
      <div v-if="rows.length" class="access-admin__table">
        <table role="table" aria-label="Пацверджаныя дазволы прылад">
          <thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col">Выбар</th><th role="columnheader" scope="col">Прылада</th><th role="columnheader" scope="col">Тып</th><th role="columnheader" scope="col">Статус</th><th role="columnheader" scope="col">Дзеянне</th></tr></thead>
          <tbody role="rowgroup">
            <tr v-for="device in rows" role="row" :key="device.id">
              <td role="cell">
                <input v-model="selected" type="checkbox" :value="device.id"
                  :aria-label="'Выбраць ' + device.id" :disabled="busy || device.status !== 'active'"
                >
              </td>
              <td role="cell">
                <strong>{{ device.label || device.deviceName || 'Без назвы' }}</strong>
                <div><code>{{ device.id }}</code></div>
                <div>{{ [device.client, device.platform].filter(Boolean).join(' · ') }}</div>
              </td>
              <td role="cell">{{ kind === 'v2' ? 'V2' : 'Legacy' }}</td>
              <td role="cell">{{ GRANT_STATUSES[device.status] || 'Статус не пацверджаны' }}</td>
              <td role="cell">
                <button type="button" :disabled="busy || device.status !== 'active'" :aria-label="'Адклікаць ' + device.id"
                  @click="pending = [device.id]"
                >Адклікаць</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <RegistryControls :page="page" :locked="busy" />
      <button v-if="rows.length" type="button" :disabled="busy || !selected.length" @click="pending = [...selected]">
        Адклікаць выбраныя ({{ selected.length }})
      </button>
      <p v-if="error" role="alert" class="access-admin__error">{{ error }}</p>
      <div v-if="results.length" class="access-admin__notice mt-3" aria-live="polite">
        <h3>Вынік адклікання</h3>
        <ul class="access-admin__list">
          <li v-for="result in results" :key="result.id"><code>{{ result.id }}</code><span>{{ result.label }}</span></li>
        </ul>
      </div>
    </div>

    <v-dialog :model-value="Boolean(pending)" max-width="520" aria-labelledby="revoke-title"
      :persistent="busy" @update:model-value="open => { if (!open) pending = null }"
    >
      <v-card v-if="pending" data-sentry-block>
        <v-card-title id="revoke-title">Адклікаць дазволы прылад?</v-card-title>
        <v-card-text>
          <p>Тып: {{ kind === 'v2' ? 'V2' : 'Legacy' }}. Выбрана прылад: {{ pending.length }}.</p>
          <p>Адкліканне канчатковае для кожнага выбранага дазволу. Стан будзе правераны асобна для кожнай прылады.</p>
        </v-card-text>
        <v-card-actions>
          <v-btn :disabled="busy" @click="pending = null">Скасаваць</v-btn>
          <v-btn color="error" :loading="busy" @click="revoke">Пацвердзіць адкліканне</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { firestoreErrorCode, isConnectionError, isFirestoreQuotaError } from '@/utils/firestoreErrors.mjs';
import { errorMessage, GRANT_STATUSES } from './model.mjs';
import RegistryControls from './RegistryControls.vue';
import { useAdminAction, useRegistryPage } from './useRegistryPage';

const { client } = defineProps({ client: { type: Object, required: true } });
const auth = useAuthStore();
const legacyAllowed = computed(() => auth.canManagePriestAccess);
const input = reactive({ kind: 'v2', status: '', id: '' });
const kind = ref('v2');
const appliedStatus = ref('');
const selected = ref([]);
const pending = ref(null);
const results = ref([]);
const page = useRegistryPage(client, () => kind.value);
const { rows, busy: loading } = page;
const { run, busy, error, isAlive } = useAdminAction();

function search() {
  error.value = '';
  if (input.id.includes('/')) {
    error.value = 'Увядзіце дакладны UID прылады без касых рысак.';
    return;
  }
  kind.value = legacyAllowed.value ? input.kind : 'v2';
  appliedStatus.value = input.status;
  results.value = [];
  page.search({ status: input.status, id: input.id });
}

async function revoke() {
  results.value = [];
  const ids = pending.value;
  const target = kind.value;
  await run(async () => {
    let stopped = false;
    for (const id of ids) {
      if (!isAlive()) return;
      if (stopped) {
        results.value.push({ id, label: 'Спроба спынена. Адкліканне не запускалася.' });
        continue;
      }
      try {
        const observed = await client.revoke(target, id);
        if (!isAlive()) return;
        rows.value = rows.value.flatMap(row => {
          if (row.id !== id) return [row];
          return appliedStatus.value === 'active' ? [] : [observed];
        });
        results.value.push({ id, label: 'Адкліканне пацверджана.' });
      } catch (cause) {
        if (!isAlive()) return;
        const code = firestoreErrorCode(cause);
        const failure = cause.blockedBy || code;
        stopped = isFirestoreQuotaError({ code: failure }) || isConnectionError({ code: failure })
          || ['permission-denied', 'unauthenticated'].includes(failure);
        // Until readback succeeds, do not keep showing an affected row as active.
        rows.value = rows.value.map(row => row.id === id ? { ...row, status: null } : row);
        results.value.push({ id, label: errorMessage(code) });
      }
    }
  });
  pending.value = null;
}
watch(rows, () => { selected.value = []; });
watch(legacyAllowed, allowed => {
  if (!allowed && kind.value === 'legacy') {
    input.kind = 'v2';
    search();
  }
});
onMounted(() => page.load());
</script>

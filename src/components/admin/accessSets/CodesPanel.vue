<template>
  <section class="access-admin__section access-admin__section--split" aria-labelledby="codes-heading">
    <div class="access-admin__box">
      <h2 id="codes-heading">Коды</h2>
      <p>Адключэнне або замена кода спыняе толькі новыя актывацыі. Выдадзеныя дазволы адклікаюцца ў раздзеле «Прылады».</p>
      <ul class="access-admin__list">
        <li v-for="entry in rows" :key="entry.id">
          <div>
            <strong>{{ labelForCode(entry) }}</strong> <span class="text-caption">…{{ entry.id.slice(-4) }}</span>
            <div>{{ nameForProfile(entry.profileId) }} · {{ codeStatus(entry.status) }}</div>
          </div>
          <div v-if="entry.status === 'active'" class="access-admin__actions">
            <button type="button" :disabled="busy" @click="rotate(entry)">Замяніць код</button>
            <button type="button" :disabled="busy" @click="confirmDisable(entry)">Адключыць код</button>
          </div>
        </li>
      </ul>
      <RegistryControls :page="page" :locked="busy" />
    </div>

    <form class="access-admin__box access-admin__form" @submit.prevent="confirmIssue">
      <h3>{{ replacing ? 'Замена кода' : 'Новы код' }}</h3>
      <p v-if="replacing">Будзе адключаны код …{{ replacing.id.slice(-4) }} гэтага профілю.</p>
      <label>Актыўны профіль
        <select v-model="profileId" required :disabled="busy || Boolean(replacing)">
          <option disabled value="">Абярыце профіль</option>
          <option v-for="profile in activeProfiles" :key="profile.id" :value="profile.id">{{ profile.name }}</option>
        </select>
      </label>
      <label>Прэфікс <input ref="editField" v-model="prefix" required maxlength="10" pattern="[A-Za-z]{3,10}" placeholder="PRST" :disabled="busy"></label>
      <p>Правы вызначае выбраны профіль.</p>
      <label>Пазнака (неабавязкова) <input v-model.trim="label" maxlength="120" :disabled="busy"></label>
      <p v-if="error" class="access-admin__error" role="alert">{{ error }}</p>
      <p v-if="notice" role="status">{{ notice }}</p>
      <div class="access-admin__actions">
        <button type="submit" class="access-admin__primary" :disabled="busy">{{ replacing ? 'Падрыхтаваць замену' : 'Падрыхтаваць выдачу' }}</button>
        <button v-if="replacing" type="button" :disabled="busy" @click="reset">Скасаваць</button>
      </div>
    </form>

    <v-dialog :model-value="Boolean(pending)" max-width="540" aria-labelledby="code-confirm-title"
      :persistent="busy" @update:model-value="open => { if (!open) pending = null }"
    >
      <v-card v-if="pending" data-sentry-block>
        <v-card-title id="code-confirm-title">{{ pending.title }}</v-card-title>
        <v-card-text>
          <p>Профіль «{{ nameForProfile(pending.profileId) }}»</p>
          <p v-if="pending.codeId">Код …{{ pending.codeId.slice(-4) }} стане недаступны для новых актывацый. Дазволы прылад працягнуць дзейнічаць.</p>
          <p v-if="!pending.disable">Падрыхтуйцеся скапіяваць новы код. Ён з’явіцца адзін раз пасля пацвярджэння серверам.</p>
        </v-card-text>
        <v-card-actions>
          <v-btn :disabled="busy" @click="pending = null">Скасаваць</v-btn>
          <v-btn color="primary" :loading="busy" @click="apply">Пацвердзіць</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog :model-value="Boolean(secret)" max-width="560" aria-labelledby="secret-title"
      content-class="access-admin-secret" @update:model-value="open => { if (!open) closeSecret() }"
    >
      <v-card v-if="secret" data-sentry-block>
        <v-card-title id="secret-title">Код выдадзены</v-card-title>
        <v-card-text>
          <p>Скапіруйце код цяпер. Пасля закрыцця гэтага акна паўторна паглядзець яго немагчыма.</p>
          <code class="access-admin-secret__value">{{ secret }}</code>
          <p v-if="copyMessage" role="status">{{ copyMessage }}</p>
        </v-card-text>
        <v-card-actions>
          <v-btn color="primary" @click="copySecret">Скапіяваць код</v-btn>
          <v-btn @click="closeSecret">Закрыць код</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { accessV2Error } from '@/services/accessSetsV2Gateway.mjs';
import { isAccessSetId } from './model.mjs';
import { useAdminAction, useRegistryPage } from './useRegistryPage';
import RegistryControls from './RegistryControls.vue';

const { client } = defineProps({ client: { type: Object, required: true } });
const page = useRegistryPage(client, () => 'codes');
const { rows } = page;
const profiles = ref([]);
const activeProfiles = computed(() => profiles.value.filter((profile) => profile.status === 'active'));
const nameForProfile = (id) => profiles.value.find((profile) => profile.id === id)?.name || 'Профіль недаступны';
const labelForCode = ({ label }) => !label || label === 'Access Sets V2' ? 'Код доступу' : label;

async function loadProfiles() {
  const result = [];
  let after;
  do {
    const page = await client.list('profiles', { after });
    result.push(...page.rows);
    after = page.next;
  } while (after);
  profiles.value = result;
}
const { busy, error, run } = useAdminAction();
const editField = ref(null);
const profileId = ref('');
const prefix = ref('');
const label = ref('');
const replacing = ref(null);
const pending = ref(null);
const secret = ref('');
const copyMessage = ref('');
const notice = ref('');
const codeStatus = status => ({ active: 'Актыўны', disabled: 'Адключаны' })[status] || 'Невядомы статус';

function reset() {
  replacing.value = null;
  profileId.value = '';
  prefix.value = '';
  label.value = '';
  error.value = '';
  notice.value = '';
}
function rotate(entry) {
  reset();
  replacing.value = entry;
  profileId.value = entry.profileId;
  label.value = entry.label || '';
  nextTick(() => editField.value?.focus());
}
function confirmDisable(entry) {
  pending.value = { disable: true, title: 'Адключыць код?', codeId: entry.id, profileId: entry.profileId };
}
function confirmIssue() {
  pending.value = {
    title: replacing.value ? 'Замяніць код?' : 'Выдаць код?',
    profileId: profileId.value,
    prefix: prefix.value,
    label: label.value,
    codeId: replacing.value?.id,
  };
}
async function apply() {
  notice.value = '';
  const { disable, codeId, ...input } = pending.value;
  const result = await run(async () => {
    if (disable) {
      await client.disableCode(codeId);
      return true;
    }
    if (!isAccessSetId(input.profileId)) throw accessV2Error('invalid-profile');
    if (!/^[A-Za-z]{3,10}$/.test(input.prefix)) throw accessV2Error('invalid-prefix');
    return client.issueCode({ profileId: input.profileId, prefix: input.prefix, label: input.label, replacesCodeId: codeId });
  });
  pending.value = null;
  if (result?.code) {
    reset();
    secret.value = result.code;
  } else if (result) {
    notice.value = 'Код адключаны. Дазволы прылад працягваюць дзейнічаць.';
    await page.load();
  }
}

function clearSecret() {
  secret.value = '';
  copyMessage.value = '';
}
function closeSecret() {
  clearSecret();
  page.load();
}
async function copySecret() {
  const value = secret.value;
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    if (secret.value === value) copyMessage.value = 'Код скапіяваны.';
  } catch {
    if (secret.value === value) copyMessage.value = 'Буфер абмену недаступны. Вылучыце і скапіруйце код уручную.';
  }
}
onMounted(() => {
  page.load();
  void loadProfiles().catch(() => {});
  window.addEventListener('pagehide', clearSecret);
});
onBeforeUnmount(() => {
  clearSecret();
  window.removeEventListener('pagehide', clearSecret);
});
</script>

<style scoped>
.access-admin-secret__value {
  display: block;
  margin-block: 14px;
  padding: 12px;
  overflow-wrap: anywhere;
  user-select: all;
}
</style>

<template>
  <section class="access-admin__section access-admin__section--split" aria-labelledby="profiles-heading">
    <div class="access-admin__box">
      <h2 id="profiles-heading">Профілі</h2>
      <ul class="access-admin__list">
        <li v-for="profile in rows" :key="profile.id">
          <div>
            <strong>{{ profile.name }}</strong>
            <div>{{ PROFILE_STATUSES[profile.status] || 'Невядомы статус' }} · Рэвізія {{ profile.revision }}</div>
            <div>Наборы: {{ formatSets(profile.allowedSets) }}</div>
          </div>
          <button type="button" :disabled="busy || profile.status === 'revoked'" @click="edit(profile)">Рэдагаваць</button>
        </li>
      </ul>
      <RegistryControls :page="page" :locked="busy" />
    </div>

    <form class="access-admin__box access-admin__form" @submit.prevent="preview">
      <h3>{{ previous ? 'Рэдагаванне профілю' : 'Новы профіль' }}</h3>
      <label>Ідэнтыфікатар профілю
        <input v-model="draft.id" required pattern="[a-z][a-z0-9\-]{0,63}" maxlength="64" :readonly="Boolean(previous)" :disabled="busy">
      </label>
      <label>Назва профілю <input ref="editField" v-model.trim="draft.name" required maxlength="120" :disabled="busy"></label>
      <label>Статус профілю
        <select v-model="draft.status" :disabled="busy || !previous">
          <option v-for="(label, status) in PROFILE_STATUSES" :key="status" :value="status">{{ label }}</option>
        </select>
      </label>
      <p>Адключаны профіль можна аднавіць. Адкліканне профілю канчатковае.</p>
      <SetPicker v-model:selected="draft.allowedSets" :sets="setRows" :disabled="busy" label="Даступныя наборы" />
      <RegistryControls :page="setsPage" :locked="busy" empty="Даступных набораў на гэтай старонцы няма." />
      <div v-if="draft.allowedSets.length">
        <p>Выбраныя наборы з усіх старонак</p>
        <div class="access-admin__actions">
          <button v-for="id in draft.allowedSets" :key="id" type="button" :aria-label="'Выдаліць набор ' + nameForSet(id)" :disabled="busy" @click="draft.allowedSets = draft.allowedSets.filter(value => value !== id)">
            {{ nameForSet(id) }} <span aria-hidden="true">×</span>
          </button>
        </div>
      </div>
      <p v-if="error" class="access-admin__error" role="alert">{{ error }}</p>
      <p v-if="saved" role="status">Профіль захаваны. Рэвізія {{ saved }}.</p>
      <div class="access-admin__actions">
        <button type="submit" class="access-admin__primary" :disabled="busy">Праверыць змены</button>
        <button v-if="previous" type="button" :disabled="busy" @click="reset">Скасаваць</button>
      </div>
    </form>

    <v-dialog :model-value="Boolean(pending)" max-width="560" aria-labelledby="profile-impact-title"
      :persistent="busy" @update:model-value="open => { if (!open) pending = null }"
    >
      <v-card v-if="pending" data-sentry-block>
        <v-card-title id="profile-impact-title">Доступ паводле профілю</v-card-title>
        <v-card-text>
          <p><strong>{{ pending.profile.name }}</strong> </p>
          <p>Статус: {{ previous ? PROFILE_STATUSES[previous.status] : 'Новы профіль' }} → {{ PROFILE_STATUSES[pending.profile.status] }}</p>
          <dl class="profile-diff">
            <dt>Да змены</dt><dd>{{ formatSets(pending.impact.before) }}</dd>
            <dt>Пасля змены</dt><dd>{{ formatSets(pending.impact.after) }}</dd>
            <dt>Дадаецца</dt><dd>{{ formatSets(pending.impact.added) }}</dd>
            <dt>Выдаляецца</dt><dd>{{ formatSets(pending.impact.removed) }}</dd>
          </dl>
          <p class="mt-3">Змены закрануць усе прылады з кодамі гэтага профілю пры наступнай праверцы доступу. Іншыя профілі і дазволы паводле ранейшых кодаў дзейнічаюць асобна.</p>
          <p v-if="pending.profile.status === 'revoked'" class="mt-2 font-weight-bold">Профіль будзе адкліканы назаўсёды.</p>
          <p v-else-if="!pending.impact.after.length" class="mt-2">Гэты профіль не будзе даваць доступу ні да аднаго набору.</p>
        </v-card-text>
        <v-card-actions>
          <v-btn :disabled="busy" @click="pending = null">Скасаваць</v-btn>
          <v-btn color="primary" :loading="busy" @click="save">Пацвердзіць і захаваць</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </section>
</template>

<script setup>
import { nextTick, onMounted, ref, watch } from 'vue';
import { accessSetName } from '@/utils/prayerAccessPresentation.mjs';
import { errorMessage, PROFILE_STATUSES, profileImpact, profileInput } from './model.mjs';
import { useAdminAction, useRegistryPage } from './useRegistryPage';
import RegistryControls from './RegistryControls.vue';
import SetPicker from './SetPicker.vue';

const { client } = defineProps({ client: { type: Object, required: true } });
const emptyProfile = () => ({ id: '', name: '', status: 'active', allowedSets: [] });
const page = useRegistryPage(client, () => 'profiles');
const { rows } = page;
const setsPage = useRegistryPage(client, () => 'sets');
const { rows: setRows } = setsPage;
const { busy, error, run } = useAdminAction();
const editField = ref(null);
const draft = ref(emptyProfile());
const previous = ref(null);
const pending = ref(null);
const saved = ref(null);
const knownSets = ref([]);
const nameForSet = (id) => accessSetName(id, knownSets.value);
const formatSets = (ids = []) => [...new Set(ids.map(nameForSet))].join(', ') || 'няма';
watch([rows, setRows], async ([profiles, current], _, onCleanup) => {
  let active = true;
  onCleanup(() => { active = false; });
  const known = new Map([...knownSets.value, ...current].map((set) => [set.id, set]));
  const required = new Set(profiles.flatMap((profile) => profile.allowedSets || []));
  await Promise.all([...required].filter((id) => !known.has(id)).map(async (id) => {
    const set = await client.read('sets', id).catch(() => null);
    if (set) known.set(id, set);
  }));
  if (active) knownSets.value = [...known.values()];
}, { immediate: true });

function reset() {
  draft.value = emptyProfile();
  previous.value = null;
  error.value = '';
  saved.value = null;
}
function edit(profile) {
  reset();
  previous.value = profile;
  draft.value = { ...profile, allowedSets: [...profile.allowedSets] };
  nextTick(() => editField.value?.focus());
}
function preview() {
  error.value = '';
  saved.value = null;
  const validation = profileInput(draft.value);
  if (validation) {
    error.value = errorMessage(validation);
    return;
  }
  const { id, name, status, allowedSets } = draft.value;
  const profile = { name: name.trim(), status, allowedSets: [...allowedSets].sort() };
  pending.value = { id, profile, revision: previous.value?.revision ?? 0, impact: profileImpact(previous.value, profile) };
}
async function save() {
  const { id, profile, revision } = pending.value;
  const result = await run(() => client.saveProfile(id, profile, revision));
  pending.value = null;
  if (result) {
    reset();
    saved.value = result;
    await page.load();
  }
}
onMounted(() => {
  page.load();
  setsPage.load();
});
</script>

<style scoped>
.profile-diff {
  display: grid;
  grid-template-columns: minmax(7rem, max-content) minmax(0, 1fr);
  gap: 4px 12px;
  margin-block: 12px;
}
.profile-diff dt { font-weight: 600; }
.profile-diff dd { overflow-wrap: anywhere; }
</style>

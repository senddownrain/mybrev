<template>
  <v-container class="drafts-page">
    <header class="drafts-hero">
      <div>
        <p class="eyebrow">Адміністраванне · Малітвы</p>
        <h1>Чарнавікі малітваў</h1>
        <p class="lead">Закрытыя тэксты, якія пакуль не бачаць ні чытачы, ні святары. Апублікаваць іх можа кожны адміністратар.</p>
      </div>
      <v-btn variant="tonal" rounded="pill" class="text-none" prepend-icon="mdi-refresh" :loading="loading" @click="load">Абнавіць</v-btn>
    </header>

    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>

    <section class="drafts-summary" aria-label="Зводка па статусах">
      <button
        v-for="status in statusOptions"
        :key="status.value"
        type="button"
        class="summary-chip"
        :class="{ 'summary-chip--active': statusFilter === status.value }"
        :aria-pressed="statusFilter === status.value"
        @click="statusFilter = statusFilter === status.value ? '' : status.value"
      >
        <strong>{{ counts[status.value] || 0 }}</strong><span>{{ status.title }}</span>
      </button>
    </section>

    <div class="drafts-toolbar">
      <v-text-field v-model="query" label="Пошук па назве, тэксце, крыніцы" prepend-inner-icon="mdi-magnify" variant="outlined" density="comfortable" hide-details clearable />
      <v-btn-toggle v-model="originFilter" mandatory divided density="comfortable" color="primary" class="origin-toggle" aria-label="Паходжанне">
        <v-btn value="" class="text-none">Усе</v-btn>
        <v-btn value="bog_dobry" class="text-none">Бог Добры</v-btn>
        <v-btn value="disputed" class="text-none">Спрэчныя</v-btn>
      </v-btn-toggle>
    </div>

    <v-skeleton-loader v-if="loading && !drafts.length" type="list-item-three-line@4" />
    <v-card v-else-if="!filtered.length" class="drafts-empty" elevation="0">
      <v-icon icon="mdi-text-box-search-outline" size="36" />
      <p>{{ drafts.length ? 'Па гэтых фільтрах чарнавікоў няма.' : 'Чарнавікоў пакуль няма. Яны з’яўляюцца пасля імпарту «Бог Добры» і пры спрэчных выпадках.' }}</p>
    </v-card>
    <ul v-else class="drafts-list">
      <li v-for="draft in visible" :key="draft.id">
        <router-link :to="{ name: 'AdminPrayerDraftEdit', params: { id: draft.id } }" class="draft-row">
          <div class="draft-row__main">
            <h2>{{ draft.title }}</h2>
            <p class="draft-row__source">{{ sourceLine(draft) }}</p>
            <div class="draft-row__tags">
              <v-chip v-for="tag in (draft.tags || []).slice(0, 4)" :key="tag" size="x-small" variant="tonal">{{ tag }}</v-chip>
              <span v-if="(draft.tags || []).length > 4" class="more">+{{ draft.tags.length - 4 }}</span>
              <v-chip v-if="draft.priestOnly" size="x-small" color="warning" variant="tonal">Святарам</v-chip>
              <v-chip v-if="draft.reason" size="x-small" color="warning" variant="outlined">{{ reasonLabel(draft.reason) }}</v-chip>
            </div>
          </div>
          <div class="draft-row__side">
            <v-chip size="small" :color="statusColor(draft.status)" variant="flat">{{ DRAFT_STATUS_LABELS[normalizeDraftStatus(draft.status)] || 'Чарнавік' }}</v-chip>
            <span class="date">{{ dateLabel(draft.updatedAt) }}</span>
          </div>
        </router-link>
      </li>
    </ul>
    <div v-if="filtered.length > shown" class="drafts-more">
      <v-btn variant="tonal" rounded="pill" class="text-none" @click="shown += 50">Паказаць яшчэ ({{ filtered.length - shown }})</v-btn>
    </div>
  </v-container>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { DRAFT_REASON_LABELS, DRAFT_STATUS_LABELS, normalizeDraftStatus, normalizeTitleKey } from '@/utils/prayerDraftModel.mjs';
import { getDraftActions } from '@/services/prayerDraftService';

const drafts = ref([]);
const loading = ref(false);
const error = ref('');
const query = ref('');
const originFilter = ref('');
const statusFilter = ref('');
const shown = ref(50);
const statusOptions = Object.entries(DRAFT_STATUS_LABELS).map(([value, title]) => ({ value, title }));
const reasonLabel = (reason) => DRAFT_REASON_LABELS[reason] || reason;
const statusColor = (status) => normalizeDraftStatus(status) === 'published' ? 'success' : 'grey';

const counts = computed(() => drafts.value.reduce((acc, item) => {
  const status = normalizeDraftStatus(item.status);
  acc[status] = (acc[status] || 0) + 1;
  return acc;
}, {}));
const filtered = computed(() => {
  const needle = normalizeTitleKey(query.value || '');
  return drafts.value
    .filter((item) => (statusFilter.value ? normalizeDraftStatus(item.status) === statusFilter.value : normalizeDraftStatus(item.status) === 'draft'))
    .filter((item) => !originFilter.value || item.origin === originFilter.value)
    .filter((item) => !needle || normalizeTitleKey(`${item.title} ${item.source || ''} ${item.sourceBook || ''} ${(item.tags || []).join(' ')} ${item.text || ''}`).includes(needle))
    .sort((a, b) => String(a.title).localeCompare(String(b.title), 'be'));
});
const visible = computed(() => filtered.value.slice(0, shown.value));
watch([query, originFilter, statusFilter], () => { shown.value = 50; });

function sourceLine(draft) {
  const pages = draft.printedPageStart ? `, с. ${draft.printedPageStart}${draft.printedPageEnd && draft.printedPageEnd !== draft.printedPageStart ? `–${draft.printedPageEnd}` : ''}` : '';
  return draft.source || `${draft.sourceBook || 'Крыніца не пазначана'}${pages}`;
}
function dateLabel(value) {
  const date = value?.toDate?.();
  return date ? date.toLocaleDateString('be-BY', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}
async function load() {
  loading.value = true; error.value = '';
  try { drafts.value = await (await getDraftActions()).listDrafts(); }
  catch (cause) { error.value = cause?.code === 'permission-denied' ? 'Чарнавікі даступныя толькі адміністратарам.' : 'Не ўдалося загрузіць чарнавікі. Паспрабуйце яшчэ раз.'; }
  finally { loading.value = false; }
}
onMounted(load);
</script>

<style scoped>
.drafts-page { width: min(100%, 980px); padding: 38px 20px 80px !important; }
.drafts-hero { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 22px; flex-wrap: wrap; }
.eyebrow { margin: 0 0 8px; color: var(--nav-muted); font-size: 0.75rem; font-weight: 750; letter-spacing: 0.11em; text-transform: uppercase; }
.drafts-hero h1 { margin: 0 0 6px; }
.lead { margin: 0; color: var(--nav-muted); max-width: 60ch; }
.drafts-summary { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 18px; }
.summary-chip { display: flex; align-items: baseline; gap: 8px; padding: 8px 14px; border: 1px solid var(--nav-border); border-radius: 999px; background: var(--nav-surface); color: inherit; cursor: pointer; font: inherit; }
.summary-chip strong { font-size: 1.05rem; }
.summary-chip span { color: var(--nav-muted); font-size: 0.85rem; }
.summary-chip--active { border-color: rgb(var(--v-theme-primary)); box-shadow: inset 0 0 0 1px rgb(var(--v-theme-primary)); }
.drafts-toolbar { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: center; margin-bottom: 18px; }
.drafts-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.draft-row { display: flex; justify-content: space-between; gap: 16px; padding: 16px 18px; border: 1px solid var(--nav-border); border-radius: 16px; background: var(--nav-surface); color: inherit; text-decoration: none; }
.draft-row:hover, .draft-row:focus-visible { border-color: rgb(var(--v-theme-primary)); }
.draft-row__main { min-width: 0; }
.draft-row h2 { margin: 0 0 4px; font-size: 1.02rem; overflow-wrap: anywhere; }
.draft-row__source { margin: 0 0 8px; color: var(--nav-muted); font-size: 0.82rem; overflow-wrap: anywhere; }
.draft-row__tags { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.more { color: var(--nav-muted); font-size: 0.78rem; }
.draft-row__side { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex-shrink: 0; }
.date { color: var(--nav-muted); font-size: 0.75rem; }
.drafts-empty { display: grid; justify-items: center; gap: 8px; padding: 38px 20px; text-align: center; border: 1px dashed var(--nav-border); background: transparent; color: var(--nav-muted); }
.drafts-more { display: flex; justify-content: center; margin-top: 18px; }
@media (max-width: 640px) {
  .drafts-page { padding: 24px 16px 64px !important; }
  .drafts-toolbar { grid-template-columns: 1fr; }
  .origin-toggle { width: 100%; }
  .origin-toggle .v-btn { flex: 1 1 0; min-width: 0; padding: 0 6px; }
  .draft-row { flex-direction: column; }
  .draft-row__side { flex-direction: row; align-items: center; justify-content: space-between; }
}
</style>

<template>
  <v-container class="fb-admin">
    <header>
      <p class="fb-eyebrow">Адміністраванне</p>
      <h1>{{ isSuper ? 'Усе звароты' : 'Звароты па тэкстах' }} <v-chip v-if="newCount" color="primary" size="small" data-test="fb-new-count">{{ newCount }} новых</v-chip></h1>
      <p v-if="!isSuper" class="fb-note">Тут бачныя толькі звароты пра памылкі ў тэксце і прапановы па тэкстах.</p>
    </header>

    <v-alert v-if="fatal" type="error" variant="tonal" class="my-4" data-test="fb-fatal">
      {{ fatal }} <v-btn variant="text" class="text-none" @click="reload">Паўтарыць</v-btn>
    </v-alert>

    <template v-else>
      <div class="fb-toolbar">
        <v-menu>
          <template #activator="{ props }">
            <v-btn v-bind="props" variant="tonal" size="small" class="text-none" :loading="exporting" data-test="fb-export">Экспарт для аналізу</v-btn>
          </template>
          <v-list density="compact">
            <v-list-item title="JSON" subtitle="Без email і заметак, тэкст ачышчаны" data-test="fb-export-json" @click="download('json')" />
            <v-list-item title="CSV" subtitle="Для табліц і AI-аналізу" data-test="fb-export-csv" @click="download('csv')" />
          </v-list>
        </v-menu>
        <span class="fb-note">{{ isSuper ? 'Усе катэгорыі' : 'Толькі тэксты' }} · бягучыя фільтры</span>
      </div>
      <div class="fb-filters">
        <v-select v-model="filters.status" :items="statusItems" label="Статус" density="compact" hide-details clearable @update:model-value="reload" />
        <v-select v-if="isSuper" v-model="filters.category" :items="categoryItems" label="Катэгорыя" density="compact" hide-details clearable data-test="fb-filter-category" @update:model-value="reload" />
        <v-select v-model="filters.platform" :items="platformItems" label="Платформа" density="compact" hide-details clearable @update:model-value="reload" />
        <v-text-field v-model="filters.q" label="Пошук па тэксце" density="compact" hide-details clearable @keyup.enter="reload" @click:clear="reload" />
      </div>

      <v-progress-linear v-if="loading" indeterminate class="my-2" />
      <v-alert v-else-if="!items.length" type="info" variant="tonal" class="my-4" data-test="fb-empty">Пакуль няма зваротаў.</v-alert>

      <ul v-else class="fb-cards" data-test="fb-list">
        <li v-for="item in items" :key="item.id">
          <button type="button" class="fb-card" :class="{ 'fb-card--active': selected?.id === item.id, 'fb-card--new': item.status === 'new' }" @click="open(item.id)">
            <span class="fb-card-top">
              <span class="fb-chip">{{ catLabel(item.category) }}</span>
              <span class="fb-status" :data-status="item.status">{{ statusLabel(item.status) }}</span>
            </span>
            <span class="fb-snippet">{{ item.snippet }}</span>
            <span class="fb-card-meta">{{ fmt(item.createdAt) }} · {{ item.platform }}</span>
          </button>
        </li>
      </ul>
      <v-btn v-if="nextCursor" variant="tonal" class="text-none" :loading="loadingMore" @click="more">Паказаць яшчэ</v-btn>

      <v-card v-if="selected" id="fb-detail" class="fb-detail pa-4 mt-6" variant="outlined" data-test="fb-detail">
        <v-btn variant="text" size="small" class="text-none fb-close" @click="selected = null">← Да спісу</v-btn>
        <v-alert v-if="actionError" type="error" variant="tonal" class="mb-3" density="compact">{{ actionError }}</v-alert>
        <p class="fb-meta">№ {{ selected.id }} · {{ fmt(selected.createdAt) }} · {{ selected.platform }}<template v-if="selected.appVersion"> · v{{ selected.appVersion }}</template></p>
        <!-- Plain text interpolation only: user text is never rendered as HTML -->
        <p class="fb-body" data-test="fb-body">{{ selected.body }}</p>
        <p v-if="selected.context" class="fb-meta" data-test="fb-context">Кантэкст: {{ ctxText }}</p>
        <p v-if="isSuper && selected.contactEmail" class="fb-meta" data-test="fb-email">Email: {{ selected.contactEmail }}</p>

        <div class="fb-actions">
          <v-select :model-value="selected.status" :items="statusItems" label="Статус" density="compact" hide-details @update:model-value="(v) => change({ status: v })" />
          <v-select v-if="isSuper" :model-value="selected.category" :items="categoryItems" label="Катэгорыя" density="compact" hide-details data-test="fb-category-select" @update:model-value="(v) => change({ category: v })" />
        </div>

        <h3 class="mt-4">Заметкі</h3>
        <p v-if="!selected.notes?.length" class="fb-meta">Заметак пакуль няма.</p>
        <div v-for="n in selected.notes" :key="n.id" class="fb-noteitem">
          <v-chip v-if="n.scope === 'superadmin_private'" size="x-small" color="warning">прыватная</v-chip> {{ n.body }}
          <span class="fb-meta"> · {{ fmt(n.createdAt) }}</span>
        </div>
        <v-textarea v-model="noteText" label="Рабочая заметка" rows="2" auto-grow density="compact" class="mt-2" hide-details />
        <div class="fb-actions mt-2">
          <v-btn color="primary" class="text-none" :disabled="!noteText.trim() || busy" @click="addNote('shared')">Дадаць заметку</v-btn>
          <v-btn v-if="isSuper" variant="tonal" class="text-none" :disabled="!noteText.trim() || busy" @click="addNote('superadmin_private')">Прыватная заметка</v-btn>
        </div>

        <h3 class="mt-4">Гісторыя</h3>
        <ul class="fb-history"><li v-for="(e, i) in selected.events" :key="i">{{ fmt(e.createdAt) }} · {{ e.kind }}<template v-if="e.kind !== 'note'">: {{ e.from }} → {{ e.to }}</template></li></ul>
      </v-card>
    </template>
  </v-container>
</template>

<script setup>
/* global Blob */
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES, adminAddNote, adminExport, adminGet, adminList, adminPatch } from '@/utils/feedbackApi';

const auth = useAuthStore();
const isSuper = computed(() => auth.isSuperAdmin); // UI hint only: the Worker re-checks the role on every request
const filters = reactive({ status: null, category: null, platform: null, q: '' });
const items = ref([]); const nextCursor = ref(null); const newCount = ref(0);
const loading = ref(false); const loadingMore = ref(false); const busy = ref(false);
const fatal = ref(''); const actionError = ref('');
const selected = ref(null); const noteText = ref(''); const exporting = ref(false);
const statusItems = FEEDBACK_STATUSES.map((s) => ({ title: s.label, value: s.value }));
const categoryItems = FEEDBACK_CATEGORIES.map((c) => ({ title: c.label, value: c.value }));
const platformItems = ['web', 'android', 'ios'];
const catLabel = (v) => FEEDBACK_CATEGORIES.find((c) => c.value === v)?.label || v;
const statusLabel = (v) => FEEDBACK_STATUSES.find((s) => s.value === v)?.label || v;
const fmt = (ms) => new Date(ms).toLocaleString('be-BY', { dateStyle: 'short', timeStyle: 'short' });
const ctxText = computed(() => Object.entries(selected.value?.context || {}).map(([k, v]) => `${k}: ${v}`).join(' · '));

const MESSAGES = { 401: 'Сесія скончылася. Увайдзіце зноў.', 403: 'Няма доступу.', 503: 'Сервіс часова недаступны.', 0: 'Няма сувязі з сервісам зваротаў.', not_configured: 'Сервіс зваротаў не падключаны.' };
const explain = (e) => (e.code === 'not_configured' ? MESSAGES.not_configured : e.status === 409 ? 'Звароты змяніліся ў іншым месцы — абноўлена. Паўтарыце дзеянне.' : MESSAGES[e.status] || 'Памылка. Паўтарыце.');
let fetchId = 0;

async function reload() {
  const id = ++fetchId; loading.value = true; fatal.value = '';
  try {
    const r = await adminList({ ...filters, limit: 25 });
    if (id !== fetchId) return;
    items.value = r.items; nextCursor.value = r.nextCursor; newCount.value = r.newCount;
  } catch (e) { if (id === fetchId) fatal.value = explain(e); } finally { if (id === fetchId) loading.value = false; }
}
async function more() {
  loadingMore.value = true;
  try { const r = await adminList({ ...filters, limit: 25, cursor: nextCursor.value }); items.value.push(...r.items); nextCursor.value = r.nextCursor; } catch (e) { fatal.value = explain(e); } finally { loadingMore.value = false; }
}
async function open(id) {
  actionError.value = '';
  try {
    selected.value = (await adminGet(id)).item;
    await nextTick();
    document.getElementById('fb-detail')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  } catch (e) { actionError.value = explain(e); }
}
// The Worker redacts e-mail, links and phones and leaves out notes; the file is built from the current filters only.
async function download(format) {
  if (exporting.value) return; exporting.value = true; actionError.value = '';
  try {
    const { status, category, platform } = filters;
    const file = await adminExport({ format, status, category, platform, limit: 1000 });
    const url = URL.createObjectURL(new Blob([file.text], { type: file.type }));
    const a = document.createElement('a'); a.href = url; a.download = file.name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) { fatal.value = explain(e); } finally { exporting.value = false; }
}
async function change(patch) {
  if (busy.value) return; busy.value = true; actionError.value = '';
  try { selected.value = (await adminPatch(selected.value.id, { version: selected.value.version, ...patch })).item; await reload(); }
  catch (e) { actionError.value = explain(e); if (e.status === 409) await open(selected.value.id); if (e.status === 404) { selected.value = null; await reload(); } }
  finally { busy.value = false; }
}
async function addNote(scope) {
  if (busy.value) return; busy.value = true; actionError.value = '';
  try { await adminAddNote(selected.value.id, { body: noteText.value, scope }); noteText.value = ''; await open(selected.value.id); }
  catch (e) { actionError.value = explain(e); } finally { busy.value = false; }
}
onMounted(reload);
</script>

<style scoped>
.fb-admin { width: min(100%, 880px); padding: 32px 16px 80px !important; }
.fb-eyebrow { font-size: .8rem; text-transform: uppercase; letter-spacing: .08em; opacity: .7; }
.fb-toolbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 12px; }
.fb-cards { list-style: none; margin: 12px 0; padding: 0; display: grid; gap: 8px; }
.fb-card { display: grid; gap: 4px; width: 100%; text-align: left; padding: 10px 12px; border: 1px solid var(--nav-border, #bbb); border-radius: 14px; background: transparent; color: inherit; font: inherit; }
.fb-card--new { border-left: 4px solid rgb(var(--v-theme-primary)); }
.fb-card--active { background: color-mix(in srgb, rgb(var(--v-theme-primary)) 10%, transparent); }
.fb-card:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.fb-card-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.fb-chip { font-size: .72rem; padding: 2px 8px; border-radius: 999px; background: color-mix(in srgb, currentColor 8%, transparent); }
.fb-status { font-size: .72rem; opacity: .75; }
.fb-status[data-status='new'] { color: rgb(var(--v-theme-primary)); opacity: 1; font-weight: 600; }
.fb-snippet { display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; font-size: .95rem; }
.fb-card-meta { font-size: .75rem; opacity: .7; }
.fb-close { margin: -8px 0 4px -8px; }
.fb-filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin: 16px 0; }
.fb-body { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 1.05rem; margin: 8px 0; }
.fb-meta, .fb-note { font-size: .85rem; opacity: .75; }
.fb-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.fb-actions > * { flex: 1 1 180px; }
.fb-noteitem { padding: 6px 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.fb-history { font-size: .85rem; padding-left: 18px; }
</style>

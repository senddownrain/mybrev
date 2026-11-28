<template>
  <v-container class="novenas">
    <header>
      <p class="eyebrow">Адміністраванне · Трэкер навэнн</p>
      <h1>Навэнны</h1>
      <p class="muted">
        Чарнавікі і апублікаваныя структуры. Тэксты малітваў тут не рэдагуюцца. Публікацыя трапляе ў праграму
        толькі пасля асобнага выпуску кантэнту (content:manifest).
      </p>
    </header>

    <v-alert v-if="error" type="error" variant="tonal" density="comfortable" class="mb-4">{{ error }}</v-alert>

    <div class="toolbar">
      <v-text-field v-model="search" label="Пошук" prepend-inner-icon="mdi-magnify" variant="outlined" density="compact" hide-details clearable class="search" />
      <v-select v-model="state" :items="stateItems" label="Стан" variant="outlined" density="compact" hide-details class="filter" />
      <v-select v-model="check" :items="checkItems" label="Праверка" variant="outlined" density="compact" hide-details class="filter" />
      <v-select v-model="type" :items="typeItems" label="Каляндар" variant="outlined" density="compact" hide-details class="filter" />
      <v-btn variant="text" rounded="pill" prepend-icon="mdi-refresh" class="text-none" :loading="loading" @click="reload">Абнавіць</v-btn>
    </div>

    <p class="muted" data-testid="novena-summary">
      Паказана {{ filtered.length }} з {{ rows.length }} · гатовых {{ count('ready') }} · з заўвагамі {{ count('blocked') }}
      · убудаваных {{ count('excluded') }} · апублікавана {{ rows.filter((row) => row.published).length }}
    </p>

    <div v-if="candidates.length || batch" class="bulk">
      <v-btn color="primary" variant="tonal" rounded="pill" class="text-none" data-testid="novena-publish-all"
        :disabled="loading || publishing || !candidates.length" :loading="publishing" @click="confirming = true">
        Апублікаваць усе гатовыя ({{ candidates.length }})
      </v-btn>
      <span v-if="publishing" class="muted">{{ progress }} з {{ total }}</span>
    </div>
    <v-alert v-if="batch" :type="batch.failed.length ? 'warning' : 'success'" variant="tonal" density="comfortable" class="mb-4" data-testid="novena-batch">
      Апублікавана: {{ batch.published.length }}. Не атрымалася: {{ batch.failed.length }}.
      <template v-if="batch.skipped"> Спынена пасля некалькіх памылак запар, не апрацавана: {{ batch.skipped }}.</template>
      <div v-for="item in batch.failed.slice(0, 5)" :key="item.id">{{ item.title }}: {{ item.message }}</div>
    </v-alert>

    <v-dialog v-model="confirming" max-width="460">
      <v-card>
        <v-card-title class="text-wrap">Апублікаваць {{ candidates.length }} навэнн?</v-card-title>
        <v-card-text>
          Трэкер будзе ўключаны для кожнай. Папярэдне праверце парадак дзён: пасля выпуску кантэнту яго ўбачаць карыстальнікі.
          Ужо апублікаваныя, знятыя з публікацыі і навэнны з заўвагамі не зменяцца.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" class="text-none" @click="confirming = false">Скасаваць</v-btn>
          <v-btn color="primary" class="text-none" data-testid="novena-publish-all-confirm" @click="publishAll">Апублікаваць</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-progress-linear v-if="loading" indeterminate class="mb-2" />
    <ul class="list">
      <li v-for="row in filtered" :key="row.id">
        <component :is="row.check === 'excluded' ? 'div' : RouterLink" class="row" :to="row.check === 'excluded' ? undefined : { name: 'AdminNovenaEditor', params: { id: row.id } }">
          <span class="row__main">
            <strong>{{ row.title }}</strong>
            <span class="muted">
              <template v-if="row.check === 'excluded'">54 дні · трэкер убудаваны ў праграму, тут не рэдагуецца</template>
              <template v-else>{{ row.days }} дзён · {{ row.uniqueDays ? 'асобныя дні' : 'аднолькавыя дні' }} · сувязей: {{ row.links }} · {{ row.schedule }}</template>
            </span>
            <span v-if="row.problems.length" class="problems">{{ errorLabel(row.problems[0]) }}<template v-if="row.problems.length > 1"> (+{{ row.problems.length - 1 }})</template></span>
          </span>
          <span class="badges">
            <span class="badge" :class="`badge--${row.check}`">{{ checkLabels[row.check] }}</span>
            <span class="badge">{{ stateLabels[row.state] }}</span>
            <span v-if="row.published && !row.published.trackerEnabled" class="badge badge--blocked">Трэкер выключаны</span>
          </span>
        </component>
      </li>
    </ul>
    <p v-if="!loading && !filtered.length" class="muted">Нічога не знойдзена.</p>
  </v-container>
</template>

<script setup>
import { computed, onMounted, ref, shallowRef } from 'vue';
import { RouterLink } from 'vue-router';
import { errorLabel, isExcluded, scheduleLabel, TYPE_LABELS } from '@/components/admin/novena/labels';
import { loadNovenaData, publishNovena } from '@/services/novenaAdminService';
import { pickDefinition, publicationErrors } from '@/utils/novena/document.mjs';
import { bulkCandidates, generatedDraft, novenaSources, publicationDocument, publishInTurn, stableJson } from '@/utils/novena/drafts.mjs';

const data = shallowRef(null);
const loading = ref(false);
const error = ref('');
const search = ref('');
const state = ref('all');
const check = ref('all');
const type = ref('all');

const checkLabels = { ready: 'Гатовая', blocked: 'Заўвагі', excluded: 'Убудаваная' };
const stateLabels = { published: 'Апублікавана', changed: 'Апублікавана · ёсць змены', draft: 'Чарнавік', generated: 'Не захавана', none: '—' };
const all = { value: 'all', title: 'Усе' };
const stateItems = [all, ...Object.entries(stateLabels).slice(0, 4).map(([value, title]) => ({ value, title }))];
const checkItems = [all, ...Object.entries(checkLabels).map(([value, title]) => ({ value, title }))];
const typeItems = [all, ...Object.entries(TYPE_LABELS).map(([value, title]) => ({ value, title }))];

function describe(id, prayers, drafts, published) {
  const live = published.get(id) || null;
  const stored = drafts.get(id) || null;
  const source = prayers.get(id);
  const title = stored?.title || live?.title || source?.title || id;
  if (isExcluded(id)) return { id, title, check: 'excluded', state: 'none', problems: [], published: null, type: '' };
  const record = stored || (live && { ...live, blockers: [] }) || generatedDraft(source, prayers);
  const definition = { ...pickDefinition(record), status: 'draft' };
  const problems = [...new Set([...(record.blockers || []), ...publicationErrors(definition, prayers)])];
  const blocks = [...(record.template || []), ...(record.days || []).flatMap((day) => day.blocks)];
  let current = stored ? 'draft' : 'generated';
  if (live) {
    const same = !stored || stableJson(publicationDocument(stored, live)) === stableJson(live);
    current = same ? 'published' : 'changed';
  }
  return {
    id, title, problems, published: live, state: current, record, stored,
    check: problems.length ? 'blocked' : 'ready',
    days: record.durationDays,
    uniqueDays: (record.days || []).some((day) => day.blocks.length),
    links: new Set(blocks.map((block) => block.prayerId).filter((x) => x && x !== id)).size,
    schedule: scheduleLabel(record.schedule),
    type: record.schedule?.type,
  };
}

const rows = computed(() => {
  if (!data.value) return [];
  const { prayers, drafts, published } = data.value;
  const ids = new Set([...novenaSources([...prayers.values()]).map((item) => item.id), ...drafts.keys(), ...published.keys()]);
  return [...ids].map((id) => describe(id, prayers, drafts, published))
    .sort((a, b) => String(a.title).localeCompare(String(b.title), 'be'));
});
const filtered = computed(() => {
  const needle = String(search.value || '').trim().toLocaleLowerCase('be');
  return rows.value.filter((row) => (!needle || String(row.title).toLocaleLowerCase('be').includes(needle))
    && (state.value === 'all' || row.state === state.value)
    && (check.value === 'all' || row.check === check.value)
    && (type.value === 'all' || row.type === type.value));
});
const count = (value) => rows.value.filter((row) => row.check === value).length;

async function reload() {
  loading.value = true;
  error.value = '';
  try {
    data.value = await loadNovenaData();
  } catch (cause) {
    error.value = `Не ўдалося загрузіць даныя: ${cause?.message || cause}`;
  } finally {
    loading.value = false;
  }
}
const candidates = computed(() => bulkCandidates(rows.value));
const confirming = ref(false);
const publishing = ref(false);
const progress = ref(0);
const total = ref(0);
const batch = ref(null);

async function publishAll() {
  const list = candidates.value;
  confirming.value = false;
  publishing.value = true;
  batch.value = null;
  progress.value = 0;
  total.value = list.length;
  const cache = new Map();
  try {
    batch.value = await publishInTurn(list, (draft, loaded) => publishNovena(draft, loaded, { cache }), {
      onProgress: (done) => { progress.value = done; },
    });
    await reload();
  } finally {
    publishing.value = false;
  }
}
onMounted(reload);
</script>

<style scoped>
.novenas { width: min(100%, 980px); padding: 38px 22px 80px !important; color: var(--nav-on-surface); }
h1 { margin: 0 0 8px; font-family: var(--reader-display-font-family); font-size: clamp(2rem, 6vw, 2.7rem); }
.eyebrow { margin: 0 0 8px; color: var(--chrome-accent); font-size: .72rem; font-weight: 800; letter-spacing: .11em; text-transform: uppercase; }
.muted { color: var(--nav-muted); font-size: .84rem; }
.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 16px 0 10px; }
.search { flex: 2 1 220px; }
.filter { flex: 1 1 160px; }
.bulk { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 0 0 12px; }
.list { margin: 0; padding: 0; list-style: none; }
.row { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; margin-bottom: 8px; padding: 14px 16px; border: 1px solid var(--nav-border); border-radius: 16px; background: var(--nav-surface); color: inherit; text-decoration: none; }
.row__main { display: grid; flex: 1 1 380px; gap: 3px; min-width: 0; }
.problems { color: rgb(var(--v-theme-error)); font-size: .82rem; overflow-wrap: anywhere; }
.badges { display: flex; flex-wrap: wrap; align-content: flex-start; gap: 6px; }
.badge { padding: 2px 8px; border-radius: 99px; background: var(--nav-active); font-size: .72rem; font-weight: 700; }
.badge--ready { background: rgba(var(--v-theme-success), .18); }
.badge--blocked { background: rgba(var(--v-theme-warning), .22); }
</style>

<template>
  <v-container class="overrides-admin">
    <header class="page-hero">
      <div>
        <p class="eyebrow">Адміністраванне · Літургічны каляндар</p>
        <h1>Выключэнні на год</h1>
        <p class="page-description">
          Каляндар сам вылічвае пераносы і калізіі. Вылічаныя пераносы запісваюцца сюды як аўтаматычныя
          выключэнні з пазнакай «патрабуе праверкі» — іх можна пацвердзіць або выправіць паводле
          афіцыйнага гадавога календара. Тут жа захоўваюцца ручныя рашэнні на адзін год.
        </p>
      </div>
      <v-btn color="primary" size="large" rounded="pill" prepend-icon="mdi-plus" class="text-none" @click="openCreate()">
        Новае выключэнне
      </v-btn>
    </header>

    <div class="toolbar">
      <v-text-field
        v-model.number="year" type="number" label="Год" variant="outlined" density="comfortable" hide-details
        :min="ORDO_MIN_YEAR" :max="ORDO_MAX_YEAR" class="year-field"
      />
      <v-select
        v-model="diocese" :items="dioceseItems" item-title="label" item-value="value" label="Дыяцэзія для прагляду"
        variant="outlined" density="comfortable" hide-details class="diocese-field"
      />
      <v-btn variant="text" rounded="pill" prepend-icon="mdi-refresh" class="text-none" :loading="loading" @click="reload">Абнавіць</v-btn>
    </div>

    <v-alert v-if="loadError" type="warning" variant="tonal" class="mb-4" density="comfortable">
      Не ўдалося прачытаць выключэнні з Firestore: {{ loadError }}. Паказаны лакальна вядомыя даныя.
    </v-alert>

    <section v-if="ambiguities.length" class="panel panel--review" aria-labelledby="review-title">
      <h2 id="review-title"><v-icon icon="mdi-alert-outline" size="20" /> Патрабуе праверкі</h2>
      <article v-for="item in ambiguities" :key="item.id" class="review-item">
        <div>
          <strong>{{ item.title }}</strong>
          <p>{{ item.description }}</p>
          <p class="review-decision">Engine зараз вырашыў: {{ item.decisionLabel }}</p>
          <p class="muted">{{ item.note }}</p>
          <ul>
            <li v-for="occurrence in item.occurrences" :key="occurrence.date + occurrence.detail">
              {{ formatDate(occurrence.date) }} — {{ occurrence.detail }}
            </li>
          </ul>
        </div>
        <v-btn variant="tonal" rounded="pill" class="text-none" @click="openCreate(item)">Стварыць выключэнне</v-btn>
      </article>
    </section>

    <section class="panel" aria-labelledby="overrides-title">
      <h2 id="overrides-title">Выключэнні {{ year }} г.</h2>
      <p v-if="!overrides.length" class="muted empty">На гэты год выключэнняў няма.</p>
      <article v-for="item in overrides" :key="item.id" class="override-item" :class="{ 'override-item--off': item.enabled === false }">
        <div class="override-main">
          <strong>{{ actionLabel(item.action) }} · {{ celebrationTitle(item) }}</strong>
          <span class="badges">
            <span class="badge" :class="item.source === 'auto-transfer' ? 'badge--auto' : 'badge--manual'">{{ sourceLabel(item) }}</span>
            <span class="badge" :class="item.status === 'needs-review' ? 'badge--review' : 'badge--confirmed'">{{ statusLabel(item) }}</span>
          </span>
          <span>{{ scopeLabel(item) }}{{ item.originalDate ? ` · з ${formatDate(item.originalDate)}` : '' }}{{ item.effectiveDate ? ` · на ${formatDate(item.effectiveDate)}` : '' }}{{ item.rank ? ` · ${rankLabelOf(item.rank)}` : '' }}{{ item.color ? ` · ${colorLabel(item.color)}` : '' }}</span>
          <span v-if="item.computedDate" class="muted">Вылічана engine: {{ formatDate(item.computedDate) }}{{ item.computedDate !== item.effectiveDate ? ' · выпраўлена ўручную' : '' }}</span>
          <span class="muted">{{ item.reason }}{{ item.sourceNote ? ` — ${item.sourceNote}` : '' }}</span>
        </div>
        <v-btn
          v-if="item.source === 'auto-transfer' && item.status === 'needs-review'" variant="tonal" size="small" rounded="pill" class="text-none"
          :loading="saving" @click="confirm(item)"
        >Пацвердзіць</v-btn>
        <span v-else />
        <v-switch
          :model-value="item.enabled !== false" color="primary" hide-details inset density="compact"
          :aria-label="`Уключыць выключэнне ${celebrationTitle(item)}`" @update:model-value="(value) => toggle(item, value)"
        />
        <v-btn icon="mdi-pencil-outline" variant="text" size="small" :aria-label="`Рэдагаваць ${celebrationTitle(item)}`" @click="openEdit(item)" />
        <v-btn icon="mdi-delete-outline" variant="text" size="small" color="error" :aria-label="`Выдаліць ${celebrationTitle(item)}`" @click="toDelete = item" />
      </article>
    </section>

    <section class="panel" aria-labelledby="transfers-title">
      <h2 id="transfers-title">Аўтаматычныя пераносы</h2>
      <p class="muted">
        Вылічаюцца па правілах і запісваюцца ў выключэнні гэтага года (npm run ordo:materialize-transfers
        або кнопка «Запісаць»). Запісаны перанос можна пацвердзіць або выправіць вышэй.
      </p>
      <p v-if="!transfers.length" class="muted empty">У гэтым годзе пераносаў няма.</p>
      <ul class="plain-list">
        <li v-for="item in transfers" :key="item.celebrationId + item.from" class="transfer-row">
          <span>
            <strong>{{ item.title }}</strong>: {{ formatDate(item.from) }} → {{ formatDate(item.to) }}
            <span v-if="item.to !== item.computedDate" class="muted"> (вылічана {{ formatDate(item.computedDate) }})</span>
            <span class="muted"> · {{ transferCaseLabel(item.transferCase) }}</span>
          </span>
          <span v-if="item.record" class="badge" :class="item.record.status === 'needs-review' ? 'badge--review' : 'badge--confirmed'">
            {{ item.record.status === 'needs-review' ? 'запісана, патрабуе праверкі' : 'пацверджана' }}
          </span>
          <v-btn v-else variant="tonal" size="small" rounded="pill" class="text-none" :loading="saving" @click="materialize(item)">Запісаць</v-btn>
        </li>
      </ul>
    </section>

    <section class="panel" aria-labelledby="collisions-title">
      <button type="button" class="collapse-toggle" :aria-expanded="showCollisions" @click="showCollisions = !showCollisions">
        <h2 id="collisions-title">Калізіі ({{ collisions.length }})</h2>
        <v-icon :icon="showCollisions ? 'mdi-chevron-up' : 'mdi-chevron-down'" />
      </button>
      <ul v-if="showCollisions" class="plain-list">
        <li v-for="item in collisions" :key="item.date">
          <strong>{{ formatDate(item.date) }}</strong> — {{ item.primary.title }};
          саступае: {{ item.suppressed.map((entry) => entry.title).join(', ') }}
        </li>
      </ul>
    </section>

    <section class="panel" aria-labelledby="calendar-title">
      <button type="button" class="collapse-toggle" :aria-expanded="showCalendar" @click="showCalendar = !showCalendar">
        <h2 id="calendar-title">Разлічаны каляндар {{ year }} г.</h2>
        <v-icon :icon="showCalendar ? 'mdi-chevron-up' : 'mdi-chevron-down'" />
      </button>
      <ul v-if="showCalendar" class="plain-list calendar-list">
        <li v-for="day in calendar" :key="day.date">
          <span class="calendar-date">{{ formatDate(day.date) }}</span>
          <span>{{ day.primary.title }}<template v-if="day.alternatives.length"> · на выбар: {{ day.alternatives.map((entry) => entry.title).join('; ') }}</template></span>
        </li>
      </ul>
    </section>

    <v-dialog v-model="dialog" max-width="720" scrollable>
      <v-card class="override-dialog">
        <v-card-title>{{ draft.id ? 'Рэдагаваць выключэнне' : 'Новае выключэнне' }}</v-card-title>
        <v-card-text>
          <div class="form-grid">
            <v-text-field v-model.number="draft.year" type="number" label="Год" variant="outlined" density="comfortable" hide-details />
            <v-select v-model="draft.scope" :items="scopeItems" item-title="label" item-value="value" label="Дзе дзейнічае" variant="outlined" density="comfortable" hide-details />
            <v-select
              v-if="draft.scope === 'diocese'" v-model="draft.dioceseId" :items="ORDO_DIOCESES" item-title="label" item-value="value"
              label="Дыяцэзія" variant="outlined" density="comfortable" hide-details
            />
            <v-select v-model="draft.action" :items="actionItems" item-title="label" item-value="value" label="Дзеянне" variant="outlined" density="comfortable" hide-details />
          </div>
          <v-autocomplete
            v-if="draft.action !== 'add'" v-model="draft.targetCelebrationId" :items="celebrationItems" item-title="title" item-value="value"
            label="Празднаванне" variant="outlined" density="comfortable" hide-details clearable no-data-text="Нічога не знойдзена" class="mt-3"
          >
            <template #item="{ props: itemProps, item }"><v-list-item v-bind="itemProps" :subtitle="item.raw.subtitle" /></template>
          </v-autocomplete>
          <div v-if="draft.action === 'add' || draft.action === 'replace'" class="form-grid mt-3">
            <v-text-field v-if="draft.action === 'add'" v-model="draft.celebration.id" label="ID (лацінкай)" variant="outlined" density="comfortable" hide-details />
            <v-text-field v-model="draft.celebration.title" label="Назва" variant="outlined" density="comfortable" hide-details />
            <v-select v-model="draft.celebration.rank" :items="rankItems" item-title="label" item-value="value" label="Ранг" variant="outlined" density="comfortable" hide-details clearable />
            <v-select v-model="draft.celebration.color" :items="colorItems" item-title="label" item-value="value" label="Колер" variant="outlined" density="comfortable" hide-details clearable />
          </div>
          <v-alert v-if="draft.computedDate" type="info" variant="tonal" density="comfortable" class="mt-3">
            Аўтаматычны перанос: engine вылічыў {{ formatDate(draft.computedDate) }}.
            Пасля захавання запіс стане ручным і пацверджаным; вылічаная дата захоўваецца для гісторыі.
          </v-alert>
          <div class="form-grid mt-3">
            <v-text-field v-if="usesFrom" v-model="draft.from" type="date" :label="draft.computedDate ? 'Першапачатковая дата' : 'З даты (неабавязкова)'" variant="outlined" density="comfortable" hide-details :readonly="Boolean(draft.computedDate)" />
            <v-text-field v-if="usesTo" v-model="draft.to" type="date" :label="draft.computedDate ? 'Дзейная дата (па гадавым календары)' : 'На дату'" variant="outlined" density="comfortable" hide-details />
            <v-select v-if="draft.action === 'changeRank'" v-model="draft.rank" :items="rankItems" item-title="label" item-value="value" label="Новы ранг" variant="outlined" density="comfortable" hide-details />
            <v-select v-if="draft.action === 'changeColor'" v-model="draft.color" :items="colorItems" item-title="label" item-value="value" label="Новы колер" variant="outlined" density="comfortable" hide-details />
          </div>
          <v-textarea v-model="draft.reason" label="Прычына" rows="2" auto-grow variant="outlined" density="comfortable" hide-details class="mt-3" />
          <v-text-field v-model="draft.sourceNote" label="Крыніца / заўвага (дэкрэт, каляндар)" variant="outlined" density="comfortable" hide-details class="mt-3" />

          <div class="preview" aria-live="polite">
            <h3>Было па разліку → стане</h3>
            <p v-if="preview.errors.length" class="preview-errors">{{ preview.errors.map(errorLabel).join('; ') }}</p>
            <p v-else-if="!preview.changes.length" class="muted">Выключэнне нічога не мяняе ў календары гэтага года.</p>
            <article v-for="change in preview.changes" :key="change.diocese + change.date" class="preview-item">
              <header><strong>{{ formatDate(change.date) }}</strong><span class="badge">{{ dioceseLabel(change.diocese) }}</span></header>
              <div class="preview-columns">
                <div><span class="muted">Было</span><p>{{ describe(change.before) }}</p></div>
                <v-icon icon="mdi-arrow-right" size="18" />
                <div><span class="muted">Стане</span><p>{{ describe(change.after) }}</p></div>
              </div>
            </article>
          </div>
          <v-alert v-if="saveError" type="error" variant="tonal" density="comfortable" class="mt-3">{{ saveError }}</v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" class="text-none" @click="dialog = false">Скасаваць</v-btn>
          <v-btn color="primary" variant="flat" rounded="pill" class="text-none" :loading="saving" :disabled="Boolean(preview.errors.length) || !String(draft.reason || '').trim()" @click="save">Захаваць</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog :model-value="Boolean(toDelete)" max-width="420" @update:model-value="toDelete = null">
      <v-card>
        <v-card-title>Выдаліць выключэнне?</v-card-title>
        <v-card-text>{{ toDelete ? `${actionLabel(toDelete.action)} · ${celebrationTitle(toDelete)}` : '' }}. Каляндар вернецца да разліку.</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" class="text-none" @click="toDelete = null">Скасаваць</v-btn>
          <v-btn color="error" variant="flat" rounded="pill" class="text-none" :loading="saving" @click="remove">Выдаліць</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { RANK_LABEL_MAP } from '@/constants/liturgical';
import { ORDO_DIOCESES, ordoDiocese } from '@/utils/ordoDiocese';
import { ordoCalendarEpoch } from '@/utils/ordoCalendarState';
import { ORDO_MAX_YEAR, ORDO_MIN_YEAR, isSupportedOrdoYear } from '@/utils/liturgicalMovableDates';
import { findAmbiguities } from '@/utils/ordo/ambiguities';
import {
  automaticTransfers, previewYearOverride, storedYearOverrides, summarizeDay, yearCollisions,
} from '@/utils/ordo/overridePreview';
import { TRANSFER_CASES, buildTransferOverrideTargets, confirmTransferOverride } from '@/utils/ordo/transferOverrides';
import { generateLiturgicalYear } from '@/utils/ordo/index';
import { colorInfo, listCalendarCelebrations } from '@/utils/ordoScreen';
import { fetchYearOverridesFresh } from '@/services/ordoCalendarService';
import { deleteYearOverride, saveYearOverride, setYearOverrideEnabled } from '@/services/yearOverridesAdminService';

const year = ref(new Date().getFullYear());
const diocese = ref(ordoDiocese.value);
const dioceseItems = ORDO_DIOCESES;
const loading = ref(false);
const loadError = ref('');
const saving = ref(false);
const saveError = ref('');
const dialog = ref(false);
const toDelete = ref(null);
const showCollisions = ref(false);
const showCalendar = ref(false);

const scopeItems = [{ value: 'belarus', label: 'Уся Беларусь' }, { value: 'diocese', label: 'Адна дыяцэзія' }];
const actionItems = [
  { value: 'move', label: 'Перанесці' },
  { value: 'suppress', label: 'Прапусціць' },
  { value: 'add', label: 'Дадаць' },
  { value: 'replace', label: 'Замяніць' },
  { value: 'changeRank', label: 'Змяніць ранг' },
  { value: 'changeColor', label: 'Змяніць колер' },
];
const rankItems = ['solemnitas', 'festum', 'memoria', 'memoria-ad-libitum'].map((value) => ({ value, label: RANK_LABEL_MAP[value] || value }));
const colorItems = ['albus', 'ruber', 'viridis', 'violaceus', 'rosaceus', 'niger'].map((value) => ({ value, label: colorInfo(value).label }));

const emptyDraft = () => ({
  id: '', year: year.value, scope: 'belarus', dioceseId: diocese.value, targetCelebrationId: null, action: 'move',
  from: '', to: '', rank: null, color: null, celebration: { id: '', title: '', rank: null, color: null },
  reason: '', sourceNote: '', enabled: true,
  // Provenance of a materialized transfer (kept on edit).
  computedDate: '', source: 'manual', status: 'confirmed', transferRule: '', transferCase: '', rankEvidence: null, generator: null,
});
const draft = reactive(emptyDraft());

const validYear = computed(() => (isSupportedOrdoYear(year.value) ? Number(year.value) : new Date().getFullYear()));
const context = computed(() => ({ diocese: diocese.value, epoch: ordoCalendarEpoch.value }));
const engineContext = computed(() => ({ diocese: context.value.diocese }));
const overrides = computed(() => (ordoCalendarEpoch.value, storedYearOverrides(validYear.value)));
// Decided cases stay documented; the panel shows open and provisional ones.
const ambiguities = computed(() => (ordoCalendarEpoch.value, findAmbiguities(validYear.value, engineContext.value)
  .filter((item) => item.status !== 'decided')));
const transfers = computed(() => (ordoCalendarEpoch.value, automaticTransfers(validYear.value, engineContext.value)));
const collisions = computed(() => (ordoCalendarEpoch.value, yearCollisions(validYear.value, engineContext.value)));
const calendar = computed(() => (showCalendar.value && ordoCalendarEpoch.value >= 0
  ? generateLiturgicalYear(validYear.value, engineContext.value).map(summarizeDay) : []));
const celebrationItems = computed(() => (ordoCalendarEpoch.value, listCalendarCelebrations(draft.scope === 'diocese' ? draft.dioceseId : diocese.value)));

const usesFrom = computed(() => ['move', 'suppress', 'replace', 'changeRank', 'changeColor'].includes(draft.action));
const usesTo = computed(() => ['move', 'add'].includes(draft.action));

function draftOverride() {
  const celebration = Object.fromEntries(Object.entries(draft.celebration).filter(([, value]) => value));
  return {
    ...(draft.id ? { id: draft.id } : {}),
    year: Number(draft.year),
    scope: draft.scope,
    ...(draft.scope === 'diocese' ? { dioceseId: draft.dioceseId } : {}),
    action: draft.action,
    ...(draft.action !== 'add' && draft.targetCelebrationId ? { targetCelebrationId: draft.targetCelebrationId } : {}),
    ...(usesFrom.value && draft.from ? { from: draft.from } : {}),
    ...(usesTo.value && draft.to ? { to: draft.to } : {}),
    ...(draft.action === 'changeRank' && draft.rank ? { rank: draft.rank } : {}),
    ...(draft.action === 'changeColor' && draft.color ? { color: draft.color } : {}),
    ...(['add', 'replace'].includes(draft.action) && Object.keys(celebration).length ? { celebration } : {}),
    reason: draft.reason,
    ...(draft.sourceNote ? { sourceNote: draft.sourceNote } : {}),
    source: draft.source || 'manual',
    status: draft.status || 'confirmed',
    ...(draft.computedDate ? { computedDate: draft.computedDate } : {}),
    ...(draft.transferRule ? { transferRule: draft.transferRule } : {}),
    ...(draft.transferCase ? { transferCase: draft.transferCase } : {}),
    ...(draft.rankEvidence ? { rankEvidence: draft.rankEvidence } : {}),
    ...(draft.generator ? { generator: draft.generator } : {}),
    enabled: draft.enabled !== false,
  };
}
const preview = computed(() => (dialog.value ? previewYearOverride(draftOverride()) : { errors: [], changes: [] }));

const ERROR_LABELS = [
  [/targetCelebrationId is required/, 'выберыце празднаванне'],
  [/move requires ISO `to`/, 'пазначце дату, на якую пераносіцца'],
  [/add requires/, 'для дадання патрэбны ID і дата'],
  [/changeRank requires/, 'выберыце новы ранг'],
  [/changeColor requires/, 'выберыце новы колер'],
  [/replace requires/, 'пазначце, што змяняецца'],
  [/dioceseId is required/, 'выберыце дыяцэзію'],
  [/must be a date of/, 'дата павінна быць у выбраным годзе'],
  [/year must be/, 'пазначце год'],
];
const errorLabel = (error) => ERROR_LABELS.find(([pattern]) => pattern.test(error))?.[1] || error;

const formatDate = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const dioceseLabel = (id) => ORDO_DIOCESES.find((item) => item.value === id)?.label || id;
const rankLabelOf = (rank) => RANK_LABEL_MAP[rank] || rank;
const colorLabel = (color) => colorInfo(color).label;
const actionLabel = (action) => actionItems.find((item) => item.value === action)?.label || action;
const scopeLabel = (item) => (item.scope === 'diocese' ? dioceseLabel(item.dioceseId) : 'Уся Беларусь');
const sourceLabel = (item) => (item.source === 'auto-transfer' ? 'Аўтаматычны перанос' : (item.computedDate ? 'Перанос, выпраўлены ўручную' : 'Ручное рашэнне'));
const statusLabel = (item) => (item.status === 'needs-review' ? 'Патрабуе праверкі' : 'Пацверджана');
const transferCaseLabel = (value) => TRANSFER_CASES[value] || value || '';
function celebrationTitle(item) {
  if (item.action === 'add') return item.celebration?.title || item.celebration?.id || '';
  const all = listCalendarCelebrations(item.scope === 'diocese' ? item.dioceseId : diocese.value);
  return all.find((entry) => entry.value === item.targetCelebrationId)?.title || item.targetCelebrationId;
}
function describe(summary) {
  const parts = [`${summary.primary.title}${summary.primary.rank && RANK_LABEL_MAP[summary.primary.rank] ? ` (${RANK_LABEL_MAP[summary.primary.rank]})` : ''}`];
  if (summary.alternatives.length) parts.push(`на выбар: ${summary.alternatives.map((item) => item.title).join('; ')}`);
  if (summary.commemorations.length) parts.push(`успамін: ${summary.commemorations.map((item) => item.title).join('; ')}`);
  return parts.join(' · ');
}

function openCreate(ambiguity = null) {
  Object.assign(draft, emptyDraft());
  if (ambiguity) {
    const occurrence = ambiguity.occurrences[0];
    draft.targetCelebrationId = occurrence?.celebrationId || ambiguity.celebrationId || null;
    draft.from = occurrence?.date || '';
    draft.reason = ambiguity.title;
  }
  saveError.value = '';
  dialog.value = true;
}
function openEdit(item) {
  Object.assign(draft, emptyDraft(), {
    ...item,
    from: item.originalDate || item.from || '', to: item.effectiveDate || item.to || '', sourceNote: item.sourceNote || '',
    computedDate: item.computedDate || '', source: item.source || 'manual', status: item.status || 'confirmed',
    celebration: { id: '', title: '', rank: null, color: null, ...(item.celebration || {}) },
  });
  saveError.value = '';
  dialog.value = true;
}

async function run(task) {
  saving.value = true;
  saveError.value = '';
  try { await task(); return true; } catch (error) { saveError.value = error?.message || String(error); return false; } finally { saving.value = false; }
}
async function save() {
  // A corrected (or simply saved) materialized transfer becomes the
  // administrator's decision: source manual, status confirmed, computedDate kept.
  const value = draft.computedDate ? confirmTransferOverride(draftOverride(), { effectiveDate: draft.to }) : draftOverride();
  if (await run(() => saveYearOverride({ ...value, createdAt: draft.createdAt }))) dialog.value = false;
}
async function confirm(item) {
  if (!(await run(() => saveYearOverride({ ...confirmTransferOverride(item), createdAt: item.createdAt })))) loadError.value = saveError.value;
}
/** Write the computed transfer as an auto Year Override (same record as the materialization script). */
async function materialize(transfer) {
  const targets = buildTransferOverrideTargets({ years: [validYear.value], yearOverrides: storedYearOverrides(validYear.value), dataYearOverrides: false });
  const record = targets.find((item) => item.targetCelebrationId === transfer.celebrationId && item.originalDate === transfer.from
    && (item.scope === 'belarus' || item.dioceseId === diocese.value));
  if (!record) { loadError.value = 'Перанос не знойдзены ў разліку'; return; }
  if (!(await run(() => saveYearOverride(record)))) loadError.value = saveError.value;
}
async function toggle(item, value) {
  if (!(await run(() => setYearOverrideEnabled(item.id, value)))) loadError.value = saveError.value;
}
async function remove() {
  const { id } = toDelete.value;
  if (await run(() => deleteYearOverride(id))) toDelete.value = null;
  else loadError.value = saveError.value;
}
async function reload() {
  loading.value = true;
  loadError.value = '';
  try { await fetchYearOverridesFresh(); } catch (error) { loadError.value = error?.message || String(error); } finally { loading.value = false; }
}
onMounted(reload);
</script>

<style scoped>
.overrides-admin { width: min(100%, 980px); padding: 38px 22px 80px !important; color: var(--nav-on-surface); }
.page-hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 28px; margin: 0 4px 22px; }
.eyebrow { margin: 0 0 8px; color: var(--chrome-accent); font-size: .72rem; font-weight: 800; letter-spacing: .11em; text-transform: uppercase; }
.page-hero h1 { margin: 0 0 10px; font-family: var(--reader-display-font-family); font-size: clamp(2rem, 6vw, 2.7rem); line-height: 1.04; letter-spacing: -.025em; }
.page-description { max-width: 660px; margin: 0; color: var(--nav-muted); font-size: .95rem; line-height: 1.55; }
.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 16px; }
.year-field { max-width: 130px; }
.diocese-field { max-width: 300px; }
.panel { margin-bottom: 14px; padding: 18px 20px; border: 1px solid var(--nav-border); border-radius: 20px; background: var(--nav-surface); }
.panel h2 { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; font-size: 1.02rem; }
.panel--review { border-color: rgb(var(--v-theme-warning)); }
.muted { color: var(--nav-muted); font-size: .84rem; }
.empty { margin: 6px 0 0; }
.review-item { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 12px 0; border-top: 1px solid var(--nav-border); }
.review-item p { margin: 4px 0 0; font-size: .88rem; line-height: 1.45; }
.review-item ul { margin: 6px 0 0; padding-left: 18px; font-size: .86rem; }
.review-decision { font-weight: 650; }
.override-item { display: grid; grid-template-columns: minmax(0, 1fr) auto auto auto auto; align-items: center; gap: 8px; padding: 12px 0; border-top: 1px solid var(--nav-border); }
.override-item--off .override-main { opacity: .55; }
.override-main { display: grid; gap: 3px; min-width: 0; font-size: .88rem; }
.plain-list { margin: 8px 0 0; padding: 0; list-style: none; font-size: .88rem; line-height: 1.5; }
.plain-list li { padding: 5px 0; border-top: 1px solid var(--nav-border); }
.calendar-list li { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 10px; }
.calendar-date { color: var(--nav-muted); font-variant-numeric: tabular-nums; }
.collapse-toggle { display: flex; align-items: center; justify-content: space-between; width: 100%; border: 0; background: transparent; color: inherit; cursor: pointer; text-align: left; }
.collapse-toggle h2 { margin: 0; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.preview { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--nav-border); }
.preview h3 { margin: 0 0 8px; font-size: .95rem; }
.preview-errors { color: rgb(var(--v-theme-error)); font-size: .86rem; }
.preview-item { padding: 10px 0; border-top: 1px solid var(--nav-border); }
.preview-item header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: .88rem; }
.preview-columns { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 10px; font-size: .86rem; }
.preview-columns p { margin: 2px 0 0; line-height: 1.4; }
.badge { padding: 2px 8px; border-radius: 99px; background: var(--nav-active); font-size: .7rem; font-weight: 700; }
.badges { display: flex; flex-wrap: wrap; gap: 6px; }
.badge--review { background: rgba(var(--v-theme-warning), .18); }
.badge--confirmed { background: rgba(var(--v-theme-success), .16); }
.badge--auto { background: rgba(var(--v-theme-info), .16); }
.transfer-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
@media (max-width: 640px) {
  .override-item { grid-template-columns: repeat(4, auto); justify-content: end; }
  .override-item .override-main { grid-column: 1 / -1; }
  .page-hero { align-items: flex-start; flex-direction: column; }
  .form-grid, .preview-columns { grid-template-columns: 1fr; }
  .review-item { flex-direction: column; }
}
</style>

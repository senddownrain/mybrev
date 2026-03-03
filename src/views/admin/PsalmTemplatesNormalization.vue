<template>
  <v-container>
    <h1 class="text-h4 mb-2">Нармалізацыя псальмаў</h1>
    <p class="text-body-2 text-medium-emphasis mb-4">
      Параўнанне шаблонаў псальмаў (Jaccard > 50%). Прагляд згрупаваны па гадзінах.
    </p>

    <v-card class="mb-4" variant="outlined">
      <v-card-text class="d-flex ga-3 align-center flex-wrap">
        <v-btn color="primary" :loading="loading" @click="loadCandidates">Абнавіць пары</v-btn>
        <v-btn color="deep-purple-darken-2" variant="outlined" :loading="autoMerging" :disabled="loading || saving" @click="autoMergeExact">Аўта-мэрж 100%</v-btn>
        <div class="text-body-2">Усяго шаблонаў: <b>{{ templates.length }}</b></div>
        <div class="text-body-2">Пары для праверкі: <b>{{ candidates.length }}</b></div>
        <div class="text-body-2" v-if="currentPair">Пара {{ currentIndex + 1 }} / {{ candidates.length }}</div>
      </v-card-text>
    </v-card>

    <v-alert v-if="!loading && !currentPair" type="success" class="mb-4">Няма пар для апрацоўкі.</v-alert>

    <v-row v-if="currentPair">
      <v-col cols="12" md="6">
        <v-card variant="outlined" class="h-100">
          <v-card-title>Варыянт A</v-card-title>
          <v-card-subtitle>id: {{ currentPair.left.id }}</v-card-subtitle>
          <v-card-text>
            <div class="mb-2 text-caption">Выкарыстанняў (days): {{ currentPair.left.ids?.length || 0 }}</div>
            <v-expansion-panels multiple variant="accordion">
              <v-expansion-panel v-for="group in PSALM_GROUPS" :key="`left-${group.key}`">
                <v-expansion-panel-title>{{ group.title }}</v-expansion-panel-title>
                <v-expansion-panel-text>
                  <div class="field-box" v-for="field in group.fields" :key="`left-${group.key}-${field}`">
                    <div class="text-caption text-medium-emphasis">{{ field }}</div>
                    <div v-html="currentPair.left[field]"></div>
                  </div>
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>

            <v-divider class="my-3" />
            <div class="text-caption text-medium-emphasis mb-1">Дадатковая інфармацыя</div>
            <div class="text-caption">usagePeriods: {{ (currentPair.left.usagePeriods || []).join(', ') || '—' }}</div>
            <div class="text-caption">usageFeasts: {{ (currentPair.left.usageFeasts || []).join(', ') || '—' }}</div>
            <div class="text-caption">usageDates: {{ (currentPair.left.usageDates || []).join(', ') || '—' }}</div>
            <div class="text-caption">usagedayOfWeek: {{ (currentPair.left.usagedayOfWeek || []).join(', ') || '—' }}</div>
          </v-card-text>
          <v-card-actions><v-btn color="success" :loading="saving" @click="resolvePair('left')">Пакінуць A</v-btn></v-card-actions>
        </v-card>
      </v-col>

      <v-col cols="12" md="6">
        <v-card variant="outlined" class="h-100">
          <v-card-title>Варыянт B</v-card-title>
          <v-card-subtitle>id: {{ currentPair.right.id }}</v-card-subtitle>
          <v-card-text>
            <div class="mb-2 text-caption">Выкарыстанняў (days): {{ currentPair.right.ids?.length || 0 }}</div>
            <v-expansion-panels multiple variant="accordion">
              <v-expansion-panel v-for="group in PSALM_GROUPS" :key="`right-${group.key}`">
                <v-expansion-panel-title>{{ group.title }}</v-expansion-panel-title>
                <v-expansion-panel-text>
                  <div class="field-box" v-for="field in group.fields" :key="`right-${group.key}-${field}`">
                    <div class="text-caption text-medium-emphasis">{{ field }}</div>
                    <div v-html="currentPair.right[field]"></div>
                  </div>
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>

            <v-divider class="my-3" />
            <div class="text-caption text-medium-emphasis mb-1">Дадатковая інфармацыя</div>
            <div class="text-caption">usagePeriods: {{ (currentPair.right.usagePeriods || []).join(', ') || '—' }}</div>
            <div class="text-caption">usageFeasts: {{ (currentPair.right.usageFeasts || []).join(', ') || '—' }}</div>
            <div class="text-caption">usageDates: {{ (currentPair.right.usageDates || []).join(', ') || '—' }}</div>
            <div class="text-caption">usagedayOfWeek: {{ (currentPair.right.usagedayOfWeek || []).join(', ') || '—' }}</div>
          </v-card-text>
          <v-card-actions><v-btn color="success" :loading="saving" @click="resolvePair('right')">Пакінуць B</v-btn></v-card-actions>
        </v-card>
      </v-col>
    </v-row>

    <v-card v-if="currentPair" class="mt-4" variant="outlined">
      <v-card-text class="d-flex ga-3 flex-wrap align-center">
        <v-btn variant="outlined" :disabled="saving || autoMerging" @click="skipPair">Прапусціць пару</v-btn>
        <div class="text-caption">Падобнасць: {{ (currentPair.score * 100).toFixed(1) }}%</div>
      </v-card-text>
    </v-card>

    <NotificationSnackbar />
  </v-container>
</template>

<script setup>
import { collection, doc, getDoc, getDocs, writeBatch } from 'firebase/firestore';
import { computed, onMounted, ref } from 'vue';
import { db } from '@/plugins/firebase';
import { useNotifier } from '@/composables/useNotifier';
import NotificationSnackbar from '@/components/NotificationSnackbar.vue';

const PSALM_GROUPS = [
  { key: 'vesper', title: 'Вячэрня', fields: ['vesperPs1', 'vesperPs2', 'vesperPs3'] },
  { key: 'sext2', title: 'Секста', fields: ['sext2Ps1', 'sext2Ps2', 'sext2Ps3'] },
  { key: 'laudes', title: 'Лаудэс', fields: ['laudesPs1', 'laudesPs2', 'laudesPs3'] },
  { key: 'officeOfReadings', title: 'Гадзіна чытанняў', fields: ['officeOfReadingsPs1', 'officeOfReadingsPs2', 'officeOfReadingsPs3'] },
];

const PSALM_FIELDS = PSALM_GROUPS.flatMap((g) => g.fields);

const { notifyError, notifyInfo, notifySuccess } = useNotifier();
const loading = ref(false);
const saving = ref(false);
const autoMerging = ref(false);
const templates = ref([]);
const candidates = ref([]);
const currentIndex = ref(0);
const currentPair = computed(() => candidates.value[currentIndex.value] || null);

function htmlToText(html = '') {
  const el = document.createElement('div');
  el.innerHTML = String(html || '');
  return (el.textContent || el.innerText || '').trim();
}

function canonicalTextForFields(item, fields) {
  return fields
    .map((field) => htmlToText(item[field] || ''))
    .join(' ')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function jaccardSimilarity(a, b) {
  const setA = new Set(a.split(' ').filter((x) => x.length > 2));
  const setB = new Set(b.split(' ').filter((x) => x.length > 2));
  if (setA.size === 0 && setB.size === 0) return 1;
  const inter = new Set([...setA].filter((x) => setB.has(x))).size;
  const union = new Set([...setA, ...setB]).size;
  return union ? inter / union : 0;
}

function buildCandidates(items) {
  const list = [];
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const left = items[i];
      const right = items[j];
      const a = canonicalTextForFields(left, PSALM_FIELDS);
      const b = canonicalTextForFields(right, PSALM_FIELDS);
      if (!a || !b) continue;
      const score = jaccardSimilarity(a, b);
      if (score <= 0.5) continue;
      list.push({ left, right, score });
    }
  }
  return list.sort((x, y) => y.score - x.score);
}

function unionArray(...arrs) {
  return Array.from(new Set(arrs.flat().filter(Boolean))).sort();
}

async function loadCandidates() {
  loading.value = true;
  try {
    const snap = await getDocs(collection(db, 'psalmTemplates'));
    templates.value = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    candidates.value = buildCandidates(templates.value);
    currentIndex.value = 0;
    notifyInfo(`Знойдзена пар для апрацоўкі: ${candidates.value.length}`);
  } catch (error) {
    notifyError(`Не атрымалася загрузіць psalmTemplates: ${error.message}`);
  } finally {
    loading.value = false;
  }
}

async function updateDaysPsalms(loser, winner) {
  const ids = loser.ids || [];
  let batch = writeBatch(db);
  let opCount = 0;
  let updatedDays = 0;
  let updatedFieldsCount = 0;
  const touchedFields = new Set();

  for (const dayId of ids) {
    const dayRef = doc(db, 'days', dayId);
    const daySnap = await getDoc(dayRef);
    if (!daySnap.exists()) continue;
    const data = daySnap.data();
    const payload = {};

    PSALM_FIELDS.forEach((field) => {
      if (String(data[field] || '') === String(loser[field] || '')) {
        payload[field] = winner[field] || '';
        touchedFields.add(field);
        updatedFieldsCount += 1;
      }
    });

    if (!Object.keys(payload).length) continue;

    batch.update(dayRef, payload);
    opCount += 1;
    updatedDays += 1;

    if (opCount >= 400) {
      await batch.commit();
      batch = writeBatch(db);
      opCount = 0;
    }
  }

  if (opCount > 0) await batch.commit();
  return { updatedDays, updatedFieldsCount, touchedFields: Array.from(touchedFields).sort() };
}

function pickWinner(left, right) {
  const leftDays = (left.ids || []).length;
  const rightDays = (right.ids || []).length;
  if (leftDays >= rightDays) return { winner: left, loser: right };
  return { winner: right, loser: left };
}

async function mergePair(left, right) {
  const { winner, loser } = pickWinner(left, right);
  const dayUpdateResult = await updateDaysPsalms(loser, winner);

  const merged = {
    ...winner,
    usagePeriods: unionArray(winner.usagePeriods || [], loser.usagePeriods || []),
    usageFeasts: unionArray(winner.usageFeasts || [], loser.usageFeasts || []),
    usageDates: unionArray(winner.usageDates || [], loser.usageDates || []),
    usagedayOfWeek: unionArray(winner.usagedayOfWeek || [], loser.usagedayOfWeek || []),
    ids: unionArray(winner.ids || [], loser.ids || []),
  };

  const batch = writeBatch(db);
  batch.set(doc(db, 'psalmTemplates', winner.id), merged, { merge: true });
  batch.delete(doc(db, 'psalmTemplates', loser.id));
  await batch.commit();

  return dayUpdateResult;
}

async function resolvePair(choice) {
  if (!currentPair.value) return;
  saving.value = true;
  try {
    const left = choice === 'left' ? currentPair.value.left : currentPair.value.right;
    const right = choice === 'left' ? currentPair.value.right : currentPair.value.left;
    const dayUpdateResult = await mergePair(left, right);

    candidates.value.splice(currentIndex.value, 1);
    if (currentIndex.value >= candidates.value.length) {
      currentIndex.value = Math.max(0, candidates.value.length - 1);
    }

    notifySuccess(`Гатова. Абноўлена days: ${dayUpdateResult.updatedDays}; зменаў палёў: ${dayUpdateResult.updatedFieldsCount}; палі: ${dayUpdateResult.touchedFields.join(', ') || 'няма'}. Дубль псальмаў аб’яднаны.`);
  } catch (error) {
    notifyError(`Памылка аб’яднання: ${error.message}`);
  } finally {
    saving.value = false;
  }
}

async function autoMergeExact() {
  autoMerging.value = true;
  try {
    const snap = await getDocs(collection(db, 'psalmTemplates'));
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const groups = new Map();
    for (const item of items) {
      const key = canonicalTextForFields(item, PSALM_FIELDS);
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }

    let mergedCount = 0;
    let totalUpdatedDays = 0;
    let totalUpdatedFields = 0;

    for (const groupItems of groups.values()) {
      if (groupItems.length < 2) continue;
      groupItems.sort((a, b) => (b.ids || []).length - (a.ids || []).length);
      let winner = groupItems[0];

      for (let i = 1; i < groupItems.length; i += 1) {
        const loser = groupItems[i];
        const result = await mergePair(winner, loser);
        mergedCount += 1;
        totalUpdatedDays += result.updatedDays;
        totalUpdatedFields += result.updatedFieldsCount;
        winner = {
          ...winner,
          ids: unionArray(winner.ids || [], loser.ids || []),
          usagePeriods: unionArray(winner.usagePeriods || [], loser.usagePeriods || []),
          usageFeasts: unionArray(winner.usageFeasts || [], loser.usageFeasts || []),
          usageDates: unionArray(winner.usageDates || [], loser.usageDates || []),
          usagedayOfWeek: unionArray(winner.usagedayOfWeek || [], loser.usagedayOfWeek || []),
        };
      }
    }

    await loadCandidates();
    notifySuccess(`Аўта-мэрж завершаны. Аб’яднана: ${mergedCount}. Абноўлена days: ${totalUpdatedDays}. Зменаў палёў: ${totalUpdatedFields}.`);
  } catch (error) {
    notifyError(`Памылка аўта-мэржу: ${error.message}`);
  } finally {
    autoMerging.value = false;
  }
}

function skipPair() {
  if (!currentPair.value) return;
  candidates.value.splice(currentIndex.value, 1);
  if (currentIndex.value >= candidates.value.length) {
    currentIndex.value = Math.max(0, candidates.value.length - 1);
  }
}

onMounted(loadCandidates);
</script>

<style scoped>
.field-box {
  max-height: 180px;
  overflow: auto;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 8px;
  padding: 8px;
  margin-bottom: 8px;
}
</style>

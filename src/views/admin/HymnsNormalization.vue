<template>
  <v-container>
    <h1 class="text-h4 mb-2">Нармалізацыя гімнаў</h1>
    <p class="text-body-2 text-medium-emphasis mb-4">
      Параўнанне амаль аднолькавых гімнаў. Выберыце варыянт, які пакідаць, або прапусціце пару.
    </p>

    <v-card class="mb-4" variant="outlined">
      <v-card-text class="d-flex ga-3 align-center flex-wrap">
        <v-btn color="primary" :loading="loading" @click="loadCandidates">Абнавіць пары</v-btn>
        <div class="text-body-2">Усяго гімнаў: <b>{{ hymns.length }}</b></div>
        <div class="text-body-2">Пары для праверкі: <b>{{ candidates.length }}</b></div>
        <div class="text-body-2" v-if="currentPair">Пара {{ currentIndex + 1 }} / {{ candidates.length }}</div>
      </v-card-text>
    </v-card>

    <v-alert v-if="!loading && !currentPair" type="success" class="mb-4">
      Няма пар для апрацоўкі. Усе падазроныя дублі ўжо разабраны.
    </v-alert>

    <v-row v-if="currentPair">
      <v-col cols="12" md="6">
        <v-card variant="outlined" class="h-100">
          <v-card-title>Варыянт A</v-card-title>
          <v-card-subtitle>{{ currentPair.left.title || 'Без назвы' }}</v-card-subtitle>
          <v-card-text>
            <div class="mb-2 text-caption">id: {{ currentPair.left.id }}</div>
            <div class="mb-2 text-caption">Выкарыстанняў (days): {{ currentPair.left.ids?.length || 0 }}</div>
            <div class="mb-2 text-caption">oras: {{ (currentPair.left.oras || []).join(', ') || '—' }}</div>
            <div class="hymn-box" v-html="currentPair.left.hymn"></div>
          </v-card-text>
          <v-card-actions>
            <v-btn color="success" :loading="saving" @click="resolvePair('left')">Пакінуць A</v-btn>
          </v-card-actions>
        </v-card>
      </v-col>

      <v-col cols="12" md="6">
        <v-card variant="outlined" class="h-100">
          <v-card-title>Варыянт B</v-card-title>
          <v-card-subtitle>{{ currentPair.right.title || 'Без назвы' }}</v-card-subtitle>
          <v-card-text>
            <div class="mb-2 text-caption">id: {{ currentPair.right.id }}</div>
            <div class="mb-2 text-caption">Выкарыстанняў (days): {{ currentPair.right.ids?.length || 0 }}</div>
            <div class="mb-2 text-caption">oras: {{ (currentPair.right.oras || []).join(', ') || '—' }}</div>
            <div class="hymn-box" v-html="currentPair.right.hymn"></div>
          </v-card-text>
          <v-card-actions>
            <v-btn color="success" :loading="saving" @click="resolvePair('right')">Пакінуць B</v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>

    <v-card v-if="currentPair" class="mt-4" variant="outlined">
      <v-card-text class="d-flex ga-3 flex-wrap">
        <v-btn variant="outlined" :disabled="saving" @click="skipPair">Прапусціць пару</v-btn>
        <div class="text-caption">Падобнасць: {{ currentPair.score.toFixed(3) }}</div>
      </v-card-text>
    </v-card>

    <NotificationSnackbar />
  </v-container>
</template>

<script setup>
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { computed, onMounted, ref } from 'vue';
import { db } from '@/plugins/firebase';
import { useNotifier } from '@/composables/useNotifier';
import NotificationSnackbar from '@/components/NotificationSnackbar.vue';

const { notifyError, notifySuccess, notifyInfo } = useNotifier();

const loading = ref(false);
const saving = ref(false);
const hymns = ref([]);
const candidates = ref([]);
const currentIndex = ref(0);

const currentPair = computed(() => candidates.value[currentIndex.value] || null);

function htmlToText(html = '') {
  const el = document.createElement('div');
  el.innerHTML = String(html || '');
  return (el.textContent || el.innerText || '').trim();
}

function firstLine(html = '') {
  return htmlToText(html)
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)[0] || '';
}

function canonicalText(html = '') {
  return htmlToText(html)
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

      const canonA = canonicalText(left.hymn);
      const canonB = canonicalText(right.hymn);
      if (!canonA || !canonB) continue;

      const similarity = canonA === canonB ? 1 : jaccardSimilarity(canonA, canonB);

      list.push({ left, right, score: similarity });
    }
  }

  return list.sort((a, b) => b.score - a.score || (b.left.ids?.length || 0) + (b.right.ids?.length || 0) - ((a.left.ids?.length || 0) + (a.right.ids?.length || 0)));
}

async function loadCandidates() {
  loading.value = true;
  try {
    const snap = await getDocs(collection(db, 'hymns'));
    hymns.value = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    candidates.value = buildCandidates(hymns.value);
    currentIndex.value = 0;
    notifyInfo(`Знойдзена пар для апрацоўкі: ${candidates.value.length}`);
  } catch (error) {
    notifyError(`Не атрымалася загрузіць гімны: ${error.message}`);
  } finally {
    loading.value = false;
  }
}

function unionArray(...arrs) {
  return Array.from(new Set(arrs.flat().filter(Boolean))).sort();
}

async function updateDaysHymnText(loser, winnerHymn) {
  const ids = loser.ids || [];
  const oras = loser.oras || [];
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

    oras.forEach((oraField) => {
      if (String(data[oraField] || '') === String(loser.hymn || '')) {
        payload[oraField] = winnerHymn;
        touchedFields.add(oraField);
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

  if (opCount > 0) {
    await batch.commit();
  }

  return {
    updatedDays,
    updatedFieldsCount,
    touchedFields: Array.from(touchedFields).sort(),
  };
}

async function resolvePair(choice) {
  if (!currentPair.value) return;

  saving.value = true;
  try {
    const winner = choice === 'left' ? currentPair.value.left : currentPair.value.right;
    const loser = choice === 'left' ? currentPair.value.right : currentPair.value.left;

    const dayUpdateResult = await updateDaysHymnText(loser, winner.hymn);

    const merged = {
      hymn: winner.hymn,
      title: firstLine(winner.hymn) || winner.title || loser.title || '',
      oras: unionArray(winner.oras || [], loser.oras || []),
      usagePeriods: unionArray(winner.usagePeriods || [], loser.usagePeriods || []),
      usageFeasts: unionArray(winner.usageFeasts || [], loser.usageFeasts || []),
      usageDates: unionArray(winner.usageDates || [], loser.usageDates || []),
      ids: unionArray(winner.ids || [], loser.ids || []),
    };

    const batch = writeBatch(db);
    batch.set(doc(db, 'hymns', winner.id), merged, { merge: true });
    batch.delete(doc(db, 'hymns', loser.id));
    await batch.commit();

    candidates.value.splice(currentIndex.value, 1);
    if (currentIndex.value >= candidates.value.length) {
      currentIndex.value = Math.max(0, candidates.value.length - 1);
    }

    notifySuccess(
      `Гатова. Абноўлена days: ${dayUpdateResult.updatedDays}; зменаў палёў: ${dayUpdateResult.updatedFieldsCount}; палі: ${dayUpdateResult.touchedFields.join(', ') || 'няма'}. Дубль гімна аб’яднаны.`
    );

    if (!candidates.value.length) {
      notifySuccess('Усе пары апрацаваны паспяхова.');
    }
  } catch (error) {
    notifyError(`Памылка аб’яднання: ${error.message}`);
  } finally {
    saving.value = false;
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
.hymn-box {
  max-height: 52vh;
  overflow: auto;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 8px;
  padding: 12px;
}
</style>

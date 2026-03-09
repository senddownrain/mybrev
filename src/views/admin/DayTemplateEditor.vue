<template>
  <div>
    <v-app-bar color="primary" app>
      <v-btn icon @click="goBack"><v-icon>mdi-arrow-left</v-icon></v-btn>
      <v-toolbar-title>{{ isNew ? 'Стварэнне шаблона дня' : 'Рэдагаванне шаблона дня' }}</v-toolbar-title>
      <v-spacer></v-spacer>
      <v-btn variant="text" class="mr-2" :to="{ name: 'AdminDayTemplatesList' }">Спіс шаблонаў</v-btn>
      <v-btn variant="text" @click="clearAll">Ачысціць</v-btn>
      <v-btn variant="text" :loading="saving" @click="saveTemplate">Захаваць</v-btn>
    </v-app-bar>

    <v-container class="py-4">
      <v-card class="mb-4">
        <v-card-text>
          <v-row>
            <v-col cols="12" md="6">
              <v-text-field v-model="templateData._title" label="Назва шаблона" variant="outlined" density="compact"></v-text-field>
            </v-col>
            <v-col cols="12" md="3">
              <v-text-field v-model.number="templateData._psalmWeekNumber" type="number" label="Нумар тыдня псалтыра" variant="outlined" density="compact"></v-text-field>
            </v-col>
            <v-col cols="12" md="3" class="d-flex align-center">
              <v-btn block prepend-icon="mdi-auto-fix" @click="setAutoTitle">Аўтаназва</v-btn>
            </v-col>
            <v-col cols="12" md="3" class="d-flex align-center">
              <v-checkbox v-model="templateData._isChecked" label="Праверана" color="success" density="compact" hide-details />
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <v-card v-if="isNew" class="mb-4">
        <v-card-title>Выбар дня-кандыдата</v-card-title>
        <v-card-text>
          <v-row>
            <v-col cols="12"><div class="text-subtitle-2 mb-1">1) Па перыядзе / тыдні / дню</div></v-col>
            <v-col cols="12" md="4">
              <v-select v-model="selector.periodType" :items="periodOptions" label="Перыяд" variant="outlined" density="compact" clearable></v-select>
            </v-col>
            <v-col cols="12" md="4">
              <v-text-field v-model.number="selector.periodWeekNumber" type="number" label="Нумар тыдня" variant="outlined" density="compact"></v-text-field>
            </v-col>
            <v-col cols="12" md="4">
              <v-select v-model="selector.dayOfWeek" :items="dayOfWeekOptions" label="Дзень тыдня" variant="outlined" density="compact" clearable></v-select>
            </v-col>
          </v-row>
          <v-btn class="mr-2" prepend-icon="mdi-magnify" @click="findByPeriod">Знайсці дзень</v-btn>

          <v-divider class="my-4"></v-divider>

          <v-row>
            <v-col cols="12"><div class="text-subtitle-2 mb-1">2) Па даце</div></v-col>
            <v-col cols="12" md="4">
              <v-text-field v-model="selector.date" label="Дата (YYYY-MM-DD)" variant="outlined" density="compact"></v-text-field>
            </v-col>
            <v-col cols="12" md="4" class="d-flex align-center">
              <v-btn prepend-icon="mdi-calendar-search" @click="findByDate">Знайсці па даце</v-btn>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <v-alert v-if="!templateData._periodType && !hasTemplateContent" type="info" variant="tonal">
        Выберыце дзень у блоку вышэй, каб запоўніць шаблон.
      </v-alert>

      <v-expansion-panels v-if="hasTemplateContent" variant="accordion" v-model="panel">
        <v-expansion-panel title="Каментар">
          <v-expansion-panel-text class="pa-1"><v-row no-gutters><InlineEditor v-model="templateData.feastComment" field-title="Каментар" /></v-row></v-expansion-panel-text>
        </v-expansion-panel>

        <v-expansion-panel title="Інвітаторый">
          <v-expansion-panel-text class="pa-1"><v-row no-gutters>
            <InlineEditor v-model="templateData.invitatoriumAnt" field-title="Антыфона (Інвітаторый)" />
          </v-row></v-expansion-panel-text>
        </v-expansion-panel>

        <v-expansion-panel title="Гадзіна Чытанняў">
          <v-expansion-panel-text class="pa-1"><v-row no-gutters>
            <InlineEditor v-model="templateData.officeOfReadingsHymn" field-title="Гімн (ГЧ)" />
            <InlineEditor v-model="templateData.officeOfReadingsAnt1" field-title="Антыфона 1 (ГЧ)" />
            <InlineEditor v-model="templateData.officeOfReadingsPs1" field-title="Псалом 1 (ГЧ)" />
            <InlineEditor v-model="templateData.officeOfReadingsAnt2" field-title="Антыфона 2 (ГЧ)" />
            <InlineEditor v-model="templateData.officeOfReadingsPs2" field-title="Псалом 2 (ГЧ)" />
            <InlineEditor v-model="templateData.officeOfReadingsAnt3" field-title="Антыфона 3 (ГЧ)" />
            <InlineEditor v-model="templateData.officeOfReadingsPs3" field-title="Псалом 3 (ГЧ)" />
            <InlineEditor v-model="templateData.officeOfReadingsVers" field-title="Верш (ГЧ)" />
            <InlineEditor v-model="templateData.officeOfReadingsR1" field-title="Чытанне 1 (ГЧ)" />
            <InlineEditor v-model="templateData.officeOfReadingsR2" field-title="Чытанне 2 (ГЧ)" />
            <InlineEditor v-model="templateData.officeOfReadingsTeDeum" field-title="Te Deum" />
            <InlineEditor v-model="templateData.officeOfReadingsPr" field-title="Малітва (ГЧ)" />
          </v-row></v-expansion-panel-text>
        </v-expansion-panel>

        <v-expansion-panel title="Ютрань">
          <v-expansion-panel-text class="pa-1"><v-row no-gutters>
            <InlineEditor v-model="templateData.laudesHymn" field-title="Гімн (Ютрань)" />
            <InlineEditor v-model="templateData.laudesAnt1" field-title="Антыфона 1 (Ютрань)" />
            <InlineEditor v-model="templateData.laudesPs1" field-title="Псалом 1 (Ютрань)" />
            <InlineEditor v-model="templateData.laudesAnt2" field-title="Антыфона 2 (Ютрань)" />
            <InlineEditor v-model="templateData.laudesPs2" field-title="Псалом 2 (Ютрань)" />
            <InlineEditor v-model="templateData.laudesAnt3" field-title="Антыфона 3 (Ютрань)" />
            <InlineEditor v-model="templateData.laudesPs3" field-title="Псалом 3 (Ютрань)" />
            <InlineEditor v-model="templateData.laudesR" field-title="Кароткае чытанне (Ютрань)" />
            <InlineEditor v-model="templateData.laudesAntBen" field-title="Антыфона да Песні Захарыі" />
            <InlineEditor v-model="templateData.laudesInter" field-title="Просьбы (Ютрань)" />
            <InlineEditor v-model="templateData.laudesPr" field-title="Малітва (Ютрань)" />
          </v-row></v-expansion-panel-text>
        </v-expansion-panel>

        <v-expansion-panel title="Дзённыя гадзіны">
          <v-expansion-panel-text class="pa-1"><v-row no-gutters>
            <InlineEditor v-model="templateData.sext1Hymn" field-title="Гімн (Тэрцыя)" />
            <InlineEditor v-model="templateData.sext1Ant1" field-title="Антыфона 1 (Тэрцыя)" />
            <InlineEditor v-model="templateData.sext1Ps1" field-title="Псалом 1 (Тэрцыя)" />
            <InlineEditor v-model="templateData.sext1Ant2" field-title="Антыфона 2 (Тэрцыя)" />
            <InlineEditor v-model="templateData.sext1Ps2" field-title="Псалом 2 (Тэрцыя)" />
            <InlineEditor v-model="templateData.sext1Ant3" field-title="Антыфона 3 (Тэрцыя)" />
            <InlineEditor v-model="templateData.sext1Ps3" field-title="Псалом 3 (Тэрцыя)" />
            <InlineEditor v-model="templateData.sext1R" field-title="Кароткае чытанне (Тэрцыя)" />
            <InlineEditor v-model="templateData.sext1Pr" field-title="Малітва (Тэрцыя)" />

            <InlineEditor v-model="templateData.sext2Hymn" field-title="Гімн (Сэкста)" />
            <InlineEditor v-model="templateData.sext2Ant1" field-title="Антыфона 1 (Сэкста)" />
            <InlineEditor v-model="templateData.sext2Ps1" field-title="Псалом 1 (Сэкста)" />
            <InlineEditor v-model="templateData.sext2Ant2" field-title="Антыфона 2 (Сэкста)" />
            <InlineEditor v-model="templateData.sext2Ps2" field-title="Псалом 2 (Сэкста)" />
            <InlineEditor v-model="templateData.sext2Ant3" field-title="Антыфона 3 (Сэкста)" />
            <InlineEditor v-model="templateData.sext2Ps3" field-title="Псалом 3 (Сэкста)" />
            <InlineEditor v-model="templateData.sext2R" field-title="Кароткае чытанне (Сэкста)" />
            <InlineEditor v-model="templateData.sext2Pr" field-title="Малітва (Сэкста)" />

            <InlineEditor v-model="templateData.sext3Hymn" field-title="Гімн (Нона)" />
            <InlineEditor v-model="templateData.sext3Ant1" field-title="Антыфона 1 (Нона)" />
            <InlineEditor v-model="templateData.sext3Ps1" field-title="Псалом 1 (Нона)" />
            <InlineEditor v-model="templateData.sext3Ant2" field-title="Антыфона 2 (Нона)" />
            <InlineEditor v-model="templateData.sext3Ps2" field-title="Псалом 2 (Нона)" />
            <InlineEditor v-model="templateData.sext3Ant3" field-title="Антыфона 3 (Нона)" />
            <InlineEditor v-model="templateData.sext3Ps3" field-title="Псалом 3 (Нона)" />
            <InlineEditor v-model="templateData.sext3R" field-title="Кароткае чытанне (Нона)" />
            <InlineEditor v-model="templateData.sext3Pr" field-title="Малітва (Нона)" />
          </v-row></v-expansion-panel-text>
        </v-expansion-panel>

        <v-expansion-panel title="Нешпары">
          <v-expansion-panel-text class="pa-1"><v-row no-gutters>
            <InlineEditor v-model="templateData.vesper1Hymn" field-title="Гімн (Першыя Нешпары)" />
            <InlineEditor v-model="templateData.vesper1Ant1" field-title="Антыфона 1 (Першыя Нешпары)" />
            <InlineEditor v-model="templateData.vesper1Ps1" field-title="Псалом 1 (Першыя Нешпары)" />
            <InlineEditor v-model="templateData.vesper1Ant2" field-title="Антыфона 2 (Першыя Нешпары)" />
            <InlineEditor v-model="templateData.vesper1Ps2" field-title="Псалом 2 (Першыя Нешпары)" />
            <InlineEditor v-model="templateData.vesper1Ant3" field-title="Антыфона 3 (Першыя Нешпары)" />
            <InlineEditor v-model="templateData.vesper1Ps3" field-title="Псалом 3 (Першыя Нешпары)" />
            <InlineEditor v-model="templateData.vesper1R" field-title="Кароткае чытанне (Першыя Нешпары)" />
            <InlineEditor v-model="templateData.vesper1AntMag" field-title="Антыфона да Песні Марыі (Першыя Нешпары)" />
            <InlineEditor v-model="templateData.vesper1Inter" field-title="Просьбы (Першыя Нешпары)" />
            <InlineEditor v-model="templateData.vesper1Pr" field-title="Малітва (Першыя Нешпары)" />

            <InlineEditor v-model="templateData.vesperHymn" field-title="Гімн (Другія Нешпары)" />
            <InlineEditor v-model="templateData.vesperAnt1" field-title="Антыфона 1 (Другія Нешпары)" />
            <InlineEditor v-model="templateData.vesperPs1" field-title="Псалом 1 (Другія Нешпары)" />
            <InlineEditor v-model="templateData.vesperAnt2" field-title="Антыфона 2 (Другія Нешпары)" />
            <InlineEditor v-model="templateData.vesperPs2" field-title="Псалом 2 (Другія Нешпары)" />
            <InlineEditor v-model="templateData.vesperAnt3" field-title="Антыфона 3 (Другія Нешпары)" />
            <InlineEditor v-model="templateData.vesperPs3" field-title="Псалом 3 (Другія Нешпары)" />
            <InlineEditor v-model="templateData.vesperR" field-title="Кароткае чытанне (Другія Нешпары)" />
            <InlineEditor v-model="templateData.vesperAntMag" field-title="Антыфона да Песні Марыі (Другія Нешпары)" />
            <InlineEditor v-model="templateData.vesperInter" field-title="Просьбы (Другія Нешпары)" />
            <InlineEditor v-model="templateData.vesperPr" field-title="Малітва (Другія Нешпары)" />
          </v-row></v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </v-container>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useFirestore } from 'vuefire';
import { addDoc, collection, doc, getDoc, getDocs, limit, query, setDoc, where } from 'firebase/firestore';
import InlineEditor from '@/components/admin/InlineEditor.vue';
import { useNotifier } from '@/composables/useNotifier';
import { DAY_TEMPLATE_FIELDS } from '@/constants/dayTemplates';
import { PERIOD_LABEL_MAP, WEEKDAY_LABEL_MAP } from '@/constants/liturgical';

const route = useRoute();
const router = useRouter();
const db = useFirestore();
const { success, error } = useNotifier();

const saving = ref(false);
const panel = ref();
const isNew = computed(() => route.params.id === 'new');
const hasTemplateContent = computed(() => DAY_TEMPLATE_FIELDS.some((field) => templateData[field]));

const templateData = reactive(getEmptyTemplate());
const selector = reactive({
  periodType: null,
  periodWeekNumber: null,
  dayOfWeek: null,
  date: '',
});

const periodOptions = Object.entries(PERIOD_LABEL_MAP).map(([value, title]) => ({ value, title }));
const dayOfWeekOptions = Object.entries(WEEKDAY_LABEL_MAP).map(([value, title]) => ({ value: Number(value), title }));

function getEmptyTemplate() {
  const data = { _title: '', _psalmWeekNumber: null, _isChecked: false, _checkedAt: null };
  DAY_TEMPLATE_FIELDS.forEach((field) => {
    data[field] = null;
  });
  return data;
}

function assignTemplate(source = {}) {
  Object.assign(templateData, getEmptyTemplate(), source);
}

function copyFromDay(dayDoc) {
  const next = {};
  DAY_TEMPLATE_FIELDS.forEach((field) => {
    next[field] = dayDoc[field] ?? null;
  });
  next._psalmWeekNumber = dayDoc._psalmWeek ? Number(dayDoc._psalmWeek) : null;
  assignTemplate(next);
}

function goBack() {
  router.push({ name: 'AdminDayTemplatesList' });
}

function setAutoTitle() {
  const week = templateData._psalmWeekNumber ?? '';
  const dayLabel = WEEKDAY_LABEL_MAP[templateData._dayOfWeek] || '';
  const periodLabel = PERIOD_LABEL_MAP[templateData._periodType] || templateData._periodType || '';
  templateData._title = `${week} тыдзень, ${dayLabel}, ${periodLabel}`.replace(/(,\s*){2,}/g, ', ').replace(/^,\s*|,\s*$/g, '');
}

function clearAll() {
  assignTemplate();
  selector.periodType = null;
  selector.periodWeekNumber = null;
  selector.dayOfWeek = null;
  selector.date = '';
}

async function findByPeriod() {
  if (!selector.periodType || !selector.periodWeekNumber || !selector.dayOfWeek) {
    error('Запоўніце перыяд, нумар тыдня і дзень тыдня.');
    return;
  }

  const q = query(
    collection(db, 'days'),
    where('_periodType', '==', selector.periodType),
    where('_periodWeekNumber', '==', Number(selector.periodWeekNumber)),
    where('_dayOfWeek', '==', Number(selector.dayOfWeek)),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) {
    error('Дзень не знойдзены.');
    return;
  }
  copyFromDay(snap.docs[0].data());
  success('Дзень загружаны ў шаблон.');
}

async function findByDate() {
  if (!selector.date) {
    error('Пакажыце дату.');
    return;
  }
  const q = query(collection(db, 'days'), where('_date', '==', selector.date), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) {
    error('Дзень з такой датай не знойдзены.');
    return;
  }
  copyFromDay(snap.docs[0].data());
  success('Дзень загружаны ў шаблон.');
}

function buildPayload() {
  const payload = {
    _title: templateData._title || '',
    _psalmWeekNumber: templateData._psalmWeekNumber != null ? Number(templateData._psalmWeekNumber) : null,
    _isChecked: templateData._isChecked === true,
    _checkedAt: templateData._isChecked === true ? (templateData._checkedAt || new Date().toISOString()) : null,
  };

  DAY_TEMPLATE_FIELDS.forEach((field) => {
    payload[field] = templateData[field] ?? null;
  });

  return payload;
}

async function saveTemplate() {
  saving.value = true;
  try {
    const payload = buildPayload();
    if (!payload._title) {
      error('Назва шаблона абавязковая.');
      return;
    }

    if (payload._isChecked && !templateData._checkedAt) {
      templateData._checkedAt = new Date().toISOString();
    }

    if (isNew.value) {
      await addDoc(collection(db, 'dayTemplates'), payload);
      success('Шаблон захаваны.');
      clearAll();
      return;
    }

    await setDoc(doc(db, 'dayTemplates', route.params.id), payload, { merge: true });
    success('Шаблон абноўлены.');
  } catch (e) {
    error(`Не атрымалася захаваць шаблон: ${e?.message || e}`);
  } finally {
    saving.value = false;
  }
}

async function loadTemplateForEdit() {
  if (isNew.value) {
    clearAll();
    return;
  }

  const templateRef = doc(db, 'dayTemplates', route.params.id);
  const snapshot = await getDoc(templateRef);
  if (!snapshot.exists()) {
    error('Шаблон не знойдзены.');
    router.push({ name: 'AdminDayTemplatesList' });
    return;
  }

  assignTemplate(snapshot.data());
}

loadTemplateForEdit();
</script>

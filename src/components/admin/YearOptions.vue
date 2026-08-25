<template>
  <v-container class="year-page">
    <header class="year-header">
      <div>
        <p class="year-eyebrow">Адміністраванне</p>
        <h1 class="year-title">Літургічны год</h1>
        <p class="year-description">
          Разлічыце рухомыя святы, праверце даты і захавайце гатовы год у базе.
        </p>
      </div>
      <div class="year-counter">
        <span class="year-counter__value">{{ sortedYears.length }}</span>
        <span class="year-counter__label">у базе</span>
      </div>
    </header>

    <v-form @submit.prevent="saveNewYear">
      <v-card class="year-card year-builder" elevation="0">
        <div class="section-heading">
          <div class="section-icon"><v-icon icon="mdi-calendar-plus-outline" /></div>
          <div>
            <h2>Дадаць год</h2>
            <p>Асноўныя даты разлічваюцца аўтаматычна.</p>
          </div>
        </div>

        <v-card-text class="year-card__content">
          <div class="year-select-row">
            <v-text-field
              v-model.number="newItem.year"
              label="Год"
              type="number"
              min="1900"
              max="2200"
              variant="outlined"
              hide-details="auto"
              class="year-input"
              :error-messages="yearError"
              @update:model-value="calculateAllDates"
            />
            <v-btn
              variant="tonal"
              rounded="pill"
              size="large"
              prepend-icon="mdi-calculator-variant-outline"
              class="calculate-button text-none"
              @click="calculateAllDates"
            >
              Разлічыць нанова
            </v-btn>
          </div>

          <div class="dates-section">
            <p class="fields-label">Рухомыя святы</p>
            <div class="dates-grid">
              <v-text-field v-model="newItem.easterSunday" label="Вялікдзень" type="date" variant="outlined" hide-details="auto" />
              <v-text-field v-model="newItem.ashWednesday" label="Папялец" type="date" variant="outlined" hide-details="auto" />
              <v-text-field v-model="newItem.ascension" label="Унебаўшэсце" type="date" variant="outlined" hide-details="auto" />
              <v-text-field v-model="newItem.pentecost" label="Спасланне Духа" type="date" variant="outlined" hide-details="auto" />
              <v-text-field v-model="newItem.corpusChristi" label="Божае Цела" type="date" variant="outlined" hide-details="auto" />
              <v-text-field v-model="newItem.baptismOfLord" label="Хрост Пана" type="date" variant="outlined" hide-details="auto" />
              <v-text-field v-model="newItem.firstAdventSunday" label="Першая нядзеля Адвэнту" type="date" variant="outlined" hide-details="auto" />
            </div>
          </div>

          <div class="dates-section dates-section--ordinary">
            <p class="fields-label">Звычайны перыяд</p>
            <div class="dates-grid dates-grid--ordinary">
              <v-text-field v-model="newItem.ordintaryStart1" label="Пачатак першага перыяду" type="date" variant="outlined" readonly hide-details="auto" />
              <v-text-field v-model.number="newItem.ordintaryWeeks1" label="Тыдняў у першым перыядзе" type="number" variant="outlined" hide-details="auto" />
              <v-text-field v-model="newItem.ordintaryStart2" label="Пачатак другога перыяду" type="date" variant="outlined" readonly hide-details="auto" />
              <v-text-field v-model.number="newItem.ordintaryWeeks2" label="Пачатковы тыдзень другога" type="number" variant="outlined" hide-details="auto" />
            </div>
          </div>
        </v-card-text>

        <v-card-actions class="year-card__actions">
          <p class="save-hint">Праверце даты перад захаваннем.</p>
          <v-btn
            type="submit"
            rounded="pill"
            size="large"
            class="save-year-button text-none"
            prepend-icon="mdi-check"
            :disabled="!isNewItemValid"
            :loading="saving"
          >
            Захаваць {{ newItem.year }} год
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-form>

    <section class="saved-years" aria-labelledby="saved-years-title">
      <div class="saved-years__heading">
        <div>
          <p class="year-eyebrow">База даных</p>
          <h2 id="saved-years-title">Захаваныя гады</h2>
        </div>
        <v-progress-circular v-if="loading" indeterminate size="24" width="2" />
      </div>

      <v-skeleton-loader v-if="loading" type="list-item-two-line@3" class="years-skeleton" />

      <div v-else-if="sortedYears.length" class="years-list">
        <article v-for="item in sortedYears" :key="item.id" class="saved-year-card">
          <div class="saved-year-card__top">
            <div class="saved-year-number">{{ item.year }}</div>
            <v-btn
              icon="mdi-delete-outline"
              variant="text"
              color="error"
              size="small"
              :aria-label="`Выдаліць ${item.year} год`"
              @click="requestDelete(item)"
            />
          </div>
          <dl class="saved-year-dates">
            <div><dt>Вялікдзень</dt><dd>{{ formatStoredDate(item.easterSunday) }}</dd></div>
            <div><dt>Папялец</dt><dd>{{ formatStoredDate(item.ashWednesday) }}</dd></div>
            <div><dt>Адвэнт</dt><dd>{{ formatStoredDate(item.firstAdventSunday) }}</dd></div>
          </dl>
        </article>
      </div>

      <div v-else class="years-empty">
        <v-icon icon="mdi-calendar-blank-outline" size="34" />
        <p>У базе пакуль няма наладжаных гадоў.</p>
      </div>
    </section>

    <v-dialog v-model="deleteDialog" max-width="430">
      <v-card class="delete-dialog" elevation="0">
        <v-card-title>Выдаліць {{ itemToDelete?.year }} год?</v-card-title>
        <v-card-text>Даты гэтага года будуць выдалены з базы. Адмяніць дзеянне будзе немагчыма.</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" rounded="pill" :disabled="deleting" @click="closeDeleteDialog">Скасаваць</v-btn>
          <v-btn color="error" variant="flat" rounded="pill" :loading="deleting" @click="confirmDelete">Выдаліць</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup>
import { computed, reactive, ref } from 'vue';
import { useCollection } from 'vuefire';
import { addDoc, collection, deleteDoc, doc, getFirestore } from 'firebase/firestore';
import { useNotifier } from '@/composables/useNotifier';
import { logger } from '@/utils/logger';
import { retryFirestore } from '@/utils/retry';

const db = getFirestore();
const yearOptionsRef = collection(db, 'yearOptions');
const { data: yearOptions, pending: loading } = useCollection(yearOptionsRef);
const { success, error: notifyError } = useNotifier();

const createDefaultItem = () => ({
  year: new Date().getFullYear() + 1,
  ashWednesday: '',
  easterSunday: '',
  ascension: '',
  pentecost: '',
  corpusChristi: '',
  baptismOfLord: '',
  firstAdventSunday: '',
  ordintaryStart1: '',
  ordintaryWeeks1: '',
  ordintaryStart2: '',
  ordintaryWeeks2: '',
});

const newItem = reactive(createDefaultItem());
const saving = ref(false);
const deleting = ref(false);
const deleteDialog = ref(false);
const itemToDelete = ref(null);

const sortedYears = computed(() => [...(yearOptions.value || [])].sort((a, b) => Number(b.year) - Number(a.year)));
const isExistingYear = computed(() => sortedYears.value.some((item) => Number(item.year) === Number(newItem.year)));
const yearError = computed(() => {
  if (!newItem.year || newItem.year < 1900 || newItem.year > 2200) return 'Увядзіце год ад 1900 да 2200';
  if (isExistingYear.value) return 'Гэты год ужо ёсць у базе';
  return '';
});
const isNewItemValid = computed(() => !yearError.value && newItem.easterSunday && newItem.firstAdventSunday);

const formatDate = (date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDays = (source, days) => {
  const date = new Date(source);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
};

const calculateAllDates = () => {
  const y = Number(newItem.year);
  if (!y || y < 1900 || y > 2200) return;

  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const easterDate = new Date(Date.UTC(y, month - 1, day));

  newItem.easterSunday = formatDate(easterDate);
  const ashWednesdayDate = addDays(easterDate, -46);
  newItem.ashWednesday = formatDate(ashWednesdayDate);
  newItem.ascension = formatDate(addDays(easterDate, 39));
  newItem.pentecost = formatDate(addDays(easterDate, 49));
  newItem.corpusChristi = formatDate(addDays(easterDate, 60));

  const christmas = new Date(Date.UTC(y, 11, 25));
  newItem.firstAdventSunday = formatDate(addDays(christmas, -christmas.getUTCDay() - 21));

  const epiphany = new Date(Date.UTC(y, 0, 6));
  let baptismLord = addDays(epiphany, 7 - epiphany.getUTCDay());
  if (baptismLord.getUTCMonth() === 0 && baptismLord.getUTCDate() < 7) baptismLord = addDays(baptismLord, 7);
  newItem.baptismOfLord = formatDate(baptismLord);

  const ordinaryStart1 = addDays(baptismLord, 1);
  const ordinaryEnd1 = addDays(ashWednesdayDate, -1);
  newItem.ordintaryStart1 = formatDate(ordinaryStart1);
  newItem.ordintaryWeeks1 = Math.ceil((ordinaryEnd1.getTime() - ordinaryStart1.getTime() + 86400000) / 604800000);
  newItem.ordintaryStart2 = formatDate(addDays(easterDate, 50));
  newItem.ordintaryWeeks2 = newItem.ordintaryWeeks1 + 2;
};

const saveNewYear = async () => {
  if (!isNewItemValid.value || saving.value) return;
  saving.value = true;
  const savedYear = newItem.year;
  try {
    await retryFirestore(() => addDoc(yearOptionsRef, { ...newItem }));
    success(`Год ${savedYear} дададзены ў базу.`);
    Object.assign(newItem, createDefaultItem(), { year: Number(savedYear) + 1 });
    calculateAllDates();
  } catch (error) {
    logger.error('Памылка дадавання года:', error);
    notifyError('Не атрымалася дадаць год. Паспрабуйце яшчэ раз.');
  } finally {
    saving.value = false;
  }
};

const requestDelete = (item) => {
  itemToDelete.value = item;
  deleteDialog.value = true;
};

const closeDeleteDialog = () => {
  deleteDialog.value = false;
  itemToDelete.value = null;
};

const confirmDelete = async () => {
  if (!itemToDelete.value || deleting.value) return;
  deleting.value = true;
  const item = itemToDelete.value;
  try {
    await retryFirestore(() => deleteDoc(doc(db, 'yearOptions', item.id)));
    success(`Год ${item.year} выдалены.`);
    closeDeleteDialog();
  } catch (error) {
    logger.error('Памылка выдалення года:', error);
    notifyError('Не атрымалася выдаліць год. Паспрабуйце яшчэ раз.');
  } finally {
    deleting.value = false;
  }
};

const formatStoredDate = (value) => {
  if (!value) return '—';
  const [year, month, day] = String(value).split('-');
  return year && month && day ? `${day}.${month}.${year}` : value;
};

calculateAllDates();
</script>

<style scoped>
.year-page {
  width: min(100%, 1180px);
  padding: 42px 20px 80px !important;
  color: var(--nav-on-surface);
}

.year-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin: 0 6px 30px;
}

.year-eyebrow,
.fields-label {
  margin: 0 0 7px;
  color: var(--nav-muted);
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}

.year-title {
  margin: 0;
  font-size: clamp(2.25rem, 5vw, 3.5rem);
  font-weight: 760;
  line-height: 1;
  letter-spacing: -0.045em;
}

.year-description {
  max-width: 610px;
  margin: 16px 0 0;
  color: var(--nav-muted);
  line-height: 1.6;
}

.year-counter {
  display: grid;
  min-width: 88px;
  min-height: 76px;
  place-content: center;
  border: 1px solid var(--nav-border);
  border-radius: 22px;
  background: var(--nav-surface);
  text-align: center;
  box-shadow: 0 4px 18px var(--nav-button-shadow);
}

.year-counter__value { font-size: 1.45rem; font-weight: 760; line-height: 1; }
.year-counter__label { margin-top: 5px; color: var(--nav-muted); font-size: 0.7rem; }

.year-card,
.delete-dialog {
  border: 1px solid var(--nav-border);
  border-radius: 28px !important;
  background: var(--nav-surface) !important;
  color: var(--nav-on-surface);
  box-shadow: 0 12px 40px var(--nav-button-shadow) !important;
}

.section-heading {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 24px 28px 0;
}

.section-icon {
  display: grid;
  width: 46px;
  height: 46px;
  flex: 0 0 46px;
  place-items: center;
  border-radius: 15px;
  background: var(--nav-active);
}

.section-heading h2,
.saved-years__heading h2 { margin: 0; font-size: 1.35rem; font-weight: 730; }
.section-heading p { margin: 3px 0 0; color: var(--nav-muted); font-size: 0.84rem; }
.year-card__content { padding: 26px 28px 28px !important; }

.year-select-row {
  display: grid;
  grid-template-columns: minmax(180px, 260px) max-content;
  align-items: start;
  gap: 14px;
}

.calculate-button { min-height: 56px; color: var(--nav-on-surface); }
.dates-section { margin-top: 30px; }
.dates-section--ordinary { padding-top: 24px; border-top: 1px solid var(--nav-border); }
.dates-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
.dates-grid--ordinary { grid-template-columns: repeat(4, minmax(0, 1fr)); }

.dates-grid :deep(.v-field),
.year-input :deep(.v-field) {
  min-height: 56px;
  border-radius: 16px;
  background: rgba(var(--v-theme-on-surface), 0.025);
}

.year-card__actions {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 28px 24px !important;
  border-top: 1px solid var(--nav-border);
}

.save-hint { margin: 0; color: var(--nav-muted); font-size: 0.82rem; }
.save-year-button { min-height: 52px; padding-inline: 24px !important; background: var(--nav-on-surface) !important; color: var(--nav-surface) !important; font-weight: 720; }
.saved-years { margin-top: 46px; }
.saved-years__heading { display: flex; align-items: center; justify-content: space-between; margin: 0 6px 18px; }
.years-list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }

.saved-year-card {
  padding: 20px;
  border: 1px solid var(--nav-border);
  border-radius: 22px;
  background: var(--nav-surface);
  box-shadow: 0 3px 14px var(--nav-button-shadow);
}

.saved-year-card__top { display: flex; align-items: center; justify-content: space-between; }
.saved-year-number { font-size: 1.65rem; font-weight: 760; letter-spacing: -0.03em; }
.saved-year-dates { display: grid; gap: 9px; margin: 16px 0 0; }
.saved-year-dates div { display: flex; justify-content: space-between; gap: 12px; }
.saved-year-dates dt { color: var(--nav-muted); font-size: 0.78rem; }
.saved-year-dates dd { margin: 0; font-size: 0.82rem; font-weight: 650; }
.years-empty { display: grid; min-height: 170px; place-content: center; gap: 10px; border: 1px dashed var(--nav-border); border-radius: 24px; color: var(--nav-muted); text-align: center; }
.years-empty p { margin: 0; }
.years-skeleton { border: 1px solid var(--nav-border); border-radius: 24px; background: var(--nav-surface); }

@media (max-width: 980px) {
  .dates-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .years-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 600px) {
  .year-page { padding: 28px 12px 60px !important; }
  .year-header { align-items: flex-start; margin-inline: 6px; }
  .year-counter { min-width: 72px; min-height: 68px; }
  .year-description { font-size: 0.9rem; }
  .section-heading { padding: 20px 20px 0; }
  .year-card__content { padding: 22px 20px !important; }
  .year-select-row { grid-template-columns: 1fr; }
  .calculate-button { width: 100%; }
  .dates-grid { grid-template-columns: 1fr; }
  .year-card__actions { align-items: stretch; flex-direction: column; padding: 18px 20px 20px !important; }
  .save-year-button { width: 100%; }
  .save-hint { text-align: center; }
  .years-list { grid-template-columns: 1fr; }
}

@media (max-width: 390px) {
  .year-counter { display: none; }
  .year-title { font-size: 2.15rem; }
}
</style>

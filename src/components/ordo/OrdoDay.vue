<template>
  <div class="ordo-day">
    <div class="date-header-shell" :style="heroStyle">
      <button
        type="button"
        class="date-header"
        aria-label="Адкрыць каляндар і выбраць дату"
        @click="toggleCalendarDialog"
      >
        <span class="date-header__eyebrow">
          <PhCalendarDots :size="16" weight="bold" aria-hidden="true" />
          {{ isToday ? 'Сёння' : 'Выбраная дата' }}
        </span>
        <h2 class="date-header__weekday">{{ weekdayName }}</h2>
        <span class="date-header__date">
          {{ dateLabel }}
          <PhCaretDown class="date-header__caret" :size="18" weight="bold" aria-hidden="true" />
        </span>
      </button>
    </div>

    <ul class="ordo-facts" aria-label="Літургічны дзень">
      <li>{{ periodText }}</li>
      <li v-if="psalterText">{{ psalterText }}</li>
      <li v-if="cycleText">{{ cycleText }}</li>
      <li class="ordo-facts__color" data-test="vestment-color">
        <span class="color-dot" :class="{ 'color-dot--marian': dayVisual?.secondary === 'marian' }" :style="{ '--dot': dayColor.swatch }" aria-hidden="true"></span>
        Колер літургічнага адзення: {{ dayColorText }}
      </li>
    </ul>

    <div v-if="dioceses.length > 1" class="context-switch" role="radiogroup" aria-label="Дыяцэзія для падрабязнасцяў дня">
      <button
        v-for="id in dioceses"
        :key="id"
        type="button"
        role="radio"
        :aria-checked="id === contextDiocese"
        :class="{ 'context-switch__item--active': id === contextDiocese }"
        class="context-switch__item"
        @click="chosenDiocese = id"
      >{{ DIOCESE_SHORT_LABELS[id] }}</button>
    </div>

    <section class="ordo-section" aria-labelledby="ordo-celebration-title">
      <div class="section-heading">
        <span class="section-icon"><PhStar :size="21" /></span>
        <div><h2 id="ordo-celebration-title">Святкаванні дня</h2><p>Паводле табліцы першынства</p></div>
      </div>

      <template v-if="union.differs">
        <p class="union-hint">Выбраныя дыяцэзіі адзначаюць гэты дзень па-рознаму.</p>
        <div
          v-for="row in union.rows"
          :key="row.key"
          class="celebration"
          :class="{ 'celebration--primary': row.role === 'primary' }"
          :style="optionStyle(row)"
        >
          <span class="color-dot" :class="{ 'color-dot--large': row.role === 'primary' }" :style="{ '--dot': colorInfo(row.color).swatch }" aria-hidden="true"></span>
          <div class="celebration__copy">
            <strong>{{ row.title }}</strong>
            <span class="celebration__meta">{{ [row.rank, ROLE_LABELS[row.role], colorNote(row)].filter(Boolean).join(' · ') }}</span>
            <span v-if="row.badges.length" class="badges">
              <span v-for="badge in row.badges" :key="badge" class="badge badge--diocese">{{ badge }}</span>
            </span>
            <CelebrationActions v-if="row.role !== 'commemoration'" :hours="hoursLink(row.id, row.dioceses)" :readings="readingsLink(row.id, row.dioceses)" :title="row.title" />
          </div>
        </div>
      </template>
      <template v-else>
      <div class="celebration celebration--primary" :style="optionStyle(day.primary)">
        <span class="color-dot color-dot--large" :style="{ '--dot': colorInfo(day.primary.color || day.color).swatch }" aria-hidden="true"></span>
        <div class="celebration__copy">
          <strong>{{ day.primary.title }}</strong>
          <span class="celebration__meta">{{ primaryMeta }}</span>
          <span v-if="optionBadges(day.primary).length" class="badges">
            <span v-for="badge in optionBadges(day.primary)" :key="badge" class="badge">{{ badge }}</span>
          </span>
          <CelebrationActions :hours="hoursLink(day.primary.id)" :readings="readingsLink(day.primary.id)" :title="day.primary.title" />
        </div>
      </div>

      <div v-if="day.alternatives.length" class="ordo-block">
        <span class="control-label">Можна выбраць замест</span>
        <div v-for="item in day.alternatives" :key="item.id" class="celebration">
          <span class="color-dot" :style="{ '--dot': colorInfo(item.color).swatch }" aria-hidden="true"></span>
          <div class="celebration__copy">
            <strong>{{ item.title }}</strong>
            <span class="celebration__meta">{{ [rankLabel(item), colorNote(item)].filter(Boolean).join(' · ') }}</span>
            <span v-if="optionBadges(item).length" class="badges">
              <span v-for="badge in optionBadges(item)" :key="badge" class="badge">{{ badge }}</span>
            </span>
            <CelebrationActions :hours="hoursLink(item.id)" :readings="readingsLink(item.id)" :title="item.title" />
          </div>
        </div>
      </div>

      <div v-if="day.commemorations.length" class="ordo-block">
        <span class="control-label">Успамін (commemoratio)</span>
        <div v-for="item in day.commemorations" :key="item.id" class="celebration">
          <span class="color-dot" :style="{ '--dot': colorInfo(item.color).swatch }" aria-hidden="true"></span>
          <div class="celebration__copy">
            <strong>{{ item.title }}</strong>
            <span class="celebration__meta">Антыфона і малітва ў Ютрані і Нешпарах; калекта ў Імшы</span>
          </div>
        </div>
      </div>
      </template>

      <details v-if="day.suppressed.length" class="ordo-details">
        <summary>Не адзначаецца ({{ day.suppressed.length }})</summary>
        <ul>
          <li v-for="item in day.suppressed" :key="`${item.id}-${item.reason}`">
            <strong>{{ item.title }}</strong>
            <span>{{ suppressionReason(item) }}</span>
          </li>
        </ul>
      </details>
    </section>

    <section class="ordo-section" aria-labelledby="ordo-mass-title">
      <div class="section-heading">
        <span class="section-icon"><PhBookOpenText :size="21" /></span>
        <div><h2 id="ordo-mass-title">Імша і чытанні</h2><p>{{ [mass.cycle || 'Лекцыянарый', contextLabel].filter(Boolean).join(' · ') }}</p></div>
      </div>
      <div v-if="referencesState === 'loading'" class="ordo-empty" role="status">
        <v-progress-circular indeterminate size="18" width="2" color="primary" /> Загрузка спасылак…
      </div>
      <div v-for="block in readingBlocks" :key="block.optionId" class="readings-block" data-test="readings-block">
        <p v-if="readingBlocks.length > 1" class="readings-block__title">
          <span class="color-dot" :style="{ '--dot': colorInfo(block.color).swatch }" aria-hidden="true"></span>
          <span>{{ block.title }}</span>
        </p>
        <template v-for="group in block.groups" :key="group.key">
          <p class="readings-block__label">{{ group.label }}</p>
          <dl class="reading-rows">
            <div v-for="row in group.rows" :key="`${group.key}-${row.key}`" class="reading-row">
              <dt>{{ row.label }}</dt>
              <dd>{{ row.citation }}</dd>
            </div>
          </dl>
        </template>
        <p v-if="block.hint" class="ordo-readings-hint">{{ block.hint }}</p>
        <router-link :to="readingsLink(block.optionId)" class="reading-open">
          <span>Адкрыць чытанні</span>
          <PhCaretRight :size="16" weight="bold" aria-hidden="true" />
        </router-link>
      </div>
      <ul v-if="mass.lines.length" class="ordo-lines">
        <li v-for="line in mass.lines" :key="line">{{ line }}</li>
      </ul>
      <OrdoNoteList v-if="notesBySection.mass.length" :groups="notesBySection.mass" plain />
    </section>

    <section class="ordo-section" aria-labelledby="ordo-office-title">
      <div class="section-heading">
        <span class="section-icon"><PhCross :size="21" weight="light" /></span>
        <div><h2 id="ordo-office-title">Літургія гадзін</h2><p>{{ [officeSubtitle, contextLabel].filter(Boolean).join(' · ') }}</p></div>
      </div>
      <ul class="ordo-lines">
        <li>{{ officeLine }}</li>
        <li v-if="day.alternatives.length">Можна маліцца таксама з {{ day.alternatives.length === 1 ? 'альтэрнатывы' : 'альтэрнатыў' }} вышэй</li>
        <li v-for="item in day.commemorations" :key="item.id">Успамін: {{ item.title }}</li>
      </ul>
      <OrdoNoteList v-if="notesBySection.office.length" :groups="notesBySection.office" plain />
      <div class="ordo-links">
        <v-btn :to="hoursRoute" class="ordo-link-btn text-none" variant="tonal" color="primary" rounded="lg">
          Літургія гадзін гэтага дня
          <template #append><PhCaretRight :size="16" weight="bold" /></template>
        </v-btn>
      </div>
    </section>

    <section class="ordo-section" aria-labelledby="ordo-directions-title">
      <div class="section-heading">
        <span class="section-icon"><PhListChecks :size="21" /></span>
        <div><h2 id="ordo-directions-title">Асаблівыя ўказанні</h2><p>Нешпары, Te Deum, Камплета</p></div>
      </div>
      <dl class="directions">
        <div v-for="item in directions" :key="item.id" class="direction" :class="`direction--${item.tone}`">
          <dt>{{ item.label }}</dt>
          <dd>{{ item.value }}</dd>
        </div>
      </dl>
      <OrdoNoteList v-if="notesBySection.directions.length" :groups="notesBySection.directions" plain />
    </section>

    <section class="ordo-section" aria-labelledby="ordo-notes-title">
      <div class="section-heading">
        <span class="section-icon"><PhHandsPraying :size="21" /></span>
        <div><h2 id="ordo-notes-title">Заўвагі Ordo</h2><p>Набажэнствы, благаслаўленні, працэсіі, адпусты</p></div>
      </div>
      <div v-if="notesState === 'loading'" class="ordo-empty" role="status">
        <v-progress-circular indeterminate size="18" width="2" color="primary" /> Загрузка заўваг…
      </div>
      <p v-else-if="notesState === 'error'" class="ordo-empty">
        Заўвагі не загрузіліся (патрэбны інтэрнэт пры першым адкрыцці).
        <button type="button" class="text-button" @click="loadNotes">Паўтарыць</button>
      </p>
      <template v-else>
        <OrdoNoteList v-if="notesBySection.notes.length" :groups="notesBySection.notes" />
        <p v-else class="ordo-empty">На гэты дзень асаблівых заўваг няма.</p>
        <details v-if="groupedNotes.periodNotes.length" class="ordo-details">
          <summary>Агульныя ўказанні перыяду ({{ groupedNotes.periodNotes.length }})</summary>
          <OrdoNoteList :groups="[{ id: 'period', notes: groupedNotes.periodNotes }]" plain />
        </details>
      </template>
    </section>

    <router-link :to="monthRoute" class="month-link">
      <PhCalendarBlank :size="18" aria-hidden="true" /> {{ monthTitle }}: увесь месяц
    </router-link>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, shallowRef } from 'vue';
import { useRoute } from 'vue-router';
import {
  PhBookOpenText, PhCalendarBlank, PhCalendarDots, PhCaretDown, PhCaretRight,
  PhCross, PhHandsPraying, PhListChecks, PhStar,
} from '@phosphor-icons/vue';
import moment from '@/utils/moment-be';
import { useAppBar } from '@/composables/useAppBar';
import { LITURGICAL_THEME_MAP } from '@/constants/liturgical';
import { ordoDiocese } from '@/utils/ordoDiocese';
import { ordoDioceseFilter } from '@/utils/ordoMonthFilter';
import { ordoCalendarEpoch } from '@/utils/ordoCalendarState';
import { loadOrdoNotes } from '@/utils/ordoNotesLoader';
import { loadPublishedOrdoNotes } from '@/services/ordoCalendarService';
import {
  DIOCESE_SHORT_LABELS, buildDayUnion, colorInfo, groupOrdoNotes, massSummary, officeDirections, officeKindLabel,
  optionBadges, ordoMonthRoute, parseOrdoRouteDate, periodLabel, psalterLabel, rankLabel,
  readingCycleLabel, resolveOrdoDay, suppressionReason,
} from '@/utils/ordoScreen';
import { logger } from '@/utils/logger';
import OrdoNoteList from '@/components/ordo/OrdoNoteList.vue';
import CelebrationActions from '@/components/ordo/CelebrationActions.vue';
import { liturgicalVisual } from '@/utils/liturgicalVisual';
import { resolveRuntimeDay } from '@/utils/ordo/runtime';
import { loadReadingReferenceIndex, readingReferencesForDay } from '@/utils/ordo/readingReferences';

const route = useRoute();
const { toggleCalendarDialog } = useAppBar();

const todayIso = () => moment().format('YYYY-MM-DD');
const iso = computed(() => parseOrdoRouteDate(route.params.date, todayIso()));
const isToday = computed(() => iso.value === todayIso());
// Several dioceses may be shown together (display filter). The details of
// the day (Office, Mass, notes) are of ONE diocese: the user's own when it is
// selected, else the first of the filter; the chips switch it.
const dioceses = computed(() => ordoDioceseFilter.value);
const chosenDiocese = ref('');
const contextDiocese = computed(() => {
  if (dioceses.value.includes(chosenDiocese.value)) return chosenDiocese.value;
  return dioceses.value.includes(ordoDiocese.value) ? ordoDiocese.value : dioceses.value[0];
});
const engineOptions = computed(() => ({ diocese: contextDiocese.value, epoch: ordoCalendarEpoch.value }));
const union = computed(() => (ordoCalendarEpoch.value, buildDayUnion(iso.value, dioceses.value)));
const contextLabel = computed(() => (dioceses.value.length > 1 ? DIOCESE_SHORT_LABELS[contextDiocese.value] : ''));
const ROLE_LABELS = { primary: '', alternative: 'на выбар', commemoration: 'успамін (commemoratio)' };

// Notes are a separate lazy chunk (~1.3 MB JSON); the day renders without
// them and gains them when the chunk arrives.
const notes = shallowRef(null);
const notesState = ref('loading');
async function loadNotes() {
  notesState.value = 'loading';
  try {
    notes.value = await loadOrdoNotes(loadPublishedOrdoNotes);
    notesState.value = 'ready';
  } catch (error) {
    logger.warn('[Ordo] notes unavailable:', error?.message || error);
    notesState.value = 'error';
  }
}
onMounted(loadNotes);

const day = computed(() => resolveOrdoDay(iso.value, { ...engineOptions.value, notes: notes.value }));
const groupedNotes = computed(() => groupOrdoNotes(day.value.ordoNotes, { date: iso.value, diocese: contextDiocese.value }));
const notesBySection = computed(() => {
  const sections = { mass: [], office: [], directions: [], notes: [] };
  groupedNotes.value.groups.forEach((group) => sections[group.section].push(group));
  return sections;
});

const mDate = computed(() => moment(iso.value, 'YYYY-MM-DD'));
const weekdayName = computed(() => mDate.value.format('dddd'));
const dateLabel = computed(() => mDate.value.format('D MMMM YYYY'));
const periodText = computed(() => periodLabel(day.value));
const psalterText = computed(() => psalterLabel(day.value));
const cycleText = computed(() => readingCycleLabel(day.value));
const dayColor = computed(() => colorInfo(day.value.color));
const dayColorText = computed(() => [dayColor.value.label, ...day.value.colorAlternatives.map((color) => colorInfo(color).label.toLowerCase())]
  .join(' або '));

const themeOf = (color) => colorInfo(color).theme || LITURGICAL_THEME_MAP.default;
const heroStyle = computed(() => {
  const theme = themeOf(day.value.color);
  return { '--liturgical-color': theme.color, '--liturgical-rgb': theme.rgb };
});
const optionStyle = (option) => {
  const theme = themeOf(option.color || day.value.color);
  return { '--option-color': theme.color, '--option-rgb': theme.rgb };
};

const primaryMeta = computed(() => {
  const primary = day.value.primary;
  const rank = rankLabel(primary);
  const kind = officeKindLabel(primary.officeKind);
  return [rank, kind && kind !== rank ? kind.toLowerCase() : ''].filter(Boolean).join(' · ');
});

const mass = computed(() => massSummary(day.value));
const directions = computed(() => officeDirections(day.value));
const officeSubtitle = computed(() => (day.value.psalterWeek ? psalterLabel(day.value) : 'Афіцый дня'));
const officeLine = computed(() => {
  const primary = day.value.primary;
  const kind = officeKindLabel(primary.officeKind);
  return primary.kind === 'temporal' ? `Афіцый дня: ${primary.title}` : `Афіцый: ${primary.title}${kind ? ` (${kind.toLowerCase()})` : ''}`;
});

// Links open the chosen variant in its diocesan context; the stored
// diocese of Settings is never changed from here.
const contextQuery = computed(() => (contextDiocese.value !== ordoDiocese.value ? { diocese: contextDiocese.value } : {}));
const hoursRoute = computed(() => (isToday.value && !contextQuery.value.diocese
  ? { name: 'Today' }
  : { name: 'SelectedDay', params: { day: iso.value }, query: contextQuery.value }));
// Each legal celebration opens ITS Hours / Readings (same option id, the
// diocese it belongs to); the Settings diocese is never changed from here.
const contextFor = (rowDioceses) => {
  const diocese = !rowDioceses?.length || rowDioceses.includes(contextDiocese.value) ? contextDiocese.value : rowDioceses[0];
  return diocese !== ordoDiocese.value ? { diocese } : {};
};
const hoursLink = (optionId, rowDioceses) => ({
  name: 'SelectedDay', params: { day: iso.value }, query: { ...contextFor(rowDioceses), option: optionId },
});
const readingsLink = (optionId, rowDioceses) => ({
  name: 'ReadingsByDate', params: { date: iso.value }, query: { ...contextFor(rowDioceses), option: optionId },
});

const dayVisual = computed(() => liturgicalVisual(day.value.primary.color ? day.value.primary : { ...day.value.primary, color: day.value.color }));
/** A variant whose vestment colour differs from the day's says so. */
const colorNote = (item) => {
  const color = item.color || day.value.color;
  return color && color !== (day.value.primary.color || day.value.color) ? `колер: ${colorInfo(color).label.toLowerCase()}` : '';
};

// Biblical citations of every legal option: the same plan and selection as
// the Readings screen, on the generated reference index (lazy chunk).
const referenceIndex = shallowRef(null);
const referencesState = ref('loading');
onMounted(async () => {
  try {
    referenceIndex.value = await loadReadingReferenceIndex();
    referencesState.value = 'ready';
  } catch (error) {
    logger.warn('[Ordo] reading references unavailable:', error?.message || error);
    referencesState.value = 'error';
  }
});
const READING_GROUP_LABELS = Object.freeze({
  weekday: 'Чытанні дня',
  proper: 'Уласныя чытанні',
});
const readingBlocks = computed(() => {
  if (!referenceIndex.value) return [];
  const resolved = resolveRuntimeDay(iso.value, { diocese: contextDiocese.value, epoch: ordoCalendarEpoch.value });
  const options = [resolved.primary, ...resolved.alternatives];
  return readingReferencesForDay(resolved, referenceIndex.value).map((entry) => {
    const option = options.find((item) => item.id === entry.optionId);
    const groups = [];
    const docGroups = (docs, label, key) => docs.forEach((doc, index) => {
      if (!doc.rows.length) return;
      groups.push({
        key: `${key}-${doc.id}`,
        label: docs.length > 1 && doc.title ? `${index === 0 ? label : 'Або'}: ${doc.title}` : (index === 0 ? label : 'Або'),
        rows: doc.rows,
      });
    });
    docGroups(entry.documents, READING_GROUP_LABELS[entry.status] || 'Чытанні', 'main');
    docGroups(entry.alternatives, 'Або ўласныя', 'own');
    if (entry.status === 'reference-only') {
      groups.push({ key: 'reference', label: 'Паводле календара', rows: [{ key: 'reference', label: 'Чытанні', citation: entry.reference }] });
    }
    let hint = '';
    if (entry.status === 'reference-only') hint = 'Тэкст гэтых чытанняў пакуль недаступны ў праграме.';
    else if (entry.status === 'missing') hint = 'Тэкст чытанняў гэтага празднавання пакуль недаступны.';
    return { optionId: entry.optionId, title: entry.title, color: option?.color || resolved.color, groups, hint };
  });
});

const monthRoute = computed(() => ordoMonthRoute({ year: Number(iso.value.slice(0, 4)), month: Number(iso.value.slice(5, 7)) }, todayIso()));
const monthTitle = computed(() => {
  const title = mDate.value.format('MMMM YYYY');
  return title.charAt(0).toUpperCase() + title.slice(1);
});
</script>

<style scoped>
.context-switch { display: flex; flex-wrap: wrap; gap: 6px; margin: -6px 12px 18px; }
.context-switch__item { min-height: 32px; padding: 5px 12px; border: 1px solid var(--nav-border); border-radius: 999px; background: var(--nav-surface); color: var(--nav-muted); font: inherit; font-size: .76rem; font-weight: 700; cursor: pointer; }
.context-switch__item--active { border-color: rgba(var(--chrome-accent-rgb), .4); background: rgba(var(--chrome-accent-rgb), .12); color: var(--chrome-accent); }
.union-hint { margin: 0 20px 10px; color: var(--nav-muted); font-size: .8rem; line-height: 1.4; }
.badge--diocese { background: rgba(var(--chrome-accent-rgb), .12); }
.ordo-links { display: flex; flex-wrap: wrap; gap: 8px; margin: 6px 20px 20px; }
.ordo-links .ordo-link-btn { margin: 0; max-width: 100%; }
.ordo-readings-hint { margin: 0 20px 8px; color: var(--nav-muted); font-size: .82rem; line-height: 1.45; }
/* Readings: compact full-width rows that wrap; nothing leaves the card. */
.readings-block { min-width: 0; margin: 0 20px 14px; padding: 12px 14px; border: 1px solid var(--nav-border); border-radius: 18px; }
.readings-block__title { display: flex; align-items: flex-start; gap: 8px; min-width: 0; margin: 0 0 6px; color: var(--nav-on-surface); font-size: .9rem; font-weight: 720; line-height: 1.35; overflow-wrap: anywhere; }
.readings-block__title .color-dot { margin-top: 4px; }
.readings-block__label { margin: 8px 0 2px; color: var(--nav-muted); font-size: .7rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; overflow-wrap: anywhere; }
.reading-rows { margin: 0; min-width: 0; }
.reading-row { display: grid; grid-template-columns: minmax(0, 9.5em) minmax(0, 1fr); gap: 4px 12px; padding: 6px 0; border-top: 1px solid var(--nav-border); }
.reading-row:first-child { border-top: 0; }
.reading-row dt { min-width: 0; color: var(--nav-muted); font-size: .78rem; font-weight: 700; line-height: 1.4; }
.reading-row dd { min-width: 0; margin: 0; color: var(--nav-on-surface); font-size: .86rem; line-height: 1.4; overflow-wrap: anywhere; white-space: normal; }
.reading-open { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 40px; margin-top: 8px; padding: 8px 12px; border-radius: 12px; background: rgba(var(--chrome-accent-rgb), .08); color: var(--chrome-accent); font-size: .84rem; font-weight: 720; text-decoration: none; }
.reading-open span { min-width: 0; overflow-wrap: anywhere; }
.reading-open:focus-visible { outline: 3px solid rgba(var(--chrome-accent-rgb), .3); outline-offset: 2px; }
.color-dot--marian { box-shadow: 0 0 0 2px rgba(94, 158, 197, .55); }
.month-link { display: flex; align-items: center; justify-content: center; gap: 8px; margin: 4px 12px 18px; padding: 12px; border: 1px solid var(--nav-border); border-radius: 18px; background: var(--nav-surface); color: var(--chrome-accent); font-size: .86rem; font-weight: 720; text-decoration: none; }

.date-header-shell { position: relative; width: calc(100% - 24px); margin: 0 12px 14px; }
.date-header {
  --liturgical-visible-color: var(--liturgical-color);
  --liturgical-visible-color: color-mix(in srgb, var(--liturgical-color) var(--period-accent-weight), var(--period-accent-target));
  display: flex; width: 100%; min-height: 158px; flex-direction: column; align-items: flex-start; justify-content: flex-end;
  margin: 0; padding: 22px 24px; overflow: hidden; border: 1px solid var(--nav-border); border-radius: 28px;
  background:
    radial-gradient(circle at 92% 14%, rgba(var(--liturgical-rgb), .28) 0, rgba(var(--liturgical-rgb), .28) 42px, transparent 43px),
    linear-gradient(145deg, rgba(var(--liturgical-rgb), .13), rgba(var(--liturgical-rgb), .035) 66%),
    var(--nav-surface);
  color: var(--nav-on-surface); box-shadow: var(--hero-shadow); cursor: pointer; font: inherit; text-align: left;
  -webkit-tap-highlight-color: transparent; transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease;
}
.date-header:hover { border-color: rgba(var(--liturgical-rgb), .34); box-shadow: 0 10px 32px var(--nav-shadow); }
.date-header:active { transform: scale(.985); }
.date-header:focus-visible { outline: 3px solid rgba(var(--liturgical-rgb), .28); outline-offset: 3px; }
.date-header__eyebrow { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 10px; color: var(--liturgical-visible-color); font-size: .72rem; font-weight: 800; line-height: 1; letter-spacing: .1em; text-transform: uppercase; }
.date-header__weekday { max-width: 100%; margin: 0; font-size: clamp(2.15rem, 9vw, 3.25rem); font-family: var(--reader-display-font-family); font-weight: 700; line-height: .98; letter-spacing: -.045em; overflow-wrap: anywhere; }
.date-header__date { display: inline-flex; align-items: center; gap: 4px; margin-top: 10px; color: var(--nav-muted); font-size: clamp(1.08rem, 4.6vw, 1.28rem); font-weight: 600; line-height: 1.2; }
.date-header__caret { color: var(--liturgical-visible-color); }

.ordo-facts { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 12px 18px; padding: 0; list-style: none; }
.ordo-facts li { display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 5px 11px; border: 1px solid var(--nav-border); border-radius: 999px; background: var(--nav-surface); color: var(--nav-muted); font-size: .76rem; font-weight: 650; line-height: 1.2; }
.ordo-facts__link { color: var(--chrome-accent); text-decoration: none; }

.color-dot { display: inline-block; flex: 0 0 12px; width: 12px; height: 12px; border: 1px solid rgba(0, 0, 0, .18); border-radius: 50%; background: var(--dot); }
.color-dot--large { flex-basis: 16px; width: 16px; height: 16px; margin-top: 4px; }
:global(.v-theme--dark) .color-dot { border-color: rgba(255, 255, 255, .28); }

.ordo-section { margin: 0 12px 14px; overflow: hidden; border: 1px solid var(--nav-border); border-radius: 24px; background: var(--nav-surface); box-shadow: 0 5px 20px var(--nav-button-shadow); }
.section-heading { display: flex; align-items: center; gap: 12px; padding: 18px 20px 12px; }
.section-heading > div:not(.month-nav) { min-width: 0; flex: 1; }
.section-icon { display: grid; flex: 0 0 42px; width: 42px; height: 42px; place-items: center; border: 1px solid rgba(var(--chrome-accent-rgb), .16); border-radius: 14px; background: rgba(var(--chrome-accent-rgb), .09); color: var(--chrome-accent); }
.section-heading h2 { margin: 0; color: var(--nav-on-surface); font-size: 1rem; font-weight: 780; letter-spacing: -.01em; }
.section-heading p { margin: 2px 0 0; color: var(--nav-muted); font-size: .78rem; line-height: 1.35; }
.control-label { display: block; margin: 4px 0 8px; color: var(--nav-muted); font-size: .7rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }

.celebration { display: flex; align-items: flex-start; gap: 12px; margin: 0 20px 8px; padding: 12px 14px; border: 1px solid var(--nav-border); border-radius: 18px; }
.celebration .color-dot { margin-top: 4px; }
.celebration--primary { margin-bottom: 14px; padding: 14px 16px; border-color: rgba(var(--option-rgb), .28); background: linear-gradient(120deg, rgba(var(--option-rgb), .12), rgba(var(--option-rgb), .02) 72%); }
.celebration__copy { display: grid; min-width: 0; gap: 3px; }
.celebration__copy strong { color: var(--nav-on-surface); font-size: .98rem; font-weight: 700; line-height: 1.35; overflow-wrap: anywhere; }
.celebration--primary .celebration__copy strong { font-size: 1.08rem; }
.celebration__meta { color: var(--nav-muted); font-size: .8rem; line-height: 1.35; }
.badges { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 4px; }
.badge { padding: 3px 8px; border-radius: 99px; background: var(--nav-active); color: var(--chrome-accent); font-size: .66rem; font-weight: 750; }
.ordo-block { padding: 2px 0 6px; }
.ordo-block .control-label { margin-inline: 20px; }

.ordo-details { margin: 4px 20px 16px; border-top: 1px solid var(--nav-border); }
.ordo-details summary { padding: 12px 0 4px; color: var(--nav-muted); font-size: .8rem; font-weight: 720; cursor: pointer; }
.ordo-details ul { margin: 6px 0 0; padding: 0; list-style: none; }
.ordo-details li { display: grid; gap: 2px; padding: 8px 0; border-bottom: 1px solid var(--nav-border); }
.ordo-details li:last-child { border-bottom: 0; }
.ordo-details li strong { color: var(--nav-on-surface); font-size: .86rem; font-weight: 650; }
.ordo-details li span { color: var(--nav-muted); font-size: .76rem; }
.ordo-details :deep(.note-list) { margin-inline: 0; }

.ordo-lines { margin: 0 20px 10px; padding: 0; list-style: none; }
.ordo-lines li { padding: 7px 0; border-top: 1px solid var(--nav-border); color: var(--nav-on-surface); font-size: .88rem; line-height: 1.45; }
.ordo-link-btn { margin: 6px 20px 20px; max-width: calc(100% - 40px); }

.directions { margin: 0 20px 12px; }
.direction { display: grid; grid-template-columns: 104px minmax(0, 1fr); gap: 12px; padding: 9px 0; border-top: 1px solid var(--nav-border); }
.direction dt { color: var(--nav-muted); font-size: .76rem; font-weight: 750; letter-spacing: .02em; }
.direction dd { margin: 0; color: var(--nav-on-surface); font-size: .86rem; line-height: 1.4; }
.direction--accent dd { color: var(--chrome-accent); font-weight: 650; }
.direction--muted dd { color: var(--nav-muted); }

.ordo-empty { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 0 20px 18px; color: var(--nav-muted); font-size: .84rem; line-height: 1.45; }
.text-button { border: 0; background: transparent; color: var(--chrome-accent); font: inherit; font-weight: 720; cursor: pointer; }

@media (max-width: 600px) {
  .date-header { min-height: 150px; padding: 20px; }
  .section-heading { padding-inline: 16px; }
  .celebration { margin-inline: 16px; }
  .ordo-block .control-label, .ordo-details, .ordo-lines, .directions, .ordo-empty { margin-inline: 16px; }
  .ordo-links, .ordo-readings-hint, .union-hint, .readings-block { margin-inline: 16px; }
  .direction { grid-template-columns: 88px minmax(0, 1fr); }
}
@media (max-width: 380px) {
  .reading-row { grid-template-columns: minmax(0, 1fr); gap: 0; }
}
@media (max-width: 359px) {
  .date-header-shell { width: calc(100% - 16px); margin-inline: 8px; }
  .ordo-facts, .ordo-section, .context-switch, .month-link { margin-inline: 8px; }
  .date-header { min-height: 140px; padding: 18px; border-radius: 24px; }
}
</style>

<template>
  <v-container class="ordo-page">
    <h1 class="section-page-title">Літургічны каляндар</h1>

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
      <li class="ordo-facts__color">
        <span class="color-dot" :style="{ '--dot': dayColor.swatch }" aria-hidden="true"></span>
        {{ dayColorText }}
      </li>
      <li>
        <router-link :to="{ name: 'Settings' }" class="ordo-facts__link">{{ dioceseLabel }}</router-link>
      </li>
    </ul>

    <section class="ordo-section" aria-labelledby="ordo-celebration-title">
      <div class="section-heading">
        <span class="section-icon"><PhStar :size="21" /></span>
        <div><h2 id="ordo-celebration-title">Празднаванне дня</h2><p>Паводле табліцы першынства</p></div>
      </div>

      <div class="celebration celebration--primary" :style="optionStyle(day.primary)">
        <span class="color-dot color-dot--large" :style="{ '--dot': colorInfo(day.primary.color || day.color).swatch }" aria-hidden="true"></span>
        <div class="celebration__copy">
          <strong>{{ day.primary.title }}</strong>
          <span class="celebration__meta">{{ primaryMeta }}</span>
          <span v-if="optionBadges(day.primary).length" class="badges">
            <span v-for="badge in optionBadges(day.primary)" :key="badge" class="badge">{{ badge }}</span>
          </span>
        </div>
      </div>

      <div v-if="day.alternatives.length" class="ordo-block">
        <span class="control-label">Можна выбраць замест</span>
        <div v-for="item in day.alternatives" :key="item.id" class="celebration">
          <span class="color-dot" :style="{ '--dot': colorInfo(item.color).swatch }" aria-hidden="true"></span>
          <div class="celebration__copy">
            <strong>{{ item.title }}</strong>
            <span class="celebration__meta">{{ rankLabel(item) }}</span>
            <span v-if="optionBadges(item).length" class="badges">
              <span v-for="badge in optionBadges(item)" :key="badge" class="badge">{{ badge }}</span>
            </span>
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
        <div><h2 id="ordo-mass-title">Імша і чытанні</h2><p>{{ mass.cycle || 'Лекцыянарый' }}</p></div>
      </div>
      <ul class="ordo-lines">
        <li v-for="line in mass.lines" :key="line">{{ line }}</li>
      </ul>
      <OrdoNoteList v-if="notesBySection.mass.length" :groups="notesBySection.mass" plain />
      <v-btn :to="readingsRoute" class="ordo-link-btn text-none" variant="tonal" color="primary" rounded="lg">
        Чытанні гэтага дня
        <template #append><PhCaretRight :size="16" weight="bold" /></template>
      </v-btn>
    </section>

    <section class="ordo-section" aria-labelledby="ordo-office-title">
      <div class="section-heading">
        <span class="section-icon"><PhCross :size="21" weight="light" /></span>
        <div><h2 id="ordo-office-title">Літургія гадзін</h2><p>{{ officeSubtitle }}</p></div>
      </div>
      <ul class="ordo-lines">
        <li>{{ officeLine }}</li>
        <li v-if="day.alternatives.length">Можна маліцца таксама з {{ day.alternatives.length === 1 ? 'альтэрнатывы' : 'альтэрнатыў' }} вышэй</li>
        <li v-for="item in day.commemorations" :key="item.id">Успамін: {{ item.title }}</li>
      </ul>
      <OrdoNoteList v-if="notesBySection.office.length" :groups="notesBySection.office" plain />
      <v-btn :to="hoursRoute" class="ordo-link-btn text-none" variant="tonal" color="primary" rounded="lg">
        Літургія гадзін гэтага дня
        <template #append><PhCaretRight :size="16" weight="bold" /></template>
      </v-btn>
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

    <section id="ordo-month" class="ordo-section" aria-labelledby="ordo-month-title">
      <div class="section-heading section-heading--month">
        <span class="section-icon"><PhCalendarBlank :size="21" /></span>
        <div><h2 id="ordo-month-title">{{ monthTitle }}</h2><p>Галоўнае празднаванне і колер</p></div>
        <div class="month-nav">
          <button type="button" aria-label="Папярэдні месяц" @click="shiftMonth(-1)"><PhCaretLeft :size="18" weight="bold" /></button>
          <button type="button" aria-label="Наступны месяц" @click="shiftMonth(1)"><PhCaretRight :size="18" weight="bold" /></button>
        </div>
      </div>
      <ol class="month-list">
        <li v-for="item in monthDays" :key="item.date">
          <router-link
            :to="routeFor(item.date)"
            class="month-day"
            :class="{
              'month-day--selected': item.date === iso,
              'month-day--sunday': item.isSunday,
              'month-day--celebration': item.isCelebration,
            }"
            :aria-current="item.date === iso ? 'date' : undefined"
          >
            <span class="month-day__date"><strong>{{ item.dayOfMonth }}</strong><small>{{ item.weekday }}</small></span>
            <span class="color-dot" :style="{ '--dot': colorInfo(item.color).swatch }" :title="item.colorLabel" aria-hidden="true"></span>
            <span class="month-day__copy">
              <span class="month-day__title">{{ item.title }}</span>
              <small v-if="item.isCelebration || item.alternatives">
                {{ [item.isCelebration ? item.rank : '', item.alternatives ? `+${item.alternatives} на выбар` : ''].filter(Boolean).join(' · ') }}
              </small>
            </span>
          </router-link>
        </li>
      </ol>
    </section>
  </v-container>
</template>

<script setup>
import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  PhBookOpenText, PhCalendarBlank, PhCalendarDots, PhCaretDown, PhCaretLeft, PhCaretRight,
  PhCross, PhHandsPraying, PhListChecks, PhStar,
} from '@phosphor-icons/vue';
import moment from '@/utils/moment-be';
import { useAppBar } from '@/composables/useAppBar';
import { LITURGICAL_THEME_MAP, PLACE_LABEL_MAP } from '@/constants/liturgical';
import { ordoDiocese } from '@/utils/ordoDiocese';
import { loadOrdoNotes } from '@/utils/ordoNotesLoader';
import { loadPublishedOrdoNotes } from '@/services/ordoCalendarService';
import {
  buildMonthOverview, colorInfo, groupOrdoNotes, massSummary, officeDirections, officeKindLabel,
  optionBadges, ordoRouteFor, parseOrdoRouteDate, periodLabel, psalterLabel, rankLabel,
  readingCycleLabel, resolveOrdoDay, suppressionReason,
} from '@/utils/ordoScreen';
import { logger } from '@/utils/logger';
import OrdoNoteList from '@/components/ordo/OrdoNoteList.vue';

const route = useRoute();
const { toggleCalendarDialog } = useAppBar();

const todayIso = () => moment().format('YYYY-MM-DD');
const iso = computed(() => parseOrdoRouteDate(route.params.date, todayIso()));
const isToday = computed(() => iso.value === todayIso());
const engineOptions = computed(() => ({ diocese: ordoDiocese.value }));

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
const groupedNotes = computed(() => groupOrdoNotes(day.value.ordoNotes, { date: iso.value, diocese: ordoDiocese.value }));
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
const dioceseLabel = computed(() => PLACE_LABEL_MAP[ordoDiocese.value] || ordoDiocese.value);

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

const hoursRoute = computed(() => (isToday.value ? { name: 'Today' } : { name: 'SelectedDay', params: { day: iso.value } }));
const readingsRoute = computed(() => (isToday.value ? { name: 'Readings' } : { name: 'ReadingsByDate', params: { date: iso.value } }));
const routeFor = (date) => ordoRouteFor(date, todayIso());

// Month overview follows the selected date; the arrows page independently.
const monthCursor = ref({ year: 0, month: 0 });
watch(iso, (value) => {
  const [year, month] = value.split('-').map(Number);
  monthCursor.value = { year, month };
}, { immediate: true });
function shiftMonth(delta) {
  const index = monthCursor.value.year * 12 + (monthCursor.value.month - 1) + delta;
  monthCursor.value = { year: Math.floor(index / 12), month: (index % 12) + 1 };
}
const monthDays = computed(() => buildMonthOverview(monthCursor.value.year, monthCursor.value.month, engineOptions.value));
const monthTitle = computed(() => {
  const title = moment({ year: monthCursor.value.year, month: monthCursor.value.month - 1, day: 1 }).format('MMMM YYYY');
  return title.charAt(0).toUpperCase() + title.slice(1);
});
</script>

<style scoped>
.ordo-page { width: min(100%, 760px); max-width: 760px; padding-top: 12px; }
.section-page-title { margin: 8px 12px 22px; color: rgb(var(--v-theme-on-surface)); font-size: clamp(1.85rem, 8vw, 2.35rem); font-family: var(--reader-display-font-family); font-weight: 700; line-height: 1.1; letter-spacing: -.025em; }

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

.section-heading--month { padding-bottom: 8px; }
.month-nav { display: flex; gap: 6px; }
.month-nav button { display: grid; width: 38px; height: 38px; place-items: center; border: 1px solid var(--nav-border); border-radius: 12px; background: transparent; color: var(--nav-on-surface); cursor: pointer; }
.month-nav button:active { transform: scale(.95); }
.month-list { margin: 0; padding: 0 10px 12px; list-style: none; }
.month-day { display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 8px 10px; border-radius: 14px; color: var(--nav-on-surface); text-decoration: none; -webkit-tap-highlight-color: transparent; }
.month-day:hover { background: var(--nav-active); }
.month-day--selected { background: rgba(var(--chrome-accent-rgb), .13); color: var(--chrome-accent); }
.month-day__date { display: grid; flex: 0 0 34px; justify-items: center; line-height: 1.05; }
.month-day__date strong { font-size: 1.02rem; font-weight: 750; }
.month-day__date small { color: var(--nav-muted); font-size: .64rem; font-weight: 700; text-transform: uppercase; }
.month-day--sunday .month-day__date strong, .month-day--sunday .month-day__date small { color: var(--rubric-color); }
.month-day__copy { display: grid; min-width: 0; gap: 1px; }
.month-day__title { font-size: .86rem; line-height: 1.3; overflow-wrap: anywhere; }
.month-day--celebration .month-day__title { font-weight: 680; }
.month-day__copy small { color: var(--nav-muted); font-size: .72rem; }

@media (max-width: 600px) {
  .ordo-page { padding: 8px 4px !important; }
  .section-page-title { margin: 10px 12px 22px; }
  .date-header { min-height: 150px; padding: 20px; }
  .section-heading { padding-inline: 16px; }
  .celebration { margin-inline: 16px; }
  .ordo-block .control-label, .ordo-details, .ordo-lines, .directions, .ordo-empty { margin-inline: 16px; }
  .ordo-link-btn { margin-inline: 16px; max-width: calc(100% - 32px); }
  .direction { grid-template-columns: 88px minmax(0, 1fr); }
}
@media (max-width: 359px) {
  .date-header-shell { width: calc(100% - 16px); margin-inline: 8px; }
  .ordo-facts, .ordo-section { margin-inline: 8px; }
  .date-header { min-height: 140px; padding: 18px; border-radius: 24px; }
}
</style>

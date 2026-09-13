<template>
  <main class="bible-page">
    <div class="bible-shell">
      <header class="bible-toolbar">
        <div class="bible-language-switch" role="group" aria-label="Мова Бібліі">
          <button
            v-for="item in languageOptions"
            :key="item.id"
            type="button"
            class="bible-language-button"
            :class="{ 'bible-language-button--active': language === item.id }"
            :aria-pressed="language === item.id"
            @click="changeLanguage(item.id)"
          >
            {{ item.shortLabel }}
          </button>
        </div>

        <button type="button" class="bible-round-button" aria-label="Пошук у Бібліі" @click="openSearch">
          <PhMagnifyingGlass :size="22" />
        </button>
      </header>

      <section class="bible-heading" aria-labelledby="bible-chapter-heading">
        <div class="bible-heading__meta">
          {{ testamentLabel }} · {{ languageConfig.label }}
        </div>
        <button type="button" class="bible-heading__button" @click="openPicker">
          <span>
            <span class="bible-heading__book">{{ currentBook?.name }}</span>
            <span id="bible-chapter-heading" class="bible-heading__chapter">Раздзел {{ chapter }}</span>
          </span>
          <PhCaretDown :size="20" weight="bold" />
        </button>
        <div class="bible-heading__translation">{{ translationLabel }}</div>
      </section>

      <div v-if="loading" class="bible-state" aria-live="polite">
        <v-progress-circular indeterminate color="primary" size="30" width="3" />
        <span>Загружаем тэкст…</span>
      </div>

      <div v-else-if="error" class="bible-state bible-state--error" role="alert">
        <PhWarningCircle :size="30" />
        <div>
          <strong>Не ўдалося адкрыць кнігу</strong>
          <p>{{ error }}</p>
          <button type="button" class="bible-retry" @click="loadCurrentBook(true)">Паўтарыць</button>
        </div>
      </div>

      <article v-else class="bible-reader" :aria-label="`${currentBook?.name}, раздзел ${chapter}`">
        <button
          v-for="verse in verses"
          :id="`bible-verse-${verse.num}`"
          :key="verse.num"
          type="button"
          class="bible-verse"
          :class="verseClasses(verse.num)"
          :aria-pressed="isVerseSelected(verse.num)"
          :aria-label="`Верш ${verse.num}. ${verse.text}`"
          @click="toggleVerse(verse.num)"
        >
          <sup class="bible-verse__number">{{ verse.num }}</sup>
          <span>{{ verse.text }}</span>
        </button>

        <p v-if="verses.length === 0" class="bible-empty">У гэтым раздзеле няма тэксту.</p>
      </article>
    </div>

    <aside v-if="selectedVerseKeys.size" class="bible-highlight-bar" aria-label="Колер вылучэння">
      <div class="bible-highlight-bar__count">{{ selectedCountLabel }}</div>
      <div class="bible-highlight-bar__colors">
        <button
          v-for="color in highlightColors"
          :key="color.id"
          type="button"
          class="bible-color-button"
          :class="`bible-color-button--${color.id}`"
          :aria-label="color.label"
          @click="applyHighlight(color.id)"
        />
        <button type="button" class="bible-color-button bible-color-button--clear" aria-label="Прыбраць вылучэнне" @click="applyHighlight(null)">
          <PhEraser :size="20" />
        </button>
      </div>
      <button type="button" class="bible-highlight-bar__close" aria-label="Скасаваць выбар" @click="clearSelection">
        <PhX :size="19" />
      </button>
    </aside>

    <nav class="bible-bottom-nav" aria-label="Навігацыя па раздзелах">
      <button type="button" class="bible-bottom-nav__side" :disabled="!previousLocation" aria-label="Папярэдні раздзел" @click="goRelative(-1)">
        <PhCaretLeft :size="23" weight="bold" />
      </button>
      <button type="button" class="bible-bottom-nav__current" @click="openPicker">
        <PhBookOpenText :size="20" />
        <span>{{ currentBook?.shortName }} {{ chapter }}</span>
      </button>
      <button type="button" class="bible-bottom-nav__side" :disabled="!nextLocation" aria-label="Наступны раздзел" @click="goRelative(1)">
        <PhCaretRight :size="23" weight="bold" />
      </button>
    </nav>

    <v-bottom-sheet v-model="pickerOpen" content-class="bible-picker-overlay">
      <v-card class="bible-picker" rounded="t-xl">
        <header class="bible-sheet-header">
          <div>
            <div class="bible-sheet-header__eyebrow">Бібліятэка</div>
            <h2>Кнігі і раздзелы</h2>
          </div>
          <button type="button" class="bible-sheet-close" aria-label="Закрыць" @click="pickerOpen = false">
            <PhX :size="21" />
          </button>
        </header>

        <div class="bible-picker__body">
          <div class="bible-testament-tabs" role="tablist" aria-label="Запавет">
            <button type="button" role="tab" :aria-selected="pickerTestament === 'old'" :class="{ active: pickerTestament === 'old' }" @click="pickerTestament = 'old'">
              Стары Запавет
            </button>
            <button type="button" role="tab" :aria-selected="pickerTestament === 'new'" :class="{ active: pickerTestament === 'new' }" @click="pickerTestament = 'new'">
              Новы Запавет
            </button>
          </div>

          <label class="bible-book-filter">
            <PhMagnifyingGlass :size="19" />
            <input v-model="bookFilter" type="search" placeholder="Знайсці кнігу" aria-label="Знайсці кнігу" autocomplete="off" />
            <button v-if="bookFilter" type="button" aria-label="Ачысціць" @click="bookFilter = ''"><PhX :size="17" /></button>
          </label>

          <div class="bible-book-list">
            <div v-for="item in pickerBooks" :key="item.id" class="bible-book-row">
              <button
                type="button"
                class="bible-book-row__button"
                :class="{ active: pickerBookId === item.id }"
                :aria-expanded="pickerBookId === item.id"
                @click="pickerBookId = pickerBookId === item.id ? null : item.id"
              >
                <span>{{ item.name }}</span>
                <span class="bible-book-row__count">{{ item.chapterCount }}</span>
              </button>

              <div v-if="pickerBookId === item.id" class="bible-chapter-grid" :aria-label="`Раздзелы: ${item.name}`">
                <button
                  v-for="number in item.chapterCount"
                  :key="number"
                  type="button"
                  :class="{ active: item.id === currentBook?.id && number === chapter }"
                  @click="chooseChapter(item.id, number)"
                >
                  {{ number }}
                </button>
              </div>
            </div>
            <p v-if="pickerBooks.length === 0" class="bible-empty">Кніга не знойдзена.</p>
          </div>
        </div>
      </v-card>
    </v-bottom-sheet>

    <v-dialog v-model="searchOpen" max-width="680" scrollable content-class="bible-search-overlay">
      <v-card class="bible-search" rounded="xl">
        <header class="bible-sheet-header">
          <div>
            <div class="bible-sheet-header__eyebrow">Пошук</div>
            <h2>Знайсці ў Бібліі</h2>
          </div>
          <button type="button" class="bible-sheet-close" aria-label="Закрыць" @click="searchOpen = false">
            <PhX :size="21" />
          </button>
        </header>

        <div class="bible-search__body">
          <label class="bible-search-field">
            <PhMagnifyingGlass :size="21" />
            <input ref="searchInput" v-model.trim="searchTerm" type="search" placeholder="Слова або назва кнігі" autocomplete="off" />
            <button v-if="searchTerm" type="button" aria-label="Ачысціць" @click="searchTerm = ''"><PhX :size="18" /></button>
          </label>
          <p class="bible-search__scope">Назвы — ва ўсіх кнігах · тэкст — у «{{ currentBook?.name }}»</p>

          <div v-if="searchTerm.length < 2" class="bible-search__hint">
            Увядзіце не менш за дзве літары.
          </div>

          <template v-else>
            <section v-if="matchingBooks.length" class="bible-search-section">
              <h3>Кнігі</h3>
              <button v-for="item in matchingBooks" :key="item.id" type="button" class="bible-search-book" @click="openBookFromSearch(item)">
                <PhBookOpenText :size="19" />
                <span>{{ item.name }}</span>
                <PhCaretRight :size="17" />
              </button>
            </section>

            <section v-if="textSearchResults.length" class="bible-search-section">
              <h3>Вершы · {{ currentBook?.name }}</h3>
              <button v-for="result in textSearchResults" :key="`${result.chapter}:${result.verse}`" type="button" class="bible-search-result" @click="openSearchResult(result)">
                <span class="bible-search-result__reference">{{ currentBook?.name }} {{ result.chapter }}:{{ result.verse }}</span>
                <span class="bible-search-result__text">{{ result.text }}</span>
              </button>
            </section>

            <div v-if="!matchingBooks.length && !textSearchResults.length" class="bible-search__hint">
              Нічога не знойдзена.
            </div>
            <p v-if="textSearchResults.length === SEARCH_RESULT_LIMIT" class="bible-search__limit">Паказаны першыя {{ SEARCH_RESULT_LIMIT }} супадзенняў.</p>
          </template>
        </div>
      </v-card>
    </v-dialog>
  </main>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  PhBookOpenText, PhCaretDown, PhCaretLeft, PhCaretRight, PhEraser,
  PhMagnifyingGlass, PhWarningCircle, PhX,
} from '@phosphor-icons/vue';

import {
  BIBLE_BOOKS, BIBLE_HIGHLIGHT_COLORS, BIBLE_LANGUAGES,
  getBibleBook, getParallelBibleBook,
} from '@/constants/bible.js';
import { fetchBibleBook } from '@/services/bibleService.js';
import {
  bibleVerseKey, loadBibleHighlights, loadBibleLanguage, loadBibleLocation,
  normalizeBibleVerse, saveBibleHighlights, saveBibleLanguage, saveBibleLocation,
} from '@/utils/bible.js';

const SEARCH_RESULT_LIMIT = 60;
const route = useRoute();
const router = useRouter();

const bookDocument = ref(null);
const bookCache = new Map();
const loading = ref(false);
const error = ref('');
const requestId = ref(0);
const pickerOpen = ref(false);
const pickerTestament = ref('old');
const pickerBookId = ref(null);
const bookFilter = ref('');
const searchOpen = ref(false);
const searchTerm = ref('');
const searchInput = ref(null);
const selectedVerseKeys = ref(new Set());
const highlights = ref(loadBibleHighlights());

const languageOptions = Object.values(BIBLE_LANGUAGES);
const highlightColors = BIBLE_HIGHLIGHT_COLORS;

const language = computed(() => BIBLE_LANGUAGES[route.params.language] ? route.params.language : 'bel');
const languageConfig = computed(() => BIBLE_LANGUAGES[language.value]);
const books = computed(() => BIBLE_BOOKS[language.value]);
const currentBook = computed(() => getBibleBook(language.value, route.params.bookId));
const chapter = computed(() => Number(route.params.chapter) || 1);
const testamentLabel = computed(() => currentBook.value?.testament === 'new' ? 'Новы Запавет' : 'Стары Запавет');
const translationLabel = computed(() => languageConfig.value.translation);

const rawChapters = computed(() => bookDocument.value?.chapters || {});
const verses = computed(() => {
  const raw = rawChapters.value[String(chapter.value)] || rawChapters.value[chapter.value] || [];
  return Array.isArray(raw) ? raw.map(normalizeBibleVerse) : [];
});

const actualChapterCount = computed(() => (
  Number(bookDocument.value?.chapterCount) || currentBook.value?.chapterCount || 0
));

const currentBookIndex = computed(() => books.value.findIndex((item) => item.id === currentBook.value?.id));

function relativeLocation(direction) {
  if (!currentBook.value) return null;
  if (direction < 0 && chapter.value > 1) return { bookId: currentBook.value.id, chapter: chapter.value - 1 };
  if (direction > 0 && chapter.value < actualChapterCount.value) return { bookId: currentBook.value.id, chapter: chapter.value + 1 };

  const adjacent = books.value[currentBookIndex.value + direction];
  if (!adjacent) return null;
  return {
    bookId: adjacent.id,
    chapter: direction < 0 ? adjacent.chapterCount : 1,
  };
}

const previousLocation = computed(() => relativeLocation(-1));
const nextLocation = computed(() => relativeLocation(1));

const pickerBooks = computed(() => {
  const query = bookFilter.value.trim().toLocaleLowerCase(language.value === 'bel' ? 'be' : 'ru');
  return books.value.filter((item) => (
    item.testament === pickerTestament.value
    && (!query || item.name.toLocaleLowerCase(language.value === 'bel' ? 'be' : 'ru').includes(query))
  ));
});

const normalizedSearchTerm = computed(() => searchTerm.value.toLocaleLowerCase(language.value === 'bel' ? 'be' : 'ru'));
const matchingBooks = computed(() => {
  if (normalizedSearchTerm.value.length < 2) return [];
  return books.value
    .filter((item) => item.name.toLocaleLowerCase(language.value === 'bel' ? 'be' : 'ru').includes(normalizedSearchTerm.value))
    .slice(0, 8);
});

const textSearchResults = computed(() => {
  const query = normalizedSearchTerm.value;
  if (query.length < 2) return [];
  const results = [];
  for (const [chapterNumber, rawVerses] of Object.entries(rawChapters.value)) {
    if (!Array.isArray(rawVerses)) continue;
    rawVerses.forEach((rawVerse, index) => {
      if (results.length >= SEARCH_RESULT_LIMIT) return;
      const verse = normalizeBibleVerse(rawVerse, index);
      if (verse.text.toLocaleLowerCase(language.value === 'bel' ? 'be' : 'ru').includes(query)) {
        results.push({ chapter: Number(chapterNumber), verse: verse.num, text: verse.text });
      }
    });
    if (results.length >= SEARCH_RESULT_LIMIT) break;
  }
  return results;
});

const selectedCountLabel = computed(() => {
  const count = selectedVerseKeys.value.size;
  return count === 1 ? '1 верш' : `${count} вершы`;
});

function routeLocation(bookId, chapterNumber, query = {}) {
  return {
    name: 'Bible',
    params: { language: language.value, bookId, chapter: chapterNumber },
    query,
  };
}

function ensureCanonicalRoute() {
  const preferredLanguage = BIBLE_LANGUAGES[route.params.language]
    ? route.params.language
    : loadBibleLanguage();
  const saved = loadBibleLocation(preferredLanguage);
  const preferredBook = getBibleBook(preferredLanguage, route.params.bookId)
    || getBibleBook(preferredLanguage, saved?.bookId)
    || BIBLE_BOOKS[preferredLanguage][0];
  const requestedChapter = Number(route.params.chapter || saved?.chapter || 1);
  const preferredChapter = Math.min(Math.max(requestedChapter || 1, 1), preferredBook.chapterCount);

  if (
    route.params.language !== preferredLanguage
    || route.params.bookId !== preferredBook.id
    || Number(route.params.chapter) !== preferredChapter
  ) {
    router.replace({
      name: 'Bible',
      params: { language: preferredLanguage, bookId: preferredBook.id, chapter: preferredChapter },
      query: route.query,
    });
    return false;
  }
  return true;
}

async function loadCurrentBook(force = false) {
  const meta = currentBook.value;
  if (!meta) return;
  const cacheKey = `${language.value}:${meta.id}`;
  const currentRequest = ++requestId.value;
  error.value = '';

  if (!force && bookCache.has(cacheKey)) {
    bookDocument.value = bookCache.get(cacheKey);
    await scrollToRequestedVerse();
    return;
  }

  loading.value = true;
  bookDocument.value = null;
  try {
    const result = await fetchBibleBook(language.value, meta.id);
    if (currentRequest !== requestId.value) return;
    if (!result) throw new Error('Кніга не знойдзена ў базе даных.');
    bookCache.set(cacheKey, result);
    bookDocument.value = result;
    await scrollToRequestedVerse();
  } catch (loadError) {
    if (currentRequest !== requestId.value) return;
    error.value = navigator.onLine === false
      ? 'Няма сеткі, а гэтая кніга яшчэ не захавана на прыладзе.'
      : (loadError?.message || 'Праверце злучэнне і паспрабуйце яшчэ раз.');
  } finally {
    if (currentRequest === requestId.value) loading.value = false;
  }
}

async function scrollToRequestedVerse() {
  const verse = Number(route.query.verse);
  if (!verse) return;
  await nextTick();
  scrollVerseIntoView(verse);
}

function scrollVerseIntoView(verseNumber) {
  document.getElementById(`bible-verse-${verseNumber}`)?.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
  });
}

function navigate(bookId, chapterNumber, query = {}) {
  clearSelection();
  router.push(routeLocation(bookId, chapterNumber, query));
}

function goRelative(direction) {
  const location = direction < 0 ? previousLocation.value : nextLocation.value;
  if (location) navigate(location.bookId, location.chapter);
}

function openPicker() {
  pickerBookId.value = currentBook.value?.id || null;
  pickerTestament.value = currentBook.value?.testament || 'old';
  bookFilter.value = '';
  pickerOpen.value = true;
}

function chooseChapter(bookId, chapterNumber) {
  pickerOpen.value = false;
  navigate(bookId, chapterNumber);
}

function changeLanguage(nextLanguage) {
  if (nextLanguage === language.value) return;
  const saved = loadBibleLocation(nextLanguage);
  const parallel = getParallelBibleBook(language.value, currentBook.value?.id, nextLanguage);
  const nextBook = parallel || getBibleBook(nextLanguage, saved?.bookId) || BIBLE_BOOKS[nextLanguage][0];
  const nextChapter = parallel
    ? Math.min(chapter.value, nextBook.chapterCount)
    : Math.min(Number(saved?.chapter) || 1, nextBook.chapterCount);
  saveBibleLanguage(nextLanguage);
  clearSelection();
  router.push({ name: 'Bible', params: { language: nextLanguage, bookId: nextBook.id, chapter: nextChapter } });
}

function verseStorageKey(verseNumber) {
  return bibleVerseKey(language.value, currentBook.value.id, chapter.value, verseNumber);
}

function isVerseSelected(verseNumber) {
  return selectedVerseKeys.value.has(verseStorageKey(verseNumber));
}

function verseClasses(verseNumber) {
  const key = verseStorageKey(verseNumber);
  return {
    'bible-verse--selected': selectedVerseKeys.value.has(key),
    [`bible-verse--${highlights.value[key]}`]: Boolean(highlights.value[key]),
  };
}

async function toggleVerse(verseNumber) {
  const key = verseStorageKey(verseNumber);
  const next = new Set(selectedVerseKeys.value);
  const isSelecting = !next.has(key);
  if (isSelecting) next.add(key);
  else next.delete(key);
  selectedVerseKeys.value = next;

  if (isSelecting) {
    // Wait until the colour palette occupies its final space, then keep the
    // selected verse comfortably visible above it.
    await nextTick();
    scrollVerseIntoView(verseNumber);
  }
}

function clearSelection() {
  selectedVerseKeys.value = new Set();
}

function applyHighlight(color) {
  const next = { ...highlights.value };
  selectedVerseKeys.value.forEach((key) => {
    if (color) next[key] = color;
    else delete next[key];
  });
  highlights.value = next;
  saveBibleHighlights(next);
  clearSelection();
}

async function openSearch() {
  searchTerm.value = '';
  searchOpen.value = true;
  await nextTick();
  searchInput.value?.focus();
}

function openBookFromSearch(item) {
  searchOpen.value = false;
  navigate(item.id, 1);
}

function openSearchResult(result) {
  searchOpen.value = false;
  navigate(currentBook.value.id, result.chapter, { verse: result.verse });
}

watch(
  () => [route.params.language, route.params.bookId, route.params.chapter],
  async () => {
    if (route.name !== 'Bible' || !ensureCanonicalRoute()) return;
    saveBibleLanguage(language.value);
    saveBibleLocation(language.value, { bookId: currentBook.value.id, chapter: chapter.value });
    clearSelection();
    await loadCurrentBook();
    if (!route.query.verse) window.scrollTo({ top: 0, behavior: 'auto' });
  },
  { immediate: true },
);

watch(() => route.query.verse, scrollToRequestedVerse);
onMounted(ensureCanonicalRoute);
</script>

<style scoped>
.bible-page {
  --bible-amber: rgba(226, 174, 52, 0.3);
  --bible-rose: rgba(211, 112, 116, 0.25);
  --bible-sky: rgba(79, 159, 193, 0.25);
  --bible-leaf: rgba(89, 164, 107, 0.25);
  min-height: 100vh;
  padding: 78px 14px 88px;
}

.bible-shell {
  width: min(100%, 760px);
  margin: 0 auto;
}

.bible-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  min-height: 48px;
  margin-bottom: 18px;
}

.bible-language-switch {
  display: flex;
  height: 44px;
  padding: 3px;
  border: 1px solid var(--nav-border);
  border-radius: 22px;
  background: var(--overlay-surface);
  box-shadow: 0 2px 9px var(--nav-button-shadow);
  backdrop-filter: blur(18px);
}

.bible-language-button {
  min-width: 54px;
  border: 0;
  border-radius: 18px;
  background: transparent;
  color: var(--nav-muted);
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  cursor: pointer;
}

.bible-language-button--active {
  background: rgba(var(--chrome-accent-rgb), 0.14);
  color: var(--chrome-accent);
}

.bible-round-button,
.bible-sheet-close {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  border: 1px solid var(--nav-border);
  border-radius: 50%;
  background: var(--overlay-surface);
  color: var(--nav-on-surface);
  cursor: pointer;
  box-shadow: 0 2px 9px var(--nav-button-shadow);
}

.bible-heading {
  margin-bottom: 14px;
  padding: 26px 26px 22px;
  border: 1px solid var(--reader-border);
  border-radius: 26px;
  background:
    radial-gradient(circle at 100% 0, rgba(var(--chrome-accent-rgb), 0.13), transparent 260px),
    var(--reader-surface);
  box-shadow: var(--reader-shadow);
}

.bible-heading__meta,
.bible-sheet-header__eyebrow {
  color: var(--chrome-accent);
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.bible-heading__button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 18px;
  margin-top: 7px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--reader-ink);
  text-align: left;
  cursor: pointer;
}

.bible-heading__book {
  display: block;
  font-family: var(--reader-display-font-family);
  font-size: clamp(1.55rem, 5vw, 2.2rem);
  font-weight: 750;
  line-height: 1.12;
}

.bible-heading__chapter {
  display: block;
  margin-top: 5px;
  color: var(--reader-muted);
  font-size: 0.9rem;
  font-weight: 650;
}

.bible-heading__translation {
  margin-top: 18px;
  padding-top: 13px;
  border-top: 1px solid var(--reader-rule);
  color: var(--reader-muted);
  font-size: 0.74rem;
}

.bible-reader {
  padding: 26px 22px 34px;
  border: 1px solid var(--reader-border);
  border-radius: 26px;
  background: var(--reader-surface);
  box-shadow: var(--reader-shadow);
}

.bible-verse {
  display: block;
  width: 100%;
  margin: 0;
  padding: 0.38em 0.42em;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--reader-ink);
  font-family: var(--reader-font-family);
  font-size: calc(1.08rem * var(--font-size-multiplier, 1));
  font-weight: 400;
  line-height: 1.78;
  text-align: left;
  text-wrap: pretty;
  cursor: pointer;
  transition: background 0.14s ease, box-shadow 0.14s ease;
}

.bible-verse + .bible-verse { margin-top: 0.2em; }
.bible-verse--amber { background: var(--bible-amber); }
.bible-verse--rose { background: var(--bible-rose); }
.bible-verse--sky { background: var(--bible-sky); }
.bible-verse--leaf { background: var(--bible-leaf); }
.bible-verse--selected { box-shadow: inset 0 0 0 2px var(--chrome-accent); }

.bible-verse__number {
  display: inline-block;
  min-width: 1.8em;
  margin-right: 0.18em;
  color: var(--rubric-color);
  font-family: var(--ui-font-family);
  font-size: 0.62em;
  font-weight: 800;
  line-height: 1;
  vertical-align: 0.42em;
}

.bible-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 260px;
  gap: 14px;
  padding: 30px;
  border: 1px solid var(--reader-border);
  border-radius: 26px;
  background: var(--reader-surface);
  color: var(--reader-muted);
}

.bible-state--error { align-items: flex-start; color: var(--rubric-color); }
.bible-state--error p { margin: 5px 0 12px; color: var(--reader-muted); }
.bible-retry { border: 0; background: transparent; color: var(--chrome-accent); font-weight: 750; cursor: pointer; }
.bible-empty { padding: 28px 10px; color: var(--reader-muted); text-align: center; }

.bible-bottom-nav {
  position: fixed;
  z-index: 8;
  right: max(12px, env(safe-area-inset-right));
  bottom: max(12px, env(safe-area-inset-bottom));
  left: max(12px, env(safe-area-inset-left));
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) 52px;
  width: min(calc(100% - 24px), 610px);
  height: 60px;
  margin-inline: auto;
  overflow: hidden;
  border: 1px solid var(--nav-border);
  border-radius: 30px;
  background: var(--overlay-surface);
  box-shadow: 0 10px 32px var(--nav-shadow);
  backdrop-filter: blur(22px) saturate(1.08);
}

.bible-bottom-nav button {
  border: 0;
  background: transparent;
  color: var(--nav-on-surface);
  cursor: pointer;
}

.bible-bottom-nav button:disabled { opacity: 0.25; cursor: default; }
.bible-bottom-nav__side { display: grid; place-items: center; }
.bible-bottom-nav__current {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  gap: 9px;
  padding-inline: 12px;
  border-inline: 1px solid var(--nav-border) !important;
  color: var(--chrome-accent) !important;
  font-weight: 750;
}
.bible-bottom-nav__current span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.bible-highlight-bar {
  position: fixed;
  z-index: 9;
  right: max(12px, env(safe-area-inset-right));
  bottom: calc(max(12px, env(safe-area-inset-bottom)) + 70px);
  left: max(12px, env(safe-area-inset-left));
  display: flex;
  align-items: center;
  width: min(calc(100% - 24px), 520px);
  min-height: 58px;
  gap: 10px;
  margin-inline: auto;
  padding: 8px 10px 8px 15px;
  border: 1px solid var(--nav-border);
  border-radius: 22px;
  background: var(--overlay-surface);
  box-shadow: 0 10px 32px var(--nav-shadow);
  backdrop-filter: blur(22px);
}

.bible-highlight-bar__count { margin-right: auto; color: var(--nav-muted); font-size: 0.78rem; font-weight: 700; white-space: nowrap; }
.bible-highlight-bar__colors { display: flex; gap: 7px; }
.bible-color-button {
  width: 34px;
  height: 34px;
  border: 1px solid var(--nav-border);
  border-radius: 50%;
  cursor: pointer;
}
.bible-color-button--amber { background: #e2ae34; }
.bible-color-button--rose { background: #d37074; }
.bible-color-button--sky { background: #4f9fc1; }
.bible-color-button--leaf { background: #59a46b; }
.bible-color-button--clear { display: grid; place-items: center; background: transparent; color: var(--nav-muted); }
.bible-highlight-bar__close { display: grid; place-items: center; width: 32px; height: 32px; border: 0; background: transparent; color: var(--nav-muted); cursor: pointer; }

.bible-picker,
.bible-search {
  overflow: hidden;
  border: 1px solid var(--nav-border) !important;
  background: var(--overlay-surface) !important;
  color: var(--nav-on-surface) !important;
}

.bible-picker { max-height: min(88dvh, 820px); }
.bible-search { max-height: min(86dvh, 760px); }

.bible-sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 22px 14px;
  border-bottom: 1px solid var(--nav-border);
}
.bible-sheet-header h2 { margin: 2px 0 0; font-family: var(--reader-display-font-family); font-size: 1.5rem; line-height: 1.15; }
.bible-sheet-close { box-shadow: none; }
.bible-picker__body,
.bible-search__body { overflow-y: auto; padding: 14px 18px 26px; }

.bible-testament-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 4px;
  border-radius: 18px;
  background: rgba(var(--chrome-accent-rgb), 0.08);
}
.bible-testament-tabs button { min-height: 42px; border: 0; border-radius: 14px; background: transparent; color: var(--nav-muted); font-weight: 720; cursor: pointer; }
.bible-testament-tabs button.active { background: var(--overlay-surface); color: var(--chrome-accent); box-shadow: 0 2px 8px var(--nav-button-shadow); }

.bible-book-filter,
.bible-search-field {
  display: flex;
  align-items: center;
  min-height: 48px;
  gap: 10px;
  margin: 12px 0;
  padding: 0 14px;
  border: 1px solid var(--nav-border);
  border-radius: 16px;
  background: rgba(var(--chrome-accent-rgb), 0.055);
  color: var(--nav-muted);
}
.bible-book-filter input,
.bible-search-field input { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color: var(--nav-on-surface); font: inherit; }
.bible-book-filter button,
.bible-search-field button { display: grid; place-items: center; border: 0; background: transparent; color: inherit; cursor: pointer; }

.bible-book-list { padding-bottom: 12px; }
.bible-book-row { border-bottom: 1px solid var(--nav-border); }
.bible-book-row__button {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 54px;
  gap: 12px;
  padding: 9px 10px;
  border: 0;
  background: transparent;
  color: var(--nav-on-surface);
  font-size: 1rem;
  font-weight: 650;
  text-align: left;
  cursor: pointer;
}
.bible-book-row__button.active { color: var(--chrome-accent); }
.bible-book-row__button span:first-child { flex: 1; }
.bible-book-row__count { display: grid; place-items: center; min-width: 30px; height: 25px; padding-inline: 7px; border-radius: 13px; background: rgba(var(--chrome-accent-rgb), 0.1); color: var(--nav-muted); font-size: 0.74rem; }

.bible-chapter-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 7px; padding: 3px 8px 16px; }
.bible-chapter-grid button { aspect-ratio: 1; min-height: 40px; border: 1px solid var(--nav-border); border-radius: 12px; background: rgba(var(--chrome-accent-rgb), 0.055); color: var(--nav-on-surface); font-weight: 720; cursor: pointer; }
.bible-chapter-grid button.active { border-color: transparent; background: var(--chrome-accent); color: var(--on-chrome-accent); }

.bible-search-field { min-height: 54px; margin-top: 0; }
.bible-search__scope { margin: -3px 3px 16px; color: var(--nav-muted); font-size: 0.76rem; }
.bible-search__hint { padding: 48px 16px; color: var(--nav-muted); text-align: center; }
.bible-search-section + .bible-search-section { margin-top: 22px; }
.bible-search-section h3 { margin: 0 0 7px 4px; color: var(--chrome-accent); font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; }
.bible-search-book,
.bible-search-result { width: 100%; border: 0; border-bottom: 1px solid var(--nav-border); background: transparent; color: var(--nav-on-surface); text-align: left; cursor: pointer; }
.bible-search-book { display: flex; align-items: center; min-height: 50px; gap: 10px; padding: 8px 6px; font-weight: 680; }
.bible-search-book span { flex: 1; }
.bible-search-result { display: block; padding: 12px 6px; }
.bible-search-result__reference { display: block; color: var(--rubric-color); font-size: 0.77rem; font-weight: 750; }
.bible-search-result__text { display: -webkit-box; margin-top: 3px; overflow: hidden; color: var(--reader-ink); font-family: var(--reader-font-family); font-size: 0.94rem; line-height: 1.45; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.bible-search__limit { color: var(--nav-muted); font-size: 0.76rem; text-align: center; }

@media (min-width: 700px) {
  .bible-picker-overlay { width: min(720px, 100%) !important; margin-inline: auto; }

  .bible-chapter-grid {
    grid-template-columns: repeat(12, 42px);
    justify-content: start;
    gap: 7px;
  }

  .bible-chapter-grid button {
    width: 42px;
    min-height: 42px;
    aspect-ratio: auto;
    border-radius: 11px;
  }
}

@media (max-width: 600px) {
  .bible-page { padding: 72px 8px 86px; }
  .bible-toolbar { padding-inline: 4px; margin-bottom: 12px; }
  .bible-heading { padding: 22px 20px 19px; border-radius: 22px; }
  .bible-reader { padding: 21px 13px 28px; border-radius: 22px; }
  .bible-verse { padding-inline: 0.48em; font-size: calc(1.06rem * var(--font-size-multiplier, 1)); }
  .bible-sheet-header { padding: 17px 18px 13px; }
  .bible-picker__body,
  .bible-search__body { padding: 12px 12px 24px; }
  .bible-chapter-grid { grid-template-columns: repeat(5, 1fr); }
  .bible-search-overlay { align-items: flex-end !important; margin: 0 !important; max-height: 92dvh; }
  .bible-search { width: 100%; border-radius: 24px 24px 0 0 !important; }
}

@media (max-width: 390px) {
  .bible-highlight-bar__count { display: none; }
  .bible-highlight-bar__colors { margin-right: auto; }
  .bible-color-button { width: 32px; height: 32px; }
}
</style>

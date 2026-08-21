<template>
  <div class="parsed-reading" :style="fontSizeStyle">

    <!-- JSON debug panel -->
    <div class="json-toggle" @click="showJson = !showJson">
      <span class="json-toggle-label">{{ showJson ? '▾' : '▸' }} JSON</span>
      <span class="json-toggle-id">{{ reading.id }}</span>
    </div>
    <div v-if="showJson" class="json-block">
      <pre>{{ rawJson }}</pre>
    </div>

    <!-- Заголовок дня -->
    <div v-if="reading.title" class="reading-day-title">{{ reading.title }}</div>

    <!-- Контроль размера шрифта -->
    <div class="font-size-row">
      <button class="font-btn" :disabled="fontSize <= MIN_SIZE" @click="fontSize = Math.max(MIN_SIZE, fontSize - 1)">A−</button>
      <button class="font-btn" :disabled="fontSize >= MAX_SIZE" @click="fontSize = Math.min(MAX_SIZE, fontSize + 1)">A+</button>
    </div>

    <template v-for="section in sections" :key="section.key">
      <div class="reading-section">
        <div class="section-label">{{ section.label }}</div>

        <!-- Reading 1 / Reading 2 -->
        <template v-if="section.key === 'reading1' || section.key === 'reading2'">
          <div v-if="section.data.title" class="reading-rubric">{{ section.data.title }}</div>
          <div v-if="section.data.bible" class="section-ref">{{ section.data.bible }}</div>
          <div v-if="section.data.comment" class="reading-intro">{{ section.data.comment }}</div>
          <div
            v-if="strippedText(section.data)"
            class="section-text"
            v-html="formatText(strippedText(section.data))"
          ></div>
        </template>

        <!-- Psalm -->
        <template v-else-if="section.key === 'psalm'">
          <div v-if="section.data.bible" class="section-ref">{{ section.data.bible }}</div>
          <template v-if="section.data.verses && section.data.verses.length">
            <div v-if="section.data.chorus" class="psalm-chorus">{{ section.data.chorus }}</div>
            <template v-for="(verse, i) in section.data.verses" :key="i">
              <div class="section-text psalm-verse-text" v-html="formatText(typeof verse === 'string' ? verse : (verse.text || ''))"></div>
              <div v-if="section.data.chorus && i < section.data.verses.length - 1" class="psalm-chorus">{{ section.data.chorus }}</div>
            </template>
            <div v-if="section.data.altChorus" class="psalm-chorus psalm-alt-chorus">{{ section.data.altChorus }}</div>
            <div v-else-if="section.data.chorus" class="psalm-chorus">{{ section.data.chorus }}</div>
          </template>
          <div v-else-if="section.data.text" class="section-text" v-html="formatText(section.data.text)"></div>
        </template>

        <!-- Alleluia -->
        <template v-else-if="section.key === 'alleluia'">
          <div v-if="section.data.bible" class="section-ref">{{ section.data.bible }}</div>
          <div v-if="section.data.verse" class="alleluia-verse">{{ section.data.verse }}</div>
          <div v-else-if="section.data.text" class="alleluia-verse" v-html="formatText(section.data.text)"></div>
        </template>

        <!-- Gospel -->
        <template v-else-if="section.key === 'gospel'">
          <div v-if="section.data.title" class="gospel-rubric">{{ section.data.title }}</div>
          <div v-if="section.data.bible" class="section-ref">{{ section.data.bible }}</div>
          <div v-if="section.data.comment" class="gospel-comment">{{ section.data.comment }}</div>
          <div v-if="section.data.text" class="section-text" v-html="formatText(section.data.text)"></div>
        </template>

        <!-- Fallback -->
        <template v-else>
          <div v-if="section.data.bible" class="section-ref">{{ section.data.bible }}</div>
          <div v-if="section.data.text" class="section-text" v-html="formatText(section.data.text)"></div>
        </template>
      </div>
    </template>

    <div v-if="!hasSections" class="no-content text-grey">
      Тэкст чытання недаступны
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';

const props = defineProps({
  reading: { type: Object, required: true },
});

// ── Font size ──
const MIN_SIZE = 14;
const MAX_SIZE = 22;
const STORAGE_KEY = 'readings_font_size';

const fontSize = ref(parseInt(localStorage.getItem(STORAGE_KEY) || '16', 10));
watch(fontSize, (v) => localStorage.setItem(STORAGE_KEY, String(v)));

const fontSizeStyle = computed(() => ({ '--reading-font-size': `${fontSize.value}px` }));

// ── Sections ──
const SECTION_LABELS = {
  reading1: 'І чытанне',
  psalm:    'Псалом',
  reading2: 'ІІ чытанне',
  alleluia: 'Алілуя',
  gospel:   'Евангелле',
};

const sections = computed(() =>
  Object.entries(SECTION_LABELS)
    .map(([key, label]) => ({ key, label, data: props.reading[key] }))
    .filter((s) => s.data),
);

const hasSections = computed(() => sections.value.length > 0);

// ── JSON debug ──
const showJson = ref(false);
const rawJson  = computed(() => JSON.stringify(props.reading, null, 2));

// ── Helpers ──
const BIBLE_REF_LEAD = /^[А-ЯA-Z][а-яa-z]{0,4}\.?\s+\d+[\d\s,.\-–()абвabcABC]*\s*/;

function strippedText(sectionData) {
  const text = sectionData?.text;
  if (!text || !sectionData?.bible) return text || '';
  // Если text начинается с той же ссылки что и bible — срезаем
  const bibleEsc = String(sectionData.bible).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const cleaned = String(text).replace(new RegExp(`^${bibleEsc}\\s*`), '');
  // Fallback: срезать по паттерну если ссылка слегка отличается
  if (cleaned !== text) return cleaned.trim();
  return String(text).replace(BIBLE_REF_LEAD, '').trim() !== text
    ? String(text).replace(BIBLE_REF_LEAD, '').trim()
    : text;
}

function formatText(text) {
  if (!text) return '';
  if (/<[a-z][\s\S]*>/i.test(text)) return text;
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}
</script>

<style scoped>
.parsed-reading {
  padding: 0 4px;
  --reading-font-size: 16px;
}

/* ── День: крупный заголовок ── */
.reading-day-title {
  font-size: 1.35rem;
  font-weight: 700;
  line-height: 1.3;
  color: rgb(var(--v-theme-primary));
  margin-bottom: 4px;
}

/* ── Размер шрифта ── */
.font-size-row {
  display: flex;
  gap: 6px;
  margin-bottom: 20px;
}
.font-btn {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.2);
  background: transparent;
  border-radius: 8px;
  padding: 3px 12px;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
  color: rgba(var(--v-theme-on-surface), 0.55);
  transition: background 0.15s, color 0.15s;
}
.font-btn:not(:disabled):hover {
  background: rgba(var(--v-theme-primary), 0.08);
  color: rgb(var(--v-theme-primary));
}
.font-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

/* ── Секции ── */
.reading-section {
  margin-bottom: 28px;
}

.section-label {
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgb(var(--v-theme-primary));
  margin-bottom: 4px;
}

/* Рубрика: "Чытанне кнігі Мудрасці Сіраха." */
.reading-rubric {
  font-size: 0.82rem;
  font-style: italic;
  color: rgba(var(--v-theme-on-surface), 0.5);
  margin-bottom: 2px;
  line-height: 1.4;
}

.section-ref {
  font-size: 0.85rem;
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.55);
  margin-bottom: 6px;
}

/* Вводная фраза перед чтением */
.reading-intro {
  font-size: 0.88rem;
  font-style: italic;
  color: rgba(var(--v-theme-on-surface), 0.45);
  margin-bottom: 10px;
  line-height: 1.5;
}

.section-text {
  font-size: var(--reading-font-size);
  line-height: 1.75;
  color: rgb(var(--v-theme-on-surface));
}

.section-text :deep(p) { margin-bottom: 0.85em; }
.section-text :deep(p:last-child) { margin-bottom: 0; }

.psalm-verse-text {
  padding-left: 4px;
}

/* Рефрен псалма */
.psalm-chorus {
  font-size: 0.88rem;
  font-weight: 600;
  font-style: italic;
  color: rgba(var(--v-theme-on-surface), 0.65);
  border-left: 3px solid rgb(var(--v-theme-primary));
  padding: 4px 10px;
  margin: 8px 0 10px;
  line-height: 1.5;
}

.psalm-alt-chorus {
  font-style: normal;
  font-weight: 700;
  letter-spacing: 0.06em;
}

/* Алілуя */
.alleluia-verse {
  font-size: var(--reading-font-size);
  font-style: italic;
  color: rgba(var(--v-theme-on-surface), 0.8);
  line-height: 1.65;
}

/* Евангелле */
.gospel-rubric {
  font-size: 0.78rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(var(--v-theme-on-surface), 0.4);
  margin-bottom: 4px;
}

.gospel-comment {
  font-size: 0.9rem;
  font-style: italic;
  color: rgba(var(--v-theme-on-surface), 0.5);
  margin-bottom: 12px;
  line-height: 1.55;
}

.no-content {
  font-size: 0.9rem;
  padding: 8px 0;
}

/* ── JSON debug ── */
.json-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  margin-bottom: 10px;
  user-select: none;
}
.json-toggle-label {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: rgba(var(--v-theme-on-surface), 0.35);
}
.json-toggle-id {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 0.7rem;
  color: rgba(var(--v-theme-on-surface), 0.25);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 220px;
}
.json-block {
  background: rgba(var(--v-theme-on-surface), 0.04);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 8px;
  padding: 12px 14px;
  margin-bottom: 20px;
  overflow-x: auto;
}
.json-block pre {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 0.72rem;
  line-height: 1.55;
  color: rgba(var(--v-theme-on-surface), 0.75);
  white-space: pre;
  margin: 0;
}
</style>

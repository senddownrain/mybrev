<template>
  <article v-reading-highlights="highlightBinding" class="parsed-reading" :class="{ 'parsed-reading--highlighting': settings.readingHighlightsEnabled }" lang="be">
    <header v-if="reading.title" class="reading-header">
      <div class="reading-header__eyebrow">Літургія слова</div>
      <h2 class="reading-day-title">{{ reading.title }}</h2>
      <span v-if="reading.year" class="reading-cycle-badge">
        Цыкл {{ cycleLabel(reading.year) }}
      </span>
    </header>

    <div v-if="reading._setLabel || reading._note" class="reading-set-meta">
      <span v-if="reading._setLabel" class="reading-set-meta__label">{{ reading._setLabel }}</span>
      <span v-if="reading._note" class="reading-set-meta__note">{{ reading._note }}</span>
    </div>

    <div v-if="reading._referenceOnly" class="reading-reference-only">
      <p class="reading-reference-only__notice">Поўны тэкст чытанняў пакуль не загружаны. Цытаты:</p>
      <dl class="reading-reference-only__list">
        <template v-for="row in referenceRows" :key="row.key">
          <dt>{{ row.label }}</dt>
          <dd>{{ row.bible }}<span v-for="alternative in row.alternatives" :key="alternative"> або {{ alternative }}</span></dd>
        </template>
      </dl>
    </div>

    <div v-else class="reading-sections">
      <section
        v-for="section in sections"
        :key="section.key"
        class="reading-section"
        :class="[`reading-section--${section.kind}`, { 'reading-section--rubric-only': section.kind === 'rubric' }]"
      >
        <template v-if="section.kind === 'rubric'">
          <div class="reading-rubric reading-rubric--liturgical" v-html="formatText(section.data.text)"></div>
        </template>

        <template v-else>
          <div class="section-heading">
            <h3 class="section-label">{{ section.label }}</h3>
            <div v-if="section.data.bible" class="section-ref">{{ section.data.bible }}</div>
          </div>

          <template v-if="section.kind === 'reading'">
            <div v-if="section.data.comment" class="section-comment">{{ section.data.comment }}</div>
            <div v-if="section.data.title" class="reading-rubric">{{ section.data.title }}</div>
            <div
              v-if="strippedText(section.data)"
              v-reader-prose class="section-text"
              v-html="formatText(strippedText(section.data))"
            ></div>
            <div v-for="rubric in section.data.rubrics || []" :key="rubric" class="reading-rubric reading-rubric--liturgical">{{ rubric }}</div>
            <div v-if="conclusionOf(section.data, 'Гэта слова Божае.')" class="reading-acclamation">
              {{ conclusionOf(section.data, 'Гэта слова Божае.') }}
            </div>
            <div v-for="(alternative, index) in section.data.alternatives || []" :key="index" class="reading-alternative">
              <div class="reading-alternative__label">Або <span v-if="alternative.bible">{{ alternative.bible }}</span></div>
              <div v-if="alternative.comment" class="section-comment">{{ alternative.comment }}</div>
              <div v-if="alternative.title" class="reading-rubric">{{ alternative.title }}</div>
              <div v-if="alternative.text" v-reader-prose class="section-text" v-html="formatText(strippedText(alternative))"></div>
              <div v-if="alternative.text && !hasAcclamation(alternative.text)" class="reading-acclamation">Гэта слова Божае.</div>
            </div>
          </template>

          <template v-else-if="section.kind === 'psalm'">
            <template v-if="section.data.verses?.length">
              <div v-if="section.data.chorus" class="psalm-refrain">
                <span class="psalm-refrain__label">Рэфрэн</span>
                <span>{{ cleanChorus(section.data.chorus) }}</span>
              </div>
              <div v-if="section.data.altChorus && section.structured" class="psalm-refrain psalm-refrain--alternate">
                <span class="psalm-refrain__label">Або</span>
                <span>{{ cleanChorus(section.data.altChorus) }}</span>
              </div>
              <div v-for="(verse, index) in section.data.verses" :key="index" class="psalm-strophe">
                <div
                  class="section-text psalm-verse-text"
                  v-html="formatPsalmText(typeof verse === 'string' ? verse : (verse.text || ''))"
                ></div>
                <div
                  v-if="section.data.chorus && index < section.data.verses.length - 1"
                  class="psalm-refrain psalm-refrain--repeat"
                >
                  <span class="psalm-refrain__label">Рэфрэн</span>
                  <span>{{ cleanChorus(section.data.chorus) }}</span>
                </div>
              </div>
              <div v-if="section.data.altChorus && !section.structured" class="psalm-refrain psalm-refrain--alternate">
                <span class="psalm-refrain__label">Або</span>
                <span>{{ cleanChorus(section.data.altChorus) }}</span>
              </div>
              <div v-else-if="section.data.chorus" class="psalm-refrain psalm-refrain--last">
                <span class="psalm-refrain__label">Рэфрэн</span>
                <span>{{ cleanChorus(section.data.chorus) }}</span>
              </div>
            </template>
            <div
              v-else-if="section.data.text"
              class="section-text psalm-verse-text"
              v-html="formatPsalmText(section.data.text)"
            ></div>
          </template>

          <template v-else-if="section.kind === 'acclamation'">
            <div class="alleluia-acclamation">
              <strong class="alleluia-acclamation__label">Акламацыя:</strong>
              <span>{{ section.data.acclamation || 'Аллелюя, аллелюя, аллелюя.' }}</span>
            </div>
            <div
              v-if="section.data.verse || section.data.text"
              class="alleluia-verse"
              v-html="formatText(section.data.verse || section.data.text)"
            ></div>
            <div class="alleluia-acclamation alleluia-acclamation--closing">
              <strong class="alleluia-acclamation__label">Акламацыя:</strong>
              <span>{{ section.data.acclamation || 'Аллелюя, аллелюя, аллелюя.' }}</span>
            </div>
          </template>

          <template v-else-if="section.kind === 'gospel'">
            <div v-if="section.data.comment" class="section-comment">{{ section.data.comment }}</div>
            <div v-if="section.data.title" class="reading-rubric gospel-rubric">
              {{ section.data.title }}
            </div>
            <div v-if="section.data.passion?.blocks?.length" class="passion" data-testid="passion">
              <template v-for="(block, index) in section.data.passion.blocks" :key="index">
                <h4 v-if="block.type === 'heading'" class="passion__heading">{{ block.text }}</h4>
                <p v-else-if="block.type === 'rubric'" class="reading-rubric reading-rubric--liturgical">{{ block.text }}</p>
                <p v-else class="section-text passion__paragraph">
                  <template v-for="(run, runIndex) in block.runs" :key="runIndex">
                    <span class="passion__role" :class="`passion__role--${run.role}`" :title="roleTitle(run.role)">{{ roleMarker(run.role) ? `${roleMarker(run.role)} ` : '' }}</span>
                    <span class="passion__run" :class="`passion__run--${run.role}`">{{ run.text }}</span>
                    {{ ' ' }}
                  </template>
                </p>
              </template>
            </div>
            <div v-else-if="section.data.text" v-reader-prose class="section-text" v-html="formatText(section.data.text, section.data.italicLines)"></div>
            <div v-if="conclusionOf(section.data, 'Гэта слова Пана.')" class="reading-acclamation">
              {{ conclusionOf(section.data, 'Гэта слова Пана.') }}
            </div>
          </template>

          <template v-else>
            <div v-if="section.data.text" class="section-text" v-html="formatText(section.data.text)"></div>
          </template>
        </template>
      </section>
    </div>

    <div v-if="!hasSections && !reading._referenceOnly" class="no-content text-grey">
      Тэкст чытання недаступны
    </div>
    <Teleport to=".v-application">
      <aside v-if="settings.readingHighlightsEnabled && selected.size" class="reading-highlight-bar" aria-label="Колер вылучэння">
        <button v-for="color in BIBLE_HIGHLIGHT_COLORS" :key="color.id" type="button"
          class="reading-color-button" :data-color="color.id" :aria-label="color.label" @click="applyHighlight(color.id)"></button>
        <button type="button" aria-label="Прыбраць вылучэнне" @click="applyHighlight(null)">Сцерці</button>
        <button type="button" aria-label="Скасаваць выбар" @click="selected = new Set()">✕</button>
      </aside>
    </Teleport>
  </article>
</template>

<script setup>
import { vReaderProse } from '@/directives/readerProse';
import { computed, ref, watch } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { BIBLE_HIGHLIGHT_COLORS } from '@/constants/bible';
import { vReadingHighlights } from '@/directives/readingHighlights';
import { readingHighlightDocumentKey, loadReadingHighlights, saveReadingHighlights } from '@/utils/readingHighlights';
import { formatResponsorialPsalmHtml } from '@/utils/responsorialPsalmHtml';
import { PASSION_ROLES, SECTION_LABELS, sanitizeReadingHtml } from '@/utils/massReadingSets';

const props = defineProps({
  reading: { type: Object, required: true },
});

const settings = useSettingsStore();
const documentKey = computed(() => readingHighlightDocumentKey(props.reading));
const selected = ref(new Set());
const highlights = ref({});
watch(documentKey, key => {
  selected.value = new Set();
  highlights.value = loadReadingHighlights()[key] || {};
}, { immediate: true, flush: 'sync' });
watch(() => settings.readingHighlightsEnabled, () => { selected.value = new Set(); });
const highlightBinding = computed(() => ({
  enabled: settings.readingHighlightsEnabled,
  documentKey: documentKey.value,
  highlights: highlights.value,
  selected: selected.value,
  onSelect(key) {
    const next = new Set(selected.value);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    selected.value = next;
  },
}));
function applyHighlight(color) {
  const next = { ...highlights.value };
  selected.value.forEach(key => {
    if (color) next[key] = color;
    else delete next[key];
  });
  highlights.value = next;
  saveReadingHighlights(documentKey.value, next);
  selected.value = new Set();
}

function readingLabel(key) {
  const number = Number(key.replace('reading', ''));
  if (number === 1) return 'Першае чытанне';
  if (number === 2) return 'Другое чытанне';
  return `Чытанне ${number}`;
}

const LEGACY_KIND = { psalm: 'psalm', alleluia: 'acclamation', gospel: 'gospel', sequence: 'sequence' };

const sections = computed(() => {
  // Structured Mass reading set: ordered sections (rubrics, cycles resolved).
  if (Array.isArray(props.reading._sections)) {
    return props.reading._sections.map((section, index) => ({
      key: `${index}-${section.kind}-${section.role || ''}`,
      kind: section.kind,
      structured: true,
      label: SECTION_LABELS[section.role] || SECTION_LABELS[section.kind] || readingLabel(String(section.role || 'reading1')),
      data: section,
    }));
  }
  const readingKeys = Object.keys(props.reading)
    .filter((key) => /^reading\d+$/.test(key) && props.reading[key])
    .sort((left, right) => Number(left.replace('reading', '')) - Number(right.replace('reading', '')));
  const firstReading = readingKeys.filter((key) => key === 'reading1');
  const laterReadings = readingKeys.filter((key) => key !== 'reading1');
  const ordered = [
    ...firstReading,
    ...(props.reading.psalm ? ['psalm'] : []),
    ...laterReadings,
    ...(props.reading.sequence?.text ? ['sequence'] : []),
    ...(props.reading.alleluia ? ['alleluia'] : []),
    ...(props.reading.gospel ? ['gospel'] : []),
  ];
  return ordered.map((key) => ({
    key,
    kind: key.startsWith('reading') ? 'reading' : LEGACY_KIND[key],
    label: key.startsWith('reading') ? readingLabel(key) : SECTION_LABELS[key],
    data: props.reading[key],
  }));
});

const referenceRows = computed(() => (props.reading._sections || [])
  .filter((section) => section.bible)
  .map((section, index) => ({
    key: `${index}-${section.role || section.kind}`,
    label: SECTION_LABELS[section.role] || SECTION_LABELS[section.kind] || '',
    bible: section.bible,
    alternatives: (section.alternatives || []).map((item) => item.bible).filter(Boolean),
  })));

/**
 * Closing acclamation of a reading: the structured `conclusion` («» = none,
 * e.g. the third reading of the Easter Vigil); legacy text gets the default
 * unless it already ends with it.
 */
function conclusionOf(data, fallback) {
  if (typeof data?.conclusion === 'string') return data.conclusion;
  const body = data?.text || '';
  if (!body || hasAcclamation(body)) return '';
  return fallback;
}

function roleMarker(role) {
  return PASSION_ROLES[role]?.marker || '';
}

function roleTitle(role) {
  return PASSION_ROLES[role]?.label || '';
}

const hasSections = computed(() => sections.value.length > 0);
const BIBLE_REF_LEAD = /^[А-ЯA-Z][а-яa-z]{0,4}\.?\s+\d+[\d\s,.\-–()абвabcABC]*\s*/;

function strippedText(sectionData) {
  const text = sectionData?.text;
  if (!text || !sectionData?.bible) return text || '';
  const bibleEsc = String(sectionData.bible).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const cleaned = String(text).replace(new RegExp(`^${bibleEsc}\\s*`), '');
  if (cleaned !== text) return cleaned.trim();
  const withoutLead = String(text).replace(BIBLE_REF_LEAD, '').trim();
  return withoutLead !== text ? withoutLead : text;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatText(text, italicLines = []) {
  if (!text) return '';
  if (/<[a-z][\s\S]*>/i.test(text)) return sanitizeReadingHtml(text);
  return String(text)
    .split(/\n{2,}/)
    .map((paragraph) => {
      const safe = paragraph.split('\n').map((line) => {
        const escaped = escapeHtml(line);
        return italicLines.includes(line) ? `<em>${escaped}</em>` : escaped;
      }).join('<br>');
      const className = /^Гэта слова (?:Пана|Божае)\.?$/i.test(paragraph.trim())
        ? ' class="reading-acclamation"'
        : '';
      return `<p${className}>${safe}</p>`;
    })
    .join('');
}

function formatPsalmText(text) {
  return formatResponsorialPsalmHtml(formatText(text));
}

function hasAcclamation(text) {
  return /Гэта\s+слова\s+(?:Пана|Божае)\.?/iu.test(
    String(text || '').replace(/<[^>]*>/g, ' '),
  );
}

function cleanChorus(value) {
  return String(value || '').replace(/^Рэфрэн\s*:\s*/i, '').trim();
}

function cycleLabel(value) {
  if (String(value) === '1') return 'I';
  if (String(value) === '2') return 'II';
  return value;
}
</script>

<style scoped>
.parsed-reading {
  margin: 0;
  overflow: hidden;
  border: 1px solid var(--reader-border);
  border-radius: 28px;
  background: var(--reader-surface);
  color: var(--reader-ink);
  box-shadow: var(--reader-shadow);
  font-family: var(--reader-font-family);
}

.reading-header {
  position: relative;
  padding: 24px 20px 22px;
  border-bottom: 1px solid var(--reader-border);
  background:
    radial-gradient(circle at 92% 18%, rgba(var(--reading-period-rgb), 0.13) 0, rgba(var(--reading-period-rgb), 0.13) 44px, transparent 45px),
    linear-gradient(145deg, rgba(var(--reading-period-rgb), 0.08), transparent 62%);
}

.reading-header__eyebrow {
  margin-bottom: 8px;
  color: var(--reading-visible-color);
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}

.reading-day-title {
  max-width: 760px;
  margin: 0;
  color: rgb(var(--v-theme-on-surface));
  font-size: calc(clamp(1.45rem, 5.3vw, 1.86rem) * var(--font-size-multiplier, 1));
  font-family: var(--reader-display-font-family);
  font-weight: 700;
  line-height: 1.28;
  letter-spacing: -0.018em;
}

.reading-cycle-badge {
  display: inline-flex;
  margin-top: 12px;
  padding: 5px 9px;
  border: 1px solid rgba(var(--reading-period-rgb), 0.18);
  border-radius: 999px;
  background: rgba(var(--reading-period-rgb), 0.075);
  color: var(--reading-visible-color);
  font-size: 0.7rem;
  font-weight: 750;
}

.reading-sections {
  padding: 8px 20px 30px;
}

.reading-section {
  padding-block: 30px 2px;
}

.reading-section + .reading-section {
  margin-top: 26px;
  border-top: 1px solid var(--nav-border);
}

.section-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  min-width: 0;
  gap: 18px;
  margin-bottom: 15px;
}

.section-label {
  min-width: 0;
  margin: 0;
  color: var(--reading-visible-color);
  font-size: calc(1rem * var(--font-size-multiplier, 1));
  font-family: var(--reader-display-font-family);
  font-weight: 700;
  line-height: 1.3;
  /* Tracking shrinks as the text grows, so a long label such as
     «Рэспансарыйны псальм» still fits a 320 px card at the largest size. */
  letter-spacing: max(0.04em, calc(0.11em / var(--font-size-multiplier, 1)));
  overflow-wrap: anywhere;
  text-transform: uppercase;
}

.section-ref {
  flex: 0 1 auto;
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--nav-muted);
  font-size: calc(0.78rem * var(--font-size-multiplier, 1));
  font-weight: 700;
  line-height: 1.35;
  text-align: right !important;
}

.section-comment {
  margin: -2px 0 14px;
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: calc(0.82rem * var(--font-size-multiplier, 1));
  font-style: italic;
  line-height: 1.58;
}

.reading-rubric {
  margin-bottom: 17px;
  color: rgb(var(--v-theme-on-surface));
  font-size: calc(1.08rem * var(--font-size-multiplier, 1));
  font-weight: 780;
  line-height: 1.48;
}

.gospel-rubric::first-letter {
  color: var(--reading-visible-color);
}

.section-text,
.alleluia-verse {
  color: var(--reader-ink);
  font-size: calc(1.04rem * var(--font-size-multiplier, 1));
  font-weight: 400;
  font-optical-sizing: auto;
  line-height: 1.78;
  hanging-punctuation: first last;
  hyphens: auto;
  text-wrap: pretty;
}

.section-text :deep(p),
.alleluia-verse :deep(p) {
  margin: 0 0 1.05em;
}

.section-text :deep(p:last-child),
.alleluia-verse :deep(p:last-child) {
  margin-bottom: 0;
}

.reading-acclamation {
  margin-top: 1.35em;
  color: var(--reader-ink);
  /* A sibling of .section-text, so it needs the same scaled size itself. */
  font-size: calc(1.04rem * var(--font-size-multiplier, 1));
  font-weight: 700;
  line-height: 1.78;
}

/* Inside the formatted HTML the parent is already scaled: do not scale twice. */
.section-text :deep(.reading-acclamation),
.alleluia-verse :deep(.reading-acclamation) {
  margin-top: 1.35em;
  font-size: inherit;
  font-weight: 700;
  line-height: inherit;
}

.reading-alternative {
  margin-top: 1.8em;
  padding-top: 1.1em;
  border-top: 1px solid var(--reader-border);
}

.reading-alternative__label {
  margin-bottom: 0.7em;
  color: var(--reading-visible-color);
  font-weight: 750;
}

.reading-alternative__label span {
  margin-left: 0.5em;
  color: var(--nav-muted);
}

.section-text :deep(b),
.section-text :deep(strong) {
  font-weight: 750;
}

.section-text :deep(i),
.section-text :deep(em) {
  color: rgba(var(--v-theme-on-surface), 0.72);
}

.psalm-refrain,
.alleluia-acclamation {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 4px;
  margin: 2px 0 21px;
  padding: 10px 13px;
  border-left: 3px solid var(--reading-visible-color);
  border-radius: 0 12px 12px 0;
  background: rgba(var(--reading-period-rgb), 0.065);
  color: rgb(var(--v-theme-on-surface));
  font-size: calc(1.02rem * var(--font-size-multiplier, 1));
  font-weight: 720;
  line-height: 1.5;
}

/* Keep the responsorial refrain easy to locate without a triple emphasis.
   Scope this Quiet Book experiment to Readings only; do not affect the
   Alleluia card or antiphons in the Liturgy of the Hours. */
.psalm-refrain {
  padding-inline: 16px;
  border-left: 0;
  border-radius: 12px;
  background: rgba(var(--reading-period-rgb), 0.052);
  font-weight: 650;
}

.psalm-refrain__label,
.alleluia-acclamation__label {
  display: block;
  margin: 0;
  color: var(--reading-visible-color);
  font-size: 0.72em;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

/* The accent-coloured label still leads the eye, but no longer shouts. */
.psalm-refrain__label {
  font-weight: 780;
}

.psalm-strophe + .psalm-strophe {
  margin-top: 20px;
}

.psalm-refrain--repeat {
  margin: 15px 0 0;
  padding-block: 7px;
  background: transparent;
}

.psalm-refrain--last,
.psalm-refrain--alternate {
  margin-top: 22px;
  margin-bottom: 0;
}

.psalm-refrain--alternate {
  border-left-color: rgba(var(--v-theme-on-surface), 0.3);
  background: rgba(var(--v-theme-on-surface), 0.035);
}

.psalm-verse-text {
  padding-left: 4px;
}

.psalm-verse-text :deep(.psalm-marker) {
  color: var(--rubric-color);
}

.alleluia-acclamation {
  margin: 2px 0 20px;
}

.alleluia-acclamation--closing {
  margin: 21px 0 0;
}

.alleluia-verse {
  color: rgb(var(--v-theme-on-surface));
  font-style: normal;
}

.reading-set-meta {
  display: grid;
  gap: 4px;
  padding: 14px 20px 0;
}

.reading-set-meta__label {
  color: var(--reading-visible-color);
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.reading-set-meta__note,
.reading-rubric--liturgical {
  color: var(--reading-visible-color);
  font-style: italic;
  line-height: 1.5;
}

.reading-section--rubric-only {
  padding-block: 14px 0;
}

.reading-reference-only {
  padding: 20px;
}

.reading-reference-only__notice {
  margin: 0 0 12px;
  color: var(--nav-muted);
}

.reading-reference-only__list {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 8px 16px;
  margin: 0;
}

.reading-reference-only__list dt {
  color: var(--reading-visible-color);
  font-weight: 700;
}

.reading-reference-only__list dd {
  margin: 0;
}

.passion__heading {
  margin: 18px 0 8px;
  color: var(--reading-visible-color);
  font-size: 0.95rem;
  font-style: italic;
  font-weight: 600;
}

.passion__role {
  color: var(--reading-visible-color);
  font-weight: 800;
}

.passion__run--christ {
  font-weight: 600;
}

.passion__run--crowd {
  font-style: italic;
}

.no-content {
  padding: 28px;
  font-size: 0.9rem;
}

@media (max-width: 600px) {
  .parsed-reading {
    margin-inline: 0;
    border-inline: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .reading-header {
    padding: 21px 16px 19px;
  }

  .reading-sections {
    padding: 4px 16px 26px;
  }

  .reading-section {
    padding-top: 26px;
  }

  .section-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 13px;
  }

  .section-ref {
    width: 100%;
    text-align: left !important;
  }
}

@media (max-width: 359px) {
  .reading-header,
  .reading-sections {
    padding-inline: 12px;
  }

  .section-text,
  .alleluia-verse {
    line-height: 1.7;
  }
}
</style>

<style>
/* Generated sentence fragments do not carry Vue scoped-style attributes. */
.parsed-reading--highlighting { margin-bottom: 80px; }
.reading-sentence { cursor: pointer; border-radius: 3px; }
.reading-sentence[data-color="amber"] { background: rgba(226, 174, 52, 0.3); }
.reading-sentence[data-color="rose"] { background: rgba(211, 112, 116, 0.25); }
.reading-sentence[data-color="sky"] { background: rgba(79, 159, 193, 0.25); }
.reading-sentence[data-color="leaf"] { background: rgba(89, 164, 107, 0.25); }
.reading-sentence--selected { outline: 1px solid var(--chrome-accent); background: rgba(var(--chrome-accent-rgb), 0.15); }
.reading-sentence:focus-visible { outline: 2px solid var(--chrome-accent); }
.reading-highlight-bar {
  position: fixed; z-index: 100; bottom: calc(84px + env(safe-area-inset-bottom));
  left: 12px; right: 12px; width: max-content; max-width: calc(100% - 24px);
  margin-inline: auto; padding: 8px; display: flex; gap: 3px;
  border: 1px solid var(--nav-border); border-radius: 18px;
  background: var(--overlay-surface); box-shadow: 0 10px 32px var(--nav-shadow);
}
.reading-highlight-bar button { min-width: 44px; min-height: 44px; padding: 4px; color: var(--nav-on-surface); border: 0; border-radius: 50%; cursor: pointer; }
.reading-highlight-bar button:not(.reading-color-button) { background: transparent; }
.reading-color-button[data-color="amber"] { background: #e2ae34; }
.reading-color-button[data-color="rose"] { background: #d37074; }
.reading-color-button[data-color="sky"] { background: #4f9fc1; }
.reading-color-button[data-color="leaf"] { background: #59a46b; }
</style>

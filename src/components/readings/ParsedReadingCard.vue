<template>
  <article class="parsed-reading">
    <header v-if="reading.title" class="reading-header">
      <div class="reading-header__eyebrow">Літургія слова</div>
      <h2 class="reading-day-title">{{ reading.title }}</h2>
      <span v-if="reading.year" class="reading-cycle-badge">
        Цыкл {{ cycleLabel(reading.year) }}
      </span>
    </header>

    <div class="reading-sections">
      <section
        v-for="section in sections"
        :key="section.key"
        class="reading-section"
        :class="`reading-section--${section.key}`"
      >
        <div class="section-heading">
          <h3 class="section-label">{{ section.label }}</h3>
          <div v-if="section.data.bible" class="section-ref">{{ section.data.bible }}</div>
        </div>

        <template v-if="section.key === 'reading1' || section.key === 'reading2'">
          <div v-if="section.data.comment" class="section-comment">{{ section.data.comment }}</div>
          <div v-if="section.data.title" class="reading-rubric">{{ section.data.title }}</div>
          <div
            v-if="strippedText(section.data)"
            class="section-text"
            v-html="formatText(strippedText(section.data))"
          ></div>
        </template>

        <template v-else-if="section.key === 'psalm'">
          <template v-if="section.data.verses?.length">
            <div v-if="section.data.chorus" class="psalm-refrain">
              <span class="psalm-refrain__label">Рэфрэн</span>
              <span>{{ cleanChorus(section.data.chorus) }}</span>
            </div>
            <div v-for="(verse, index) in section.data.verses" :key="index" class="psalm-strophe">
              <div
                class="section-text psalm-verse-text"
                v-html="formatText(typeof verse === 'string' ? verse : (verse.text || ''))"
              ></div>
              <div
                v-if="section.data.chorus && index < section.data.verses.length - 1"
                class="psalm-refrain psalm-refrain--repeat"
              >
                <span class="psalm-refrain__label">Рэфрэн</span>
                <span>{{ cleanChorus(section.data.chorus) }}</span>
              </div>
            </div>
            <div v-if="section.data.altChorus" class="psalm-refrain psalm-refrain--alternate">
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
            v-html="formatText(section.data.text)"
          ></div>
        </template>

        <template v-else-if="section.key === 'alleluia'">
          <div class="alleluia-acclamation">
            <strong class="alleluia-acclamation__label">Акламацыя:</strong>
            <span>Аллелюя, аллелюя, аллелюя.</span>
          </div>
          <div
            v-if="section.data.verse || section.data.text"
            class="alleluia-verse"
            v-html="formatText(section.data.verse || section.data.text)"
          ></div>
          <div class="alleluia-acclamation alleluia-acclamation--closing">
            <strong class="alleluia-acclamation__label">Акламацыя:</strong>
            <span>Аллелюя, аллелюя, аллелюя.</span>
          </div>
        </template>

        <template v-else-if="section.key === 'gospel'">
          <div v-if="section.data.comment" class="section-comment">{{ section.data.comment }}</div>
          <div v-if="section.data.title" class="reading-rubric gospel-rubric">
            {{ section.data.title }}
          </div>
          <div v-if="section.data.text" class="section-text" v-html="formatText(section.data.text)"></div>
        </template>

        <template v-else>
          <div v-if="section.data.text" class="section-text" v-html="formatText(section.data.text)"></div>
        </template>
      </section>
    </div>

    <div v-if="!hasSections" class="no-content text-grey">
      Тэкст чытання недаступны
    </div>
  </article>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  reading: { type: Object, required: true },
});

const SECTION_LABELS = {
  reading1: 'Першае чытанне',
  psalm: 'Рэспансарыйны псальм',
  reading2: 'Другое чытанне',
  alleluia: 'Спеў перад Евангеллем',
  gospel: 'Евангелле',
};

const sections = computed(() =>
  Object.entries(SECTION_LABELS)
    .map(([key, label]) => ({ key, label, data: props.reading[key] }))
    .filter((section) => section.data),
);

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

function formatText(text) {
  if (!text) return '';
  if (/<[a-z][\s\S]*>/i.test(text)) return text;
  return String(text)
    .split(/\n{2,}/)
    .map((paragraph) => {
      const safe = escapeHtml(paragraph).replace(/\n/g, '<br>');
      const className = /^Гэта слова (?:Пана|Божае)\.?$/i.test(paragraph.trim())
        ? ' class="reading-acclamation"'
        : '';
      return `<p${className}>${safe}</p>`;
    })
    .join('');
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
  gap: 18px;
  margin-bottom: 15px;
}

.section-label {
  margin: 0;
  color: var(--reading-visible-color);
  font-size: calc(0.8rem * var(--font-size-multiplier, 1));
  font-family: var(--reader-display-font-family);
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}

.section-ref {
  flex: 0 0 auto;
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

.section-text :deep(.reading-acclamation) {
  margin-top: 1.35em;
  font-weight: 700;
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

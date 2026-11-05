<template>
  <v-container class="document-page proper-calendar-page">
    <main>
      <DocumentBack />
      <h1>{{ calendar.title }}</h1>
      <nav class="document-index" aria-label="Месяцы ўласнага календара">
        <router-link v-for="month in calendar.months" :key="month.id" :to="{ hash: `#${month.id}` }" replace>{{ month.title }}</router-link>
      </nav>
      <article class="proper-calendar" aria-label="Тэкст уласнага календара">
        <section v-for="page in calendar.pages" :key="page.number" :data-page="page.number" class="calendar-page" :aria-label="`Старонка ${page.number} арыгінала`">
          <template v-for="(row, index) in page.rows" :key="index">
            <h2 v-if="row.kind === 'month'" :id="`month-${row.month}`" class="calendar-month">{{ row.text }}</h2>
            <template v-else-if="row.kind === 'intro'">
              <p v-if="index === 0" class="calendar-intro"><DocumentRuns :runs="introRuns" /></p>
            </template>
            <p v-else-if="row.kind === 'note'" class="calendar-note"><DocumentRuns :runs="row.runs" /></p>
            <div v-else class="calendar-row" :class="{ 'calendar-row--full': !row.date && !row.indent, 'calendar-row--empty': row.date && !row.runs.length }" :data-month="row.month" :data-date="row.date">
              <span v-if="row.date" class="calendar-date" :class="`doc-tone--${row.dateTone}`">{{ row.date }}.</span>
              <span class="calendar-text"><DocumentRuns :runs="row.runs" /></span>
              <span v-if="row.rank.length" class="calendar-rank"><DocumentRuns :runs="row.rank" /></span>
            </div>
          </template>
        </section>
      </article>
      <p class="document-original"><a :href="calendar.sourceFile" target="_blank" rel="noopener noreferrer">Арыгінал PDF</a></p>
    </main>
  </v-container>
</template>
<script setup>
import calendar from '@/data/documents/proper-calendar.json';
import DocumentBack from '@/components/DocumentBack.vue';
import DocumentRuns from '@/components/DocumentRuns.vue';
// Keep the five source lines and their styles intact in the document data.
// Only their presentation becomes one logical, naturally wrapping paragraph.
const introRuns = calendar.pages.flatMap(page => page.rows).filter(row => row.kind === 'intro')
  .flatMap((row, index) => [...(index ? [{ ...row.runs[0], text: ' ' }] : []), ...row.runs]);
</script>
<style src="@/styles/documents.css"></style>
<style scoped>
.proper-calendar { font-family: 'Times New Roman', serif; font-size: 1.125rem; line-height: 1.45; }
.calendar-month { margin: 30px 0 16px; color: var(--document-red); text-align: center; font-size: 1.2rem; font-weight: 700; scroll-margin-top: 80px; }
.calendar-intro { margin: 0; }
.calendar-note { margin-top: 8px; }
.calendar-row { display: grid; grid-template-columns: 2rem minmax(0, 1fr) 8.25rem; column-gap: 8px; min-height: 1.5em; }
.calendar-date { grid-column: 1; }
.calendar-text { grid-column: 2; min-width: 0; }
.calendar-rank { grid-column: 3; }
.calendar-row--full .calendar-text { grid-column: 1 / 3; }
.calendar-row--full:not(:has(.calendar-rank)) .calendar-text { grid-column: 1 / -1; }
.calendar-row:not(:has(.calendar-rank)) .calendar-text { grid-column-end: -1; }
@media (max-width: 600px) {
  .calendar-row { grid-template-columns: 1.8rem minmax(0, 1fr); column-gap: 4px; }
  .calendar-row--full .calendar-text { grid-column: 1 / -1; }
  .calendar-rank { grid-column: 2; margin: 2px 0 4px; font-size: 1rem; }
}
</style>

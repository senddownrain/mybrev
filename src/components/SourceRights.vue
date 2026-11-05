<template>
  <div class="source-rights">
    <section v-for="group in groups" :key="group.id" class="source-rights__group" :aria-labelledby="`sources-${group.id}`">
      <h2 :id="`sources-${group.id}`">{{ group.title }}</h2>
      <ul class="source-rights__list">
        <li v-for="source in group.entries" :id="source.id" :key="source.id" class="source-rights__entry">
          <h3>{{ edition(source) }}</h3>
          <p v-if="translation(source)">{{ translation(source) }}</p>
          <p v-for="notice in source.copyrightNotices" :key="notice">{{ notice }}</p>
          <p v-if="source.rightsholder && !source.copyrightNotices.length">{{ source.rightsholder }}</p>
          <details v-if="source.decrees" class="source-rights__decrees">
            <summary>Дэкрэты аб выкарыстанні тэкстаў</summary>
            <ul>
              <li v-for="decree in source.decrees.filter(item => item.status === 'verified')" :key="decree.id">
                <a :href="decree.sourceUrl" target="_blank" rel="noopener noreferrer">Том {{ decree.volume }} — № {{ decree.number }}, {{ decreeDate(decree.date) }}</a>
              </li>
            </ul>
          </details>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup>
import { getSource, SOURCE_REGISTRY } from '@/constants/sources.js';

const bindings = SOURCE_REGISTRY.bindings;
const groups = [
  { id: 'bible', title: 'Святое Пісанне', ids: [bindings.bible.bel.new, bindings.bible.bel.old, bindings.bible.ru.old] },
  { id: 'readings', title: 'Чытанні', ids: bindings.readings },
  { id: 'liturgy-hours', title: 'Літургія гадзінаў', ids: bindings['liturgy-hours'] },
  { id: 'compendium', title: 'Кампендый ККК', ids: bindings.compendium },
].map(group => ({ ...group, entries: group.ids.map(getSource) }));

function edition(source) {
  const details = [source.publicationPlace, source.years].filter(Boolean).join(', ');
  return `«${source.officialEdition}»${details ? ` (${details})` : ''}`;
}

function translation(source) {
  // The Bible reader already has concise, editorial translation names.
  // Institutional descriptions and import/verification notes stay in the registry.
  const label = source.translation.label;
  if (!label || source.officialEdition.includes(label)) return '';
  const short = label.split(' · ').at(-1).replace(`, ${source.years}`, '');
  return short.charAt(0).toUpperCase() + short.slice(1);
}

function decreeDate(date) {
  return date.split('-').reverse().join('.');
}
</script>

<style scoped>
.source-rights { color: var(--nav-on-surface); line-height: 1.55; overflow-wrap: anywhere; }
.source-rights__group + .source-rights__group { margin-top: 22px; }
.source-rights h2 { margin-bottom: 8px; font-size: 1.15rem; font-weight: 650; line-height: 1.35; }
.source-rights h3 { font-size: 1rem; font-weight: 600; line-height: 1.5; }
.source-rights__list { list-style: none; padding: 0; }
.source-rights__entry { scroll-margin-top: 80px; }
.source-rights__entry + .source-rights__entry { margin-top: 14px; }
.source-rights p { margin: 2px 0 0; }
.source-rights a { color: var(--chrome-accent); text-underline-offset: 3px; }
.source-rights__decrees { margin-top: 4px; }
.source-rights summary { cursor: pointer; padding: 8px 0; }
.source-rights__decrees ul { padding-inline-start: 20px; }
.source-rights__decrees li + li { margin-top: 6px; }
.source-rights summary:focus-visible, .source-rights a:focus-visible { outline: 2px solid var(--chrome-accent); outline-offset: 3px; }
</style>

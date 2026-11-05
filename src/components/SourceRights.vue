<template>
  <div class="source-rights">
    <section v-for="group in groups" :key="group.id" class="source-rights__group" :aria-labelledby="`sources-${group.id}`">
      <h2 :id="`sources-${group.id}`">{{ group.title }}</h2>
      <ul class="source-rights__list">
        <li v-for="source in group.entries" :id="source.id" :key="source.id" class="source-rights__entry">
          <h3 v-if="source.translation.label">{{ textLabel(source) }}</h3>
          <p v-if="edition(source) && source.id !== bindings.bible.bel.new" class="source-rights__edition">{{ edition(source) }}</p>
          <p v-for="notice in source.copyrightNotices" :key="notice">{{ notice }}</p>
          <p v-if="source.rightsholder && !source.copyrightNotices.length">{{ source.rightsholder }}</p>
          <router-link v-if="source.decrees" :to="{ name: 'LiturgyHoursDecrees' }" class="source-rights__decrees-link">Дэкрэты аб выкарыстанні тэкстаў</router-link>
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
  if (source.id === bindings.bible.ru.old) return '';
  return `«${source.officialEdition}»${details ? ` (${details})` : ''}`;
}

function textLabel(source) {
  if (source.id === bindings.bible.bel.new) {
    const translator = source.translation.label.split(' · ').at(-1).replace(`, ${source.years}`, '');
    return `${edition(source)} — ${translator}`;
  }
  return source.translation.label.replace(' · ', ' — ').replace(`, ${source.years}`, '');
}

</script>

<style scoped>
.source-rights { color: var(--nav-on-surface); line-height: 1.55; overflow-wrap: anywhere; }
.source-rights__group + .source-rights__group { margin-top: 22px; }
.source-rights h2 { margin-bottom: 12px; font-size: 1.05rem; font-weight: 650; line-height: 1.35; }
.source-rights h3 { font-size: 1rem; font-weight: 500; line-height: 1.5; }
.source-rights__list { list-style: none; padding: 0; }
.source-rights__entry { scroll-margin-top: 80px; }
.source-rights__entry + .source-rights__entry { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--nav-border); }
.source-rights p { margin: 2px 0 0; }
.source-rights a { color: var(--chrome-accent); text-underline-offset: 3px; }
.source-rights__decrees-link { display: inline-block; padding-block: 8px; }
.source-rights a:focus-visible { outline: 2px solid var(--chrome-accent); outline-offset: 3px; }
</style>

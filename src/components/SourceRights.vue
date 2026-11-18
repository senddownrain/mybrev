<template>
  <div class="source-rights">
    <section v-for="section in bibliography.sections" :key="section" class="source-rights__group">
      <h2>{{ section }}</h2>
      <ul class="source-rights__list">
        <li v-for="source in bibliography.entries.filter(entry => entry.section === section && entry.visibleInSources !== false)" :id="source.id" :key="source.id" class="source-rights__entry">
          <p class="source-rights__edition">{{ source.title }}</p>
          <p v-for="detail in source.details || []" :key="detail">{{ detail }}</p>
          <p v-for="notice in source.notices" :key="notice">{{ notice }}</p>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup>
import bibliography from '@/data/sourceBibliography.json' with { type: 'json' };
</script>

<style scoped>
.source-rights { color: var(--nav-on-surface); line-height: 1.55; overflow-wrap: anywhere; }
.source-rights__group + .source-rights__group { margin-top: 26px; }
.source-rights__group h2 { margin-bottom: 14px; font-size: 1.05rem; font-weight: 650; line-height: 1.35; }
.source-rights__list { list-style: none; padding: 0; }
.source-rights__entry { scroll-margin-top: 80px; }
.source-rights__entry + .source-rights__entry { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--nav-border); }
.source-rights p { margin: 2px 0 0; }
.source-rights__edition { font-weight: 500; }
</style>

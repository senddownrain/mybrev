<template>
  <div class="source-rights">
    <ul class="source-rights__list">
      <li v-for="source in bibliography.entries" :id="source.id" :key="source.id" class="source-rights__entry">
        <p class="source-rights__edition">{{ source.title }}</p>
        <p v-for="notice in source.notices" :key="notice">{{ notice }}</p>
      </li>
    </ul>
  </div>
</template>

<script setup>
import bibliography from '@/data/sourceBibliography.json' with { type: 'json' };
</script>

<style scoped>
.source-rights { color: var(--nav-on-surface); line-height: 1.55; overflow-wrap: anywhere; }
.source-rights__list { list-style: none; padding: 0; }
.source-rights__entry { scroll-margin-top: 80px; }
.source-rights__entry + .source-rights__entry { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--nav-border); }
.source-rights p { margin: 2px 0 0; }
.source-rights__edition { font-weight: 500; }
</style>

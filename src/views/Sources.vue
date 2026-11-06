<template>
  <v-container class="sources-page" lang="be">
    <main>
      <router-link :to="{ name: 'About' }" class="sources-back">
        <PhArrowLeft :size="19" aria-hidden="true" />
        Пра праграму
      </router-link>
      <h1>Крыніцы і аўтарскія правы</h1>
      <SourceRights />
      <section class="sources-documents" aria-labelledby="sources-documents-title">
        <h2 id="sources-documents-title">Дакументы</h2>
        <ul>
          <li><router-link :to="{ name: 'LiturgyHoursDecrees' }">Дэкрэты Літургіі гадзінаў</router-link></li>
          <li><router-link :to="{ name: 'LiturgyHoursIntroduction' }">Агульныя ўводзіны да Літургіі гадзінаў</router-link></li>
          <li><router-link :to="{ name: 'ProperCalendar' }">Уласны каляндар дыяцэзій на Беларусі</router-link></li>
        </ul>
      </section>
    </main>
  </v-container>
</template>

<script setup>
import { PhArrowLeft } from '@phosphor-icons/vue';
import SourceRights from '@/components/SourceRights.vue';
</script>

<style scoped>
.sources-page.v-container { width: min(100%, 720px); padding: 12px 20px 36px !important; color: var(--nav-on-surface); }
.sources-page h1 { margin: 10px 0 22px; font-size: clamp(1.4rem, 5vw, 1.8rem); font-weight: 650; line-height: 1.25; }
.sources-back { display: inline-flex; align-items: center; gap: 7px; min-height: 44px; color: var(--chrome-accent); text-decoration: none; }
.sources-back:hover { text-decoration: underline; text-underline-offset: 3px; }
.sources-back:focus-visible { outline: 2px solid var(--chrome-accent); outline-offset: 3px; border-radius: 4px; }
.sources-documents { margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--nav-border); }
.sources-documents h2 { margin-bottom: 6px; font-size: 1.05rem; font-weight: 600; }
.sources-documents ul { list-style: none; padding: 0; }
.sources-documents a { display: inline-block; padding-block: 8px; color: var(--chrome-accent); text-underline-offset: 3px; }
</style>

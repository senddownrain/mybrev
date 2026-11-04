<template>
  <section class="source-rights" aria-labelledby="source-rights-title">
    <h2 id="source-rights-title">Крыніцы і аўтарскія правы</h2>
    <p>Звесткі пра выданні, пераклады і паходжанне лічбавых тэкстаў.</p>
    <article v-for="source in SOURCES" :id="source.id" :key="source.id" class="source-rights__entry" :aria-labelledby="`${source.id}-title`">
      <h3 :id="`${source.id}-title`">{{ source.title }}</h3>
      <p class="source-rights__sections">{{ source.sections.map(id => SOURCE_REGISTRY.sections[id]).join(' · ') }}</p>
      <dl>
        <dt>Выданне</dt>
        <dd>«{{ source.officialEdition }}» ({{ source.publicationPlace || 'месца выдання патрабуе праверкі' }}, {{ source.years || 'год патрабуе праверкі' }})</dd>
        <dt>Праваўладальнік</dt>
        <dd>{{ source.rightsholder || 'Патрабуе праверкі' }}</dd>
        <template v-if="source.copyrightNotices.length">
          <dt>Аўтарскія правы</dt>
          <dd><p v-for="notice in source.copyrightNotices" :key="notice">{{ notice }}</p></dd>
        </template>
        <dt>Пераклад</dt>
        <dd>{{ source.translation.translator || 'Звесткі пра перакладчыкаў патрабуюць праверкі' }}<template v-if="source.translation.edition">. {{ source.translation.edition }}</template></dd>
        <dt>Лічбавыя крыніцы</dt>
        <dd>
          <ul>
            <li v-for="digital in source.digitalSources" :key="digital.url">
              <a :href="digital.url" target="_blank" rel="noopener noreferrer">{{ digital.label }}</a>
              <span v-if="digital.status === 'candidate'"> — паходжанне імпарту патрабуе праверкі</span>
            </li>
          </ul>
        </dd>
      </dl>
      <details v-if="source.decrees" class="source-rights__details">
        <summary>Дэкрэты ККББ аб выкарыстанні тэкстаў</summary>
        <ul>
          <li v-for="decree in source.decrees" :key="decree.id">
            Том {{ decree.volume }}:
            <template v-if="decree.status === 'verified'">
              <a :href="decree.sourceUrl" target="_blank" rel="noopener noreferrer">№ {{ decree.number }}, {{ decree.date }}</a>.
              {{ decree.summary }}
            </template>
            <template v-else>дэкрэт патрабуе дакументальнага пацверджання; нумар і дата не ўстаноўлены.</template>
          </li>
        </ul>
      </details>
      <details class="source-rights__details">
        <summary>Стан праверкі: часткова пацверджана</summary>
        <ul><li v-for="note in source.verification.pending" :key="note">{{ note }}</li></ul>
      </details>
    </article>
    <p class="source-rights__permission">{{ SOURCES[0].digitalPermission.note }}</p>
  </section>
</template>

<script setup>
import { SOURCES, SOURCE_REGISTRY } from '@/constants/sources.js';
</script>

<style scoped>
.source-rights { width: 100%; min-width: 0; margin-top: 32px; color: var(--nav-on-surface); text-align: start; line-height: 1.6; overflow-wrap: anywhere; }
.source-rights h2 { font-size: 1.35rem; line-height: 1.3; }
.source-rights h3 { font-size: 1.12rem; line-height: 1.4; }
.source-rights__entry { padding: 24px 0; border-bottom: 1px solid var(--nav-border); scroll-margin-top: 80px; }
.source-rights__sections { color: var(--nav-muted); margin: 4px 0 14px; }
.source-rights dt { font-weight: 650; margin-top: 10px; }
.source-rights dd { margin: 0; }
.source-rights ul { padding-inline-start: 22px; }
.source-rights a { color: var(--chrome-accent); text-underline-offset: 3px; }
.source-rights__details { margin-top: 12px; }
.source-rights summary { cursor: pointer; padding: 8px 0; }
.source-rights summary:focus-visible, .source-rights a:focus-visible { outline: 2px solid var(--chrome-accent); outline-offset: 3px; }
.source-rights__permission { margin-top: 20px; }
</style>

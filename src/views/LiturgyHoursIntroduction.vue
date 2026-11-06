<template>
  <v-container class="document-page introduction-page" lang="be">
    <main>
      <DocumentBack />
      <article aria-labelledby="introduction-title">
        <header class="introduction-header">
          <p class="introduction-kicker">Літургія гадзінаў</p>
          <h1 id="introduction-title">{{ introduction.title }}</h1>
        </header>
        <nav class="introduction-index" aria-label="Змест старонкі">
          <p>На гэтай старонцы</p>
          <ul>
            <li v-for="section in introduction.sections" :key="section.id">
              <router-link :to="{ hash: `#${section.id}` }" replace>{{ section.title }}</router-link>
            </li>
          </ul>
        </nav>
        <section :id="introduction.sections[0].id" class="introduction-section" aria-labelledby="edition-title">
          <h2 id="edition-title">{{ introduction.sections[0].title }}</h2>
          <p class="document-prose">{{ introduction.editionNote }}</p>
        </section>
        <section :id="introduction.sections[1].id" class="introduction-section" aria-labelledby="full-text-title">
          <h2 id="full-text-title">{{ introduction.sections[1].title }}</h2>
          <p class="document-prose">{{ introduction.readingNote }}</p>
          <p class="introduction-link"><a :href="introduction.fullTextUrl" target="_blank" rel="noopener noreferrer">Чытаць поўны тэкст на lh.catholic.by</a></p>
        </section>
        <section :id="introduction.sections[2].id" class="introduction-section" aria-labelledby="sources-title">
          <h2 id="sources-title">{{ introduction.sections[2].title }}</h2>
          <ul class="introduction-sources">
            <li v-for="source in introduction.sources" :key="source.url"><a :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.label }}</a></li>
          </ul>
        </section>
      </article>
    </main>
  </v-container>
</template>
<script setup>
import introduction from '@/data/documents/liturgy-hours-introduction.json';
import DocumentBack from '@/components/DocumentBack.vue';
</script>
<style src="@/styles/documents.css"></style>
<style scoped>
.introduction-page.v-container { width: min(100%, 760px); }
.introduction-header { margin-block: 28px; }
.introduction-kicker { color: var(--document-red); font-size: .9rem; letter-spacing: .06em; }
.introduction-header h1 { max-width: 24ch; font-family: 'Times New Roman', serif; font-size: clamp(1.8rem, 6vw, 2.5rem); line-height: 1.2; }
.introduction-index { padding-block: 16px; border-block: 1px solid var(--nav-border); }
.introduction-index p { font-size: .85rem; }
.introduction-index ul { display: flex; flex-wrap: wrap; gap: 0 24px; padding: 0; list-style: none; }
.introduction-index a { display: inline-flex; align-items: center; min-height: 44px; }
.introduction-section { margin-top: 32px; scroll-margin-top: 80px; }
.introduction-section h2 { margin-bottom: 14px; color: var(--document-red); font-size: 1.15rem; line-height: 1.4; }
.introduction-section .document-prose { font-family: 'Times New Roman', serif; font-size: 1.125rem; line-height: 1.65; }
.introduction-link { margin-top: 16px; }
.introduction-link a, .introduction-sources a { display: inline-block; padding-block: 8px; }
.introduction-sources { padding-left: 1.1em; }
</style>

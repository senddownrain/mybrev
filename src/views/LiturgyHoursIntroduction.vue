<template>
  <v-container class="document-page introduction-page" lang="be">
    <main>
      <DocumentBack />
      <article aria-labelledby="introduction-title">
        <header class="introduction-header">
          <h1 id="introduction-title" data-source-text>{{ introduction.officialTitle }}</h1>
        </header>
        <nav class="introduction-index" aria-label="Змест Уводзінаў">
          <p>Змест</p>
          <ol>
            <li v-for="chapter in introduction.chapters" :key="chapter.id">
              <router-link :to="{ hash: `#${chapter.id}` }" replace>
                <span class="introduction-index__label">{{ chapter.label }}</span>
                {{ chapter.title }}
                <span class="introduction-index__range">{{ chapter.firstPoint }}–{{ chapter.lastPoint }}</span>
              </router-link>
            </li>
          </ol>
          <ul>
            <li><router-link :to="{ hash: `#${introduction.liturgicalDays.id}` }" replace>{{ introduction.liturgicalDays.title }}</router-link></li>
            <li><router-link :to="{ hash: `#${introduction.precedence.id}` }" replace>{{ introduction.precedence.title }}</router-link></li>
          </ul>
        </nav>

        <section v-for="chapter in introduction.chapters" :id="chapter.id" :key="chapter.id" class="introduction-chapter" :aria-labelledby="`${chapter.id}-title`">
          <h2 :id="`${chapter.id}-title`" data-source-text><span class="chapter-label">{{ chapter.label }}</span>{{ chapter.title }}</h2>
          <details class="chapter-index">
            <summary>Падраздзелы</summary>
            <ul>
              <li v-for="heading in chapter.blocks.filter(block => block.type === 'heading')" :key="heading.id" :class="{ 'chapter-index__subheading': heading.level === 4 }">
                <router-link :to="{ hash: `#${heading.id}` }" replace>{{ heading.text }}</router-link>
              </li>
            </ul>
          </details>
          <template v-for="(block, index) in chapter.blocks" :key="index">
            <component :is="`h${block.level}`" v-if="block.type === 'heading'" :id="block.id" class="introduction-subheading" data-source-text>{{ block.text }}</component>
            <div v-else-if="block.type === 'point'" :id="block.id" class="introduction-point">
              <span class="introduction-point__mark">
                <span class="introduction-point__number" data-source-text>{{ block.number }}.</span>
                <sup v-if="block.number === 177" class="editorial-reference"><router-link :to="{ hash: '#numbering-note-177' }" replace aria-label="Заўвага да нумарацыі пункта 177">†</router-link></sup>
              </span>
              <DocumentTextBlocks :blocks="block.blocks" />
            </div>
            <p v-else-if="block.type === 'paragraph'" class="document-prose introduction-source-note" data-source-text>{{ block.text }}</p>
          </template>
        </section>

        <section :id="introduction.liturgicalDays.id" class="introduction-chapter precedence-table" aria-labelledby="liturgical-days-title">
          <h2 id="liturgical-days-title" data-source-text>{{ introduction.liturgicalDays.title }}</h2>
          <p class="precedence-table__subtitle" data-source-text>{{ introduction.liturgicalDays.subtitle }}</p>
          <p class="document-prose" data-source-text>{{ introduction.liturgicalDays.introduction }}</p>
          <section v-for="group in introduction.liturgicalDays.groups" :key="group.label" class="precedence-group" :aria-label="`Група ${group.label}`">
            <h3 data-source-text>{{ group.label }}</h3>
            <ol class="precedence-list" :start="group.entries[0].number">
              <li v-for="entry in group.entries" :key="entry.number" :value="entry.number" :data-table-number="entry.number">
                <span class="precedence-list__number" data-source-text>{{ entry.number }}.</span>
                <div>
                  <p class="document-prose" data-source-text>{{ entry.text }}</p>
                  <ul v-if="entry.subpoints.length" class="precedence-subpoints">
                    <li v-for="(subpoint, index) in entry.subpoints" :key="index" class="document-prose" data-source-text>{{ subpoint }}</li>
                  </ul>
                </div>
              </li>
            </ol>
          </section>
        </section>
        <section :id="introduction.precedence.id" class="introduction-chapter" aria-labelledby="precedence-title">
          <h2 id="precedence-title" data-source-text>{{ introduction.precedence.title }}</h2>
          <p v-for="(paragraph, index) in introduction.precedence.paragraphs" :key="index" class="document-prose precedence-paragraph" data-source-text>{{ paragraph }}</p>
        </section>

        <footer class="introduction-footer">
          <aside v-for="note in introduction.editorialNotes" :id="note.id" :key="note.id" class="editorial-note" aria-label="Рэдакцыйная заўвага">
            <p>† {{ note.text }} <a :href="note.verificationUrl" target="_blank" rel="noopener noreferrer">Пар. пункт {{ note.point }}</a>.</p>
          </aside>
          <p class="introduction-copyright">© Канферэнцыя Каталіцкіх Біскупаў Беларусі</p>
          <ul class="introduction-sources" aria-label="Крыніцы тэксту">
            <li v-for="source in introduction.sources" :key="source.url"><a :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.label }}</a></li>
          </ul>
        </footer>
      </article>
    </main>
  </v-container>
</template>
<script setup>
import introduction from '@/data/documents/liturgy-hours-introduction.json';
import DocumentBack from '@/components/DocumentBack.vue';
import DocumentTextBlocks from '@/components/DocumentTextBlocks.vue';
</script>
<style src="@/styles/documents.css"></style>
<style scoped>
.introduction-page.v-container { width: min(100%, 800px); }
.introduction-header { margin-block: 32px; }
.introduction-header h1 { font-family: 'Times New Roman', serif; font-size: clamp(1.5rem, 4.5vw, 2rem); line-height: 1.4; text-align: center; }
.introduction-index { padding-block: 20px; border-block: 1px solid var(--nav-border); }
.introduction-index > p { margin-bottom: 8px; font-weight: 600; }
.introduction-index ol, .introduction-index ul, .chapter-index ul { padding: 0; list-style: none; }
.introduction-index a { display: block; padding-block: 8px; line-height: 1.5; font-size: .88rem; }
.introduction-index__label { display: block; font-size: .8rem; font-weight: 600; }
.introduction-index__range { margin-left: .4em; font-size: .82rem; white-space: nowrap; color: var(--nav-muted); }
.introduction-chapter { margin-top: 48px; font-family: 'Times New Roman', serif; font-size: 1.125rem; line-height: 1.65; scroll-margin-top: 80px; }
.introduction-chapter h2 { margin-bottom: 24px; color: var(--document-red); font-size: clamp(1.15rem, 3.8vw, 1.5rem); line-height: 1.45; text-align: center; }
.chapter-label { display: block; margin-bottom: 12px; font-size: .85em; }
.chapter-index { margin-block: 20px 28px; font-family: var(--ui-font-family); font-size: .9rem; line-height: 1.5; }
.chapter-index summary { width: fit-content; min-height: 44px; padding-block: 10px; color: var(--chrome-accent); cursor: pointer; }
.chapter-index a { display: block; padding-block: 8px; }
.chapter-index__subheading { padding-left: 1em; }
.introduction-subheading { margin-block: 32px 18px; color: var(--document-red); line-height: 1.5; scroll-margin-top: 80px; }
h3.introduction-subheading { font-size: 1.05em; }
h4.introduction-subheading { font-size: 1em; font-style: italic; font-weight: 600; }
.introduction-point { display: flow-root; margin-block: 1.1em; scroll-margin-top: 80px; }
.introduction-point__mark { float: left; margin-right: .45em; color: var(--document-red); font-weight: 700; font-variant-numeric: tabular-nums; }
.editorial-reference { display: inline-block; margin-left: .25em; }
.introduction-source-note { margin-top: 24px; }
.precedence-table__subtitle { margin-bottom: 20px; text-align: center; font-style: italic; }
.precedence-group { margin-top: 28px; }
.precedence-group h3 { margin-bottom: 16px; color: var(--document-red); text-align: center; font-size: 1.1em; }
.precedence-list { padding: 0; list-style: none; }
.precedence-list > li { display: grid; grid-template-columns: 1.7em minmax(0, 1fr); column-gap: .4em; margin-block: 1em; }
.precedence-list__number { color: var(--document-red); font-weight: 600; }
.precedence-subpoints { margin-top: .6em; padding-left: .8em; list-style: none; }
.precedence-subpoints > li + li { margin-top: .5em; }
.precedence-paragraph + .precedence-paragraph { margin-top: 1em; }
.introduction-footer { margin-top: 44px; padding-top: 24px; border-top: 1px solid var(--nav-border); font-size: .9rem; line-height: 1.6; }
.editorial-note { margin-bottom: 24px; scroll-margin-top: 80px; }
.introduction-copyright { margin-block: 16px; }
.introduction-sources { display: flex; flex-wrap: wrap; gap: 4px 24px; padding: 0; list-style: none; }
.introduction-sources a { display: inline-block; padding-block: 10px; }
</style>

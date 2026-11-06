<template>
  <v-container class="document-page decrees-page" lang="be">
    <main>
      <DocumentBack />
      <h1>{{ decrees.title }}</h1>
      <nav class="document-index" aria-label="Тамы Літургіі гадзінаў">
        <router-link v-for="document in decrees.documents" :key="document.id" :to="{ hash: `#${document.id}` }" replace>Том {{ document.roman }}</router-link>
        <router-link :to="{ hash: '#apostolic-see' }" replace>Дэкрэты Апостальскай Сталіцы</router-link>
      </nav>
      <article v-for="document in decrees.documents" :id="document.id" :key="document.id" class="decree" :aria-labelledby="`${document.id}-title`">
        <h2 :id="`${document.id}-title`">Том {{ document.roman }}</h2>
        <div class="decree__issuer"><div v-for="line in document.issuer" :key="line">{{ line }}</div></div>
        <p class="decree__number">№ {{ document.number }}</p>
        <h3>{{ document.heading }}</h3>
        <p v-for="paragraph in document.paragraphs" :key="paragraph" class="decree__paragraph document-prose">{{ paragraph }}</p>
        <div class="decree__date"><div v-for="line in document.dateLines" :key="line">{{ line }}</div></div>
        <div class="decree__signature"><div v-for="line in document.signature" :key="line">{{ line }}</div></div>
      </article>
      <p class="document-original"><a href="https://lh.catholic.by/dekrety.php" target="_blank" rel="noopener noreferrer">Крыніца дэкрэтаў I–III тамоў</a></p>
      <section id="apostolic-see" class="apostolic-decrees" aria-labelledby="apostolic-see-title">
        <h2 id="apostolic-see-title">{{ apostolic.title }}</h2>
        <article v-for="document in apostolic.documents" :id="document.id" :key="document.id" class="apostolic-decree" :aria-labelledby="`${document.id}-title`">
          <h3 :id="`${document.id}-title`">Прат. № {{ document.protocol }}</h3>
          <p class="apostolic-decree__issuer">{{ document.issuer }}</p>
          <p class="apostolic-decree__date"><time :datetime="document.date">{{ document.dateLabel }}</time></p>
        </article>
        <p class="document-prose">{{ apostolic.publicationNote }}</p>
        <p class="document-original"><a :href="apostolic.sourceUrl" target="_blank" rel="noopener noreferrer">Поўныя тэксты двух дэкрэтаў на lh.catholic.by</a></p>
      </section>
    </main>
  </v-container>
</template>
<script setup>
import decrees from '@/data/documents/liturgy-hours-decrees.json';
import apostolic from '@/data/documents/apostolic-see-decrees.json';
import DocumentBack from '@/components/DocumentBack.vue';
</script>
<style src="@/styles/documents.css"></style>
<style scoped>
.decree { padding-block: 24px; border-top: 1px solid var(--nav-border); scroll-margin-top: 80px; font-family: 'Times New Roman', serif; font-size: 1.125rem; line-height: 1.6; }
.decree h2 { margin-bottom: 18px; font-family: var(--reader-font-family); font-size: 1.1rem; }
.decree__issuer { text-align: center; }
.decree__number { margin: 18px 0; }
.decree h3 { margin-block: 20px; text-align: center; font-size: 1.2rem; font-weight: 600; }
.decree__paragraph { margin-bottom: 16px; white-space: pre-line; }
.decree__date { margin-top: 22px; }
.decree__signature { margin-top: 22px; }
.apostolic-decrees { margin-top: 36px; padding-top: 24px; border-top: 1px solid var(--nav-border); scroll-margin-top: 80px; }
.apostolic-decrees h2 { font-size: 1.35rem; line-height: 1.4; }
.apostolic-decree { margin-block: 24px; scroll-margin-top: 80px; }
.apostolic-decree h3 { font-size: 1.1rem; }
.apostolic-decree__issuer { margin-block: 6px; }
.apostolic-decree__date { font-size: .95rem; }
</style>

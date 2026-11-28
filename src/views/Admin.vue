<template>
  <v-container class="admin-home">
    <header class="admin-home__header">
      <p class="admin-home__eyebrow">Адміністраванне</p>
      <h1>Рэдактары літургічных даных</h1>
    </header>

    <div class="admin-home__grid">
      <v-card
        v-for="item in visibleEditors"
        :key="item.title"
        :to="item.to"
        class="admin-home__card"
        elevation="0"
      >
        <v-icon :icon="item.icon" size="30" color="primary" />
        <div>
          <h2>{{ item.title }}</h2>
          <p>{{ item.description }}</p>
        </div>
        <v-icon icon="mdi-arrow-right" class="admin-home__arrow" />
      </v-card>
    </div>
  </v-container>
</template>

<script setup>
import { computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
const auth = useAuthStore();
const feedbackTitle = computed(() => (auth.isSuperAdmin ? 'Усе звароты' : 'Звароты па тэкстах'));
const visibleEditors = computed(() => editors
  .filter((item) => !item.superAdmin || auth.isSuperAdmin)
  .map((item) => (item.feedback ? { ...item, title: feedbackTitle.value, description: auth.isSuperAdmin ? 'Усе паведамленні з Web, Android і iOS, катэгорыі, статусы.' : item.description } : item)));
const editors = [
  { feedback: true, title: 'Звароты па тэкстах', description: 'Паведамленні ад чытачоў: памылкі і прапановы па тэкстах.', icon: 'mdi-message-alert-outline', to: { name: 'AdminFeedback' } },
  { title: 'Доступ для святароў', description: 'Код актывацыі і дазволы зарэгістраваных прылад.', icon: 'mdi-key', to: { name: 'AdminPriestAccess' } },
  { title: 'Асаблівы доступ', description: 'Наборы малітваў, профілі, коды і дазволы прылад.', icon: 'mdi-key', to: { name: 'AdminAccessSets' } },
  { title: 'Аналітыка', description: 'Статыстыка выкарыстання малітоўніка і яго раздзелаў.', icon: 'mdi-chart-box-outline', to: { name: 'AdminAnalytics' }, superAdmin: true },
  { title: 'Стварыць спеў', description: 'Тэкст, акорды і тэгі для пілігрымкавага спеўніка.', icon: 'mdi-music-note', to: { name: 'AdminSongAdd' } },
  { title: 'Спеўнік', description: 'Знайсці спеў і адкрыць яго асобны рэдактар.', icon: 'mdi-playlist-music', to: { name: 'Songs' } },
  {
    title: 'Стварыць чытанне',
    description: 'Стварыць новы дакумент чытанняў у калекцыі readings.',
    icon: 'mdi-book-open-page-variant',
    to: { name: 'AdminParsedReadingEditor', params: { id: 'new' } },
  },
  { title: 'Каталог малітваў', description: 'Пошук і рэдагаванне агульнадаступных малітваў і малітваў з асаблівым доступам.', icon: 'mdi-book-open-variant', to: { name: 'AdminPrayers' } },
  {
    title: 'Стварыць малітву',
    description: 'Стварыць новую малітву ў калекцыі prayers.',
    icon: 'mdi-hands-pray',
    to: { name: 'PrayerAdd' },
  },
  {
    title: 'Чарнавікі малітваў',
    description: 'Закрытыя тэксты: праверыць, выправіць і апублікаваць уручную.',
    icon: 'mdi-file-document-edit-outline',
    to: { name: 'AdminPrayerDrafts' },
  },
  {
    title: 'Навэнны',
    description: 'Трэкер навэнн: парадак дзён, сувязі, даты пачатку, праверка і публікацыя.',
    icon: 'mdi-hands-pray',
    to: { name: 'AdminNovenas' },
  },
  {
    title: 'Катэгорыі малітваў',
    description: 'Праглядзець, дадаць, выдаліць і выбраць катэгорыі па змаўчанні.',
    icon: 'mdi-folder-cog-outline',
    to: { name: 'AdminPrayerCategories' },
  },
  {
    title: 'Каляндар: выключэнні на год',
    description: 'Ручныя пераносы і змены на адзін год, калізіі і пытанні, што патрабуюць праверкі.',
    icon: 'mdi-calendar-alert',
    to: { name: 'AdminYearOverrides' },
  },
];
</script>

<style scoped>
.admin-home {
  width: min(100%, 980px);
  padding: 42px 20px 80px !important;
}

.admin-home__header {
  margin-bottom: 28px;
}

.admin-home__eyebrow {
  margin: 0 0 8px;
  color: var(--nav-muted);
  font-size: 0.75rem;
  font-weight: 750;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}

.admin-home h1,
.admin-home h2,
.admin-home p {
  margin-top: 0;
}

.admin-home__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
}

.admin-home__card {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 18px;
  padding: 22px;
  border: 1px solid var(--nav-border);
  border-radius: 20px;
  background: var(--nav-surface);
}

.admin-home__card h2 {
  margin-bottom: 5px;
  font-size: 1.05rem;
}

.admin-home__card p {
  margin-bottom: 0;
  color: var(--nav-muted);
}

.admin-home__arrow {
  color: var(--nav-muted);
}
</style>

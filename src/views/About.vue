<template>
  <v-container class="about-page">
    <main class="about-card">
      <div class="about-emblem-wrap">
        <img
          src="/maria-menu-logo.svg"
          alt="Герб з выявай Найсвяцейшай Панны Марыі"
          class="about-emblem"
          width="300"
          height="297"
        />
      </div>

      <div class="about-copy">
        <p>
          Парафія Беззаганнага Зачацця<br />
          Найсвяцейшай Панны Марыі,<br />
          г. Мінск, Айцы марыяне
        </p>
        <p class="about-cooperation">у супрацоўніцтве з Камісіяй Божага Культу і Дысцыпліны Сакрамэнтаў пры Канферэнцыі Каталіцкіх Біскупаў Беларусі</p>
        <a href="https://www.mic-minsk.by" target="_blank" rel="noopener noreferrer">
          www.mic-minsk.by
        </a>
        <p class="about-developer">
        Распрацоўшчык: <a href="https://t.me/davin_dev" target="_blank" rel="noopener noreferrer" aria-label="Глеб Шаршнёў — Telegram">Глеб Шаршнёў</a>
      </p>
      </div>

      <router-link :to="{ name: 'Sources' }" class="about-sources">
        <PhBookOpen :size="20" aria-hidden="true" />
        <span>Крыніцы і аўтарскія правы</span>
        <PhCaretRight :size="17" aria-hidden="true" />
      </router-link>
      <p class="about-privacy"><a href="/privacy">Палітыка прыватнасці</a></p>
      <p class="about-version">Версія: {{ appVersion }}</p>
    </main>
  </v-container>
</template>

<script setup>
import { version as appVersion } from '../../package.json';
import { PhBookOpen, PhCaretRight } from '@phosphor-icons/vue';
</script>

<style scoped>
.about-page {
  display: grid;
  width: min(100%, 780px);
  min-height: calc(100dvh - 156px);
  padding: 12px 18px 36px;
  place-items: center;
}

.about-card {
  display: flex;
  width: min(100%, 540px);
  min-height: min(650px, calc(100dvh - 190px));
  flex-direction: column;
  align-items: center;
  padding: clamp(28px, 7vw, 50px) clamp(22px, 7vw, 48px) 30px;
  border: 1px solid var(--nav-border);
  border-radius: 28px;
  background: var(--reader-surface);
  box-shadow: var(--reader-shadow);
  text-align: center;
}

.about-emblem-wrap {
  display: grid;
  width: min(78vw, 300px);
  aspect-ratio: 1;
  place-items: center;
}

.about-emblem {
  display: block;
  width: 100%;
  height: auto;
  filter: drop-shadow(0 12px 22px var(--nav-button-shadow));
}

.about-copy {
  margin-top: clamp(24px, 5vw, 38px);
  color: var(--nav-on-surface);
  font-size: clamp(1rem, 3.8vw, 1.16rem);
  line-height: 1.5;
}

.about-copy p {
  margin: 0 0 4px;
}

.about-cooperation {
  margin: 6px 0 10px !important;
  color: var(--nav-muted);
  font-size: 0.74em;
  font-weight: 400;
  line-height: 1.4;
}

.about-copy a {
  color: var(--chrome-accent);
  font-weight: 650;
  text-underline-offset: 3px;
}

.about-developer {
  margin: 22px 0 0;
  color: var(--nav-muted);
  font-size: 0.9em;
}

.about-developer a {
  color: inherit;
  font-weight: inherit;
  text-decoration: underline;
  text-decoration-color: currentColor;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}

.about-developer a:focus-visible {
  outline: 2px solid var(--chrome-accent);
  outline-offset: 3px;
  border-radius: 2px;
}

.about-privacy {
  margin: 18px 0 0;
  font-size: 0.96rem;
}

.about-sources {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 22px;
  min-height: 44px;
  color: var(--chrome-accent);
  font-size: 0.96rem;
  font-weight: 650;
  text-decoration: none;
}

.about-sources svg { flex-shrink: 0; }
.about-sources:hover span { text-decoration: underline; text-underline-offset: 3px; }
.about-sources:focus-visible { outline: 2px solid var(--chrome-accent); outline-offset: 4px; border-radius: 4px; }

.about-privacy a {
  color: var(--chrome-accent);
  font-weight: 650;
  text-underline-offset: 3px;
}

.about-version {
  margin: auto 0 0;
  padding-top: 36px;
  color: var(--nav-muted);
  font-size: 0.9rem;
  font-weight: 650;
  letter-spacing: 0.01em;
}

@media (max-width: 560px) {
  .about-page {
    min-height: calc(100dvh - 142px);
    padding: 8px 14px 28px !important;
  }

  .about-card {
    min-height: calc(100dvh - 172px);
    border-radius: 24px;
  }
}
</style>

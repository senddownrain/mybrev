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
        <a href="https://www.mic-minsk.by" target="_blank" rel="noopener noreferrer">
          www.mic-minsk.by
        </a>
        <p class="about-developer">Распрацоўшчык @davin_dev</p>
      </div>

      <p class="about-version">Версія: {{ appVersion }}</p>
    </main>
  </v-container>
</template>

<script setup>
import { version as appVersion } from '../../package.json';
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

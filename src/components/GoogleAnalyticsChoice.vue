<template>
  <section v-if="googleAnalyticsAvailable && (settings || googleAnalyticsChoice === null || googleAnalyticsChoiceError)"
    :class="['analytics-choice', { 'analytics-choice--banner': !settings }]" aria-label="Статыстыка выкарыстання">
    <div>
      <strong>Статыстыка выкарыстання</strong>
      <p>Дапамажыце палепшыць праграму: дазвольце Google Analytics збіраць агульную статыстыку наведванняў і тэхнічныя даныя. Гэта неабавязкова і не ўплывае на карыстанне малітоўнікам.</p>
      <a href="/privacy.html" target="_blank" rel="noopener noreferrer">Палітыка прыватнасці</a>
    </div>
    <div v-if="settings" class="analytics-choice-actions">
      <span role="status">{{ googleAnalyticsChoice === 'granted' ? 'Дазволена' : 'Не дазволена' }}</span>
      <button type="button" @click="setGoogleAnalyticsChoice(googleAnalyticsChoice !== 'granted')">
        {{ googleAnalyticsChoice === 'granted' ? 'Адключыць' : 'Дазволіць' }}
      </button>
    </div>
    <div v-else class="analytics-choice-actions">
      <button type="button" @click="setGoogleAnalyticsChoice(false)">Не дазваляць</button>
      <button type="button" @click="setGoogleAnalyticsChoice(true)">Дазволіць</button>
    </div>
    <p v-if="googleAnalyticsChoiceError" role="alert">Не ўдалося захаваць выбар. Збор у гэтай укладцы спынены. Ачысціце даныя сайта ў браўзеры, каб скінуць выбар ва ўсіх укладках.</p>
  </section>
</template>

<script setup>
import { googleAnalyticsAvailable, googleAnalyticsChoice, googleAnalyticsChoiceError, setGoogleAnalyticsChoice } from '@/utils/googleAnalyticsConsent.js';
defineProps({ settings: Boolean });
</script>

<style scoped>
.analytics-choice { padding: 12px 16px; border: 1px solid var(--nav-border, #b8a38a); border-radius: 12px; color: var(--nav-on-surface, CanvasText); background: var(--app-viewport-background, Canvas); font: .88rem/1.45 system-ui, sans-serif; }
.analytics-choice--banner { position: fixed; z-index: 20; top: max(12px, env(safe-area-inset-top)); right: 12px; width: min(400px, calc(100% - 24px)); box-shadow: 0 4px 18px #0002; }
.analytics-choice p { margin: 6px 0; }
.analytics-choice a { color: inherit; text-decoration: underline; }
.analytics-choice-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 10px; }
.analytics-choice button { color: inherit; background: transparent; border: 1px solid currentColor; border-radius: 8px; padding: 8px 12px; font: inherit; cursor: pointer; }
.analytics-choice button:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
</style>

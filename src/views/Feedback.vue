<template>
  <v-container class="feedback-page">
    <header class="feedback-hero">
      <div class="feedback-eyebrow">Зваротная сувязь</div>
      <h1>{{ context ? 'Паведаміць пра памылку' : 'Напісаць нам' }}</h1>
      <p>Уваход не патрэбны. Мы чытаем кожнае паведамленне.</p>
    </header>

    <v-alert v-if="!configured" type="info" variant="tonal" density="compact" data-test="feedback-not-configured">
      Адпраўка пакуль не падключана. Паведамленне не будзе страчана, але і не будзе адпраўлена.
    </v-alert>
    <v-alert v-else-if="offline && !sent" type="warning" variant="tonal" density="compact" data-test="feedback-offline">
      Няма сеткі. Можна напісаць цяпер — адправіце, калі злучэнне вернецца.
    </v-alert>

    <section v-if="sent" class="feedback-success" data-test="feedback-success" role="status">
      <PhCheckCircle :size="36" weight="duotone" aria-hidden="true" />
      <h2>Дзякуй! Паведамленне прынята.</h2>
      <p class="feedback-id">
        Нумар звароту
        <code data-test="feedback-id">{{ sent }}</code>
      </p>
      <div class="feedback-success-actions">
        <v-btn variant="tonal" class="text-none" data-test="feedback-copy" @click="copyId">{{ copied ? 'Скапіявана' : 'Скапіяваць нумар' }}</v-btn>
        <v-btn color="primary" class="text-none" data-test="feedback-return" @click="goBack">Вярнуцца да чытання</v-btn>
        <v-btn variant="text" class="text-none" data-test="feedback-again" @click="writeAnother">Напісаць яшчэ</v-btn>
      </div>
    </section>

    <form v-else class="feedback-form" novalidate @submit.prevent="send">
      <fieldset>
        <legend>Што вы хочаце паведаміць?</legend>
        <div class="feedback-categories" role="radiogroup" aria-label="Тып звароту">
          <button v-for="c in categories" :key="c.value" type="button" role="radio" :aria-checked="category === c.value"
            :class="{ active: category === c.value }" data-test="feedback-category" @click="category = c.value">{{ c.label }}</button>
        </div>
      </fieldset>

      <div v-if="context" class="feedback-context" data-test="feedback-context">
        <PhFlag :size="16" aria-hidden="true" />
        <span class="feedback-context-text">{{ summary }}</span>
        <button type="button" class="feedback-context-remove" aria-label="Прыбраць кантэкст" data-test="feedback-context-remove" @click="context = null"><PhX :size="14" /></button>
      </div>

      <label for="fb-body">Ваша паведамленне</label>
      <textarea id="fb-body" v-model="body" rows="6" :maxlength="max" data-test="feedback-body" :aria-invalid="!!bodyError" @input="bodyError = ''" />
      <div class="feedback-meta"><span class="feedback-error" role="alert">{{ bodyError }}</span><span>{{ body.length }} / {{ max }}</span></div>

      <label for="fb-email">Email для адказу <span class="feedback-optional">неабавязкова</span></label>
      <input id="fb-email" v-model="email" type="email" autocomplete="email" inputmode="email" data-test="feedback-email" :aria-invalid="!!emailError" @input="emailError = ''" />
      <div class="feedback-error" role="alert">{{ emailError }}</div>

      <p class="feedback-hint">Не ўказвайце асабістыя даныя, якія не патрэбныя для звароту. Email бачыць толькі галоўны адміністратар.</p>
      <details class="feedback-privacy">
        <summary>Якія даныя адпраўляюцца</summary>
        <p>Адпраўляюцца: тып звароту, тэкст паведамлення, платформа і версія праграмы, бачны вам кантэкст матэрыялу (калі не прыбралі) і email, калі вы яго ўказалі. Не адпраўляюцца: IP-адрас, гісторыя чытання, налады, ідэнтыфікатары прылады. Звароты захоўваюцца, пакуль апрацоўваюцца, і выдаляюцца праз 180 дзён пасля закрыцця. Каб выдаліць свой зварот раней, напішыце з тым жа email. Падрабязней — у <a href="/privacy">палітыцы прыватнасці</a>.</p>
      </details>

      <v-alert v-if="errorText" type="error" variant="tonal" density="compact" class="mb-3" data-test="feedback-error">{{ errorText }}</v-alert>
      <v-btn type="submit" color="primary" size="large" block class="text-none" :loading="sending" :disabled="sending || !configured" data-test="feedback-submit">{{ errorText ? 'Паспрабаваць яшчэ раз' : 'Адправіць' }}</v-btn>
    </form>
  </v-container>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { PhCheckCircle, PhFlag, PhX } from '@phosphor-icons/vue';
import { FEEDBACK_CATEGORIES, MAX_FEEDBACK_LENGTH, feedbackBaseUrl, submitFeedback } from '@/utils/feedbackApi';
import { attemptRequestId, contextFromQuery, contextSummary, resetAttempt } from '@/utils/feedbackContext';
import { useSettingsStore } from '@/stores/settings.js';

const route = useRoute();
const router = useRouter();
const settings = useSettingsStore();
const categories = FEEDBACK_CATEGORIES;
const max = MAX_FEEDBACK_LENGTH;
const configured = computed(() => Boolean(feedbackBaseUrl()));
// A text error report from a page is the common case; the settings entry has no context and starts neutral.
const startContext = contextFromQuery(route.query, { diocese: settings.dioceses?.[0], lang: 'be' });
const category = ref(startContext ? 'text_error' : 'other');
const body = ref('');
const email = ref('');
const bodyError = ref('');
const emailError = ref('');
const errorText = ref('');
const sending = ref(false);
const sent = ref('');
const copied = ref(false);
const offline = ref(typeof navigator !== 'undefined' && navigator.onLine === false);
const context = ref(startContext);
const summary = computed(() => contextSummary(context.value));
// Same message => same id (a double tap or a manual retry never duplicates); an edited message => a new id.
const attempt = reactive({ id: '', key: '' });

const setOffline = () => { offline.value = true; };
const setOnline = () => { offline.value = false; };
onMounted(() => { window.addEventListener('offline', setOffline); window.addEventListener('online', setOnline); });
onBeforeUnmount(() => { window.removeEventListener('offline', setOffline); window.removeEventListener('online', setOnline); });

const ERRORS = {
  429: 'Занадта шмат спроб. Пачакайце хвіліну і націсніце «Адправіць» яшчэ раз.',
  503: 'Сервіс часова недаступны. Тэкст захаваны на экране — паспрабуйце пазней.',
  413: 'Паведамленне занадта вялікае.',
};

async function send() {
  if (sending.value) return;
  bodyError.value = ''; emailError.value = ''; errorText.value = '';
  const text = body.value.trim();
  if (text.length < 3) { bodyError.value = 'Напішыце хаця б некалькі слоў.'; return; }
  if (email.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim())) { emailError.value = 'Праверце адрас email.'; return; }
  sending.value = true;
  const payload = {
    category: category.value, platform: 'web', appVersion: String(import.meta.env.VITE_APP_VERSION || '4.5.2'),
    body: text, email: email.value.trim() || undefined, context: context.value || undefined,
  };
  try {
    let result;
    try {
      result = await submitFeedback({ ...payload, requestId: attemptRequestId(attempt, payload) });
    } catch (e) {
      if (e.code !== 'request_id_reused') throw e;
      resetAttempt(attempt); // defensive: the Worker saw this id with other text; start a fresh message id once
      result = await submitFeedback({ ...payload, requestId: attemptRequestId(attempt, payload) });
    }
    sent.value = result.id;
    body.value = '';
    resetAttempt(attempt);
  } catch (e) {
    errorText.value = ERRORS[e.status] || (e.code === 'network' || e.status === 0 ? 'Няма сеткі. Тэкст захаваны — націсніце «Паспрабаваць яшчэ раз», калі злучэнне вернецца.' : 'Не атрымалася адправіць. Тэкст захаваны, паспрабуйце яшчэ раз.');
  } finally { sending.value = false; }
}

async function copyId() {
  try { await navigator.clipboard.writeText(sent.value); copied.value = true; setTimeout(() => { copied.value = false; }, 2000); } catch { copied.value = false; }
}
function goBack() {
  if (window.history.state?.back) router.back();
  else router.push(startContext?.path || '/');
}
function writeAnother() { sent.value = ''; copied.value = false; context.value = null; category.value = 'other'; }
</script>

<style scoped>
.feedback-page { width: min(100%, 640px); padding: 24px 16px 80px !important; }
.feedback-hero h1 { margin: 4px 0 6px; font-size: clamp(1.5rem, 5vw, 1.9rem); }
.feedback-hero p { margin: 0 0 12px; opacity: .8; }
.feedback-eyebrow { font-size: .75rem; text-transform: uppercase; letter-spacing: .08em; opacity: .65; }
.feedback-form { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; margin-top: 12px; }
fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
legend, label { font-weight: 600; margin: 10px 0 6px; font-size: .95rem; }
.feedback-optional { font-weight: 400; opacity: .65; font-size: .85rem; margin-left: 4px; }
/* One scrollable row on phones, wrapping on wider screens; equal height, large touch targets. */
.feedback-categories { display: flex; gap: 8px; overflow-x: auto; scroll-snap-type: x proximity; scroll-padding-inline: 16px; padding-bottom: 4px; margin: 0 -16px; padding-inline: 16px; scrollbar-width: none; }
.feedback-categories::-webkit-scrollbar { display: none; }
.feedback-categories button { flex: 0 0 auto; min-height: 44px; padding: 0 16px; border-radius: 999px; border: 1px solid var(--nav-border, #bbb); background: transparent; color: inherit; scroll-snap-align: start; white-space: nowrap; font: inherit; font-size: .92rem; }
.feedback-categories button.active { border-color: rgb(var(--v-theme-primary)); background: color-mix(in srgb, rgb(var(--v-theme-primary)) 14%, transparent); font-weight: 600; }
@media (min-width: 560px) { .feedback-categories { flex-wrap: wrap; overflow: visible; margin: 0; padding-inline: 0; } }
textarea, input { box-sizing: border-box; width: 100%; max-width: 100%; padding: 12px; border: 1px solid var(--nav-border, #bbb); border-radius: 12px; background: transparent; color: inherit; font: inherit; }
textarea:focus-visible, input:focus-visible, .feedback-categories button:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.feedback-context { display: flex; align-items: center; gap: 8px; padding: 6px 8px 6px 12px; border-radius: 999px; background: color-mix(in srgb, currentColor 6%, transparent); font-size: .88rem; max-width: 100%; }
.feedback-context-text { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.feedback-context-remove { flex: 0 0 auto; width: 32px; height: 32px; border: 0; border-radius: 50%; background: transparent; color: inherit; display: inline-grid; place-items: center; }
.feedback-meta { display: flex; justify-content: space-between; font-size: .82rem; opacity: .75; }
.feedback-error { color: rgb(var(--v-theme-error)); font-size: .88rem; min-height: 1.2em; }
.feedback-hint, .feedback-privacy { font-size: .88rem; opacity: .85; }
.feedback-success { display: grid; gap: 8px; justify-items: center; text-align: center; margin-top: 16px; padding: 28px 16px; border-radius: 20px; background: color-mix(in srgb, rgb(var(--v-theme-primary)) 8%, transparent); }
.feedback-success h2 { margin: 0; font-size: 1.25rem; }
.feedback-id { margin: 0; display: grid; gap: 4px; font-size: .88rem; opacity: .9; }
.feedback-id code { font-size: .8rem; padding: 6px 10px; border-radius: 10px; background: color-mix(in srgb, currentColor 8%, transparent); overflow-wrap: anywhere; user-select: all; }
.feedback-success-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 8px; }
</style>

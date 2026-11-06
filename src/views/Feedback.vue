<template>
  <v-container class="feedback-page">
    <header class="feedback-hero">
      <div class="feedback-eyebrow">Налады</div>
      <h1>Зваротная сувязь</h1>
      <p>Знайшлі памылку ў тэксце або маеце прапанову? Напішыце нам — уваход не патрэбны.</p>
    </header>

    <v-alert v-if="!configured" type="info" variant="tonal" data-test="feedback-not-configured">
      Адпраўка пакуль не падключана. Паведамленне не будзе страчана, але і не будзе адпраўлена.
    </v-alert>

    <v-alert v-if="sent" type="success" variant="tonal" data-test="feedback-success" class="mb-4">
      Дзякуй! Паведамленне прынята. Нумар звароту: <strong>{{ sent }}</strong>
    </v-alert>

    <form v-else class="feedback-form" novalidate @submit.prevent="send">
      <fieldset>
        <legend>Што вы хочаце паведаміць?</legend>
        <div class="feedback-categories" role="radiogroup" aria-label="Тып звароту">
          <button v-for="c in categories" :key="c.value" type="button" role="radio" :aria-checked="category === c.value"
            :class="{ active: category === c.value }" data-test="feedback-category" @click="category = c.value">{{ c.label }}</button>
        </div>
      </fieldset>

      <div v-if="context" class="feedback-context" data-test="feedback-context">
        <div><strong>Кантэкст:</strong> {{ summary }}</div>
        <v-btn size="small" variant="text" class="text-none" @click="context = null">Прыбраць</v-btn>
      </div>

      <label for="fb-body">Ваша паведамленне</label>
      <textarea id="fb-body" v-model="body" rows="6" :maxlength="max" data-test="feedback-body" :aria-invalid="!!bodyError" @input="bodyError = ''" />
      <div class="feedback-meta"><span class="feedback-error" role="alert">{{ bodyError }}</span><span>{{ body.length }} / {{ max }}</span></div>

      <label for="fb-email">Email для адказу (неабавязкова)</label>
      <input id="fb-email" v-model="email" type="email" autocomplete="email" inputmode="email" data-test="feedback-email" :aria-invalid="!!emailError" @input="emailError = ''" />
      <div class="feedback-error" role="alert">{{ emailError }}</div>

      <p class="feedback-hint">Не ўказвайце асабістыя даныя, якія не патрэбныя для звароту. Email бачыць толькі галоўны адміністратар.</p>
      <details class="feedback-privacy">
        <summary>Якія даныя адпраўляюцца</summary>
        <p>Адпраўляюцца: тып звароту, тэкст паведамлення, платформа і версія праграмы, бачны вам кантэкст матэрыялу (калі не прыбралі) і email, калі вы яго ўказалі. Не адпраўляюцца: IP-адрас, гісторыя чытання, налады, ідэнтыфікатары прылады. Звароты захоўваюцца, пакуль апрацоўваюцца, і выдаляюцца праз 180 дзён пасля закрыцця. Каб выдаліць свой зварот раней, напішыце з тым жа email.</p>
      </details>

      <v-alert v-if="errorText" type="error" variant="tonal" class="mb-3" data-test="feedback-error">{{ errorText }}</v-alert>
      <v-btn type="submit" color="primary" size="large" block class="text-none" :loading="sending" :disabled="sending || !configured" data-test="feedback-submit">Адправіць</v-btn>
    </form>
  </v-container>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { FEEDBACK_CATEGORIES, MAX_FEEDBACK_LENGTH, feedbackBaseUrl, submitFeedback } from '@/utils/feedbackApi';
import { contextFromQuery, contextSummary } from '@/utils/feedbackContext';
import { useSettingsStore } from '@/stores/settings.js';

const route = useRoute();
const settings = useSettingsStore();
const categories = FEEDBACK_CATEGORIES;
const max = MAX_FEEDBACK_LENGTH;
const configured = computed(() => Boolean(feedbackBaseUrl()));
const category = ref('text_error');
const body = ref('');
const email = ref('');
const bodyError = ref('');
const emailError = ref('');
const errorText = ref('');
const sending = ref(false);
const sent = ref('');
const context = ref(contextFromQuery(route.query, { diocese: settings.dioceses?.[0], lang: 'be' }));
const summary = computed(() => contextSummary(context.value));
// One id per composed message: a second tap or a manual retry after a lost response can never create a duplicate.
const requestId = ref(crypto.randomUUID());

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
  try {
    const result = await submitFeedback({
      category: category.value, platform: 'web', appVersion: String(import.meta.env.VITE_APP_VERSION || '4.5.2'),
      body: text, email: email.value.trim() || undefined, context: context.value || undefined, requestId: requestId.value,
    });
    sent.value = result.id;
    body.value = '';
  } catch (e) {
    errorText.value = ERRORS[e.status] || (e.code === 'network' || e.status === 0 ? 'Няма сеткі. Тэкст захаваны — націсніце «Адправіць», калі злучэнне вернецца.' : 'Не атрымалася адправіць. Тэкст захаваны, паспрабуйце яшчэ раз.');
  } finally { sending.value = false; }
}
</script>

<style scoped>
.feedback-page { width: min(100%, 680px); padding: 32px 16px 80px !important; }
.feedback-hero h1 { margin: 4px 0 8px; }
.feedback-eyebrow { font-size: .8rem; text-transform: uppercase; letter-spacing: .08em; opacity: .7; }
.feedback-form { display: grid; gap: 8px; margin-top: 20px; }
fieldset { border: 0; padding: 0; margin: 0; }
legend, label { font-weight: 600; margin: 8px 0 6px; }
.feedback-categories { display: flex; flex-wrap: wrap; gap: 8px; }
.feedback-categories button { min-height: 44px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--nav-border, #bbb); background: transparent; color: inherit; }
.feedback-categories button.active { border-color: rgb(var(--v-theme-primary)); background: color-mix(in srgb, rgb(var(--v-theme-primary)) 14%, transparent); font-weight: 600; }
textarea, input { width: 100%; padding: 12px; border: 1px solid var(--nav-border, #bbb); border-radius: 12px; background: transparent; color: inherit; font: inherit; }
.feedback-context { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 12px; background: color-mix(in srgb, currentColor 6%, transparent); font-size: .92rem; }
.feedback-meta { display: flex; justify-content: space-between; font-size: .85rem; opacity: .8; }
.feedback-error { color: rgb(var(--v-theme-error)); font-size: .88rem; min-height: 1.2em; }
.feedback-hint, .feedback-privacy { font-size: .9rem; opacity: .85; }
</style>

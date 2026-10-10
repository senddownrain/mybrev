<template>
  <section class="settings-section priest-settings" aria-labelledby="priest-access-title" data-sentry-block>
    <h2 id="priest-access-title">Доступ для святароў</h2>
    <template v-if="priestAccess.active">
      <p class="mt-3"><v-icon icon="mdi-key" size="small" /> Доступ актываваны</p>
      <p>Паўторна ўводзіць код не трэба. Доступ дзейнічае, пакуль вы ці адміністратар яго не выключыце.</p>
      <v-btn class="mt-3" variant="tonal" :loading="busy" @click="disable">Выключыць доступ</v-btn>
    </template>
    <v-form v-else class="mt-3" @submit.prevent="activate">
      <v-text-field v-model="code" label="Код актывацыі" type="password" autocomplete="off" :maxlength="79" />
      <v-text-field v-model="label" label="Назва прылады / імя" hint="Неабавязковы подпіс, не пацвярджэнне асобы" persistent-hint :maxlength="120" />
      <v-btn type="submit" color="primary" :loading="busy" :disabled="!code.trim()">Адкрыць доступ</v-btn>
      <details v-if="priestAccess.helpText" class="mt-4"><summary>Дзе атрымаць код?</summary><p class="help-text">{{ priestAccess.helpText }}</p></details>
    </v-form>
    <v-alert v-if="message" class="mt-4" :type="messageType" variant="tonal" role="status">{{ message }}</v-alert>
    <p class="text-caption mt-4">Закрытыя малітвы даступныя пры злучэнні з інтэрнэтам. Пасля ачысткі даных браўзера, змены профілю або пераўсталявання можа спатрэбіцца новая актывацыя.</p>
  </section>
</template>
<script setup>
import { onMounted, ref } from 'vue';
import { priestAccess, checkPriestAccess, loadPriestHelp, activatePriestAccess, disablePriestAccess } from '@/services/priestAccessService';
const code = ref('');
const label = ref('');
const busy = ref(false);
const message = ref('');
const messageType = ref('error');
onMounted(() => { checkPriestAccess().catch(() => {}); loadPriestHelp(); });
async function activate() {
  busy.value = true;
  message.value = '';
  try { await activatePriestAccess(code.value, label.value); code.value = ''; label.value = ''; }
  catch (error) { messageType.value = 'error'; message.value = error.message; }
  finally { busy.value = false; }
}
async function disable() {
  busy.value = true;
  await disablePriestAccess();
  busy.value = false;
  messageType.value = 'info';
  message.value = 'Доступ выключаны. Калі няма злучэння, сервернае дазволенне будзе адклікана пры наступным падключэнні.';
}
</script>
<style scoped>
.priest-settings p { color: var(--nav-muted); }
.priest-settings { padding: 20px; }
.help-text { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>

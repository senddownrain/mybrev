<template>
  <section class="settings-section priest-settings" aria-labelledby="priest-access-title" data-sentry-block>
    <h2 id="priest-access-title">Асаблівы доступ</h2>
    <template v-if="accessSetsSession.active">
      <p class="mt-3"><v-icon icon="mdi-key" size="small" /> Доступ актываваны</p>
      <p>Паўторна ўводзіць код не трэба.</p>
    </template>
    <v-btn v-if="accessSetsSession.canDisable || accessSetsSession.pendingDisable" class="mt-3"
      variant="tonal" :loading="busy" @click="disable">
      {{ accessSetsSession.pendingDisable ? 'Паўтарыць выключэнне' : 'Выключыць доступ' }}
    </v-btn>
    <v-form v-if="!accessSetsSession.pendingDisable" class="mt-3" @submit.prevent="activate">
      <v-text-field v-model="code" label="Код актывацыі" type="password" autocomplete="off" />
      <v-text-field v-model="label" label="Назва прылады / імя" hint="Неабавязковы подпіс, не пацвярджэнне асобы" persistent-hint :maxlength="120" />
      <v-btn type="submit" color="primary" :loading="busy" :disabled="busy || !code.trim()">Адкрыць доступ</v-btn>
      <details v-if="priestAccess.helpText" class="mt-4"><summary>Дзе атрымаць код?</summary><p class="help-text">{{ priestAccess.helpText }}</p></details>
    </v-form>
    <p v-if="accessSetsSession.pendingDisable" class="mt-3" role="status">Доступ закрыты на гэтай прыладзе. Серверны дазвол будзе адкліканы пасля падключэння.</p>
    <v-alert v-if="message" class="mt-4" :type="messageType" variant="tonal" role="status">{{ message }}</v-alert>
    <p class="text-caption mt-4">Закрытыя малітвы даступныя пры злучэнні з інтэрнэтам. Пасля ачысткі даных браўзера або пераўсталявання прыкладання можа спатрэбіцца новая актывацыя.</p>
  </section>
</template>
<script setup>
import { onMounted, ref } from 'vue';
import { accessSetsSession, priestAccess, startPriestAccess, loadPriestHelp, activatePriestAccess, disablePriestAccess } from '@/services/priestAccessService';
const code = ref('');
const label = ref('');
const busy = ref(false);
const message = ref('');
const messageType = ref('error');
onMounted(() => { startPriestAccess().catch(() => {}); loadPriestHelp(); });
async function activate() {
  if (busy.value || !code.value.trim()) return;
  busy.value = true;
  message.value = '';
  const submitted = code.value;
  code.value = '';
  try { await activatePriestAccess(submitted, label.value); label.value = ''; }
  catch (error) { messageType.value = 'error'; message.value = error.message; }
  finally { busy.value = false; }
}
async function disable() {
  if (busy.value) return;
  busy.value = true;
  message.value = '';
  code.value = '';
  try {
    const result = await disablePriestAccess();
    if (!result.pending) {
      messageType.value = 'info';
      message.value = 'Доступ выключаны.';
    } else if (!result.persisted) {
      messageType.value = 'error';
      message.value = 'Браўзер не захаваў запыт. Паўтарыце выключэнне пасля падключэння.';
    }
  } catch {
    messageType.value = 'error';
    message.value = 'Не ўдалося выключыць доступ. Паспрабуйце яшчэ раз.';
  } finally {
    busy.value = false;
  }
}
</script>
<style scoped>
.priest-settings p { color: var(--nav-muted); }
.priest-settings { padding: 20px; }
.help-text { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>

<template>
  <v-container class="priest-admin" data-sentry-block>
    <h1>Доступ для святароў</h1>
    <v-alert v-if="error" type="error" variant="tonal" class="my-4">{{ error }}</v-alert>
    <v-progress-linear v-if="loading" indeterminate aria-label="Загрузка" />
    <v-card class="my-5 pa-5" elevation="0" border>
      <h2>Код актывацыі</h2>
      <p class="my-3">Статус: {{ settings.codeCreated ? 'код створаны' : 'код адсутнічае' }}<br>Апошняя змена: {{ date(settings.changedAt) }}</p>
      <p>Код патрэбны адзін раз. Змена кода не адключае зарэгістраваныя прылады.</p>
      <v-btn class="my-4" color="primary" :disabled="busy || loading" @click="confirmCode(true)">Згенераваць новы код</v-btn>
      <v-form @submit.prevent="confirmCode(false)">
        <v-text-field v-model="customCode" label="Уласны код" type="password" autocomplete="off" :maxlength="79" hint="24–64 сімвалы без I, O, 0 і 1. Выпадковы код бяспечней." persistent-hint />
        <v-btn type="submit" variant="tonal" :disabled="busy || loading || !customCode.trim()">Усталяваць уласны код</v-btn>
      </v-form>
      <v-alert v-if="newCode" type="success" variant="tonal" class="mt-4">
        <p>Новы код паказваецца толькі зараз. Захавайце яго перад закрыццём.</p>
        <strong class="new-code">{{ newCode }}</strong>
        <v-btn variant="text" prepend-icon="mdi-content-copy" @click="copyCode">Капіяваць</v-btn>
        <v-btn variant="text" @click="newCode = ''">Схаваць</v-btn>
        <p v-if="copied">Скапіявана</p>
      </v-alert>
      <v-textarea v-model="helpText" class="mt-5" label="Дзе атрымаць код?" :maxlength="1000" rows="3" hint="Кантакт або інструкцыя. Калі пуста, блок не паказваецца." persistent-hint />
      <v-btn variant="tonal" :loading="busy" :disabled="loading" @click="saveHelp">Захаваць інструкцыю</v-btn>
    </v-card>
    <v-card class="pa-5" elevation="0" border>
      <h2>Зарэгістраваныя прылады</h2>
      <p class="my-3">Подпіс інфармацыйны і не пацвярджае асобу.</p>
      <v-text-field v-model="query" label="Пошук прылады або подпісу" prepend-inner-icon="mdi-magnify" clearable />
      <v-select v-model="filter" label="Статус" :items="[{ title: 'Усе', value: '' }, { title: 'Актыўны', value: 'active' }, { title: 'Адкліканы', value: 'revoked' }]" />
      <v-btn variant="text" :loading="loading" @click="load">Абнавіць</v-btn>
      <article v-for="device in filteredDevices" :key="device.id" class="device-row">
        <h3>{{ device.deviceName }}</h3>
        <p>{{ device.client }} · {{ device.platform || 'Платформа невядомая' }}</p>
        <p>Актывавана: {{ date(device.activatedAt) }} · Апошняя актыўнасць: {{ date(device.lastActiveAt) }}</p>
        <p>Статус: {{ device.status === 'active' ? 'Актыўны' : 'Адкліканы' }}</p>
        <v-text-field v-model="device.label" label="Подпіс" :maxlength="120" />
        <v-btn variant="text" :disabled="busy" @click="saveLabel(device)">Захаваць подпіс</v-btn>
        <v-btn v-if="device.status === 'active'" color="error" variant="tonal" :disabled="busy" @click="revokeTarget = device">Адклікаць доступ</v-btn>
      </article>
      <p v-if="!filteredDevices.length && !loading" class="my-4">Прылады не знойдзены</p>
    </v-card>
    <v-dialog v-model="codeDialog" max-width="540" persistent>
      <v-card>
        <v-card-title>Змяніць код актывацыі?</v-card-title>
        <v-card-text>Новы код будзе выкарыстоўвацца для актывацыі новых прылад. Раней зарэгістраваныя прылады захаваюць доступ.</v-card-text>
        <v-card-actions><v-spacer /><v-btn :disabled="busy" @click="codeDialog = false">Скасаваць</v-btn><v-btn color="primary" :loading="busy" @click="replaceCode">Змяніць код</v-btn></v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog :model-value="Boolean(revokeTarget)" max-width="500" @update:model-value="!$event && (revokeTarget = null)">
      <v-card>
        <v-card-title>Адклікаць доступ?</v-card-title>
        <v-card-text>«{{ revokeTarget?.deviceName }}» больш не зможа атрымліваць закрытыя малітвы. Для аднаўлення спатрэбіцца новая актывацыя.</v-card-text>
        <v-card-actions><v-spacer /><v-btn :disabled="busy" @click="revokeTarget = null">Скасаваць</v-btn><v-btn color="error" :loading="busy" @click="revoke">Адклікаць</v-btn></v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue';
import { getPriestSettings, replacePriestCode, savePriestHelp, listPriestDevices, updatePriestDevice } from '@/services/priestAccessService';
import { useNotifier } from '@/composables/useNotifier';
const { notifySuccess } = useNotifier();
const settings = ref({});
const devices = ref([]);
const helpText = ref('');
const customCode = ref('');
const newCode = ref('');
const copied = ref(false);
const error = ref('');
const busy = ref(false);
const loading = ref(false);
const query = ref('');
const filter = ref('');
const codeDialog = ref(false);
const generate = ref(true);
const revokeTarget = ref(null);
const filteredDevices = computed(() => devices.value.filter((d) => (!filter.value || d.status === filter.value)
  && `${d.deviceName} ${d.label} ${d.platform} ${d.client}`.toLocaleLowerCase().includes(String(query.value || '').toLocaleLowerCase())));
const date = (value) => value ? (value.toDate?.() || new Date(value)).toLocaleString('be-BY') : '—';
onMounted(load);
async function load() {
  loading.value = true;
  error.value = '';
  try {
    settings.value = await getPriestSettings();
    helpText.value = settings.value.helpText;
    const items = [];
    let after = '';
    do {
      const page = await listPriestDevices(after);
      items.push(...page.devices);
      after = page.next;
    } while (after);
    devices.value = items;
  } catch (e) { error.value = e.message; }
  finally { loading.value = false; }
}
function confirmCode(auto) { generate.value = auto; codeDialog.value = true; }
async function perform(action) {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try { await action(); } catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}
async function replaceCode() {
  await perform(async () => {
    const result = await replacePriestCode(generate.value ? { generate: true } : { code: customCode.value });
    newCode.value = result.code;
    copied.value = false;
    settings.value = result;
    delete settings.value.code; // The plaintext exists only in the one-time view.
    customCode.value = '';
    codeDialog.value = false;
  });
}
async function copyCode() { try { await navigator.clipboard.writeText(newCode.value); copied.value = true; } catch { error.value = 'Не ўдалося скапіяваць код.'; } }
async function saveHelp() { await perform(async () => { settings.value = await savePriestHelp(helpText.value); notifySuccess('Інструкцыя захавана'); }); }
async function saveLabel(device) { await perform(async () => { await updatePriestDevice(device.id, { label: device.label }); notifySuccess('Подпіс захаваны'); }); }
async function revoke() {
  await perform(async () => {
    await updatePriestDevice(revokeTarget.value.id, { revoke: true });
    revokeTarget.value.status = 'revoked';
    revokeTarget.value = null;
    notifySuccess('Доступ адкліканы');
  });
}
</script>
<style scoped>
.priest-admin { max-width: 980px; padding-bottom: 80px; }
.priest-admin h1 { margin-top: 0; font-size: 1.65rem; line-height: 1.3; }
.priest-admin h2 { font-size: 1.3rem; }
.new-code { display: block; font-family: monospace; font-size: 1.15rem; padding: 12px 0; overflow-wrap: anywhere; }
.device-row { border-top: 1px solid var(--nav-border); padding: 20px 0; overflow-wrap: anywhere; }
.device-row p { color: var(--nav-muted); margin: 6px 0; }
.device-row .v-input { max-width: 500px; margin-top: 12px; }
@media (max-width: 480px) {
  .priest-admin { padding: 12px 12px 48px; }
  .priest-admin h1 { font-size: 1.35rem; }
  .priest-admin h2 { font-size: 1.1rem; }
  .priest-admin :deep(.v-card) { padding: 16px !important; margin-block: 12px !important; }
  .priest-admin :deep(.v-btn) { max-width: 100%; margin-bottom: 8px; font-size: .8rem; }
  .priest-admin :deep(.v-btn__content) { white-space: normal; }
}
</style>

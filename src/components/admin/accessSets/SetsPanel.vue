<template>
  <section class="access-admin__section access-admin__section--split" aria-labelledby="sets-heading">
    <div class="access-admin__box">
      <h2 id="sets-heading">Наборы малітваў</h2>
      <ul class="access-admin__list">
        <li v-for="set in rows" :key="set.id">
          <div><strong>{{ displayAccessSetName(set) }}</strong> · {{ set.status === 'active' ? 'Актыўны' : 'Невядомы статус' }}</div>
          <button type="button" :disabled="busy || set.status !== 'active'" @click="edit(set)">Змяніць назву</button>
        </li>
      </ul>
      <RegistryControls :page="page" :locked="busy" />
    </div>
    <form class="access-admin__box access-admin__form" @submit.prevent="save">
      <h3>{{ editing ? 'Змяніць назву набору' : 'Новы набор' }}</h3>
      <label>
        Ідэнтыфікатар набору
        <input v-model="id" required maxlength="64" pattern="[a-z][a-z0-9\-]{0,63}" :readonly="editing" :disabled="busy" aria-describedby="access-set-ids">
      </label>
      <p id="access-set-ids">
        Зарэзерваваныя ID: <code>priest</code>, <code>marian</code>.
        Напрыклад, можна дадаць <code>capuchin</code> або <code>eucharistines</code>, калі з’явяцца адпаведныя наборы.
      </p>
      <label>Назва набору <input ref="editField" v-model.trim="name" required maxlength="120" :disabled="busy"></label>
      <p>Статус пасля захавання: актыўны.</p>
      <p v-if="error" class="access-admin__error" role="alert">{{ error }}</p>
      <p v-if="saved" role="status">Набор захаваны.</p>
      <div class="access-admin__actions">
        <button type="submit" class="access-admin__primary" :disabled="busy">{{ editing ? 'Захаваць назву' : 'Стварыць набор' }}</button>
        <button v-if="editing" type="button" :disabled="busy" @click="reset">Скасаваць</button>
      </div>
    </form>
  </section>
</template>

<script setup>
import { displayAccessSetName } from '@/utils/prayerAccessPresentation.mjs';

import { nextTick, onMounted, ref } from 'vue';
import { useAdminAction, useRegistryPage } from './useRegistryPage';
import RegistryControls from './RegistryControls.vue';

const { client } = defineProps({ client: { type: Object, required: true } });
const page = useRegistryPage(client, () => 'sets');
const { rows } = page;
const { busy, error, run } = useAdminAction();
const editField = ref(null);
const editing = ref(false);
const id = ref('');
const name = ref('');
const saved = ref(false);

function reset() {
  editing.value = false;
  id.value = '';
  name.value = '';
  error.value = '';
  saved.value = false;
}
function edit(set) {
  reset();
  editing.value = true;
  id.value = set.id;
  name.value = set.name;
  nextTick(() => editField.value?.focus());
}
async function save() {
  saved.value = false;
  const ok = await run(async () => {
    if (editing.value) await client.renameSet(id.value, name.value);
    else await client.createSet(id.value, name.value);
    return true;
  });
  if (ok) {
    reset();
    saved.value = true;
    await page.search({});
  }
}
onMounted(() => page.load());
</script>

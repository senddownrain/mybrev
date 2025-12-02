<template>
  <v-container>
    <v-form @submit.prevent="handleSave">
      <v-text-field
        v-model="form.titleVersions.be"
        label="Назва (бел.)"
        variant="outlined"
        class="mb-4"
        required
      ></v-text-field>

      <v-text-field
        v-model="form.titleVersions.ru"
        label="Назва (рус.)"
        variant="outlined"
        class="mb-4"
      ></v-text-field>

      <v-textarea
        v-model="form.textVersions.be"
        label="Тэкст малітвы (бел.)"
        variant="outlined"
        rows="10"
        class="mb-4"
        required
      ></v-textarea>

      <v-textarea
        v-model="form.textVersions.ru"
        label="Текст молитвы (рус.)"
        variant="outlined"
        rows="10"
        class="mb-4"
      ></v-textarea>

      <v-combobox
        v-model="form.tags"
        :items="allTags"
        label="Тэгі"
        multiple
        chips
        clearable
        variant="outlined"
        class="mb-4"
      ></v-combobox>

      <v-btn
        type="submit"
        color="primary"
        variant="flat"
        :loading="saving"
        block
      >
        {{ isEditMode ? 'Захаваць змены' : 'Дадаць малітву' }}
      </v-btn>
    </v-form>
  </v-container>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { usePrayers } from '@/composables/usePrayers';
import { useNotifier } from '@/composables/useNotifier';

const route = useRoute();
const router = useRouter();
const { prayers, addPrayer, updatePrayer, allTags } = usePrayers();
const { notifySuccess, notifyError } = useNotifier();

const isEditMode = computed(() => !!route.params.id);
const saving = ref(false);

const form = ref({
  titleVersions: {
    be: '',
    ru: ''
  },
  textVersions: {
    be: '',
    ru: ''
  },
  tags: []
});

onMounted(() => {
  if (isEditMode.value) {
    const prayer = prayers.value.find(p => p.id === route.params.id);
    if (prayer) {
      form.value = {
        titleVersions: prayer.titleVersions || { be: '', ru: '' },
        textVersions: prayer.textVersions || { be: '', ru: '' },
        tags: prayer.tags || []
      };
    }
  }
});

async function handleSave() {
  if (!form.value.titleVersions.be || !form.value.textVersions.be) {
    notifyError('Запоўніце назву і тэкст на беларускай мове');
    return;
  }

  saving.value = true;
  try {
    if (isEditMode.value) {
      await updatePrayer(route.params.id, form.value);
      notifySuccess('Малітва абноўлена');
    } else {
      await addPrayer(form.value);
      notifySuccess('Малітва дададзена');
    }
    router.push({ name: 'PrayersList' });
  } catch (error) {
    notifyError('Памылка захавання малітвы');
  } finally {
    saving.value = false;
  }
}
</script>


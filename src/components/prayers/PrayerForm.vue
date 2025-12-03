<template>
  <v-container>
    <v-form @submit.prevent="handleSave">
      <v-text-field
        v-model="form.title"
        label="Назва"
        variant="outlined"
        class="mb-4"
        :rules="[validatePrayerTitle]"
        counter="200"
        required
      ></v-text-field>

      <v-textarea
        v-model="form.text"
        label="Тэкст малітвы"
        variant="outlined"
        rows="10"
        class="mb-4"
        :rules="[validatePrayerText]"
        required
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
import { validatePrayerTitle, validatePrayerText } from '@/utils/validators';

const route = useRoute();
const router = useRouter();
const { prayers, addPrayer, updatePrayer, allTags } = usePrayers();
const { notifySuccess, notifyError } = useNotifier();

const isEditMode = computed(() => !!route.params.id);
const saving = ref(false);

const form = ref({
  title: '',
  text: '',
  tags: []
});

onMounted(() => {
  if (isEditMode.value) {
    const prayer = prayers.value.find(p => p.id === route.params.id);
    if (!prayer) {
      notifyError('Малітва не знойдзена');
      router.push({ name: 'PrayersList' });
      return;
    }
    
    // Поддержка старого формата с titleVersions/textVersions и нового формата
    if (prayer.titleVersions) {
      form.value.title = prayer.titleVersions.be || prayer.titleVersions.ru || Object.values(prayer.titleVersions)[0] || '';
    } else {
      form.value.title = prayer.title || '';
    }
    
    if (prayer.textVersions) {
      form.value.text = prayer.textVersions.be || prayer.textVersions.ru || Object.values(prayer.textVersions)[0] || '';
    } else {
      form.value.text = prayer.text || '';
    }
    
    form.value.tags = prayer.tags || [];
  }
});

async function handleSave() {
  // Валидация
  const titleValidation = validatePrayerTitle(form.value.title);
  const textValidation = validatePrayerText(form.value.text);
  
  if (titleValidation !== true) {
    notifyError(titleValidation);
    return;
  }
  
  if (textValidation !== true) {
    notifyError(textValidation);
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
    const { handleFirestoreError } = await import('@/utils/errorHandler');
    handleFirestoreError(error, 'PrayerForm');
  } finally {
    saving.value = false;
  }
}
</script>


<template>
  <v-col cols="12" class="py-2">
    <v-card variant="outlined">
      <v-toolbar density="compact" flat color="transparent">
        <v-toolbar-title class="text-subtitle-1 font-weight-regular">
          {{ fieldTitle }}
        </v-toolbar-title>
        <v-spacer></v-spacer>
        <!-- Кнопки управления: видны только если мы не в режиме редактирования -->
        <v-btn v-if="!isEditing" @click="startEditing" variant="text" size="small" prepend-icon="mdi-pencil">Рэдагаваць</v-btn>
      </v-toolbar>
      <v-divider></v-divider>

      <!-- Режим Просмотра -->
      <v-card-text v-if="!isEditing" class="pt-2">
        <p v-if="!modelValue" class="text-grey-darken-1 text-body-2">Тэкст адсутнічае</p>
        <div v-else v-html="modelValue" class="ora-text"></div>
      </v-card-text>

      <!-- Режим Редактирования -->
      <div v-if="isEditing" class="pa-2">
        <quill-editor
          v-model:content="editableContent"
          contentType="html"
          theme="snow"
          toolbar="essential"
        />
        <v-card-actions class="px-1 pb-1">
          <v-spacer></v-spacer>
          <v-btn @click="cancelEditing" variant="text" size="small">Адмяніць</v-btn>
          <v-btn @click="saveContent" color="primary" variant="flat" size="small">Захаваць поле</v-btn>
        </v-card-actions>
      </div>
    </v-card>
  </v-col>
</template>

<script setup>
import { ref } from 'vue';
import { QuillEditor } from '@vueup/vue-quill';
import '@vueup/vue-quill/dist/vue-quill.snow.css';

// Используем defineModel для удобной двусторонней привязки (v-model)
const modelValue = defineModel();

const props = defineProps({
  fieldTitle: String,
});

const isEditing = ref(false);
const editableContent = ref('');

const startEditing = () => {
  // Копируем текущее значение во временную переменную для редактирования
  editableContent.value = modelValue.value;
  isEditing.value = true;
};

const saveContent = () => {
  // Обновляем основную модель (v-model)
  modelValue.value = editableContent.value;
  isEditing.value = false;
};

const cancelEditing = () => {
  // Просто выходим из режима редактирования, не сохраняя изменения
  isEditing.value = false;
};
</script>

<style>
/* Стили для Quill, чтобы он выглядел аккуратно внутри v-card */
.ql-toolbar.ql-snow {
  border-top: none;
  border-left: none;
  border-right: none;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.ql-container.ql-snow {
  border: none;
  min-height: 200px;
}
/* Стили для текста предпросмотра */
.ora-text p:last-child {
  margin-bottom: 0;
}
.ora-text {
    line-height: 1.6;
}
</style>
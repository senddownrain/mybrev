<template>
  <div class="access-admin__actions">
    <button type="button" :disabled="page.busy.value || locked" @click="page.load()">Абнавіць</button>
    <button type="button" :disabled="page.busy.value || locked || page.cursors.value.length < 2" @click="page.previous()">Папярэдняя</button>
    <span>Старонка {{ page.cursors.value.length }}</span>
    <button type="button" :disabled="page.busy.value || locked || !page.next.value" @click="page.more()">Наступная</button>
  </div>
  <p v-if="page.busy.value" role="status">Загрузка…</p>
  <p v-else-if="page.error.value" role="alert" class="access-admin__error">{{ page.error.value }}</p>
  <p v-else-if="!page.rows.value.length" role="status">{{ empty }}</p>
</template>

<script setup>
defineProps({
  page: { type: Object, required: true },
  locked: Boolean,
  empty: { type: String, default: 'Запісаў на гэтай старонцы няма.' },
});
</script>

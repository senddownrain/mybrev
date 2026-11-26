<template>
  <SetPicker :sets="rows" :selected="selected" label="Уласныя наборы гэтага запісу" :disabled="disabled"
    @update:selected="$emit('update:selected', $event)" />
  <RegistryControls :page="page" />
</template>

<script setup>
import { onMounted } from 'vue';
import SetPicker from './SetPicker.vue';
import RegistryControls from './RegistryControls.vue';
import { useRegistryPage } from './useRegistryPage';

const { client } = defineProps({
  client: { type: Object, required: true },
  selected: { type: Array, required: true },
  disabled: Boolean,
});
defineEmits(['update:selected']);
const page = useRegistryPage(client, () => 'sets');
const { rows } = page;
onMounted(() => page.load());
</script>

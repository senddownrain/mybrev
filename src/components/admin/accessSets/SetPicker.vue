<template>
  <fieldset :disabled="disabled" class="access-admin__checks">
    <legend>{{ label }}</legend>
    <label v-for="set in sets" :key="set.id">
      <input
        type="checkbox"
        :checked="selected.includes(set.id)"
        :disabled="set.status !== 'active'"
        @change="toggle(set.id, $event.target.checked)"
      >
      {{ set.name }} · <code>{{ set.id }}</code>
    </label>
  </fieldset>
</template>

<script setup>
const props = defineProps({
  sets: { type: Array, required: true },
  selected: { type: Array, required: true },
  label: { type: String, required: true },
  disabled: Boolean,
});
const emit = defineEmits(['update:selected']);
function toggle(id, checked) {
  if (props.disabled || !props.sets.some(set => set.id === id && set.status === 'active')) return;
  emit('update:selected', checked ? [...new Set([...props.selected, id])] : props.selected.filter(value => value !== id));
}
</script>

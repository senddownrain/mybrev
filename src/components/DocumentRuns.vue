<template><span v-for="(run, index) in runs" :key="index" :class="[`doc-tone--${run.tone}`, { 'doc-italic': run.italic, 'doc-small': run.small, 'doc-bold': run.bold }]">{{ run.text }}</span></template>
<script setup>
defineProps({ runs: { type: Array, required: true } });
</script>

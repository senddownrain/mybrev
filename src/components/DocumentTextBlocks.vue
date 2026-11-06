<template>
  <template v-for="(block, index) in blocks" :key="index">
    <p v-if="block.type === 'paragraph'" class="document-prose" data-source-text>{{ block.text }}</p>
    <ul v-else-if="block.type === 'list'" class="document-subpoints">
      <li v-for="(item, itemIndex) in block.items" :key="itemIndex" class="document-prose" data-source-text>{{ item }}</li>
    </ul>
  </template>
</template>
<script setup>
defineProps({ blocks: { type: Array, required: true } });
</script>
<style scoped>
p + p, p + ul, ul + p { margin-top: .7em; }
.document-subpoints { margin-block: .65em; padding-left: 1.3em; list-style: none; }
.document-subpoints li + li { margin-top: .4em; }
</style>

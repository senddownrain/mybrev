import { ref } from 'vue';
export const prayers = ref([
  { id: 'public', title: 'Публічная малітва', text: 'Публічны тэкст', tags: ['public'], priestOnly: false },
  { id: 'closed', title: 'Закрытая малітва', text: 'Тэставы закрыты тэкст', tags: ['closed'], priestOnly: true },
]);
export const categories = ref([
  { id: 'public', name: 'Публічная катэгорыя', tags: ['public'], priestOnly: false },
  { id: 'closed', name: 'Закрытая катэгорыя', tags: ['closed'], priestOnly: true },
  { id: 'child', name: 'Даччыная катэгорыя', tags: ['child'], parentId: 'closed', priestOnly: false },
]);
export function updateCategory(id, data) { categories.value = categories.value.map((c) => c.id === id ? { ...c, ...data } : c); }

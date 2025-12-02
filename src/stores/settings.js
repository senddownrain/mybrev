import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { useTheme } from 'vuetify';

// Константа для системного шрифта
const systemFont = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const defaultCategories = [
  { name: 'Марыйныя', tags: ['Марыя'] },
  { name: 'Літаніі', tags: ['Літанія'] },
  { name: 'Навэнны', tags: ['Навэнна'] }
];

// Экспортируем константу с правильным именем 'useSettingsStore'
export const useSettingsStore = defineStore('settings', () => {
  const theme = useTheme();

  // --- Состояния (State) ---
  const currentTheme = ref(localStorage.getItem('theme') || 'light');
  const fontFamily = ref(localStorage.getItem('fontFamily') || systemFont);
  const fontSizeMultiplier = ref(parseFloat(localStorage.getItem('fontSizeMultiplier')) || 1.0);
  const menuCategories = ref(JSON.parse(localStorage.getItem('menuCategories') || JSON.stringify(defaultCategories)));

  // --- Слежение за изменениями (Watchers) ---
  watch(currentTheme, (newTheme) => {
    theme.global.name.value = newTheme;
    localStorage.setItem('theme', newTheme);
  }, { immediate: true });

  watch(fontFamily, (newFont) => {
    document.documentElement.style.setProperty('--app-font-family', newFont);
    localStorage.setItem('fontFamily', newFont);
  }, { immediate: true });

  watch(fontSizeMultiplier, (newMultiplier) => {
    document.documentElement.style.setProperty('--font-size-multiplier', newMultiplier);
    localStorage.setItem('fontSizeMultiplier', String(newMultiplier));
  }, { immediate: true });

  watch(menuCategories, (v) => localStorage.setItem('menuCategories', JSON.stringify(v)), { deep: true });


  // --- Действия (Actions) ---
  function toggleTheme() {
    currentTheme.value = currentTheme.value === 'light' ? 'dark' : 'light';
  }

  function setFontFamily(font) {
    fontFamily.value = font;
  }

  function increaseFontSize() {
    if (fontSizeMultiplier.value < 1.8) {
      fontSizeMultiplier.value = parseFloat((fontSizeMultiplier.value + 0.1).toFixed(2));
    }
  }
  function decreaseFontSize() {
    if (fontSizeMultiplier.value > 0.7) {
      fontSizeMultiplier.value = parseFloat((fontSizeMultiplier.value - 0.1).toFixed(2));
    }
  }

  function addCategory(cat) {
    if (cat && cat.name && cat.tags?.length > 0) {
      menuCategories.value.push(cat);
    }
  }

  function removeCategory(index) {
    menuCategories.value.splice(index, 1);
  }

  return {
    currentTheme,
    fontFamily,
    systemFont,
    fontSizeMultiplier,
    menuCategories,
    toggleTheme,
    setFontFamily,
    increaseFontSize,
    decreaseFontSize,
    addCategory,
    removeCategory,
  };
});
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { useTheme } from 'vuetify';
import { SYSTEM_FONT } from '@/constants/fonts';
import { DEFAULT_CATEGORIES } from '@/constants/categories';
import { validateCategory } from '@/utils/validators';

export const useSettingsStore = defineStore('settings', () => {
  const theme = useTheme();

  const currentTheme = ref(localStorage.getItem('theme') || 'light');
  const fontFamily = ref(localStorage.getItem('fontFamily') || SYSTEM_FONT);
  const fontSizeMultiplier = ref(parseFloat(localStorage.getItem('fontSizeMultiplier')) || 1.0);
  const menuCategories = ref(JSON.parse(localStorage.getItem('menuCategories') || JSON.stringify(DEFAULT_CATEGORIES)));
  const favoritePrayers = ref(JSON.parse(localStorage.getItem('favoritePrayers') || '[]'));

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
  watch(favoritePrayers, (v) => localStorage.setItem('favoritePrayers', JSON.stringify(v)), { deep: true });


  function toggleTheme() {
    currentTheme.value = currentTheme.value === 'light' ? 'dark' : 'light';
  }

  function setTheme(isDark) {
    currentTheme.value = isDark ? 'dark' : 'light';
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
    const validation = validateCategory(cat);
    if (validation === true) {
      menuCategories.value.push(cat);
    }
  }

  function removeCategory(index) {
    menuCategories.value.splice(index, 1);
  }

  function toggleFavoritePrayer(prayerId) {
    const index = favoritePrayers.value.indexOf(prayerId);
    if (index > -1) {
      favoritePrayers.value.splice(index, 1);
    } else {
      favoritePrayers.value.push(prayerId);
    }
  }

  function isFavoritePrayer(prayerId) {
    return favoritePrayers.value.includes(prayerId);
  }

  return {
    currentTheme,
    fontFamily,
    systemFont: SYSTEM_FONT,
    fontSizeMultiplier,
    menuCategories,
    favoritePrayers,
    toggleTheme,
    setTheme,
    setFontFamily,
    increaseFontSize,
    decreaseFontSize,
    addCategory,
    removeCategory,
    toggleFavoritePrayer,
    isFavoritePrayer,
  };
});
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { useTheme } from 'vuetify';
import { normalizeReaderFont, SYSTEM_FONT } from '@/constants/fonts';
import { APP_STATUS_BAR_COLORS } from '@/constants/appearance';
import { DEFAULT_CATEGORIES } from '@/constants/categories';
import { validateCategory } from '@/utils/validators';
import { logger } from '@/utils/logger';
import { requestWakeLock, releaseWakeLock } from '@/composables/useWakeLock';
import { ensureReaderFontLoaded } from '@/utils/fonts';

const PERSONAL_CATEGORIES_KEY = 'personalPrayerCategories';

function categoryMatchesDefault(category) {
  return DEFAULT_CATEGORIES.some((defaultCategory) => (
    category?.name === defaultCategory.name
    && JSON.stringify(category?.tags || []) === JSON.stringify(defaultCategory.tags)
  ));
}

function loadPersonalCategories() {
  const personal = localStorage.getItem(PERSONAL_CATEGORIES_KEY);
  if (personal !== null) return JSON.parse(personal);

  // One-time migration: the old key mixed three app-wide defaults with the
  // user's own categories. Only carry the genuinely personal entries forward.
  const legacy = JSON.parse(localStorage.getItem('menuCategories') || '[]');
  return legacy.filter((category) => !categoryMatchesDefault(category));
}

export const useSettingsStore = defineStore('settings', () => {
  const theme = useTheme();

  const currentTheme = ref(localStorage.getItem('theme') === 'dark' ? 'dark' : 'light');
  const fontFamily = ref(normalizeReaderFont(localStorage.getItem('fontFamily')));
  const fontSizeMultiplier = ref(parseFloat(localStorage.getItem('fontSizeMultiplier')) || 1.0);
  const menuCategories = ref(loadPersonalCategories());
  const favoritePrayers = ref(JSON.parse(localStorage.getItem('favoritePrayers') || '[]'));
  const keepScreenOn = ref(localStorage.getItem('keepScreenOn') === 'true');

  watch(currentTheme, (newTheme) => {
    theme.change(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.dataset.appearance = newTheme;
    // Keep the Android browser/status bar aligned with the selected appearance.
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) {
      themeColor.setAttribute('content', APP_STATUS_BAR_COLORS[newTheme]);
    }
  }, { immediate: true });

  watch(fontFamily, (newFont) => {
    ensureReaderFontLoaded(newFont);
    document.documentElement.style.setProperty('--reader-font-family', newFont);
    localStorage.setItem('fontFamily', newFont);
  }, { immediate: true });

  watch(fontSizeMultiplier, (newMultiplier) => {
    document.documentElement.style.setProperty('--font-size-multiplier', newMultiplier);
    localStorage.setItem('fontSizeMultiplier', String(newMultiplier));
  }, { immediate: true });

  watch(menuCategories, (v) => localStorage.setItem(PERSONAL_CATEGORIES_KEY, JSON.stringify(v)), { deep: true });
  watch(favoritePrayers, (v) => localStorage.setItem('favoritePrayers', JSON.stringify(v)), { deep: true });
  
  watch(keepScreenOn, async (newValue) => {
    localStorage.setItem('keepScreenOn', String(newValue));
    try {
      if (newValue) {
        await requestWakeLock();
      } else {
        await releaseWakeLock();
      }
    } catch (err) {
      logger.error('[settings] Wake Lock error:', err);
      // Не сбрасываем значение, если ошибка при выключении
      if (newValue) {
        keepScreenOn.value = false;
      }
    }
  }, { immediate: true });
  
  async function setKeepScreenOn(value) {
    keepScreenOn.value = value;
  }


  function toggleTheme() {
    currentTheme.value = currentTheme.value === 'light' ? 'dark' : 'light';
  }

  function setTheme(isDark) {
    currentTheme.value = isDark ? 'dark' : 'light';
  }

  function setFontFamily(font) {
    fontFamily.value = normalizeReaderFont(font);
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
    personalPrayerCategories: menuCategories,
    favoritePrayers,
    keepScreenOn,
    toggleTheme,
    setTheme,
    setFontFamily,
    increaseFontSize,
    decreaseFontSize,
    addCategory,
    removeCategory,
    toggleFavoritePrayer,
    isFavoritePrayer,
    setKeepScreenOn,
  };
});

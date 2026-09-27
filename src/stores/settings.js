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
const HIDDEN_GLOBAL_CATEGORIES_KEY = 'hiddenGlobalPrayerCategoryIds';

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
  const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');
  const savedThemePreference = localStorage.getItem('themePreference');
  // Existing explicit light/dark choices remain explicit after migration.
  const legacyTheme = localStorage.getItem('theme');
  const themePreference = ref(
    ['system', 'light', 'dark'].includes(savedThemePreference)
      ? savedThemePreference
      : ['light', 'dark'].includes(legacyTheme) ? legacyTheme : 'system',
  );

  const currentTheme = ref(
    themePreference.value === 'system'
      ? colorScheme.matches ? 'dark' : 'light'
      : themePreference.value,
  );
  const fontFamily = ref(normalizeReaderFont(localStorage.getItem('fontFamily')));
  const fontSizeMultiplier = ref(parseFloat(localStorage.getItem('fontSizeMultiplier')) || 1.0);
  const menuCategories = ref(loadPersonalCategories());
  const hiddenGlobalPrayerCategoryIds = ref(JSON.parse(
    localStorage.getItem(HIDDEN_GLOBAL_CATEGORIES_KEY) || '[]',
  ));
  const favoritePrayers = ref(JSON.parse(localStorage.getItem('favoritePrayers') || '[]'));
  const favoriteSongs = ref(JSON.parse(localStorage.getItem('favoriteSongs') || '[]'));
  const songCompactList = ref(localStorage.getItem('songCompactList') === 'true');
  const songShowChords = ref(localStorage.getItem('songShowChords') === 'true');
  const songChordLayout = ref(['left', 'right'].includes(localStorage.getItem('songChordLayout')) ? 'left' : 'above');
  const keepScreenOn = ref(localStorage.getItem('keepScreenOn') === 'true');

  function applyThemePreference() {
    currentTheme.value = themePreference.value === 'system'
      ? colorScheme.matches ? 'dark' : 'light'
      : themePreference.value;
  }

  watch(themePreference, (newPreference) => {
    localStorage.setItem('themePreference', newPreference);
    applyThemePreference();
  }, { immediate: true });

  const handleColorSchemeChange = () => {
    if (themePreference.value === 'system') applyThemePreference();
  };
  if (colorScheme.addEventListener) colorScheme.addEventListener('change', handleColorSchemeChange);
  else colorScheme.addListener(handleColorSchemeChange);

  watch(currentTheme, (newTheme) => {
    theme.change(newTheme);
    // Keep the legacy key synchronized for older installed app versions.
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
  watch(hiddenGlobalPrayerCategoryIds, (v) => {
    localStorage.setItem(HIDDEN_GLOBAL_CATEGORIES_KEY, JSON.stringify(v));
  }, { deep: true });
  watch(favoritePrayers, (v) => localStorage.setItem('favoritePrayers', JSON.stringify(v)), { deep: true });
  watch(favoriteSongs, (v) => localStorage.setItem('favoriteSongs', JSON.stringify(v)), { deep: true });
  watch(songCompactList, (v) => localStorage.setItem('songCompactList', String(v)));
  watch(songShowChords, (v) => localStorage.setItem('songShowChords', String(v)));
  watch(songChordLayout, (v) => localStorage.setItem('songChordLayout', v));
  
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
    themePreference.value = currentTheme.value === 'light' ? 'dark' : 'light';
  }

  function setTheme(isDark) {
    themePreference.value = isDark ? 'dark' : 'light';
  }

  function setThemePreference(preference) {
    if (['system', 'light', 'dark'].includes(preference)) {
      themePreference.value = preference;
    }
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

  function hideGlobalPrayerCategory(categoryId) {
    hiddenGlobalPrayerCategoryIds.value = [...new Set([
      ...hiddenGlobalPrayerCategoryIds.value,
      categoryId,
    ])];
  }

  function restoreGlobalPrayerCategories() {
    hiddenGlobalPrayerCategoryIds.value = [];
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

  function toggleFavoriteSong(id) {
    favoriteSongs.value = favoriteSongs.value.includes(id)
      ? favoriteSongs.value.filter((item) => item !== id) : [...favoriteSongs.value, id];
  }

  return {
    currentTheme,
    themePreference,
    fontFamily,
    systemFont: SYSTEM_FONT,
    fontSizeMultiplier,
    menuCategories,
    personalPrayerCategories: menuCategories,
    hiddenGlobalPrayerCategoryIds,
    favoritePrayers,
    favoriteSongs,
    songCompactList,
    songShowChords,
    songChordLayout,
    toggleFavoriteSong,
    keepScreenOn,
    toggleTheme,
    setTheme,
    setThemePreference,
    setFontFamily,
    increaseFontSize,
    decreaseFontSize,
    addCategory,
    removeCategory,
    hideGlobalPrayerCategory,
    restoreGlobalPrayerCategories,
    toggleFavoritePrayer,
    isFavoritePrayer,
    setKeepScreenOn,
  };
});

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
import { normalizePsalmVerseLayout, normalizePsalmMarkerBreakMode } from '@/utils/psalmodyDisplay';
import { normalizeChordLayout } from '@/utils/songDisplay';
import { trackFeature } from '../utils/trackFeature.js';
import { ordoDiocese, ordoDioceses, setOrdoDiocese, toggleOrdoDiocese } from '@/utils/ordoDiocese';

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
  const psalmVerseLayout = ref(normalizePsalmVerseLayout(localStorage.getItem('psalmVerseLayout')));
  const psalmMarkerBreakMode = ref(normalizePsalmMarkerBreakMode(localStorage.getItem('psalmMarkerBreakMode')));
  watch(psalmVerseLayout, (value) => {
    trackFeature('psalmody_layout_change');
    localStorage.setItem('psalmVerseLayout', normalizePsalmVerseLayout(value));
  });
  watch(psalmMarkerBreakMode, (value) => {
    trackFeature('psalmody_layout_change');
    localStorage.setItem('psalmMarkerBreakMode', normalizePsalmMarkerBreakMode(value));
  });
  const menuCategories = ref(loadPersonalCategories());
  const hiddenGlobalPrayerCategoryIds = ref(JSON.parse(
    localStorage.getItem(HIDDEN_GLOBAL_CATEGORIES_KEY) || '[]',
  ));
  const favoritePrayers = ref(JSON.parse(localStorage.getItem('favoritePrayers') || '[]'));
  const favoriteSongs = ref(JSON.parse(localStorage.getItem('favoriteSongs') || '[]'));
  const songShowChords = ref(localStorage.getItem('songShowChords') === 'true');
  // Older versions stored "left"; it is migrated to "right" and saved back.
  const songChordLayout = ref(normalizeChordLayout(localStorage.getItem('songChordLayout')));
  if (localStorage.getItem('songChordLayout') !== null) localStorage.setItem('songChordLayout', songChordLayout.value);
  // The song list is always compact now; drop the obsolete toggle.
  localStorage.removeItem('songCompactList');
  const keepScreenOn = ref(localStorage.getItem('keepScreenOn') !== 'false');

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
  watch(songShowChords, (v) => {
    trackFeature('chords_toggle');
    localStorage.setItem('songShowChords', String(v));
  });
  watch(songChordLayout, (v) => {
    const layout = normalizeChordLayout(v);
    if (layout !== v) songChordLayout.value = layout;
    else {
      trackFeature('chord_layout_change');
      localStorage.setItem('songChordLayout', layout);
    }
  });
  
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
      // A browser refusal does not change the user's saved preference.
    }
  }, { immediate: true });
  
  async function setKeepScreenOn(value) {
    if (keepScreenOn.value !== value) trackFeature('keep_screen_on_toggle');
    keepScreenOn.value = value;
  }


  function setDiocese(value) {
    trackFeature('ordo_diocese_change');
    setOrdoDiocese(value);
  }

  /** One or several dioceses for Hours and Readings (minimum one). */
  function toggleDiocese(value) {
    trackFeature('ordo_diocese_change');
    return toggleOrdoDiocese(value);
  }


  function toggleTheme() {
    trackFeature('theme_change');
    themePreference.value = currentTheme.value === 'light' ? 'dark' : 'light';
  }

  function setTheme(isDark) {
    if (themePreference.value !== (isDark ? 'dark' : 'light')) trackFeature('theme_change');
    themePreference.value = isDark ? 'dark' : 'light';
  }

  function setThemePreference(preference) {
    if (['system', 'light', 'dark'].includes(preference)) {
      if (themePreference.value !== preference) trackFeature('theme_change');
      themePreference.value = preference;
    }
  }

  function setFontFamily(font) {
    const next = normalizeReaderFont(font);
    if (fontFamily.value !== next) trackFeature('font_family_change');
    fontFamily.value = next;
  }

  function increaseFontSize() {
    if (fontSizeMultiplier.value < 1.8) {
      trackFeature('text_scale_change');
      fontSizeMultiplier.value = parseFloat((fontSizeMultiplier.value + 0.1).toFixed(2));
    }
  }
  function decreaseFontSize() {
    if (fontSizeMultiplier.value > 0.7) {
      trackFeature('text_scale_change');
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
      trackFeature('favorite_remove');
      favoritePrayers.value.splice(index, 1);
    } else {
      trackFeature('favorite_add');
      favoritePrayers.value.push(prayerId);
    }
  }

  function isFavoritePrayer(prayerId) {
    return favoritePrayers.value.includes(prayerId);
  }

  function toggleFavoriteSong(id) {
    trackFeature(favoriteSongs.value.includes(id) ? 'favorite_remove' : 'favorite_add');
    favoriteSongs.value = favoriteSongs.value.includes(id)
      ? favoriteSongs.value.filter((item) => item !== id) : [...favoriteSongs.value, id];
  }

  return {
    currentTheme,
    themePreference,
    fontFamily,
    systemFont: SYSTEM_FONT,
    fontSizeMultiplier,
    psalmVerseLayout,
    psalmMarkerBreakMode,
    menuCategories,
    personalPrayerCategories: menuCategories,
    hiddenGlobalPrayerCategoryIds,
    favoritePrayers,
    favoriteSongs,
    songShowChords,
    songChordLayout,
    toggleFavoriteSong,
    keepScreenOn,
    diocese: ordoDiocese,
    dioceses: ordoDioceses,
    setDiocese,
    toggleDiocese,
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

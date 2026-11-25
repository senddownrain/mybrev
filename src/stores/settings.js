import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { useTheme } from 'vuetify';
import { normalizeReaderFont, SYSTEM_FONT } from '@/constants/fonts';
import { APP_STATUS_BAR_COLORS, isThemePreference, loadThemePreference, resolveTheme } from '@/constants/appearance';
import { DEFAULT_CATEGORIES } from '@/constants/categories';
import { migratePersonalCategoryIcons, normalizeCategoryIconKey, suggestCategoryIconKey } from '@/constants/prayerCategoryIcons';
import { validateCategory } from '@/utils/validators';
import { logger } from '@/utils/logger';
import { requestWakeLock, releaseWakeLock } from '@/composables/useWakeLock';
import { ensureReaderFontLoaded } from '@/utils/fonts';
import { normalizePsalmodyMode, loadPsalmodyMode } from '@/utils/psalmodyDisplay';
import { normalizeTextAlignment } from '@/utils/readerPreferences';
import { normalizeChordLayout } from '@/utils/songDisplay';
import { trackFeature } from '../utils/trackFeature.js';
import { ordoDiocese, ordoDioceses, setOrdoDiocese, toggleOrdoDiocese } from '@/utils/ordoDiocese';
import { prayerCatalogRevision } from '@/services/prayerCatalogAccess';

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
  // One-time migration: the old key mixed three app-wide defaults with the
  // user's own categories. Only carry the genuinely personal entries forward.
  const stored = personal !== null
    ? JSON.parse(personal)
    : JSON.parse(localStorage.getItem('menuCategories') || '[]').filter((category) => !categoryMatchesDefault(category));
  // Second one-time migration: give every category without an iconKey a meaningful one and persist it,
  // so renaming later never changes the icon. A stored valid choice is never touched.
  const { list, changed } = migratePersonalCategoryIcons(stored);
  if (changed) {
    try { localStorage.setItem(PERSONAL_CATEGORIES_KEY, JSON.stringify(list)); } catch { /* storage unavailable: kept in memory */ }
  }
  return list;
}

export const useSettingsStore = defineStore('settings', () => {
  const theme = useTheme();
  const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');
  const themePreference = ref(loadThemePreference(localStorage));
  const currentTheme = ref(resolveTheme(themePreference.value, colorScheme.matches));
  const fontFamily = ref(normalizeReaderFont(localStorage.getItem('fontFamily')));
  const fontSizeMultiplier = ref(parseFloat(localStorage.getItem('fontSizeMultiplier')) || 1.0);
  const textAlignment = ref(normalizeTextAlignment(localStorage.getItem('textAlignment')));
  const textSettingsExpanded = ref(localStorage.getItem('textSettingsExpanded') === 'true');
  const liturgicalSettingsExpanded = ref(localStorage.getItem('liturgicalSettingsExpanded') === 'true');
  watch(textAlignment, (value) => {
    const alignment = normalizeTextAlignment(value);
    if (alignment !== value) { textAlignment.value = alignment; return; }
    localStorage.setItem('textAlignment', alignment);
    document.documentElement.style.setProperty('--reader-text-alignment', alignment);
  }, { immediate: true, flush: 'sync' });
  watch(textSettingsExpanded, value => localStorage.setItem('textSettingsExpanded', String(value)));
  watch(liturgicalSettingsExpanded, value => localStorage.setItem('liturgicalSettingsExpanded', String(value)));
  const psalmodyMode = ref(loadPsalmodyMode(localStorage));
  watch(psalmodyMode, (value, previous) => {
    const mode = normalizePsalmodyMode(value);
    if (mode !== value) { psalmodyMode.value = mode; return; }
    if (previous !== undefined) trackFeature('psalmody_layout_change');
    localStorage.setItem('psalmodyMode', mode);
  }, { immediate: true, flush: 'sync' });
  const menuCategories = ref(loadPersonalCategories());
  const hiddenGlobalPrayerCategoryIds = ref(JSON.parse(
    localStorage.getItem(HIDDEN_GLOBAL_CATEGORIES_KEY) || '[]',
  ));
  const favoritePrayers = ref(JSON.parse(localStorage.getItem('favoritePrayers') || '[]'));
  const protectedFavorites = ref([]);
  watch(prayerCatalogRevision, () => { protectedFavorites.value = []; }, { flush: 'sync' });
  const favoriteSongs = ref(JSON.parse(localStorage.getItem('favoriteSongs') || '[]'));
  const songShowChords = ref(localStorage.getItem('songShowChords') === 'true');
  // Older versions stored "left"; it is migrated to "right" and saved back.
  const songChordLayout = ref(normalizeChordLayout(localStorage.getItem('songChordLayout')));
  if (localStorage.getItem('songChordLayout') !== null) localStorage.setItem('songChordLayout', songChordLayout.value);
  // The song list is always compact now; drop the obsolete toggle.
  localStorage.removeItem('songCompactList');
  const readingHighlightsEnabled = ref(localStorage.getItem('readingHighlightsEnabled') === 'true');
  watch(readingHighlightsEnabled, value => localStorage.setItem('readingHighlightsEnabled', String(value)), { flush: 'sync' });
  // Presentation-only preference. Liturgical colours and the texts themselves stay unchanged.
  // Enabled by default, preserving the established coloured cards for existing readers.
  const liturgicalEmphasisEnabled = ref(localStorage.getItem('liturgicalEmphasisEnabled') !== 'false');
  watch(liturgicalEmphasisEnabled, (enabled) => {
    document.documentElement.dataset.liturgicalEmphasis = enabled ? 'on' : 'off';
    localStorage.setItem('liturgicalEmphasisEnabled', String(enabled));
  }, { immediate: true, flush: 'sync' });
  const keepScreenOn = ref(localStorage.getItem('keepScreenOn') !== 'false');

  function applyThemePreference() {
    currentTheme.value = resolveTheme(themePreference.value, colorScheme.matches);
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
    if (isThemePreference(preference)) {
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
      menuCategories.value.push({ ...cat, iconKey: normalizeCategoryIconKey(cat.iconKey) || suggestCategoryIconKey(cat) });
    }
  }

  /** Edit a personal category in place; fields not in `patch` (and unknown extra fields) are preserved. */
  function updateCategory(index, patch) {
    const current = menuCategories.value[index];
    if (!current) return false;
    const next = { ...current, ...patch };
    if (validateCategory(next) !== true) return false;
    const iconKey = normalizeCategoryIconKey(patch.iconKey) || normalizeCategoryIconKey(current.iconKey)
      || (typeof current.iconKey === 'string' && current.iconKey.trim() ? current.iconKey : suggestCategoryIconKey(next));
    menuCategories.value.splice(index, 1, { ...next, iconKey });
    return true;
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

  function toggleFavoritePrayer(prayerId, isProtected = false) {
    const favorites = isProtected ? protectedFavorites : favoritePrayers;
    const index = favorites.value.indexOf(prayerId);
    if (index > -1) {
      trackFeature('favorite_remove');
      favorites.value.splice(index, 1);
    } else {
      trackFeature('favorite_add');
      favorites.value.push(prayerId);
    }
  }

  function isFavoritePrayer(prayerId, isProtected = false) {
    return (isProtected ? protectedFavorites : favoritePrayers).value.includes(prayerId);
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
    psalmodyMode,
    textAlignment,
    textSettingsExpanded,
    liturgicalSettingsExpanded,
    menuCategories,
    personalPrayerCategories: menuCategories,
    hiddenGlobalPrayerCategoryIds,
    favoritePrayers,
    favoriteSongs,
    songShowChords,
    songChordLayout,
    toggleFavoriteSong,
    readingHighlightsEnabled,
    liturgicalEmphasisEnabled,
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
    updateCategory,
    removeCategory,
    hideGlobalPrayerCategory,
    restoreGlobalPrayerCategories,
    toggleFavoritePrayer,
    isFavoritePrayer,
    setKeepScreenOn,
  };
});

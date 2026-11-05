// Application materials, not liturgical colours. Periods and celebrations
// keep their independent palette in liturgical.js.
export const APP_THEME_COLORS = Object.freeze({
  light: Object.freeze({
    primary: '#6B4A32',
    'on-primary': '#FFF8EE',
    secondary: '#79583D',
    'on-secondary': '#FFF8EE',
    background: '#F5F1E8',
    surface: '#FFFBF3',
    'surface-bright': '#FFFDF9',
    'surface-light': '#FFFDF9',
    'surface-variant': '#ECE3D6',
    'on-background': '#2A221B',
    'on-surface': '#2A221B',
    'on-surface-variant': '#675A4D',
    'reader-muted': '#6F6357',
    devotional: '#8B493B',
    'on-devotional': '#FFF9EF',
    rubric: '#9B302A',
    ambient: '#B49B71',
  }),
  marian: Object.freeze({
    primary: '#244D78',
    'on-primary': '#FFFFFF',
    secondary: '#477DAA',
    // White on the requested secondary is only 4.39:1. Dark ink passes AA.
    'on-secondary': '#000000',
    background: '#F4F8FC',
    surface: '#FFFFFF',
    'reader-surface': '#FBFDFF',
    'surface-bright': '#FFFFFF',
    'surface-light': '#FFFFFF',
    'surface-variant': '#E2EFF9',
    'on-background': '#202D39',
    'on-surface': '#202D39',
    'on-surface-variant': '#52687A',
    'reader-muted': '#52687A',
    devotional: '#244D78',
    'on-devotional': '#FFFFFF',
    rubric: '#9B302A',
    ambient: '#A8CBE6',
    error: '#A62D32',
    'on-error': '#FFFFFF',
    success: '#32643F',
    'on-success': '#FFFFFF',
    warning: '#795800',
    'on-warning': '#FFFFFF',
    info: '#285F88',
    'on-info': '#FFFFFF',
  }),
  dark: Object.freeze({
    primary: '#C9A67B',
    'on-primary': '#281B12',
    secondary: '#B89570',
    'on-secondary': '#281B12',
    // Near-black espresso is the material; walnut and bronze stay accents.
    background: '#0F0E0C',
    surface: '#171512',
    'surface-bright': '#211E1A',
    'surface-light': '#211E1A',
    'surface-variant': '#2A2621',
    'on-background': '#F2EBDD',
    'on-surface': '#F2EBDD',
    'on-surface-variant': '#C5B8A7',
    'reader-muted': '#B4A89A',
    devotional: '#D39A83',
    'on-devotional': '#2A1913',
    rubric: '#EF9188',
    ambient: '#4A3A2D',
  }),
});

export const APP_STATUS_BAR_COLORS = Object.freeze({
  light: APP_THEME_COLORS.light.primary,
  dark: APP_THEME_COLORS.dark.background,
  marian: APP_THEME_COLORS.marian.primary,
});

export const THEME_OPTIONS = Object.freeze([
  { value: 'system', label: 'Сістэма' },
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Цёмная' },
  { value: 'marian', label: 'Марыйная' },
]);

export function isThemePreference(value) {
  return THEME_OPTIONS.some((option) => option.value === value);
}

export function loadThemePreference(storage) {
  const saved = storage.getItem('themePreference');
  if (isThemePreference(saved)) return saved;
  const legacy = storage.getItem('theme');
  return Object.hasOwn(APP_THEME_COLORS, legacy) ? legacy : 'system';
}

export function resolveTheme(preference, systemDark) {
  return preference === 'system' ? systemDark ? 'dark' : 'light' : preference;
}

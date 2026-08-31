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
  dark: Object.freeze({
    primary: '#C9A67B',
    'on-primary': '#281B12',
    secondary: '#B89570',
    'on-secondary': '#281B12',
    background: '#17130F',
    surface: '#211C18',
    'surface-bright': '#302720',
    'surface-light': '#302720',
    'surface-variant': '#3A3028',
    'on-background': '#F2EBDD',
    'on-surface': '#F2EBDD',
    'on-surface-variant': '#C5B8A7',
    'reader-muted': '#B4A89A',
    devotional: '#D39A83',
    'on-devotional': '#2A1913',
    rubric: '#EF9188',
    ambient: '#6F4D30',
  }),
});

export const APP_STATUS_BAR_COLORS = Object.freeze({
  light: APP_THEME_COLORS.light.primary,
  dark: APP_THEME_COLORS.dark.background,
});

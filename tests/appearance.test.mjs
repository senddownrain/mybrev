import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { APP_THEME_COLORS, APP_STATUS_BAR_COLORS, APP_PWA_MANIFEST_THEME_COLOR, THEME_OPTIONS, isThemePreference, loadThemePreference, resolveTheme } from '../src/constants/appearance.js';
import { getLiturgicalTheme, LITURGICAL_THEME_MAP } from '../src/constants/liturgical.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const rgb = (hex) => hex.slice(1).match(/../g).map((c) => parseInt(c, 16));
function luminance(channels) {
  const [r, g, b] = channels.map((c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

for (const [theme, colors] of Object.entries(APP_THEME_COLORS)) {
  test(`${theme}: text, accents and keyboard focus stay readable on application surfaces`, () => {
    for (const surface of ['background', 'surface', 'surface-variant', ...(colors['reader-surface'] ? ['reader-surface'] : [])]) {
      for (const foreground of ['primary', 'devotional', 'on-surface', 'on-surface-variant', 'reader-muted', 'rubric']) {
        const ratio = contrast(rgb(colors[foreground]), rgb(colors[surface]));
        assert.ok(ratio >= 4.5, `${theme} ${foreground}/${surface}: ${ratio.toFixed(2)}`);
      }
      const background = rgb(colors[surface]);
      const focus = rgb(colors.primary).map((c, i) => c * 0.7 + background[i] * 0.3);
      assert.ok(contrast(focus, background) >= 3, `${theme} focus/${surface}`);
    }
    for (const role of ['primary', 'secondary', 'devotional']) {
      assert.ok(contrast(rgb(colors[role]), rgb(colors[`on-${role}`])) >= 4.5);
    }
  });
}

test('CSS and Vuetify share the same application palette, including overlay themes', () => {
  const css = read('src/styles/main.scss');
  assert.match(css, /\.v-theme--light,\s*\.v-theme--dark,\s*\.v-theme--marian\s*\{/);
  assert.match(css, /--chrome-accent: rgb\(var\(--v-theme-primary\)\)/);
  assert.match(css, /--devotional-rgb: var\(--v-theme-devotional\)/);
  assert.match(css, /--focus-ring: rgba\(var\(--chrome-accent-rgb\), 0\.7\)/);
  assert.match(css, /--overlay-surface: rgba\(var\(--v-theme-surface\)/);
  assert.match(css, /:where\(a:any-link\)\s*\{\s*color: var\(--chrome-accent\)/);
  const vuetify = read('src/plugins/vuetify.js');
  for (const theme of Object.keys(APP_THEME_COLORS)) {
    assert.ok(vuetify.includes(`colors: { ...APP_THEME_COLORS.${theme} }`));
  }
});

test('first paint, saved theme, runtime status bar and PWA manifest agree', () => {
  for (const path of ['index.html', 'public/404.html']) {
    const html = read(path);
    for (const saved of [null, 'system', 'light', 'dark', 'marian', 'obsolete-theme']) {
      for (const legacy of [null, 'light', 'dark', 'marian', 'obsolete-theme']) {
        for (const systemDark of [false, true]) {
          const storage = { getItem: (key) => key === 'themePreference' ? saved : legacy };
          const theme = resolveTheme(loadThemePreference(storage), systemDark);
          let themeColor = html.match(/name="theme-color" content="([^"]+)"/)[1];
          const dataset = {};
          runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], {
            localStorage: storage,
            matchMedia: () => ({ matches: systemDark }),
            document: {
              documentElement: { dataset },
              querySelector: () => ({ setAttribute: (_name, value) => { themeColor = value; } }),
            },
          });
          assert.equal(themeColor, APP_STATUS_BAR_COLORS[theme], `${path}: ${saved}/${legacy}/${systemDark}`);
          assert.equal(dataset.appearance, theme);
          assert.ok(html.includes(APP_THEME_COLORS[theme].background));
        }
      }
    }
  }
  const runtime = read('src/stores/settings.js');
  assert.match(runtime, /APP_STATUS_BAR_COLORS\[newTheme\]/);
  assert.match(runtime, /dataset\.appearance = newTheme/);
  const config = read('vite.config.js');
  assert.match(config, /theme_color: APP_PWA_MANIFEST_THEME_COLOR/);
  assert.match(config, /background_color: APP_THEME_COLORS\.light\.background/);
});

test('PWA native chrome fallback is neutral graphite and readable in every theme', () => {
  assert.equal(APP_PWA_MANIFEST_THEME_COLOR, '#111318');
  assert.ok(contrast(rgb('#FFFFFF'), rgb(APP_PWA_MANIFEST_THEME_COLOR)) >= 7);
  for (const color of Object.values(APP_STATUS_BAR_COLORS)) {
    assert.notEqual(APP_PWA_MANIFEST_THEME_COLOR, color);
  }
  // This change must never replace the per-theme top status-bar meta logic.
  assert.match(read('src/stores/settings.js'), /APP_STATUS_BAR_COLORS\[newTheme\]/);
});

test('document canvas and body use the selected PWA appearance in all themes', () => {
  const html = read('index.html');
  const css = read('src/styles/main.scss');
  assert.match(html, /:root\s*\{\s*--app-viewport-background:\s*#F5F1E8;/);
  assert.match(html, /:root\[data-appearance="dark"\]\s*\{\s*--app-viewport-background:\s*#0F0E0C;/);
  assert.match(html, /background-color:\s*var\(--app-viewport-background\)/);
  assert.match(html, /color-scheme:\s*light/);
  assert.match(html, /color-scheme:\s*dark/);
  assert.match(css, /html,\s*body\s*\{\s*background-color:\s*var\(--app-viewport-background,\s*#F5F1E8\)/);
  for (const theme of Object.keys(APP_THEME_COLORS)) {
    assert.ok(html.includes(APP_THEME_COLORS[theme].background), theme);
  }
});

test('purple literals only belong to liturgical or source-document ink, never application chrome', () => {
  const root = new URL('../src/', import.meta.url);
  const files = readdirSync(root, { recursive: true }).filter((file) => /\.(vue|js|scss|css)$/.test(file));
  const failures = [];
  for (const file of files) {
    if (file.replaceAll('\\', '/') === 'constants/liturgical.js') continue;
    // The static PDF transcription preserves its magenta documentary marks.
    // Its ink is scoped to .document-page and is independent of app chrome.
    if (file.replaceAll('\\', '/') === 'styles/documents.css') {
      const documentCss = read('src/styles/documents.css');
      assert.match(documentCss, /\.document-page\.v-container[^}]*--document-magenta:/);
      assert.match(documentCss, /\.v-theme--dark \.document-page[^}]*--document-magenta:/);
      assert.match(documentCss, /\.doc-tone--magenta\s*\{\s*color: var\(--document-magenta\)/);
      continue;
    }
    const source = readFileSync(new URL(file.replaceAll('\\', '/'), root), 'utf8');
    if (/["'](?:deep-)?(?:purple|indigo|violet|lavender)(?:-(?:darken|lighten)-\d)?["']/i.test(source)) failures.push(file);
    const colors = [
      ...[...source.matchAll(/#[\da-f]{6}\b/gi)].map(([hex]) => rgb(hex)),
      ...[...source.matchAll(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/g)].map((m) => m.slice(1).map(Number)),
    ];
    for (const [r, g, b] of colors) {
      // Also catch blue-lavender (equal red/green), including native link tones.
      if (b > g + 8 && r >= g - 8) failures.push(`${file}: rgb(${r},${g},${b})`);
    }
  }
  assert.deepEqual(failures, []);
});

test('periods and feast overrides retain their independent liturgical colours', () => {
  for (const period of ['ordinary', 'advent', 'lent', 'holyweek', 'christmas', 'easter']) {
    assert.deepEqual(getLiturgicalTheme({ _periodType: period }), LITURGICAL_THEME_MAP[period]);
  }
  assert.equal(getLiturgicalTheme({ _periodType: 'lent', _rank: 'memoria', _templates: ['blessed-virgin-mary'] }), LITURGICAL_THEME_MAP.marian);
  assert.equal(getLiturgicalTheme({ _periodType: 'advent', _rank: 'solemnitas' }), LITURGICAL_THEME_MAP.gold);
  assert.equal(getLiturgicalTheme({ _theme: 'requiem' }), LITURGICAL_THEME_MAP.requiem);
  const hours = read('src/components/OrasList.vue');
  assert.ok(!hours.includes('avatarColor'));
  assert.match(hours, /getLiturgicalTheme\(dayData\.value, dayData\.value\?\._periodType\)/);
});


test('Marian palette keeps the requested materials and readable functional colours', () => {
  const colors = APP_THEME_COLORS.marian;
  for (const [key, value] of Object.entries({
    background: '#F4F8FC', surface: '#FFFFFF', 'surface-variant': '#E2EFF9',
    primary: '#244D78', secondary: '#477DAA', ambient: '#A8CBE6',
    'on-surface': '#202D39', 'on-surface-variant': '#52687A', rubric: '#9B302A',
  })) assert.equal(colors[key], value, key);
  for (const role of ['error', 'success', 'warning', 'info']) {
    for (const surface of ['surface', 'background', 'surface-variant']) {
      assert.ok(contrast(rgb(colors[role]), rgb(colors[surface])) >= 4.5, `${role}/${surface}`);
    }
    assert.ok(contrast(rgb(colors[role]), rgb(colors[`on-${role}`])) >= 4.5, role);
  }
  assert.match(read('src/styles/main.scss'), /\.text-secondary\s*\{ color: rgb\(var\(--v-theme-primary\)\)/);
});

test('all four preferences, legacy migration, restoration and OS independence', () => {
  assert.deepEqual(THEME_OPTIONS.map((option) => option.value), ['system', 'light', 'dark', 'marian']);
  const saved = new Map();
  const storage = { getItem: (key) => saved.get(key) ?? null };
  assert.equal(loadThemePreference(storage), 'system');
  for (const legacy of ['light', 'dark']) {
    saved.set('theme', legacy);
    assert.equal(loadThemePreference(storage), legacy);
    saved.set('themePreference', 'invalid');
    assert.equal(loadThemePreference(storage), legacy);
    saved.delete('themePreference');
  }
  for (const { value } of THEME_OPTIONS) {
    assert.ok(isThemePreference(value));
    saved.set('themePreference', value);
    assert.equal(loadThemePreference(storage), value);
    for (const systemDark of [true, false]) {
      assert.equal(resolveTheme(loadThemePreference(storage), systemDark), value === 'system' ? systemDark ? 'dark' : 'light' : value);
    }
  }
  assert.equal(isThemePreference('unknown'), false);
  assert.equal(isThemePreference(null), false);
  saved.set('fontSizeMultiplier', '1.3');
  loadThemePreference(storage);
  assert.equal(saved.get('fontSizeMultiplier'), '1.3');
});


test('Marian prayer paper remains almost white with AA text and focus contrast', () => {
  const colors = APP_THEME_COLORS.marian;
  assert.equal(colors['reader-surface'], '#FBFDFF');
  for (const role of ['on-surface', 'on-surface-variant', 'primary', 'rubric']) {
    assert.ok(contrast(rgb(colors[role]), rgb(colors['reader-surface'])) >= 4.5, role);
  }
});

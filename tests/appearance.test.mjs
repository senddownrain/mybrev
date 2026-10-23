import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { APP_THEME_COLORS, APP_STATUS_BAR_COLORS } from '../src/constants/appearance.js';
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
  test(`${theme}: text, accents and keyboard focus stay readable on warm surfaces`, () => {
    for (const surface of ['background', 'surface', 'surface-variant']) {
      for (const foreground of ['primary', 'devotional', 'on-surface', 'reader-muted', 'rubric']) {
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
  assert.match(css, /\.v-theme--light,\s*\.v-theme--dark\s*\{/);
  assert.match(css, /--chrome-accent: rgb\(var\(--v-theme-primary\)\)/);
  assert.match(css, /--devotional-rgb: var\(--v-theme-devotional\)/);
  assert.match(css, /--focus-ring: rgba\(var\(--chrome-accent-rgb\), 0\.7\)/);
  assert.match(css, /--overlay-surface: rgba\(var\(--v-theme-surface\)/);
  assert.match(css, /:where\(a:any-link\)\s*\{\s*color: var\(--chrome-accent\)/);
  const vuetify = read('src/plugins/vuetify.js');
  for (const theme of ['light', 'dark']) {
    assert.ok(vuetify.includes(`colors: { ...APP_THEME_COLORS.${theme} }`));
  }
});

test('first paint, saved theme, runtime status bar and PWA manifest agree', () => {
  for (const path of ['index.html', 'public/404.html']) {
    const html = read(path);
    for (const savedTheme of [null, 'light', 'dark', 'obsolete-theme']) {
      const theme = savedTheme === 'dark' ? 'dark' : 'light';
      let themeColor = html.match(/name="theme-color" content="([^"]+)"/)[1];
      const dataset = {};
      runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], {
        localStorage: { getItem: () => savedTheme },
        document: {
          documentElement: { dataset },
          querySelector: () => ({ setAttribute: (_name, value) => { themeColor = value; } }),
        },
      });
      assert.equal(themeColor, APP_STATUS_BAR_COLORS[theme], `${path}: ${savedTheme}`);
      assert.equal(dataset.appearance || 'light', theme);
      assert.ok(html.includes(APP_THEME_COLORS[theme].background));
    }
  }
  const runtime = read('src/stores/settings.js');
  assert.match(runtime, /APP_STATUS_BAR_COLORS\[newTheme\]/);
  assert.match(runtime, /dataset\.appearance = newTheme/);
  const config = read('vite.config.js');
  assert.match(config, /theme_color: APP_STATUS_BAR_COLORS\.light/);
  assert.match(config, /background_color: APP_THEME_COLORS\.light\.background/);
});

test('document canvas and body use the selected PWA appearance in both themes', () => {
  const html = read('index.html');
  const css = read('src/styles/main.scss');
  assert.match(html, /:root\s*\{\s*--app-viewport-background:\s*#F5F1E8;/);
  assert.match(html, /:root\[data-appearance="dark"\]\s*\{\s*--app-viewport-background:\s*#0F0E0C;/);
  assert.match(html, /background-color:\s*var\(--app-viewport-background\)/);
  assert.match(html, /color-scheme:\s*light/);
  assert.match(html, /color-scheme:\s*dark/);
  assert.match(css, /html,\s*body\s*\{\s*background-color:\s*var\(--app-viewport-background,\s*#F5F1E8\)/);
  for (const theme of ['light', 'dark']) {
    assert.ok(html.includes(APP_THEME_COLORS[theme].background), theme);
  }
});

test('purple literals only belong to the liturgical palette, never application chrome', () => {
  const root = new URL('../src/', import.meta.url);
  const files = readdirSync(root, { recursive: true }).filter((file) => /\.(vue|js|scss|css)$/.test(file));
  const failures = [];
  for (const file of files) {
    if (file.replaceAll('\\', '/') === 'constants/liturgical.js') continue;
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

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Static guards for the five audited responsive defects (RESPONSIVE_AUDIT.md #1-#5).
// The geometry itself is measured in a real browser by `npm run smoke:responsive`.
const style = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').split('<style')[1];
const norm = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');
// All declarations of the rules whose selector is exactly `selector` (a later rule overrides an earlier one).
const rule = (css, selector) => {
  const flat = norm(css);
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const bodies = [...flat.matchAll(new RegExp(`(?<=^|[}{>] )${escaped} \\{([^}]*)\\}`, 'g'))].map((m) => m[1]);
  assert.ok(bodies.length > 0, `rule ${selector} exists`);
  return bodies.join(' ');
};

test('Mass reading-set buttons do not inherit the compact A/B/C shrink on phones', () => {
  const css = style('src/components/readings/ReadingsView.vue');
  const phone = css.slice(css.indexOf('@media (max-width: 600px)'));
  const shrink = rule(phone, '.cycle-choice__button');
  assert.match(shrink, /flex: 1 1 0/);
  const set = rule(phone, '.set-choice__button');
  assert.match(set, /flex: 0 0 auto/);
  assert.match(set, /white-space: normal/);
  assert.match(set, /width: 100%/);
  assert.match(rule(phone, '.set-choice__buttons'), /flex-direction: column/);
});

test('the standalone acclamation scales with the text multiplier and is never scaled twice', () => {
  const css = style('src/components/readings/ParsedReadingCard.vue');
  assert.match(rule(css, '.reading-acclamation'), /font-size: calc\(1\.04rem \* var\(--font-size-multiplier, 1\)\)/);
  assert.match(norm(css), /\.section-text, \.alleluia-verse \{[^}]*font-size: calc\(1\.04rem \* var\(--font-size-multiplier, 1\)\)/);
  const nested = norm(css).match(/\.section-text :deep\(\.reading-acclamation\)[^{]*\{[^}]*\}/)?.[0] || '';
  assert.match(nested, /font-size: inherit/);
});

test('long section labels wrap instead of being clipped', () => {
  const css = style('src/components/readings/ParsedReadingCard.vue');
  const label = rule(css, '.section-label');
  assert.match(label, /overflow-wrap: anywhere/);
  assert.match(label, /min-width: 0/);
  assert.doesNotMatch(label, /overflow: hidden/);
  assert.match(label, /letter-spacing: max\(0\.04em, calc\(0\.11em \/ var\(--font-size-multiplier, 1\)\)\)/);
});

test('dioceses use their own 2 x 2 grid and the theme switch keeps its flex layout', () => {
  const source = readFileSync(new URL('../src/views/Settings.vue', import.meta.url), 'utf8');
  assert.match(source, /class="theme-options diocese-options"[^>]*data-test="settings-dioceses"/);
  const css = style('src/views/Settings.vue');
  assert.match(source, /class="setting-row setting-row--dioceses"/);
  const row = rule(css, '.setting-row--dioceses');
  assert.match(row, /flex-direction: column/);
  assert.match(row, /align-items: stretch/);
  const grid = rule(css, '.diocese-options');
  assert.match(grid, /display: grid/);
  assert.match(grid, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(grid, /grid-auto-rows: 1fr/);
  assert.match(grid, /width: 100%/);
  assert.doesNotMatch(grid, /360px/);
  const narrow = css.slice(css.indexOf('@media (max-width: 380px)'));
  assert.match(rule(narrow, '.diocese-options'), /grid-template-columns: 1fr/);
  assert.match(rule(css, '.theme-options'), /display: flex/);
  assert.equal((source.match(/class="theme-options"/g) || []).length, 1, 'the theme switch still uses the plain flex layout');
});

test('only the open drawer casts a shadow', () => {
  const css = style('src/layouts/default/NavigationDrawer.vue');
  assert.match(rule(css, '.app-drawer'), /box-shadow: none !important/);
  assert.match(rule(css, '.app-drawer.v-navigation-drawer--active'), /box-shadow: 10px 0 32px var\(--nav-shadow\) !important/);
});

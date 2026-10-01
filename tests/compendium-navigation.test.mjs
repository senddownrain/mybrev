import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COMPENDIUM_SOURCE_URL } from '../src/constants/compendium.js';
import { compendiumParentRoute } from '../src/utils/compendiumBack.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('drawer keeps Кампендый between Bible and songs', () => {
  const drawer = read('src/layouts/default/NavigationDrawer.vue');
  const bible = drawer.indexOf('title="Біблія"');
  const compendium = drawer.indexOf('title="Кампендый"');
  const songs = drawer.indexOf('title="Спеўнік"');
  assert.ok(bible > 0 && compendium > bible && songs > compendium);
  assert.match(drawer.slice(compendium, songs), /<PhScroll /);
});

test('root, Part and question are the normal routes; node and topic are compatibility redirects', () => {
  const router = read('src/router/index.js');
  const shell = router.slice(router.indexOf("path: 'compendium',"), router.indexOf("path: 'songs'"));
  assert.match(shell, /CompendiumShell\.vue/);
  for (const [path, name] of [
    ['', 'Compendium'], ['part/:partId', 'CompendiumPart'],
    ['node/:nodeId', 'CompendiumNode'], ['topic/:topicId', 'CompendiumTopic'],
    ['question/:number', 'CompendiumQuestion'],
  ]) assert.match(shell, new RegExp(`path: '${path.replace(/[/:]/g, '\\$&')}', name: '${name}'`));
  assert.equal(shell.match(/CompendiumLegacy\.vue/g).length, 2);
  assert.equal(shell.match(/CompendiumNode\.vue/g).length, 1);
  assert.match(read('src/views/CompendiumQuestion.vue'), /store\.init\(\)/);
});

test('one persistent search dock covers root, Part and question; sources remain attributed', () => {
  const shell = read('src/views/CompendiumShell.vue');
  assert.equal(shell.match(/<CompendiumSearchDock\b/g).length, 1);
  assert.match(shell, /:key="route.path" v-show="!resultsOpen"/);
  assert.match(shell, /<CompendiumSearchResults v-if="store.ready" :results="store.searchResults" \/>/);
  assert.match(read('src/components/compendium/CompendiumSearchDock.vue'), /v-model="store\.searchQuery"/);
  assert.match(read('src/components/compendium/CompendiumSearchResults.vue'), /name: 'CompendiumQuestion'/);
  assert.equal(COMPENDIUM_SOURCE_URL, 'https://catholic.by/3/lib/documents/kasciol/3963-kampendyj-katekhizisa-katalitskaga-kastsjola');
  for (const view of ['Compendium', 'CompendiumNode', 'CompendiumQuestion']) {
    assert.match(read(`src/views/${view}.vue`), /<CompendiumSource \/>/);
  }
});

test('Back uses history, with Part anchor fallback for legacy deep links', () => {
  const layout = read('src/layouts/default/Default.vue');
  assert.match(layout, /router\.back\(\)/);
  assert.match(layout, /router\.push\(compendiumParentRoute\(route\.name, route\.params\)\)/);
  assert.deepEqual(compendiumParentRoute('CompendiumNode', { nodeId: 'p1-s1-ch1' }),
    { name: 'CompendiumPart', params: { partId: 'p1' }, hash: '#p1-s1-ch1' });
  assert.deepEqual(compendiumParentRoute('CompendiumTopic', { topicId: 'p4-s2-intro-t1' }),
    { name: 'CompendiumPart', params: { partId: 'p4' }, hash: '#p4-s2-intro-t1' });
  assert.deepEqual(compendiumParentRoute('CompendiumPart', { partId: 'p1' }), { name: 'Compendium' });
});

test('Part styles use existing theme tokens and reserve room for the search dock', () => {
  const css = read('src/styles/compendium.css');
  assert.match(css, /\.prayers-list-container\.compendium-container\s*\{\s*padding-bottom: calc\(104px/);
  assert.match(css, /\.prayer-view-container\.compendium-reader\s*\{\s*padding-bottom: calc\(96px/);
  assert.match(css, /\.compendium-outline-heading--section/);
  assert.match(css, /\.compendium-outline-heading--subsection/);
  assert.match(css, /\.compendium-outline-topic/);
  assert.match(css, /\.compendium-outline-subtopic/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,6}\b/i);
  assert.match(read('src/views/CompendiumNode.vue'), /class="prayers-list-container compendium-container"/);
});

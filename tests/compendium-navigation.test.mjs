import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COMPENDIUM_SOURCE_URL } from '../src/constants/compendium.js';
import { compendiumParentRoute } from '../src/utils/compendiumBack.js';

// The repo has no component test runner; like appearance.test.mjs these
// checks pin the wiring in the source files.
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('drawer: «Кампендый» with a Phosphor icon, between Bible and songs', () => {
  const drawer = read('src/layouts/default/NavigationDrawer.vue');
  const bible = drawer.indexOf('title="Біблія"');
  const compendium = drawer.indexOf('title="Кампендый"');
  const songs = drawer.indexOf('title="Спеўнік"');
  assert.ok(bible > 0 && compendium > bible && songs > compendium);
  const item = drawer.slice(compendium, songs);
  assert.match(item, /:to="\{ name: 'Compendium' \}"/);
  assert.match(item, /<PhScroll /);
  assert.doesNotMatch(item, /PhBookOpen/);
  assert.match(drawer, /COMPENDIUM_ROUTE_NAMES = new Set\(\['Compendium', 'CompendiumPart', 'CompendiumNode', 'CompendiumTopic', 'CompendiumQuestion'\]\)/);
});

test('routes: root, part, structural node, topic and deep-linkable question inside one shell', () => {
  const router = read('src/router/index.js');
  const shell = router.slice(router.indexOf("path: 'compendium',"), router.indexOf("path: 'songs'"));
  assert.match(shell, /component: \(\) => import\('@\/views\/CompendiumShell\.vue'\)/);
  for (const [path, name] of [
    ['', 'Compendium'],
    ['part/:partId', 'CompendiumPart'],
    ['node/:nodeId', 'CompendiumNode'],
    ['topic/:topicId', 'CompendiumTopic'],
    ['question/:number', 'CompendiumQuestion'],
  ]) assert.match(shell, new RegExp(`path: '${path.replace(/[/:]/g, '\\$&')}', name: '${name}'`));
  // Part, section and subsection are one reusable view.
  assert.equal(shell.match(/import\('@\/views\/CompendiumNode\.vue'\)/g).length, 2);
  // Question pages resolve data from the store after a reload (lazy dataset + init()).
  const question = read('src/views/CompendiumQuestion.vue');
  assert.match(question, /store\.init\(\)/);
  assert.match(question, /Пытанне \{\{ number \}\} не знойдзена/);
});

test('root screen: title and four parts; search lives in the shell', () => {
  const root = read('src/views/Compendium.vue');
  assert.match(root, /COMPENDIUM_TITLE/);
  assert.match(root, /name: 'CompendiumPart'/);
  const shell = read('src/views/CompendiumShell.vue');
  assert.match(shell, /<CompendiumSearchResults v-if="store\.ready" :results="store\.searchResults" \/>/);
  const results = read('src/components/compendium/CompendiumSearchResults.vue');
  assert.match(results, /name: 'CompendiumQuestion'/);
  assert.match(results, /Нічога не знойдзена/);
  // Reuses the existing search dock and list styles instead of new ones.
  assert.match(read('src/components/compendium/CompendiumSearchDock.vue'), /class="prayer-search-dock"/);
  assert.match(results, /class="prayer-list-item compendium-row"/);
});

test('search query lives in the store so it survives entering a result', () => {
  const store = read('src/stores/compendium.js');
  assert.match(store, /const searchQuery = ref\(''\)/);
  assert.match(read('src/components/compendium/CompendiumSearchDock.vue'), /v-model="store\.searchQuery"/);
});

test('source attribution links to Catholic.by', () => {
  assert.equal(COMPENDIUM_SOURCE_URL, 'https://catholic.by/3/lib/documents/kasciol/3963-kampendyj-katekhizisa-katalitskaga-kastsjola');
  const source = read('src/components/compendium/CompendiumSource.vue');
  assert.match(source, /:href="COMPENDIUM_SOURCE_URL"/);
  assert.match(source, /rel="noopener noreferrer"/);
  for (const view of ['Compendium', 'CompendiumNode', 'CompendiumTopic', 'CompendiumQuestion']) {
    assert.match(read(`src/views/${view}.vue`), /<CompendiumSource \/>/, view);
  }
});

test('back navigation uses history, with a parent fallback for deep links', () => {
  const layout = read('src/layouts/default/Default.vue');
  assert.match(layout, /isCompendiumSubPage = computed\(\(\) => \['CompendiumPart', 'CompendiumNode', 'CompendiumTopic', 'CompendiumQuestion'\]/);
  assert.match(layout, /const goBackInCompendium = \(\) => \{\n {2}if \(router\.options\.history\.state\.back\) \{\n {4}router\.back\(\);/);
  assert.match(layout, /router\.push\(compendiumParentRoute\(route\.name, route\.params\)\);/);
  // Deep link → logical parent: topic → subsection/section → part → root.
  const node = (nodeId) => ({ name: 'CompendiumNode', params: { nodeId } });
  const part = (partId) => ({ name: 'CompendiumPart', params: { partId } });
  assert.deepEqual(compendiumParentRoute('CompendiumTopic', { topicId: 'p1-s1-ch2-t1' }), node('p1-s1-ch2'));
  assert.deepEqual(compendiumParentRoute('CompendiumTopic', { topicId: 'p4-s2-intro-t1' }), node('p4-s2'));
  assert.deepEqual(compendiumParentRoute('CompendiumNode', { nodeId: 'p1-s1-ch1' }), node('p1-s1'));
  assert.deepEqual(compendiumParentRoute('CompendiumNode', { nodeId: 'p1-s1' }), part('p1'));
  assert.deepEqual(compendiumParentRoute('CompendiumPart', { partId: 'p1' }), { name: 'Compendium' });
  assert.deepEqual(compendiumParentRoute('CompendiumQuestion', { number: '5' }), { name: 'Compendium' });
  assert.deepEqual(compendiumParentRoute('CompendiumNode', { nodeId: 'garbage' }), { name: 'Compendium' });
});

test('Compendium stays independent from prayers', () => {
  for (const file of ['src/stores/compendium.js', 'src/services/compendiumService.js', 'src/views/CompendiumTopic.vue']) {
    assert.doesNotMatch(read(file), /prayer(Service|s\.js|sFilters)|usePrayers/, file);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nextTick, ref } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { indexCompendium } from '../src/utils/compendiumData.js';
import {
  buildCompendiumNavigation, buildPartOutline, questionContextLabel, questionTrail,
  readingItemRoute, readingNeighbours, resolveLegacyTopicRoute,
} from '../src/utils/compendiumNavigation.js';
import { createCompendiumSearchIndex, searchCompendium } from '../src/utils/compendiumSearch.js';
import { createCompendiumSearchSync } from '../src/utils/compendiumSearchRoute.js';

const readJson = (path) => JSON.parse(readFileSync(new URL(`../src/data/compendium/${path}`, import.meta.url), 'utf8'));
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const dataset = readJson('compendium.json');
const index = indexCompendium(dataset);
const navigation = buildCompendiumNavigation(index);
const search = createCompendiumSearchIndex(index.questions, readJson('compendium_search_aliases.json'));
const numbers = (questions) => questions.map((question) => question.number);
const allNodes = [...navigation.nodes.values()];

// --- Hierarchy -------------------------------------------------------------

test('question 1 sits directly under РАЗДЗЕЛ ПЕРШЫ «ВЕРУ» — «ВЕРЫМ», before its chapters', () => {
  const [section] = buildPartOutline(index, 'p1').sections;
  assert.equal(section.label, 'РАЗДЗЕЛ ПЕРШЫ');
  assert.equal(section.title, '«ВЕРУ» — «ВЕРЫМ»');
  assert.deepEqual(numbers(section.directQuestions), [1]);
  assert.equal(section.directQuestions[0].question, index.getQuestion(1).question);
  assert.deepEqual(section.topics, []);
  assert.deepEqual(section.chapters.map((chapter) => chapter.label), ['ГЛАВА ПЕРШАЯ', 'ГЛАВА ДРУГАЯ', 'ГЛАВА ТРЭЦЯЯ']);
  assert.equal(section.chapters[0].title, 'ЧАЛАВЕК — «СВЯТЫНЯ» БОГА');
  assert.deepEqual(numbers(section.chapters[0].directQuestions), [2, 3, 4, 5]);
  // The chapter's lead quotation stays visible with its real heading.
  assert.equal(section.chapters[0].leadCitations.length, 1);
});

test('no visible node is a technical group or a question-range title', () => {
  for (const node of allNodes) {
    assert.equal(node.sourceHeading, true, node.id);
    assert.ok(typeof node.title === 'string' && node.title.trim(), node.id);
    assert.doesNotMatch(node.title, /^Пытанн[еі]\s+\d/u, node.id);
    assert.doesNotMatch(node.id, /-intro$/, node.id);
  }
  assert.equal(navigation.getNode('p1-s1-intro'), null);
  const outlineIds = ['p1', 'p2', 'p3', 'p4'].flatMap((partId) => buildPartOutline(index, partId).sections
    .flatMap((section) => [section, ...section.topics, ...section.chapters, ...section.chapters.flatMap((chapter) => chapter.topics)])
    .map((node) => node.id));
  assert.ok(!outlineIds.includes('p1-s1-intro'));
  assert.ok(!outlineIds.some((id) => id.endsWith('-intro')));
  // The part screen links topics and direct questions only, never a raw group id.
  const part = read('src/components/compendium/CompendiumNodeList.vue');
  assert.match(part, /name: 'CompendiumQuestion', params: \{ number: question\.number \}/);
  assert.doesNotMatch(read('src/views/CompendiumPart.vue'), /group\.id|rangeLabel\(group\)/);
});

test('ЧАСТКА / РАЗДЗЕЛ / ГЛАВА keep their own source labels', () => {
  for (const part of navigation.parts) {
    assert.match(part.label, /^ЧАСТКА /u);
    for (const section of part.sections) {
      assert.match(section.label, /^РАЗДЗЕЛ /u);
      for (const chapter of section.chapters) assert.match(chapter.label, /^ГЛАВА /u);
    }
  }
  const chapters = allNodes.filter((node) => node.kind === 'chapter');
  assert.equal(chapters.length, dataset.parts.flatMap((part) => part.sections.flatMap((section) => section.chapters)).length);
});

test('real named topics stay visible, with the range only as metadata', () => {
  const chapter = navigation.getNode('p1-s1-ch2');
  assert.deepEqual(chapter.directQuestions, []);
  assert.deepEqual(chapter.topics.map((topic) => [topic.title, topic.firstQuestion, topic.lastQuestion]), [
    ['БОЖАЕ АБ’ЯЎЛЕННЕ', 6, 10],
    ['ПЕРАДАВАННЕ БОЖАГА АБ’ЯЎЛЕННЯ', 11, 17],
    ['СВЯТОЕ ПIСАННЕ', 18, 24],
  ]);
  // Direct questions before named topics: rows, not a fake «Пытанні 79–80» node.
  const christ = navigation.getNode('p1-s2-ch2');
  assert.deepEqual(numbers(christ.directQuestions), [79, 80]);
  assert.equal(christ.topics[0].firstQuestion, 81);
  // A section with named topics but no chapters (Part IV, Lord's Prayer).
  const lordsPrayer = buildPartOutline(index, 'p4').sections[1];
  assert.equal(lordsPrayer.title, 'МАЛІТВА ПАНСКАЯ');
  assert.deepEqual(lordsPrayer.topics.map((topic) => topic.title)[0], 'ОЙЧА НАШ');
  // Italic subheadings remain metadata of their topic.
  assert.deepEqual(navigation.getNode('p1-s2-ch1-t2').subtopics.map((sub) => sub.title), ['Неба і зямля', 'Чалавек', 'Упадак']);
});

test('every question is reachable exactly once from the source hierarchy', () => {
  const seen = [];
  for (const node of allNodes) {
    seen.push(...numbers(node.directQuestions));
    if (node.kind === 'topic') for (let n = node.firstQuestion; n <= node.lastQuestion; n++) seen.push(n);
  }
  assert.deepEqual(seen.sort((a, b) => a - b), numbers(index.questions));
});

test('legacy technical group routes resolve gracefully', () => {
  assert.deepEqual(resolveLegacyTopicRoute(index, 'p1-s1-intro'), { name: 'CompendiumQuestion', params: { number: '1' } });
  assert.deepEqual(resolveLegacyTopicRoute(index, 'p1-s1-ch1'), { name: 'CompendiumPart', params: { partId: 'p1' }, hash: '#p1-s1-ch1' });
  assert.deepEqual(resolveLegacyTopicRoute(index, 'p3-s2-intro'), { name: 'CompendiumPart', params: { partId: 'p3' }, hash: '#p3-s2' });
  assert.deepEqual(resolveLegacyTopicRoute(index, 'p2-s2-ch1'), { name: 'CompendiumQuestion', params: { number: '251' } });
  // Real topics keep their route; unknown ids fall through to «не знойдзена».
  assert.equal(resolveLegacyTopicRoute(index, 'p1-s1-ch2-t1'), null);
  assert.equal(resolveLegacyTopicRoute(index, 'p9-x'), null);
  assert.match(read('src/views/CompendiumTopic.vue'), /resolveLegacyTopicRoute\(store\.index, props\.topicId\)/);
});

test('topic pager walks named topics and direct questions in source order', () => {
  const { previous, next } = readingNeighbours(index, 'p1-s1-ch2-t1');
  assert.deepEqual(readingItemRoute(previous), { name: 'CompendiumQuestion', params: { number: '5' } });
  assert.deepEqual(readingItemRoute(next), { name: 'CompendiumTopic', params: { topicId: 'p1-s1-ch2-t2' } });
  assert.ok(navigation.sequence.every((item) => item.kind === 'question' || navigation.getNode(item.id)?.kind === 'topic'));
});

test('context trails use real headings only, without duplicates', () => {
  assert.deepEqual(questionTrail(index, index.getQuestion(1)).map((crumb) => crumb.label), ['ЧАСТКА ПЕРШАЯ', '«ВЕРУ» — «ВЕРЫМ»']);
  assert.deepEqual(questionTrail(index, index.getQuestion(6)).map((crumb) => crumb.label),
    ['ЧАСТКА ПЕРШАЯ', '«ВЕРУ» — «ВЕРЫМ»', 'БОГ ВЫХОДЗІЦЬ НАСУСТРАЧ ЧАЛАВЕКУ', 'БОЖАЕ АБ’ЯЎЛЕННЕ']);
  for (const question of index.questions) {
    const labels = questionTrail(index, question).map((crumb) => crumb.label);
    labels.forEach((label, position) => assert.notEqual(label, labels[position - 1], `q${question.number}`));
    assert.ok(labels.every((label) => !/^Пытанн|^p\d/u.test(label)), `q${question.number}`);
  }
  assert.equal(questionContextLabel(index.getQuestion(1)), 'ЧАСТКА ПЕРШАЯ · «ВЕРУ» — «ВЕРЫМ»');
  assert.equal(questionContextLabel(index.getQuestion(3)), 'ЧАСТКА ПЕРШАЯ · ЧАЛАВЕК — «СВЯТЫНЯ» БОГА');
});

// --- Search ----------------------------------------------------------------

test('one search dock, mounted by the shell for every Compendium level', () => {
  const shell = read('src/views/CompendiumShell.vue');
  assert.equal(shell.match(/<CompendiumSearchDock\b/g).length, 1);
  assert.match(shell, /<router-view v-slot="\{ Component \}">/);
  for (const view of ['Compendium', 'CompendiumPart', 'CompendiumTopic', 'CompendiumQuestion']) {
    assert.doesNotMatch(read(`src/views/${view}.vue`), /CompendiumSearchDock/, view);
  }
  // All four levels are children of the shell route.
  const router = read('src/router/index.js');
  const block = router.slice(router.indexOf("path: 'compendium',"), router.indexOf("path: 'songs'"));
  for (const name of ['Compendium', 'CompendiumPart', 'CompendiumTopic', 'CompendiumQuestion']) assert.match(block, new RegExp(`name: '${name}'`));
});

test('numeric, Belarusian and hidden Russian search keep working', () => {
  for (const n of [1, 125, 598]) assert.equal(searchCompendium(search, String(n))[0].question.number, n);
  assert.ok(searchCompendium(search, 'хрост').some((result) => result.question.number === 252));
  const russian = searchCompendium(search, 'крещение');
  assert.ok(russian.some((result) => result.question.number === 252));
  // Visible result content stays Belarusian.
  for (const { question } of russian.slice(0, 10)) {
    assert.doesNotMatch(`${question.question} ${question.answer} ${questionContextLabel(question)}`, /[щъ]|крещ/iu);
    assert.equal(question, index.getQuestion(question.number));
  }
});

function memoryRouter() {
  const view = { render: () => null };
  return createRouter({
    history: createMemoryHistory(),
    routes: [{
      path: '/compendium',
      component: view,
      children: [
        { path: '', name: 'Compendium', component: view },
        { path: 'part/:partId', name: 'CompendiumPart', component: view },
        { path: 'topic/:topicId', name: 'CompendiumTopic', component: view },
        { path: 'question/:number', name: 'CompendiumQuestion', component: view },
      ],
    }],
  });
}

const waitForRoute = (router, predicate) => new Promise((resolve) => {
  if (predicate(router.currentRoute.value)) { resolve(); return; }
  const stop = router.afterEach((to) => { if (predicate(to)) { stop(); resolve(); } });
});

test('query survives result → question → Back, and clearing restores the page', async () => {
  const router = memoryRouter();
  await router.push('/compendium/topic/p1-s1-ch2-t1');
  const query = ref('');
  let scroll = 640;
  const sync = createCompendiumSearchSync({ router, query, getScroll: () => scroll, setScroll: (top) => { scroll = top; } });
  const settle = async () => { await nextTick(); await sync.settled(); };

  // Typing on a nested level opens global results on that level.
  query.value = 'Эў';
  query.value = 'Эўхарыстыя';
  await settle();
  assert.equal(router.currentRoute.value.fullPath, `/compendium/topic/p1-s1-ch2-t1?q=${encodeURIComponent('Эўхарыстыя')}`);
  assert.equal(sync.resultsOpen.value, true);
  assert.equal(scroll, 0);

  // Opening a result keeps the query in the dock but shows the question.
  await router.push({ name: 'CompendiumQuestion', params: { number: '271' } });
  assert.equal(sync.resultsOpen.value, false);
  assert.equal(query.value, 'Эўхарыстыя');

  // Back returns to the results for the same query.
  router.back();
  await waitForRoute(router, (route) => route.name === 'CompendiumTopic');
  assert.equal(sync.resultsOpen.value, true);
  assert.equal(query.value, 'Эўхарыстыя');

  // Clearing restores the page the user was on, with its scroll.
  query.value = '';
  await settle();
  assert.equal(router.currentRoute.value.fullPath, '/compendium/topic/p1-s1-ch2-t1');
  assert.equal(sync.resultsOpen.value, false);
  assert.equal(scroll, 640);

  // A kept query reopens from the dock on any level.
  await router.push('/compendium/question/5');
  query.value = '5';
  await settle();
  await router.push('/compendium/question/1');
  await sync.reopen();
  assert.equal(router.currentRoute.value.fullPath, '/compendium/question/1?q=5');
  sync.stop();
});

// --- Layout ----------------------------------------------------------------

test('fixed dock never covers the last content', () => {
  const css = read('src/styles/compendium.css');
  assert.match(css, /\.prayers-list-container\.compendium-container \{\n {2}padding-bottom: calc\(104px \+ env\(safe-area-inset-bottom, 0px\)\) !important;/);
  assert.match(css, /\.prayer-view-container\.compendium-reader \{\n {2}padding-bottom: calc\(96px \+ env\(safe-area-inset-bottom, 0px\)\) !important;/);
  for (const [view, container] of [
    ['Compendium', 'prayers-list-container compendium-container'],
    ['CompendiumPart', 'prayers-list-container compendium-container'],
    ['CompendiumTopic', 'prayer-view-container compendium-reader'],
    ['CompendiumQuestion', 'prayer-view-container compendium-reader'],
    ['CompendiumShell', 'prayers-list-container compendium-container'],
  ]) assert.match(read(`src/views/${view}.vue`), new RegExp(`class="${container}"`), view);
  // Only existing theme tokens; no hard-coded colours.
  assert.doesNotMatch(css, /#[0-9a-f]{3,6}\b/i);
});

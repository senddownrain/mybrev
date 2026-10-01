import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nextTick, ref } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { indexCompendium } from '../src/utils/compendiumData.js';
import {
  buildCompendiumNavigation, buildPartReadingOutline, questionPartRoute,
  questionTrail, resolveLegacyNodeRoute, resolveLegacyTopicRoute,
} from '../src/utils/compendiumNavigation.js';
import { compendiumLevelLabel, masculineOrdinal } from '../src/utils/compendiumLabels.js';
import { createCompendiumSearchIndex, searchCompendium } from '../src/utils/compendiumSearch.js';
import { createCompendiumSearchSync } from '../src/utils/compendiumSearchRoute.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const dataset = JSON.parse(read('src/data/compendium/compendium.json'));
const index = indexCompendium(dataset);
const navigation = buildCompendiumNavigation(index);
const aliases = JSON.parse(read('src/data/compendium/compendium_search_aliases.json'));
const search = createCompendiumSearchIndex(index.questions, aliases);
const outline = (partId) => buildPartReadingOutline(index, partId);
const items = (partId) => outline(partId).items;
const questions = (partId) => items(partId).filter((item) => item.kind === 'question').map((item) => item.question.number);
const position = (partId, id) => items(partId).findIndex((item) => item.id === id);
const partRoute = (partId, hash) => ({ name: 'CompendiumPart', params: { partId }, hash: `#${hash}` });

test('root keeps four parts; one Part view renders all questions as one row style', () => {
  assert.deepEqual(index.parts.map((part) => part.id), ['p1', 'p2', 'p3', 'p4']);
  const root = read('src/views/Compendium.vue');
  assert.match(root, /v-for="part in parts"/);
  assert.match(root, /name: 'CompendiumPart'/);
  const part = read('src/views/CompendiumNode.vue');
  assert.match(part, /buildPartReadingOutline/);
  assert.match(part, /v-for="item in outline.items"/);
  assert.match(part, /class="prayer-list-item compendium-row"/);
  assert.match(part, /name: 'CompendiumQuestion'/);
  assert.doesNotMatch(part, /CompendiumNodeList|nodeRoute|name: 'CompendiumTopic'/);
});

test('each part has exactly its canonical questions in order; 598 total without duplicates', () => {
  const flattened = index.parts.flatMap((part) => {
    const actual = questions(part.id);
    const canonical = index.questions.filter((question) => question.partId === part.id).map((question) => question.number);
    assert.deepEqual(actual, canonical, part.id);
    assert.equal(outline(part.id), outline(part.id), 'cached per index and part');
    return actual;
  });
  assert.equal(flattened.length, 598);
  assert.equal(new Set(flattened).size, 598);
  assert.deepEqual(flattened, index.questions.map((question) => question.number));
  assert.equal(buildPartReadingOutline(index, 'unknown'), null);
});

test('Part I starts section → q1 → subsection → lead quotation → q2–5 → named topic → q6', () => {
  const first = items('p1');
  assert.deepEqual(first.slice(0, 5).map((item) => item.id),
    ['p1-s1', 'q001', 'p1-s1-ch1', 'p1-s1-ch1-lead', 'q002']);
  assert.deepEqual(first.slice(4, 8).map((item) => item.id), ['q002', 'q003', 'q004', 'q005']);
  assert.ok(position('p1', 'p1-s1-ch2-t1') < position('p1', 'q006'));
  assert.equal(first.find((item) => item.id === 'p1-s1-ch1').label, 'ПАДРАЗДЗЕЛ ПЕРШЫ');
  assert.deepEqual(first.find((item) => item.id === 'p1-s1-ch1-lead').citations,
    index.units.find((unit) => unit.id === 'p1-s1-ch1').leadCitations);
});

test('all structural and thematic headings are inline dividers, never destinations', () => {
  const part = read('src/views/CompendiumNode.vue');
  for (const kind of ['sectionHeading', 'subsectionHeading', 'topicHeading', 'subtopicHeading']) {
    assert.match(part, new RegExp(`item.kind === '${kind}'`));
  }
  assert.match(part, /<h2>/);
  assert.match(part, /<h3>/);
  assert.match(part, /<h4/);
  assert.match(part, /<h5/);
  const allowed = new Set(['sectionHeading', 'subsectionHeading', 'topicHeading', 'subtopicHeading', 'leadCitations', 'question']);
  for (const partData of index.parts) for (const item of items(partData.id)) {
    assert.ok(allowed.has(item.kind), item.kind);
    assert.doesNotMatch(item.title || '', /^Пытанн[еі] \d/u);
    if (item.kind !== 'question' && item.kind !== 'leadCitations') assert.doesNotMatch(item.id, /-intro$/);
  }
  assert.equal(firstQuestionAfter('p1', 'p1-s1-ch1'), 2);
});

function firstQuestionAfter(partId, id) {
  return items(partId).slice(position(partId, id) + 1).find((item) => item.kind === 'question')?.question.number;
}

test('edge cases preserve headings and direct questions across all parts', () => {
  for (const [partId, heading, number] of [
    ['p1', 'p1-s2-ch2', 79], ['p2', 'p2-s1', 218], ['p2', 'p2-s2-intro-t1', 250],
    ['p2', 'p2-s2-ch1', 251], ['p2', 'p2-s2-ch2', 295], ['p2', 'p2-s2-ch3', 321],
    ['p3', 'p3-s1', 357], ['p3', 'p3-s2', 434], ['p4', 'p4-s1', 534],
    ['p4', 'p4-s1-ch1', 535], ['p4', 'p4-s1-ch2', 557], ['p4', 'p4-s1-ch3', 567],
  ]) assert.equal(firstQuestionAfter(partId, heading), number, heading);
  assert.deepEqual(questions('p1').slice(78, 80), [79, 80]);
  assert.deepEqual(questions('p3').slice(434 - 357, 442 - 357), [434, 435, 436, 437, 438, 439, 440, 441]);
  assert.deepEqual(questions('p4').slice(567 - 534, 569 - 534), [567, 568]);
  assert.equal(navigation.getNode('p4-s2').chapters.length, 0);
  assert.equal(firstQuestionAfter('p4', 'p4-s2-intro-t1'), 578);
});

test('subtopic titles appear only when their value changes', () => {
  for (const part of index.parts) {
    const stream = items(part.id);
    for (let i = 0; i < stream.length; i++) {
      const item = stream[i];
      if (item.kind !== 'subtopicHeading') continue;
      const question = stream.slice(i + 1).find((entry) => entry.kind === 'question').question;
      assert.equal(item.title, question.subtopicTitle);
      const previous = stream.slice(0, i).reverse().find((entry) => entry.kind === 'question');
      assert.notEqual(previous?.question.subtopicTitle, item.title);
    }
  }
  assert.deepEqual(items('p1').filter((item) => item.kind === 'subtopicHeading' && item.title === 'Неба і зямля').map((item) => item.id), ['q059-subtopic']);
});

test('canonical ГЛАВА labels remain in data; UI derives masculine ПАДРАЗДЗЕЛ labels', () => {
  assert.deepEqual([1, 2, 3, 4].map(masculineOrdinal), ['ПЕРШЫ', 'ДРУГІ', 'ТРЭЦІ', 'ЧАЦВЁРТЫ']);
  assert.equal(compendiumLevelLabel('chapter', 1, 'ГЛАВА ПЕРШАЯ'), 'ПАДРАЗДЗЕЛ ПЕРШЫ');
  for (const part of dataset.parts) for (const section of part.sections) for (const chapter of section.chapters) {
    assert.match(chapter.label, /^ГЛАВА /u);
    assert.equal(items(part.id).find((item) => item.id === chapter.id).label,
      `ПАДРАЗДЗЕЛ ${masculineOrdinal(chapter.number)}`);
  }
});

test('legacy node, topic and technical group links resolve to a Part anchor that exists', () => {
  const cases = [
    ['node', 'p1-s1', 'p1', 'p1-s1'],
    ['node', 'p1-s1-ch1', 'p1', 'p1-s1-ch1'],
    ['topic', 'p1-s1-ch2-t1', 'p1', 'p1-s1-ch2-t1'],
    ['topic', 'p1-s1-intro', 'p1', 'q001'],
    ['topic', 'p3-s2-intro', 'p3', 'q434'],
    ['topic', 'p2-s2-ch1', 'p2', 'p2-s2-ch1'],
    ['topic', 'p4-s2-intro-t1', 'p4', 'p4-s2-intro-t1'],
  ];
  for (const [kind, id, partId, anchor] of cases) {
    const target = kind === 'node' ? resolveLegacyNodeRoute(index, id) : resolveLegacyTopicRoute(index, id);
    assert.deepEqual(target, partRoute(partId, anchor), `${kind}/${id}`);
    assert.ok(position(partId, anchor) >= 0, `${kind}/${id} missing target`);
  }
  assert.equal(resolveLegacyNodeRoute(index, 'p9-x'), null);
  assert.equal(resolveLegacyTopicRoute(index, 'p9-x'), null);
  const legacy = read('src/views/CompendiumLegacy.vue');
  assert.match(legacy, /router.replace\(\{ \.\.\.location, hash, query: route.query \}\)/);
  for (const node of navigation.nodes.values()) {
    const target = resolveLegacyNodeRoute(index, node.id);
    if (node.kind === 'part') continue;
    assert.ok(position(target.params.partId, target.hash.slice(1)) >= 0, node.id);
  }
  for (const group of index.groups.values()) {
    const target = resolveLegacyTopicRoute(index, group.id);
    assert.ok(position(target.params.partId, target.hash.slice(1)) >= 0, group.id);
  }
});

test('reader context links and Да часткі lead back to inline anchors', () => {
  assert.deepEqual(questionPartRoute(index.getQuestion(79)), partRoute('p1', 'q079'));
  assert.deepEqual(questionTrail(index, index.getQuestion(81)).at(-1).to,
    partRoute('p1', 'p1-s2-ch2-t1'));
  assert.deepEqual(questionTrail(index, index.getQuestion(3)).map((crumb) => crumb.label),
    ['ЧАСТКА ПЕРШАЯ', '«ВЕРУ» — «ВЕРЫМ»', 'ЧАЛАВЕК — «СВЯТЫНЯ» БОГА']);
  const reader = read('src/views/CompendiumQuestion.vue');
  assert.match(reader, /label: 'Да часткі', to: questionPartRoute\(question.value\)/);
  assert.doesNotMatch(reader, /Уся тэма/);
  assert.match(read('src/views/CompendiumNode.vue'), /scrollIntoView\(\{ block: 'start' \}\)/);
});

test('persistent global search on Part retains query, Back and scroll after clearing', async () => {
  const view = { render: () => null };
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/compendium/part/:partId', name: 'CompendiumPart', component: view },
    { path: '/compendium/question/:number', name: 'CompendiumQuestion', component: view },
  ] });
  await router.push('/compendium/part/p1');
  const query = ref('');
  let scroll = 640;
  const sync = createCompendiumSearchSync({ router, query, getScroll: () => scroll, setScroll: (top) => { scroll = top; } });
  query.value = 'крещение';
  await nextTick(); await sync.settled();
  assert.equal(router.currentRoute.value.fullPath, `/compendium/part/p1?q=${encodeURIComponent('крещение')}`);
  assert.ok(searchCompendium(search, query.value).some((result) => result.question.number === 252));
  assert.equal(scroll, 0);
  await router.push({ name: 'CompendiumQuestion', params: { number: '252' } });
  assert.equal(query.value, 'крещение');
  router.back();
  await new Promise((resolve) => { const stop = router.afterEach((to) => { if (to.name === 'CompendiumPart') { stop(); resolve(); } }); });
  assert.equal(sync.resultsOpen.value, true);
  query.value = '';
  await nextTick(); await sync.settled();
  assert.equal(router.currentRoute.value.fullPath, '/compendium/part/p1');
  assert.equal(scroll, 640);
  sync.stop();
});

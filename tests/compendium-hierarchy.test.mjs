import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nextTick, ref } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { indexCompendium } from '../src/utils/compendiumData.js';
import {
  buildCompendiumNavigation, buildNodeScreen, buildPartOutline, nodeRoute, questionContextLabel, questionTrail,
  readingItemRoute, readingNeighbours, resolveLegacyPartHash, resolveLegacyTopicRoute,
} from '../src/utils/compendiumNavigation.js';
import { compendiumLevelLabel, masculineOrdinal } from '../src/utils/compendiumLabels.js';
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
  // Node screens link questions, topics and child nodes only, never a raw group id.
  const list = read('src/components/compendium/CompendiumNodeList.vue');
  assert.match(list, /name: 'CompendiumQuestion', params: \{ number: question\.number \}/);
  assert.doesNotMatch(`${list}${read('src/views/CompendiumNode.vue')}`, /group\.id|rangeLabel\(group\)|unit\.id/);
});

test('ЧАСТКА / РАЗДЗЕЛ / ГЛАВА keep their own source labels in the data', () => {
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
  assert.deepEqual(resolveLegacyTopicRoute(index, 'p1-s1-ch1'), { name: 'CompendiumNode', params: { nodeId: 'p1-s1-ch1' } });
  assert.deepEqual(resolveLegacyTopicRoute(index, 'p3-s2-intro'), { name: 'CompendiumNode', params: { nodeId: 'p3-s2' } });
  assert.deepEqual(resolveLegacyTopicRoute(index, 'p1-s2'), { name: 'CompendiumNode', params: { nodeId: 'p1-s2' } });
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

// --- Hierarchy v2: consistent drill-down -------------------------------------

/** What a node screen renders, as plain data. */
const screenOf = (id) => {
  const screen = buildNodeScreen(index, id);
  return {
    label: screen.node.uiLabel,
    title: screen.node.title,
    questions: numbers(screen.questions),
    topics: screen.topics.map((topic) => topic.title),
    children: screen.children.map((child) => child.uiLabel),
    childIds: screen.children.map((child) => child.id),
    screen,
  };
};

test('masculine Belarusian ordinals are generated from the number', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(masculineOrdinal),
    ['ПЕРШЫ', 'ДРУГІ', 'ТРЭЦІ', 'ЧАЦВЁРТЫ', 'ПЯТЫ', 'ШОСТЫ', 'СЁМЫ', 'ВОСЬМЫ', 'ДЗЯВЯТЫ', 'ДЗЯСЯТЫ']);
  assert.equal(masculineOrdinal(0), null);
  assert.equal(masculineOrdinal(11), null);
  assert.equal(compendiumLevelLabel('chapter', 1, 'ГЛАВА ПЕРШАЯ'), 'ПАДРАЗДЗЕЛ ПЕРШЫ');
  assert.equal(compendiumLevelLabel('chapter', 4, 'ГЛАВА ЧАЦВЁРТАЯ'), 'ПАДРАЗДЗЕЛ ЧАЦВЁРТЫ');
  assert.equal(compendiumLevelLabel('chapter', 11), 'ПАДРАЗДЗЕЛ 11');
  assert.equal(compendiumLevelLabel('section', 2), 'РАЗДЗЕЛ ДРУГІ');
  assert.equal(compendiumLevelLabel('part', 1, 'ЧАСТКА ПЕРШАЯ'), 'ЧАСТКА ПЕРШАЯ');
  // No string replacement of the source word, and no visible label hard-coded in a view.
  assert.doesNotMatch(read('src/utils/compendiumLabels.js'), /replace\(/);
  for (const file of ['views/CompendiumNode', 'views/Compendium', 'views/CompendiumTopic', 'views/CompendiumQuestion', 'components/compendium/CompendiumNodeList']) {
    assert.doesNotMatch(read(`src/${file}.vue`), /ПАДРАЗДЗЕЛ|ГЛАВА|РАЗДЗЕЛ [А-ЯЁІЎ]/u, file);
  }
});

test('UI labels: ЧАСТКА → РАЗДЗЕЛ → ПАДРАЗДЗЕЛ, no «ГЛАВА» and no feminine ordinal', () => {
  const sections = allNodes.filter((node) => node.kind === 'section');
  const chapters = allNodes.filter((node) => node.kind === 'chapter');
  assert.equal(sections.length, 8);
  assert.equal(chapters.length, 20);
  for (const part of navigation.parts) assert.equal(part.uiLabel, part.label);
  // Generated РАЗДЗЕЛ labels equal the source ones, which proves the ordinal table.
  for (const section of sections) assert.equal(section.uiLabel, section.label, section.id);
  for (const chapter of chapters) {
    assert.equal(chapter.uiLabel, `ПАДРАЗДЗЕЛ ${masculineOrdinal(chapter.number)}`, chapter.id);
    assert.doesNotMatch(chapter.uiLabel, /ГЛАВА|(АЯ|ЯЯ)$/u, chapter.id);
    assert.match(chapter.label, /^ГЛАВА /u, chapter.id); // canonical data untouched
  }
  assert.deepEqual(screenOf('p2-s2').children, ['ПАДРАЗДЗЕЛ ПЕРШЫ', 'ПАДРАЗДЗЕЛ ДРУГІ', 'ПАДРАЗДЗЕЛ ТРЭЦІ', 'ПАДРАЗДЗЕЛ ЧАЦВЁРТЫ']);
  for (const topic of allNodes.filter((node) => node.kind === 'topic')) assert.equal(topic.uiLabel, null, topic.id);
});

test('Part I screen shows only its sections', () => {
  const part = screenOf('p1');
  assert.equal(part.label, 'ЧАСТКА ПЕРШАЯ');
  assert.deepEqual(part.children, ['РАЗДЗЕЛ ПЕРШЫ', 'РАЗДЗЕЛ ДРУГІ']);
  assert.deepEqual(part.childIds, ['p1-s1', 'p1-s2']);
  // No question 1, no question 2, no ПАДРАЗДЗЕЛ row and no topic on the part screen.
  assert.deepEqual(part.questions, []);
  assert.deepEqual(part.topics, []);
  assert.ok(!part.children.some((label) => label.startsWith('ПАДРАЗДЗЕЛ')));
  // Section rows carry their range as metadata and open the section screen.
  const [first, second] = part.screen.children;
  assert.deepEqual([first.title, first.firstQuestion, first.lastQuestion], ['«ВЕРУ» — «ВЕРЫМ»', 1, 32]);
  assert.deepEqual([second.firstQuestion, second.lastQuestion], [33, 217]);
  assert.deepEqual(nodeRoute(first), { name: 'CompendiumNode', params: { nodeId: 'p1-s1' } });
  // `/compendium/part/1` keeps resolving like `/compendium/part/p1`.
  assert.equal(buildNodeScreen(index, '1').node.id, 'p1');
});

test('no part screen ever lists a question, a subsection or a topic', () => {
  for (const part of navigation.parts) {
    const screen = buildNodeScreen(index, part.id);
    assert.deepEqual(screen.questions, [], part.id);
    assert.deepEqual(screen.topics, [], part.id);
    assert.ok(screen.children.length && screen.children.every((child) => child.kind === 'section'), part.id);
    assert.deepEqual(screen.ancestors, [], part.id);
  }
});

test('Section «ВЕРУ» — «ВЕРЫМ»: q1 directly, then ПАДРАЗДЗЕЛ ПЕРШЫ / ДРУГІ / ТРЭЦІ', () => {
  const section = screenOf('p1-s1');
  assert.equal(section.label, 'РАЗДЗЕЛ ПЕРШЫ');
  assert.equal(section.title, '«ВЕРУ» — «ВЕРЫМ»');
  assert.deepEqual(section.questions, [1]);
  assert.deepEqual(section.topics, []);
  assert.deepEqual(section.children, ['ПАДРАЗДЗЕЛ ПЕРШЫ', 'ПАДРАЗДЗЕЛ ДРУГІ', 'ПАДРАЗДЗЕЛ ТРЭЦІ']);
  assert.deepEqual(section.screen.children.map((child) => [child.title, child.firstQuestion, child.lastQuestion]), [
    ['ЧАЛАВЕК — «СВЯТЫНЯ» БОГА', 2, 5],
    ['БОГ ВЫХОДЗІЦЬ НАСУСТРАЧ ЧАЛАВЕКУ', 6, 24],
    ['ЧАЛАВЕК АДКАЗВАЕ БОГУ', 25, 32],
  ]);
  assert.deepEqual(section.screen.ancestors.map((node) => node.id), ['p1']);
});

test('Subsection ЧАЛАВЕК — «СВЯТЫНЯ» БОГА: q2–5, no fake topic or range node', () => {
  const subsection = screenOf('p1-s1-ch1');
  assert.equal(subsection.label, 'ПАДРАЗДЗЕЛ ПЕРШЫ');
  assert.equal(subsection.title, 'ЧАЛАВЕК — «СВЯТЫНЯ» БОГА');
  assert.deepEqual(subsection.questions, [2, 3, 4, 5]);
  assert.deepEqual(subsection.topics, []);
  assert.deepEqual(subsection.children, []);
  assert.equal(subsection.screen.node.leadCitations.length, 1);
  assert.deepEqual(subsection.screen.ancestors.map((node) => node.id), ['p1', 'p1-s1']);
});

test('structural edge cases across the dataset', () => {
  // Section-level direct questions.
  assert.deepEqual(screenOf('p2-s1').questions, [218, 219, 220]);
  assert.deepEqual(screenOf('p2-s1').children, ['ПАДРАЗДЗЕЛ ПЕРШЫ', 'ПАДРАЗДЗЕЛ ДРУГІ']);
  assert.deepEqual(screenOf('p3-s2').questions, [434, 435, 436, 437, 438, 439, 440, 441]);
  assert.deepEqual(screenOf('p3-s2').children, ['ПАДРАЗДЗЕЛ ПЕРШЫ', 'ПАДРАЗДЗЕЛ ДРУГІ']);
  // A chapter with direct q79–80 followed by named topics.
  const christ = screenOf('p1-s2-ch2');
  assert.equal(christ.label, 'ПАДРАЗДЗЕЛ ДРУГІ');
  assert.deepEqual(christ.questions, [79, 80]);
  assert.equal(christ.topics.length, 6);
  assert.deepEqual([christ.screen.topics[0].firstQuestion, christ.screen.topics[0].lastQuestion], [81, 84]);
  assert.deepEqual([christ.screen.topics[1].firstQuestion, christ.screen.topics[1].lastQuestion], [85, 111]);
  // Single direct question before the topics.
  for (const [id, number] of [['p2-s2-ch1', 251], ['p2-s2-ch2', 295], ['p2-s2-ch3', 321], ['p4-s1-ch1', 535], ['p4-s1-ch2', 557]]) {
    assert.deepEqual(screenOf(id).questions, [number], id);
    assert.ok(screenOf(id).topics.length > 0, id);
  }
  // A section without chapters but with named topics (Part IV, the Lord's Prayer).
  const lordsPrayer = screenOf('p4-s2');
  assert.equal(lordsPrayer.title, 'МАЛІТВА ПАНСКАЯ');
  assert.deepEqual(lordsPrayer.questions, []);
  assert.deepEqual(lordsPrayer.children, []);
  assert.equal(lordsPrayer.topics.length, 4);
  assert.equal(lordsPrayer.topics[0], 'ОЙЧА НАШ');
  assert.deepEqual(nodeRoute(lordsPrayer.screen.topics[0]), { name: 'CompendiumTopic', params: { topicId: 'p4-s2-intro-t1' } });
  // A section with its own named topic before its subsections (q250).
  const sacraments = screenOf('p2-s2');
  assert.deepEqual(sacraments.questions, []);
  assert.deepEqual(sacraments.screen.topics.map((topic) => [topic.firstQuestion, topic.lastQuestion]), [[250, 250]]);
  assert.equal(sacraments.children.length, 4);
  // A topic with internal subtopic headings stays one reader screen.
  assert.deepEqual(navigation.getNode('p1-s2-ch1-t2').subtopics.map((sub) => sub.title), ['Неба і зямля', 'Чалавек', 'Упадак']);
  assert.ok(screenOf('p1-s2-ch1').topics.includes(navigation.getNode('p1-s2-ch1-t2').title));
  assert.equal(buildNodeScreen(index, 'p1-s2-ch1-t2'), null);
  assert.equal(buildNodeScreen(index, 'p1-s1-intro'), null);
  assert.equal(buildNodeScreen(index, 'nope'), null);
});

test('full dataset audit: every question is listed on exactly one screen, under its nearest owner', () => {
  const screens = allNodes.filter((node) => node.kind !== 'topic').map((node) => buildNodeScreen(index, node.id));
  assert.equal(screens.length, 4 + 8 + 20);
  const topics = allNodes.filter((node) => node.kind === 'topic');
  assert.equal(topics.length, 70);

  const listed = new Map();
  const topicOwner = new Map();
  for (const screen of screens) {
    for (const question of screen.questions) {
      assert.ok(!listed.has(question.number), `q${question.number} listed twice`);
      listed.set(question.number, screen.node.id);
    }
    for (const topic of screen.topics) {
      assert.ok(!topicOwner.has(topic.id), `${topic.id} listed twice`);
      topicOwner.set(topic.id, screen.node.id);
      assert.equal(topic.parentId, screen.node.id);
    }
    // Rows are in source order, and ranges are metadata of real titles only.
    const order = [...numbers(screen.questions), ...screen.topics.map((topic) => topic.firstQuestion), ...screen.children.map((child) => child.firstQuestion)];
    assert.deepEqual(order, [...order].sort((a, b) => a - b), screen.node.id);
    for (const row of [...screen.topics, ...screen.children]) {
      assert.ok(row.title.trim() && Number.isInteger(row.firstQuestion) && row.lastQuestion >= row.firstQuestion, row.id);
    }
  }
  assert.equal(topicOwner.size, 70);
  for (const topic of topics) for (let n = topic.firstQuestion; n <= topic.lastQuestion; n++) {
    assert.ok(!listed.has(n), `q${n} both direct and in a topic`);
    listed.set(n, topic.id);
  }
  assert.equal(listed.size, 598);
  for (const question of index.questions) {
    const placement = navigation.getPlacement(question.number);
    assert.equal(listed.get(question.number), placement.nodeId, `q${question.number}`);
    // Nearest owner: topic, else chapter, else section. Never the part.
    assert.equal(placement.nodeId, placement.topicId || placement.chapterId || placement.sectionId, `q${question.number}`);
  }
  // Pinned numbers of the audit (docs/compendium.md).
  const direct = (kind) => allNodes.filter((node) => node.kind === kind && node.directQuestions.length)
    .map((node) => [node.id, numbers(node.directQuestions)]);
  assert.deepEqual(direct('part'), []);
  assert.deepEqual(direct('section').map(([id, list]) => [id, list[0], list.at(-1)]),
    [['p1-s1', 1, 1], ['p2-s1', 218, 220], ['p3-s1', 357, 357], ['p3-s2', 434, 441], ['p4-s1', 534, 534]]);
  assert.deepEqual(direct('chapter').map(([id, list]) => [id, list[0], list.at(-1)]), [
    ['p1-s1-ch1', 2, 5], ['p1-s2-ch2', 79, 80], ['p2-s2-ch1', 251, 251], ['p2-s2-ch2', 295, 295],
    ['p2-s2-ch3', 321, 321], ['p4-s1-ch1', 535, 535], ['p4-s1-ch2', 557, 557], ['p4-s1-ch3', 567, 568],
  ]);
  const sectionTopics = allNodes.filter((node) => node.kind === 'section' && node.topics.length).map((node) => [node.id, node.topics.length]);
  assert.deepEqual(sectionTopics, [['p2-s2', 1], ['p4-s2', 4]]);
  assert.equal([...listed.values()].filter((id) => navigation.getNode(id).kind === 'section').length, 14);
  assert.equal([...listed.values()].filter((id) => navigation.getNode(id).kind === 'chapter').length, 13);
  assert.equal([...listed.values()].filter((id) => navigation.getNode(id).kind === 'topic').length, 571);
  // Only p1-s1-ch1 is a subsection without named topics.
  assert.deepEqual(allNodes.filter((node) => node.kind === 'chapter' && !node.topics.length).map((node) => node.id), ['p1-s1-ch1']);
});

test('context and legacy links open the owning screen', () => {
  // A direct question links back to the section / subsection that lists it.
  const crumbs = (number) => questionTrail(index, index.getQuestion(number)).map((crumb) => crumb.to);
  assert.deepEqual(crumbs(1), [{ name: 'CompendiumPart', params: { partId: 'p1' } }, { name: 'CompendiumNode', params: { nodeId: 'p1-s1' } }]);
  assert.deepEqual(crumbs(3).at(-1), { name: 'CompendiumNode', params: { nodeId: 'p1-s1-ch1' } });
  assert.deepEqual(crumbs(81).at(-1), { name: 'CompendiumTopic', params: { topicId: 'p1-s2-ch2-t1' } });
  assert.deepEqual(questionTrail(index, index.getQuestion(3)).map((crumb) => crumb.label),
    ['ЧАСТКА ПЕРШАЯ', '«ВЕРУ» — «ВЕРЫМ»', 'ЧАЛАВЕК — «СВЯТЫНЯ» БОГА']);
  for (const question of index.questions) {
    for (const { label } of questionTrail(index, question)) assert.doesNotMatch(label, /intro|chapter|ГЛАВА|ПАДРАЗДЗЕЛ|^p\d/u, `q${question.number}`);
  }
  // Old part anchors (#section / #chapter) open that node's screen.
  assert.deepEqual(resolveLegacyPartHash(index, 'p1', '#p1-s1-ch1'), { name: 'CompendiumNode', params: { nodeId: 'p1-s1-ch1' } });
  assert.deepEqual(resolveLegacyPartHash(index, 'p3', '#p3-s2'), { name: 'CompendiumNode', params: { nodeId: 'p3-s2' } });
  assert.deepEqual(resolveLegacyPartHash(index, '3', '#p3-s2'), { name: 'CompendiumNode', params: { nodeId: 'p3-s2' } });
  for (const [partId, hash] of [['p1', ''], ['p1', '#p2-s1'], ['p1', '#p1'], ['p1', '#p1-s1-ch2-t1'], ['p1', '#nope']]) {
    assert.equal(resolveLegacyPartHash(index, partId, hash), null, hash);
  }
  assert.match(read('src/views/CompendiumNode.vue'), /resolveLegacyPartHash\(store\.index, props\.nodeId, route\.hash\)/);
});

// --- Search ----------------------------------------------------------------

test('one search dock, mounted by the shell for every Compendium level', () => {
  const shell = read('src/views/CompendiumShell.vue');
  assert.equal(shell.match(/<CompendiumSearchDock\b/g).length, 1);
  assert.match(shell, /<router-view v-slot="\{ Component, route \}">/);
  for (const file of ['views/Compendium', 'views/CompendiumNode', 'views/CompendiumTopic', 'views/CompendiumQuestion', 'components/compendium/CompendiumNodeList']) {
    assert.doesNotMatch(read(`src/${file}.vue`), /CompendiumSearchDock/, file);
  }
  // Every level (root, part, section/subsection node, topic, question) is a child of the shell route.
  const router = read('src/router/index.js');
  const block = router.slice(router.indexOf("path: 'compendium',"), router.indexOf("path: 'songs'"));
  for (const name of ['Compendium', 'CompendiumPart', 'CompendiumNode', 'CompendiumTopic', 'CompendiumQuestion']) assert.match(block, new RegExp(`name: '${name}'`));
  // Each level is its own screen instance, but `?q` alone never remounts it.
  assert.match(shell, /<component :is="Component" :key="route\.path" v-show="!resultsOpen" \/>/);
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
        { path: 'node/:nodeId', name: 'CompendiumNode', component: view },
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

test('search works from section and subsection screens', async () => {
  const router = memoryRouter();
  const query = ref('');
  let scroll = 0;
  const sync = createCompendiumSearchSync({ router, query, getScroll: () => scroll, setScroll: (top) => { scroll = top; } });
  const settle = async () => { await nextTick(); await sync.settled(); };
  for (const nodeId of ['p1-s1', 'p1-s1-ch1', 'p4-s2']) {
    const path = `/compendium/node/${nodeId}`;
    await router.push(path);
    scroll = 320;
    query.value = 'хрост';
    await settle();
    assert.equal(router.currentRoute.value.name, 'CompendiumNode');
    assert.equal(router.currentRoute.value.fullPath, `${path}?q=${encodeURIComponent('хрост')}`);
    assert.equal(sync.resultsOpen.value, true);
    // Result → question → Back returns to the results on the same node.
    await router.push({ name: 'CompendiumQuestion', params: { number: '252' } });
    assert.equal(sync.resultsOpen.value, false);
    router.back();
    await waitForRoute(router, (route) => route.name === 'CompendiumNode');
    assert.equal(sync.resultsOpen.value, true);
    assert.equal(query.value, 'хрост');
    // Clearing restores the node screen and its scroll.
    query.value = '';
    await settle();
    assert.equal(router.currentRoute.value.fullPath, path);
    assert.equal(sync.resultsOpen.value, false);
    assert.equal(scroll, 320);
  }
  sync.stop();
});

// --- Layout ----------------------------------------------------------------

test('fixed dock never covers the last content', () => {
  const css = read('src/styles/compendium.css');
  assert.match(css, /\.prayers-list-container\.compendium-container \{\n {2}padding-bottom: calc\(104px \+ env\(safe-area-inset-bottom, 0px\)\) !important;/);
  assert.match(css, /\.prayer-view-container\.compendium-reader \{\n {2}padding-bottom: calc\(96px \+ env\(safe-area-inset-bottom, 0px\)\) !important;/);
  for (const [view, container] of [
    ['Compendium', 'prayers-list-container compendium-container'],
    ['CompendiumNode', 'prayers-list-container compendium-container'],
    ['CompendiumTopic', 'prayer-view-container compendium-reader'],
    ['CompendiumQuestion', 'prayer-view-container compendium-reader'],
    ['CompendiumShell', 'prayers-list-container compendium-container'],
  ]) assert.match(read(`src/views/${view}.vue`), new RegExp(`class="${container}"`), view);
  // Only existing theme tokens; no hard-coded colours.
  assert.doesNotMatch(css, /#[0-9a-f]{3,6}\b/i);
});

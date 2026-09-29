// Derived navigation model for the Compendium (see docs/compendium.md).
//
// The canonical dataset groups content into technical `units` (and the index
// into reading groups). Those stay internal. This adapter builds the visible
// source hierarchy on top of them: only headings printed on Catholic.by
// (ЧАСТКА, РАЗДЗЕЛ, ГЛАВА and named thematic headings) become nodes. Questions
// that sit under a heading before its first child heading are that node's
// `directQuestions`, rendered as plain question rows, never as a titled node.
//
// Pure module: no Vue or `@/` imports, shared with `node --test`.

const cache = new WeakMap();

const questionRange = (questions) => (questions.length
  ? { firstQuestion: questions[0].number, lastQuestion: questions.at(-1).number }
  : { firstQuestion: null, lastQuestion: null });

/** "Пытанне 6" / "Пытанні 6–10": secondary metadata only, never a title. */
export function questionRangeLabel(first, last) {
  if (!Number.isInteger(first)) return '';
  return first === last || !Number.isInteger(last) ? `Пытанне ${first}` : `Пытанні ${first}–${last}`;
}

/** Compact pager label: "6–10", or "6" for a single question. */
export const compactRangeLabel = (first, last) => (first === last ? String(first) : `${first}–${last}`);

function sourceNode(kind, { id, label = null, title, partId }) {
  return { id, kind, label, title, partId, sourceHeading: true, leadCitations: [], directQuestions: [], topics: [], chapters: [] };
}

/**
 * Build (once per index) the source navigation tree:
 *
 *   part → sections → [directQuestions, topics, chapters → [directQuestions, topics]]
 *
 * plus a flat reading sequence (topics and direct questions in source order)
 * and the placement of every question in that tree.
 */
export function buildCompendiumNavigation(index) {
  if (cache.has(index)) return cache.get(index);
  const parts = [];
  const nodes = new Map();
  const placement = new Map();
  const sequence = [];
  const add = (node) => { nodes.set(node.id, node); return node; };

  for (const part of index.parts) {
    const partNode = add(sourceNode('part', { id: part.id, label: part.label, title: part.title, partId: part.id }));
    partNode.sections = (part.sections || []).map((section) => {
      const sectionNode = add({ ...sourceNode('section', { id: section.id, label: section.label, title: section.title, partId: part.id }), number: section.number });
      sectionNode.chapters = (section.chapters || []).map((chapter) => add({
        ...sourceNode('chapter', { id: chapter.id, label: chapter.label, title: chapter.title, partId: part.id }),
        number: chapter.number,
      }));
      return sectionNode;
    });
    parts.push(partNode);
  }

  for (const unit of index.units) {
    const partNode = nodes.get(unit.partId);
    const sectionNode = partNode?.sections.find((section) => section.number === unit.sectionNumber);
    const chapterNode = unit.chapterNumber ? sectionNode?.chapters.find((chapter) => chapter.number === unit.chapterNumber) || null : null;
    const owner = chapterNode || sectionNode;
    if (!owner) continue;
    if (unit.leadCitations?.length) owner.leadCitations.push(...unit.leadCitations);

    const entries = unit.questions.map((question) => index.getQuestion(question.number));
    for (const entry of entries.filter((question) => !question.topicId)) {
      owner.directQuestions.push(entry);
      sequence.push({ kind: 'question', id: entry.id, number: entry.number, firstQuestion: entry.number, lastQuestion: entry.number });
    }
    for (const topic of unit.topics) {
      const questions = entries.filter((question) => question.topicId === topic.id);
      if (!questions.length) continue;
      const topicNode = add({
        ...sourceNode('topic', { id: topic.id, title: topic.title, partId: unit.partId }),
        parentTitle: topic.parentTitle || null,
        groupId: topic.id,
        subtopics: questions
          .filter((question, position) => question.subtopicTitle && question.subtopicTitle !== questions[position - 1]?.subtopicTitle)
          .map((question) => ({ title: question.subtopicTitle, firstQuestion: question.number })),
        ...questionRange(questions),
      });
      owner.topics.push(topicNode);
      sequence.push({ kind: 'topic', id: topic.id, firstQuestion: topicNode.firstQuestion, lastQuestion: topicNode.lastQuestion });
    }
    for (const entry of entries) {
      placement.set(entry.number, {
        partId: unit.partId,
        sectionId: sectionNode.id,
        chapterId: chapterNode?.id || null,
        topicId: entry.topicId && nodes.has(entry.topicId) ? entry.topicId : null,
        // Nearest real heading that owns the question.
        nodeId: entry.topicId && nodes.has(entry.topicId) ? entry.topicId : owner.id,
        direct: !entry.topicId,
      });
    }
  }

  // Ranges of structural nodes, computed from what they contain.
  for (const partNode of parts) {
    for (const sectionNode of partNode.sections) {
      for (const chapterNode of sectionNode.chapters) Object.assign(chapterNode, rangeOf(chapterNode));
      Object.assign(sectionNode, rangeOf(sectionNode));
    }
    const numbers = partNode.sections.flatMap((section) => [section.firstQuestion, section.lastQuestion]).filter(Number.isInteger);
    Object.assign(partNode, numbers.length ? { firstQuestion: Math.min(...numbers), lastQuestion: Math.max(...numbers) } : questionRange([]));
  }

  const navigation = {
    parts,
    nodes,
    sequence,
    getNode: (id) => nodes.get(id) || null,
    getPlacement: (number) => placement.get(Number(number)) || null,
  };
  cache.set(index, navigation);
  return navigation;
}

function rangeOf(node) {
  const numbers = [
    ...node.directQuestions.map((question) => question.number),
    ...node.topics.flatMap((topic) => [topic.firstQuestion, topic.lastQuestion]),
    ...node.chapters.flatMap((chapter) => [chapter.firstQuestion, chapter.lastQuestion]),
  ].filter(Number.isInteger);
  return numbers.length ? { firstQuestion: Math.min(...numbers), lastQuestion: Math.max(...numbers) } : questionRange([]);
}

/** Part outline for the part screen: the part node with its real sections. */
export function buildPartOutline(index, partId) {
  const part = index.getPart(partId);
  if (!part) return null;
  const partNode = buildCompendiumNavigation(index).getNode(part.id);
  return { part, sections: partNode.sections };
}

/** Previous/next reading item (a named topic or a direct question) around a topic. */
export function readingNeighbours(index, topicId) {
  const { sequence } = buildCompendiumNavigation(index);
  const position = sequence.findIndex((item) => item.kind === 'topic' && item.id === topicId);
  if (position < 0) return { previous: null, next: null };
  return { previous: sequence[position - 1] || null, next: sequence[position + 1] || null };
}

/** Router location of a reading item from `readingNeighbours`. */
export function readingItemRoute(item) {
  if (!item) return null;
  return item.kind === 'topic'
    ? { name: 'CompendiumTopic', params: { topicId: item.id } }
    : { name: 'CompendiumQuestion', params: { number: String(item.number) } };
}

/** Router location of a real structural node: its part screen, scrolled to the heading. */
export function nodeRoute(node) {
  if (!node) return null;
  if (node.kind === 'topic') return { name: 'CompendiumTopic', params: { topicId: node.id } };
  if (node.kind === 'part') return { name: 'CompendiumPart', params: { partId: node.id } };
  return { name: 'CompendiumPart', params: { partId: node.partId }, hash: `#${node.id}` };
}

/**
 * Old links to technical reading groups (`/compendium/topic/p1-s1-intro`,
 * `/compendium/topic/p1-s1-ch1`, …). Returns the location to redirect to, or
 * null when the id is a real named topic (rendered as is) or unknown.
 * - one question → that question;
 * - several → the part screen at the real parent heading, where they are listed.
 */
export function resolveLegacyTopicRoute(index, id) {
  const navigation = buildCompendiumNavigation(index);
  if (navigation.getNode(id)?.kind === 'topic') return null;
  const group = index.getGroup(id);
  if (group?.kind === 'unit') {
    if (group.questions.length === 1) return { name: 'CompendiumQuestion', params: { number: String(group.questions[0].number) } };
    return nodeRoute(navigation.getNode(navigation.getPlacement(group.firstQuestion).nodeId));
  }
  const unit = index.units.find((candidate) => candidate.id === id);
  if (unit) return nodeRoute(navigation.getNode(navigation.getPlacement(unit.firstQuestion).nodeId));
  const node = navigation.getNode(id);
  return node ? nodeRoute(node) : null;
}

/**
 * Meaningful source context of a question as linkable crumbs: part label,
 * section, chapter and named topic titles. Consecutive duplicates are dropped
 * and no technical id or question-range title is ever produced.
 */
export function questionTrail(index, question) {
  const placement = question ? buildCompendiumNavigation(index).getPlacement(question.number) : null;
  if (!placement) return [];
  const { getNode } = buildCompendiumNavigation(index);
  const part = getNode(placement.partId);
  const crumbs = [{ label: part.label, to: nodeRoute(part) }];
  for (const id of [placement.sectionId, placement.chapterId, placement.topicId]) {
    const node = id ? getNode(id) : null;
    if (node?.title && node.title !== crumbs.at(-1).label) crumbs.push({ label: node.title, to: nodeRoute(node) });
  }
  return crumbs;
}

/** Short result context: part label · nearest real heading (topic, chapter or section). */
export function questionContextLabel(question) {
  if (!question) return '';
  const heading = question.topicTitle || question.chapterTitle || question.sectionTitle;
  return [question.partLabel, heading].filter(Boolean).join(' · ');
}

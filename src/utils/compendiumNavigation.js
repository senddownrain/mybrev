// Derived navigation model for the Compendium (see docs/compendium.md).
//
// Technical units stay internal. The source heading tree supplies labels and
// stable anchors; buildPartReadingOutline flattens one part into inline headings
// and question rows in canonical order.
//
// Pure module: no Vue or `@/` imports, shared with `node --test`.

import { compendiumLevelLabel } from './compendiumLabels.js';

const cache = new WeakMap();
const partOutlineCache = new WeakMap();

const questionRange = (questions) => (questions.length
  ? { firstQuestion: questions[0].number, lastQuestion: questions.at(-1).number }
  : { firstQuestion: null, lastQuestion: null });

/**
 * `label` is the heading as printed in the source (e.g. "ГЛАВА ПЕРШАЯ");
 * `uiLabel` is what the product shows (e.g. "ПАДРАЗДЗЕЛ ПЕРШЫ"). Named topics
 * have neither: they are shown by their title only.
 */
function sourceNode(kind, { id, label = null, title, partId, parentId = null, number = null }) {
  return {
    id, kind, label, title, partId, parentId, number,
    uiLabel: kind === 'topic' ? null : compendiumLevelLabel(kind, number, label),
    sourceHeading: true, leadCitations: [], directQuestions: [], topics: [], chapters: [],
  };
}

/**
 * Build (once per index) the source heading tree:
 *
 *   part → sections → [directQuestions, topics, chapters → [directQuestions, topics]]
 *
 * `children` and `topics` preserve source relationships for outline generation
 * and legacy anchors. Every question has a placement in that tree.
 */
export function buildCompendiumNavigation(index) {
  if (cache.has(index)) return cache.get(index);
  const parts = [];
  const nodes = new Map();
  const placement = new Map();
  const add = (node) => { nodes.set(node.id, node); return node; };

  for (const part of index.parts) {
    const partNode = add(sourceNode('part', { id: part.id, label: part.label, title: part.title, partId: part.id, number: part.number }));
    partNode.sections = (part.sections || []).map((section) => {
      const sectionNode = add(sourceNode('section', {
        id: section.id, label: section.label, title: section.title, partId: part.id, parentId: part.id, number: section.number,
      }));
      sectionNode.chapters = (section.chapters || []).map((chapter) => add(sourceNode('chapter', {
        id: chapter.id, label: chapter.label, title: chapter.title, partId: part.id, parentId: section.id, number: chapter.number,
      })));
      sectionNode.children = sectionNode.chapters;
      return sectionNode;
    });
    partNode.children = partNode.sections;
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
    }
    for (const topic of unit.topics) {
      const questions = entries.filter((question) => question.topicId === topic.id);
      if (!questions.length) continue;
      const topicNode = add({
        ...sourceNode('topic', { id: topic.id, title: topic.title, partId: unit.partId, parentId: owner.id }),
        parentTitle: topic.parentTitle || null,
        groupId: topic.id,
        subtopics: questions
          .filter((question, position) => question.subtopicTitle && question.subtopicTitle !== questions[position - 1]?.subtopicTitle)
          .map((question) => ({ title: question.subtopicTitle, firstQuestion: question.number })),
        ...questionRange(questions),
      });
      owner.topics.push(topicNode);
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

/** One ordered display stream for a part. Technical units never become headings. */
export function buildPartReadingOutline(index, partId) {
  const part = index?.getPart(partId);
  if (!part) return null;
  let outlines = partOutlineCache.get(index);
  if (!outlines) { outlines = new Map(); partOutlineCache.set(index, outlines); }
  if (outlines.has(part.id)) return outlines.get(part.id);

  const navigation = buildCompendiumNavigation(index);
  const items = [];
  let sectionId = null;
  let chapterId = null;
  let topicId = null;
  let parentTitle = null;
  let subtopicTitle = null;
  for (const unit of index.units.filter((entry) => entry.partId === part.id)) {
    const first = index.getQuestion(unit.firstQuestion);
    const placement = navigation.getPlacement(first.number);
    if (sectionId !== placement.sectionId) {
      sectionId = placement.sectionId;
      const node = navigation.getNode(sectionId);
      items.push({ kind: 'sectionHeading', id: node.id, label: node.uiLabel, title: node.title });
      chapterId = null;
      topicId = null;
      parentTitle = null;
      subtopicTitle = null;
    }
    if (chapterId !== placement.chapterId) {
      chapterId = placement.chapterId;
      if (chapterId) {
        const node = navigation.getNode(chapterId);
        items.push({ kind: 'subsectionHeading', id: node.id, label: node.uiLabel, title: node.title });
      }
      topicId = null;
      parentTitle = null;
      subtopicTitle = null;
    }
    if (unit.leadCitations?.length) items.push({ kind: 'leadCitations', id: `${unit.id}-lead`, citations: unit.leadCitations });
    for (const sourceQuestion of unit.questions) {
      const question = index.getQuestion(sourceQuestion.number);
      if (topicId !== question.topicId) {
        topicId = question.topicId;
        subtopicTitle = null;
        if (topicId) {
          const topic = navigation.getNode(topicId);
          if (topic.parentTitle && topic.parentTitle !== parentTitle) {
            items.push({ kind: 'topicHeading', id: `${topic.id}-parent`, title: topic.parentTitle });
          }
          parentTitle = topic.parentTitle;
          items.push({ kind: 'topicHeading', id: topic.id, title: topic.title });
          const citations = index.getGroup(topic.id)?.leadCitations || [];
          if (citations.length) items.push({ kind: 'leadCitations', id: `${topic.id}-lead`, citations });
        } else parentTitle = null;
      }
      if (question.subtopicTitle && question.subtopicTitle !== subtopicTitle) {
        items.push({ kind: 'subtopicHeading', id: `${question.id}-subtopic`, title: question.subtopicTitle });
      }
      subtopicTitle = question.subtopicTitle || null;
      items.push({ kind: 'question', id: question.id, question });
    }
  }
  const outline = { part, items };
  outlines.set(part.id, outline);
  return outline;
}

/** Router location of a real heading inside its part. */
export function nodeRoute(node) {
  if (!node) return null;
  if (node.kind === 'part') return { name: 'CompendiumPart', params: { partId: node.id } };
  return { name: 'CompendiumPart', params: { partId: node.partId }, hash: `#${node.id}` };
}

export function questionPartRoute(question) {
  return question ? { name: 'CompendiumPart', params: { partId: question.partId }, hash: `#${question.id}` } : null;
}

/**
 * Old links to technical reading groups (`/compendium/topic/p1-s1-intro`,
 * `/compendium/topic/p1-s1-ch1`, …) go to the real heading, or the first
 * question of a technical group, within the part page.
 */
export function resolveLegacyTopicRoute(index, id) {
  const navigation = buildCompendiumNavigation(index);
  const node = navigation.getNode(id);
  if (node) return nodeRoute(node);
  const group = index.getGroup(id);
  if (group?.kind === 'unit') {
    return questionPartRoute(group.questions[0]);
  }
  const unit = index.units.find((candidate) => candidate.id === id);
  if (unit) return questionPartRoute(index.getQuestion(unit.firstQuestion));
  return null;
}

export function resolveLegacyNodeRoute(index, id) {
  const node = buildCompendiumNavigation(index).getNode(id);
  return node ? nodeRoute(node) : resolveLegacyTopicRoute(index, id);
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

// Tags come from the tags that already exist in the content; a missing generic tag is only proposed
// (never created here). Matching is NFC + casefold + apostrophe-insensitive so the existing spelling wins.
import { normalizeTitleKey } from '../../../src/utils/prayerDraftModel.mjs';

export function buildTagUniverse(prayers, categories = []) {
  const map = new Map();
  const add = (tag) => { const clean = String(tag).trim().replace(/\s+/g, ' '); if (clean && !map.has(normalizeTitleKey(clean))) map.set(normalizeTitleKey(clean), clean); };
  for (const item of [...prayers, ...categories]) for (const tag of item.tags || []) add(tag);
  return map;
}
export const existingTag = (universe, name) => universe.get(normalizeTitleKey(name)) || null;

const TYPE_TAGS = { litany: 'Літанія', novena: 'Навэнна', chaplet: 'Вяночак' };
const SOURCE_TAGS = { our_father_marian: ['Марыя'], our_father_saints: ['Святыя'], our_father_needs: ['У розных патрэбах'] };
// Subject tags: only used when an equivalent tag already exists. Patterns run on the normalized key
// (lowercase, і->и, ў->у, ё->е, no apostrophes).
const SUBJECT_RULES = [
  [/марыи|марыя|маци божа|панны|дзевы/, 'Марыя'],
  [/юзаф/, 'Юзаф'],
  [/сэрц\p{L}* езус/u, 'Сэрца Езуса'],
  [/дух\p{L}* свят/u, 'Дух Святы'],
  [/михал/, 'Арханёл Міхал'],
  [/миласэрнасц/, 'Божая Міласэрнасць'],
  [/крыв\p{L}* (хрыст|пан)/u, 'Кроў Хрыста'],
  [/тройц/, 'Тройца'],
  [/памерлы|памерш/, 'За памерлых'],
  [/сакрамэнт|эухарыст|камуни/, 'Сакрамэнт'],
  [/крыжов\p{L}* шлях/u, 'Крыжовы шлях'],
  [/ружан/, 'Ружанец'],
];

/**
 * @returns {{ tags: string[], proposedNew: Array<{tag, reason}>, trace: Array<{tag, via}> }}
 */
export function chooseTags({ kind, title, sourceId, keepTags = [] }, universe) {
  const tags = []; const proposedNew = []; const trace = [];
  const push = (name, via, { allowNew = false } = {}) => {
    const found = existingTag(universe, name);
    if (found) { if (!tags.includes(found)) { tags.push(found); trace.push({ tag: found, via }); } }
    else if (allowNew) { proposedNew.push({ tag: name, reason: via }); if (!tags.includes(name)) tags.push(name); }
  };
  if (TYPE_TAGS[kind]) push(TYPE_TAGS[kind], `type:${kind}`, { allowNew: kind === 'chaplet' }); // the one generic tag the policy allows to add
  for (const name of SOURCE_TAGS[sourceId] || []) push(name, `source:${sourceId}`);
  const key = normalizeTitleKey(title);
  for (const [pattern, name] of SUBJECT_RULES) if (pattern.test(key)) push(name, `title:${pattern.source}`);
  for (const old of keepTags) { const found = existingTag(universe, old); if (found && !tags.includes(found)) { tags.push(found); trace.push({ tag: found, via: 'kept-from-old' }); } }
  return { tags, proposedNew, trace };
}

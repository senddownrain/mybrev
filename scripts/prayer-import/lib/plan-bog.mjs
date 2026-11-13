// Dry-run planner for the second pass: «Бог Добры» (Пінск, 2022). Secondary source: nothing here can become public.
// Result per entry: EXCLUDE | ALREADY_EXISTS | UNIQUE_DRAFT | REVIEW. Only UNIQUE_DRAFT and REVIEW produce a
// closed `prayerDrafts` document; reference = final canonical set (first pass) + live prayers + existing drafts.
import { createHash } from 'node:crypto';
import { draftSourceNotice, normalizeTitleKey } from '../../../src/utils/prayerDraftModel.mjs';
import { pageSpanLabel } from '../../../src/utils/prayerSource.mjs';
import { entryToMarkdown } from './blocks-to-markdown.mjs';
import { containment, jaccard, kindFromTitle, oldText, oldTitle, sameStems, shingles } from './matching.mjs';
import { buildTagUniverse, chooseTags, existingTag } from './tags.mjs';

export const BOG_BATCH = 'bog-dobry-2022-two-pass-2026-11-12-v1';
export const BOG_SOURCE_ID = 'bog_dobry_pinsk_edition_2022';
export const bogDraftId = (entryId) => `bd_${createHash('sha256').update(entryId).digest('hex').slice(0, 16)}`;
const textHash = (value) => createHash('sha256').update(value).digest('hex');

export const EXCLUDED_TYPES = Object.freeze({
  song: 'песня (спеўнік)', section: 'загаловак раздзела', catechism: 'катэхізіс', office: 'часы / гадзінкі (Ліцургія гадзін)',
  frontmatter: 'тытул, выходныя даныя, уступ', article: 'артыкул / даведка', table: 'табліца',
});
// Title patterns that are not prayers although the parser typed them as prayer/devotion/rite.
const TITLE_EXCLUSIONS = [
  [/абавязков\p{L}* свят/iu, 'інфармацыйны спіс (не малітва), пазначана ў review-findings'],
  [/песн\p{L}* жальб/iu, 'раздзел песень'],
  [/каляндар|праздн\p{L}* па годзе|літургічн\p{L}* год/iu, 'каляндарная даведка'],
  [/гадзінк|гадзіны дня/iu, 'гадзінкі (Ліцургія гадзін)'],
];
const SACRAMENT_ORDER = /^(САКРАМЭНТ|ПАРАДАК|АБРАД)(?=\s|$)/u;
const INSTRUCTION = /^(Як |Умовы |Аб неабходнасці)/u;
// Section -> existing tag (never invented; used only when the tag already exists).
const SECTION_TAGS = [[/ДА МАЦІ БОЖАЙ|ДА НАЙСВЯЦЕЙШАЙ ПАННЫ МАРЫІ/u, 'Марыя'], [/Ў РОЗНЫХ ПАТРЭБАХ/u, 'У розных патрэбах'], [/СМЕРЦЬ І ПАХАВАННЕ/u, 'За памерлых'], [/БЛАГАСЛАЎЛЕННІ/u, 'Благаслаўленне'], [/САКРАМЭНТЫ/u, 'Сакрамэнт']];
// ALL-CAPS printed headings become sentence case; names that are always capitalised stay capitalised (the editor can adjust).
const PROPER = /^(найсвяцейш\p{L}*|езус\p{L}*|хрыст\p{L}*|марыі|марыя|марыю|пан[аую]?|божа\p{L}*|бог\p{L}*|сэрц\p{L}*|тройц\p{L}*|дух\p{L}*|касцёл\p{L}*|юзаф\p{L}*|ружанец|ружанца)$/u;
export function sentenceCase(title) {
  if (title !== title.toUpperCase() || !/\p{L}{4}/u.test(title)) return title;
  const words = title.toLowerCase().split(/(\s+)/).map((word, index) => (index === 0 || PROPER.test(word) ? word.charAt(0).toUpperCase() + word.slice(1) : word));
  return words.join('');
}

function classify(meta, entry, title) {
  if (EXCLUDED_TYPES[meta.type]) return { decision: 'EXCLUDE', reason: `type:${meta.type}`, detail: EXCLUDED_TYPES[meta.type] };
  for (const [pattern, why] of TITLE_EXCLUSIONS) if (pattern.test(title)) return { decision: 'EXCLUDE', reason: 'title', detail: why };
  if (meta.language && meta.language !== 'be') return { decision: 'EXCLUDE', reason: `language:${meta.language}`, detail: 'не па-беларуску: рашэнне рэдактара, у чарнавікі не трапляе' };
  if (meta.type === 'rite' && SACRAMENT_ORDER.test(meta.title)) return { decision: 'EXCLUDE', reason: 'rite', detail: 'парадак сакрамэнту: канкурыруе з афіцыйнымі абрадамі ці Імшой' };
  return null;
}

/**
 * @param {{ corpus, sources, canonical: {payloads, operations}, oldPrayers: Array, drafts?: Array, categories?: Array, sourceSha256: string }} input
 */
export function planBogDobry({ corpus, sources, canonical, oldPrayers, drafts = [], categories = [], sourceSha256 }) {
  const rights = sources.sources[BOG_SOURCE_ID];
  const universe = buildTagUniverse([...oldPrayers, ...drafts], categories);
  // Reference set: everything that will exist after pass 1 (+ live content + existing drafts).
  const reference = [
    ...Object.values(canonical.payloads).map((p) => ({ id: p.id, title: p.data.title, text: p.data.text, origin: 'canon' })),
    ...oldPrayers.map((p) => ({ id: p.id, title: oldTitle(p), text: oldText(p), origin: 'live' })),
    ...drafts.map((d) => ({ id: d.id, title: d.title, text: d.text, origin: 'draft' })),
  ].map((item) => ({ ...item, key: normalizeTitleKey(item.title), shingles: shingles(item.text) }));
  const operations = []; const payloads = {}; const tagRows = []; const proposedTags = new Map(); const duplicateRows = []; const excluded = [];
  const seenInBook = new Map(); // title+text key -> first draft id (the book repeats some prayers)
  const qa = { mixedRed: 0, imagesSkipped: 0, unresolvedRefs: 0, noTags: 0, titleCase: 0 };
  const counts = { EXCLUDE: 0, ALREADY_EXISTS: 0, UNIQUE_DRAFT: 0, REVIEW: 0 };
  const byType = {}; const exclusionReasons = {};

  for (const meta of corpus.index) {
    const entry = corpus.readEntry(meta);
    const bump = (decision) => { counts[decision] += 1; byType[meta.type] ||= {}; byType[meta.type][decision] = (byType[meta.type][decision] || 0) + 1; };
    const title = sentenceCase(meta.title);
    const base = { sourceId: BOG_SOURCE_ID, sourceEntryId: meta.id, type: meta.type, language: meta.language, title, printedTitle: meta.title, parserStatus: meta.status, sectionTrail: meta.sectionTrail || [], pdfPageStart: meta.pdfPageStart, pdfPageEnd: meta.pdfPageEnd, printedPageStart: meta.printedPageStart, printedPageEnd: meta.printedPageEnd };
    const verdict = classify(meta, entry, title);
    if (verdict) {
      bump('EXCLUDE'); exclusionReasons[verdict.reason] = (exclusionReasons[verdict.reason] || 0) + 1;
      excluded.push({ ...base, reason: verdict.reason, detail: verdict.detail });
      operations.push({ ...base, action: 'EXCLUDE', rationale: `${verdict.reason}: ${verdict.detail}` });
      continue;
    }
    const { markdown, stats } = entryToMarkdown(entry, { title });
    qa.mixedRed += stats.mixedRed; qa.imagesSkipped += stats.skippedBlocks || 0; qa.unresolvedRefs += stats.unresolvedLinks;
    const key = normalizeTitleKey(title); const mine = shingles(markdown);
    // Already in the app (or in the canonical set)? title/stem + text evidence, never title alone for different texts.
    const hits = reference.map((ref) => {
      const text = jaccard(mine, ref.shingles); const within = containment(mine, ref.shingles); const same = ref.key === key;
      return { id: ref.id, title: ref.title, origin: ref.origin, titleExact: same, stems: sameStems(title, ref.title), textScore: Math.round(text * 100) / 100, contained: Math.round(within * 100) / 100 };
    });
    const confirmed = hits.filter((h) => h.textScore >= 0.6 || (h.contained >= 0.85 && mine.size >= 12) || (h.titleExact && h.textScore >= 0.3) || (h.stems && h.textScore >= 0.45));
    if (confirmed.length) {
      confirmed.sort((a, b) => b.textScore - a.textScore);
      bump('ALREADY_EXISTS');
      operations.push({ ...base, action: 'ALREADY_EXISTS', rationale: `already present as ${confirmed[0].origin} ${confirmed[0].id} «${confirmed[0].title}» (text ${confirmed[0].textScore}, contained ${confirmed[0].contained})`, matches: confirmed.slice(0, 5) });
      duplicateRows.push({ sourceEntryId: meta.id, title, decision: 'ALREADY_EXISTS', matches: confirmed.slice(0, 5) });
      continue;
    }
    const doubtful = hits.filter((h) => h.titleExact || (h.stems && h.textScore >= 0.2) || h.textScore >= 0.4).sort((a, b) => b.textScore - a.textScore);
    const bookKey = `${key}|${textHash(normalizeTitleKey(markdown))}`;
    if (seenInBook.has(bookKey)) {
      bump('ALREADY_EXISTS');
      operations.push({ ...base, action: 'ALREADY_EXISTS', rationale: `repeated inside the book: first as ${seenInBook.get(bookKey)}`, matches: [{ id: seenInBook.get(bookKey), origin: 'bog-internal' }] });
      continue;
    }
    // Draft. Reasons that need an editor's look make it REVIEW (origin "disputed"), the rest are plain unique drafts.
    const flags = [];
    if (meta.status !== 'complete') flags.push('parser QA: ' + ((entry.uncertainties || []).map((u) => u.reason).join('; ') || 'needs_review').slice(0, 240));
    if (doubtful.length) flags.push(`похожая малітва ёсць (${doubtful[0].origin} ${doubtful[0].id} «${doubtful[0].title}»), супадзенне не пацверджана`);
    if (INSTRUCTION.test(title)) flags.push('даведка/інструкцыя, а не малітва');
    if (meta.type === 'rite') flags.push('абрад з «Бог Добры»: не заменчае афіцыйныя абрады, патрэбна рашэнне рэдактара');
    if (meta.type === 'devotion' && stats.blocks > 120) flags.push('вялікае набажэнства: праверыць сегментацыю');
    const review = flags.length > 0;
    const decision = review ? 'REVIEW' : 'UNIQUE_DRAFT';
    bump(decision);
    const sectionTags = SECTION_TAGS.filter(([pattern]) => (meta.sectionTrail || []).some((part) => pattern.test(part))).map(([, tag]) => tag);
    const chosen = chooseTags({ kind: ['litany', 'novena', 'chaplet'].includes(meta.type) ? meta.type : kindFromTitle(title) || 'prayer', title, sourceId: BOG_SOURCE_ID, keepTags: sectionTags }, universe);
    for (const t of chosen.proposedNew) { const known = proposedTags.get(t.tag) || { tag: t.tag, reason: t.reason, affected: [] }; known.affected.push(meta.id); proposedTags.set(t.tag, known); }
    for (const t of chosen.trace) tagRows.push({ sourceEntryId: meta.id, title, tag: t.tag, via: t.via });
    if (!chosen.tags.length) qa.noTags += 1;
    if (title !== meta.title) qa.titleCase += 1;
    const categoryNames = categories.filter((c) => (c.tags || []).some((tag) => chosen.tags.includes(tag))).map((c) => c.name);
    const id = bogDraftId(meta.id);
    seenInBook.set(bookKey, id);
    const pages = pageSpanLabel(meta.printedPageStart, meta.printedPageEnd);
    const doc = { draftId: id, sourceId: BOG_SOURCE_ID, sourceBook: rights.book, sourceSha256, pdfPageStart: meta.pdfPageStart, pdfPageEnd: meta.pdfPageEnd, printedPageStart: meta.printedPageStart, printedPageEnd: meta.printedPageEnd, sourcePageSpan: pages, originalEntryId: meta.id, title, text: markdown, textFormat: 'mybrev-markdown', tags: chosen.tags, copyrightNotices: rights.copyrightNotices, rightsStatus: 'unconfirmed', priestOnly: false, originBatch: BOG_BATCH, origin: review ? 'disputed' : 'bog_dobry', reason: review ? (meta.status !== 'complete' ? 'needs_review' : doubtful.length ? 'ambiguous' : 'needs_review') : 'unique_bog_dobry', flagReasons: flags.slice(0, 6), possibleDuplicateIds: doubtful.map((h) => h.id).slice(0, 10), status: review ? 'needs_review' : 'draft', fingerprint: textHash(markdown) };
    payloads[id] = { collection: 'prayerDrafts', id, data: doc };
    operations.push({ ...base, action: decision, targetCollection: 'prayerDrafts', targetId: id, tags: chosen.tags, categories: categoryNames, source: draftSourceNotice({ sourceBook: rights.book, copyrightNotices: rights.copyrightNotices, printedPageStart: meta.printedPageStart, printedPageEnd: meta.printedPageEnd, pdfPageStart: meta.pdfPageStart }), copyrightNotices: rights.copyrightNotices, rightsStatus: 'unconfirmed', textSha256: textHash(markdown), textLength: markdown.length, rationale: review ? flags.join(' | ') : 'no counterpart in canonical set, live content or drafts', flags, evidence: doubtful.slice(0, 5) });
    if (doubtful.length) duplicateRows.push({ sourceEntryId: meta.id, title, decision, matches: doubtful.slice(0, 5) });
  }
  return { operations, payloads, counts, byType, exclusionReasons, excluded, tagRows, proposedNewTags: [...proposedTags.values()], duplicateRows, qa, tagUniverse: [...universe.values()], existingTag: (name) => existingTag(universe, name) };
}

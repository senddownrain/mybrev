// Deterministic local search over the Compendium. Pure module shared by the
// app and `node --test`; the normalisation rules are documented in
// docs/compendium.md so that other clients can reproduce them.

const LATIN_LOOKALIKES = { a: 'а', e: 'е', i: 'и', o: 'о', p: 'р', c: 'с', x: 'х', y: 'у' };

/**
 * Fold text for matching:
 * - lower case, Unicode NFD with combining marks removed (ё→е, й→и, ў→у, stress marks);
 * - Belarusian/Russian orthographic variants: і→и, э→е, ъ removed;
 * - apostrophes removed (’ ' ʼ), Latin lookalike letters used in the source → Cyrillic;
 * - every other non-letter/digit becomes a space.
 */
export function normalizeSearchText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[aeiopcxy](?=[Ѐ-ӿ])|(?<=[Ѐ-ӿ])[aeiopcxy]/g, (letter) => LATIN_LOOKALIKES[letter])
    .replace(/[іi]/g, 'и')
    .replace(/э/g, 'е')
    .replace(/[ъ’'ʼ`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function tokenizeSearchText(value) {
  const normalized = normalizeSearchText(value);
  return normalized ? normalized.split(' ') : [];
}

/** "1066-1075" → [1066, 1075]; "1076" → [1076, 1076]. */
export function parseCccRef(ref) {
  const [from, to = from] = String(ref).split('-').map(Number);
  return [from, to];
}

/**
 * Hidden Russian → Belarusian search aliases. File format:
 * { schemaVersion: 1, groups: [{ ru: ["крещени", …], be: ["хрост", …] }] }
 * `ru` entries are query stems (a query word that starts with one of them
 * triggers the group); `be` entries are word prefixes searched in the text.
 * Aliases only widen matching: they are never displayed.
 */
export function compileSearchAliases(aliasFile) {
  const groups = (aliasFile?.groups || []).map((group) => ({
    ru: (group.ru || []).map(normalizeSearchText).filter(Boolean),
    be: (group.be || []).map(normalizeSearchText).filter(Boolean),
  })).filter((group) => group.ru.length && group.be.length);
  return {
    expand(token) {
      const extra = new Set();
      for (const group of groups) {
        if (group.ru.some((stem) => token.startsWith(stem))) group.be.forEach((stem) => extra.add(stem));
      }
      extra.delete(token);
      return [...extra];
    },
    groups,
  };
}

const FIELD_WEIGHTS = { question: 12, answer: 5, context: 3, refs: 4 };
const EMPTY_ALIASES = compileSearchAliases(null);

/** Precompute normalised word lists once per dataset (not per keystroke). */
export function createCompendiumSearchIndex(questions, aliasFile = null) {
  const aliases = aliasFile ? compileSearchAliases(aliasFile) : EMPTY_ALIASES;
  const entries = questions.map((question) => {
    const context = [question.partTitle, question.sectionTitle, question.chapterTitle, question.topicTitle, question.subtopicTitle].filter(Boolean).join(' ');
    const questionText = normalizeSearchText(question.question);
    const answerText = normalizeSearchText(question.answer);
    return {
      question,
      questionText,
      answerText,
      words: {
        question: [...new Set(questionText.split(' '))],
        answer: [...new Set(answerText.split(' '))],
        context: [...new Set(tokenizeSearchText(context))],
      },
      refs: (question.cccRefs || []).map(parseCccRef),
    };
  });
  return { entries, aliases };
}

function stemVariants(token) {
  // Light, language-agnostic stemming for inflected Belarusian words: allow a
  // shorter prefix (вера → вер…: верай, веры; малітвы → малітв…).
  if (/^\d+$/.test(token) || token.length < 4) return [];
  const variants = [token.slice(0, -1)];
  if (token.length >= 7) variants.push(token.slice(0, -2));
  return variants;
}

function matchWords(words, prefixes) {
  return words.some((word) => prefixes.some((prefix) => word.startsWith(prefix)));
}

/** Per-field scores of one query word: { question?, answer?, context?, refs? }. */
function scoreToken(entry, token, aliases) {
  // Pure numbers match Catechism paragraph references (range-aware) only;
  // matching digits inside Scripture citations would only add noise.
  if (/^\d+$/.test(token)) {
    const number = Number(token);
    return entry.refs.some(([from, to]) => number >= from && number <= to) ? { refs: FIELD_WEIGHTS.refs } : {};
  }
  const alternatives = [
    { prefixes: [token], factor: 1 },
    { prefixes: aliases.expand(token), factor: 0.85 },
    { prefixes: stemVariants(token), factor: 0.6 },
  ].filter((alternative) => alternative.prefixes.length);
  const scores = {};
  for (const name of ['question', 'answer', 'context']) {
    const alternative = alternatives.find((candidate) => matchWords(entry.words[name], candidate.prefixes));
    if (!alternative) continue;
    // A whole-word hit ranks slightly above a prefix hit.
    const exact = alternative.factor === 1 && entry.words[name].includes(token);
    scores[name] = FIELD_WEIGHTS[name] * alternative.factor * (exact || alternative.factor !== 1 ? 1 : 0.9);
  }
  return scores;
}

/**
 * Search questions. Ranking: exact question number, then matches in the
 * question text, then answer, headings and Catechism references. Every query
 * word must match somewhere (AND). Returns `{ question, score, field }[]`.
 */
export function searchCompendium(index, query, { limit = 200 } = {}) {
  const raw = String(query ?? '').trim();
  const tokens = tokenizeSearchText(raw);
  if (!tokens.length) return [];
  const numberQuery = /^(?:№\s*|#\s*)?(\d{1,4})\.?$/u.exec(raw)?.[1];
  const phrase = tokens.join(' ');
  const results = [];

  for (const entry of index.entries) {
    if (numberQuery && entry.question.number === Number(numberQuery)) {
      results.push({ question: entry.question, score: 1000, field: 'number' });
      continue;
    }
    let total = 0;
    let bestField = null;
    let bestFieldScore = 0;
    const fieldHits = { question: 0, answer: 0, context: 0, refs: 0 };
    let matchedAll = true;
    for (const token of tokens) {
      const scores = scoreToken(entry, token, index.aliases);
      const values = Object.entries(scores);
      if (!values.length) { matchedAll = false; break; }
      const [field, best] = values.reduce((a, b) => (b[1] > a[1] ? b : a));
      // Best field counts fully, other matching fields add a little.
      total += best + values.reduce((sum, [name, value]) => sum + (name === field ? 0 : value * 0.25), 0);
      values.forEach(([name]) => { fieldHits[name]++; });
      if (best > bestFieldScore) { bestFieldScore = best; bestField = field; }
    }
    if (!matchedAll) continue;
    // Short questions that are "about" the query come first ("Што такое Эўхарыстыя?").
    if (fieldHits.question) total += (4 * fieldHits.question) / entry.words.question.length;
    if (tokens.length > 1) {
      if (entry.questionText.includes(phrase)) total += 20;
      else if (entry.answerText.includes(phrase)) total += 8;
      if (fieldHits.question === tokens.length) total += 10;
      if (fieldHits.context === tokens.length) total += 8;
    }
    results.push({ question: entry.question, score: total, field: bestField });
  }

  return results
    .sort((a, b) => b.score - a.score || a.question.number - b.question.number)
    .slice(0, limit);
}

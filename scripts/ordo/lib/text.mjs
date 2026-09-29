/** Text helpers shared by the Ordo build and check scripts. */

export function clean(value) {
  return String(value ?? '').normalize('NFC').replace(/­/g, '').replace(/\s+/g, ' ').trim();
}

/** Lower-case comparison form: Belarusian letter variants folded. */
export function fold(value) {
  return clean(value)
    .toLocaleLowerCase('be-BY')
    .replace(/[ёэ]/g, 'е')
    .replace(/ў/g, 'у')
    .replace(/[’'ʼ`]/g, '')
    .replace(/i/g, 'і');
}

const ABBREVIATIONS = [
  [/\bнпм\b/g, 'найсвяцейшай панны марыі'],
  [/\bсвв?\.\s*/g, ''],
  [/\bбл\.\s*/g, ''],
  [/\bбпп?\b\.?/g, ''],
  [/\bд-рк\b\.?|\bдк\b\.?/g, ''],
];

const ROLE_WORDS = new Set([
  'свят', 'святы', 'свята', 'святога', 'святой', 'святых', 'святыя', 'благаслаулен', 'благаслауленага',
  'благаслауленай', 'благаслауленых', 'успамін', 'урачыстасць', 'урачыстасці', 'абавязковы', 'неабавязковы',
  'біскупа', 'біскупау', 'біскуп', 'прэзбітэра', 'прэзбітэрау', 'прэзб', 'мучаніка', 'мучанікау', 'мучаніцы',
  'мучаніц', 'мм', 'мч', 'панны', 'паннау', 'пн', 'доктара', 'доктарау', 'касцела', 'апостала', 'апосталау',
  'абата', 'аб', 'папы', 'пп', 'законніка', 'законніцы', 'паплечнікау', 'папл', 'дыякана', 'манаха', 'пустэльніка',
  'евангеліста', 'ап', 'ев', 'апекуна', 'апякункі', 'еуропы', 'дыяцэзіі', 'дадатковага', 'галоунага', 'ad', 'libitum',
  'або', 'альбо', 'успамін', 'у', 'і', 'з', 'ад', 'на', 'пра', 'дзень', 'свята', 'нядзеля',
]);

/** Name tokens (4-letter stems) used to match celebration titles. */
const LATIN_LOOKALIKES = { a: 'а', c: 'с', e: 'е', o: 'о', p: 'р', x: 'х', y: 'у', k: 'к', m: 'м', h: 'н', t: 'т', b: 'в' };

export function titleStems(title) {
  // Mixed-script words ("Cхалястыкі" with a Latin C) are folded to Cyrillic.
  let text = fold(celebrationCore(title)).replace(/[a-z](?=[а-яіу])|(?<=[а-яіу])[a-z]/g, (ch) => LATIN_LOOKALIKES[ch] || ch);
  ABBREVIATIONS.forEach(([pattern, replacement]) => { text = text.replace(pattern, replacement); });
  return [...new Set(text
    .replace(/[^a-zа-яіу\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((word) => word.length >= 3 && !ROLE_WORDS.has(word))
    .map((word) => word.slice(0, 5)))];
}

/**
 * Similarity of two stem sets: Dice, or containment of the shorter title in
 * the longer one (source titles carry extra rubrics, catalog titles do not).
 */
export function similarity(left, right) {
  const a = new Set(left);
  const b = new Set(right);
  if (!a.size || !b.size) return 0;
  let common = 0;
  let fuzzy = 0;
  a.forEach((item) => {
    if (b.has(item)) common += 1;
    else if (item.length >= 4 && [...b].some((other) => other.length >= 4 && other.slice(0, 2) === item.slice(0, 2) && editDistance(other, item) <= 1)) fuzzy += 1;
  });
  const matched = common + fuzzy * 0.8;
  const dice = (2 * matched) / (a.size + b.size);
  const containment = matched / Math.min(a.size, b.size);
  return Math.max(dice, containment * 0.85);
}

/** Strict Dice on exact stems (for cross-date matching / transfers). */
export function strictSimilarity(left, right) {
  const a = new Set(left);
  const b = new Set(right);
  let common = 0;
  a.forEach((item) => { if (b.has(item)) common += 1; });
  return common >= 2 ? (2 * common) / (a.size + b.size) : 0;
}

function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

/** Remove rubric tails from a printed celebration title before matching. */
export function celebrationCore(title) {
  return clean(title)
    // Rubric parentheses ("(можна карыстацца толькі калектай)") go; name
    // parentheses ("Адальбэрта (Войцеха)", "Анзгара (Аскара)") stay.
    .replace(/\((?:[^)]*(?:можна|гл\.|з увагі|карыстацца|калект|№|\d))[^)]*\)/giu, ' ')
    .replace(/,?\s*гл\.\s*с\..*$/i, '')
    .replace(/\.\s+(?:Імша|Аф\.|Св\.\s+Імша)\b.*$/i, '')
    .replace(/\s+[–—-]\s+(?:Імша|ранішняя|вечаровая).*$/i, '')
    .trim();
}

/** Stable key for "the same note" across days and sources. */
export function fingerprint(text) {
  return fold(text)
    .replace(/\((?:аг|рі|с\.|сс\.|імшал)[^)]*\)/g, ' ')
    .replace(/[«»“”"().,;:!?–—-]/g, ' ')
    .replace(/\b\d+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

export function wordSet(text) {
  return new Set(fingerprint(text).split(' ').filter((word) => word.length > 3).map((word) => word.slice(0, 6)));
}

export function jaccard(left, right) {
  const a = left instanceof Set ? left : wordSet(left);
  const b = right instanceof Set ? right : wordSet(right);
  if (!a.size || !b.size) return 0;
  let common = 0;
  a.forEach((item) => { if (b.has(item)) common += 1; });
  return common / (a.size + b.size - common);
}

/** Markers that tie a note to one particular civil year. */
export function yearSpecificMarkers(text) {
  const value = clean(text);
  const markers = [];
  const years = value.match(/(?<!(?:Аг|РІ|с\.|сс\.|імшал|№)\s?)\b(?:19|20)\d{2}\b(?!\s*[–-]\s*\d)/g) || [];
  years.forEach((year) => {
    if (!new RegExp(`ад\\s+${year}\\s*г`).test(value) && !new RegExp(`\\(\\s*\\+?\\s*${year}\\s*\\)`).test(value)) {
      markers.push(`year:${year}`);
    }
  });
  if (/у\s+гэтым\s+годзе/i.test(value)) markers.push('this-year');
  if (/юбіле/i.test(value)) markers.push('jubilee');
  if (/\bа\s+\d{1,2}(?:[.:]\d{2})?\s*гадз|\d{1,2}[.:]\d{2}/i.test(value)) markers.push('clock-time');
  if (/перанесен|перанос/i.test(value)) markers.push('transfer-instance');
  return [...new Set(markers)];
}

const ORDINALS = {
  першы: 1, другі: 2, трэці: 3, чацверты: 4, пяты: 5, шосты: 6, сёмы: 7, восьмы: 8, дзявяты: 9, дзевяты: 9,
};

export function ordinal(word) {
  const key = clean(word).toLocaleLowerCase('be-BY').replace(/[.,-].*$/, '');
  if (/^\d+$/.test(key)) return Number(key);
  const roman = { і: 1, i: 1, іі: 2, ii: 2, ііі: 3, iii: 3, iv: 4, іv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9 };
  return ORDINALS[key] || roman[key] || null;
}

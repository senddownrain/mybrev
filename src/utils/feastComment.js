/** A celebration rank already appears in the day header.
 * A comment containing only that rank is metadata, not an introduction.
 * Do not suppress real liturgical notes or biographies.
 */
export const RANK_ONLY_FEAST_COMMENTS = Object.freeze([
  'Урачыстасць',
  'Ўрачыстасць',
  'Свята',
  'Успамін',
  'Неабавязковы ўспамін',
  'solemnitas',
  'solemnity',
  'festum',
  'feast',
  'memoria',
  'memoria ad libitum',
]);

const rankLabels = new Set(RANK_ONLY_FEAST_COMMENTS.map(label => label.toLowerCase()));

export function isRankOnlyFeastComment(value) {
  if (typeof value !== 'string') return false;
  const plain = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:nbsp|#160|#x0*a0);/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!]+$/, '')
    .trim()
    .toLowerCase();
  return rankLabels.has(plain);
}

export function visibleFeastComment(value) {
  return typeof value === 'string' && !isRankOnlyFeastComment(value) ? value : '';
}

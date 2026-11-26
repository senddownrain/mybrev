const UNPUBLISHED_STATUSES = new Set(['draft', 'pending', 'review', 'rejected', 'archived']);

export function isPublishedPrayerContent(item) {
  return item.published !== false && !UNPUBLISHED_STATUSES.has(String(item.status || '').trim().toLowerCase());
}

export function normalizePrayerCategoryComment(comment) {
  if (!comment || typeof comment !== 'object' || Array.isArray(comment)
    || typeof comment.content !== 'string' || !comment.content.trim()) return null;
  const result = { content: comment.content.replace(/\r\n?/g, '\n') };
  if (typeof comment.title === 'string' && comment.title.trim()) result.title = comment.title.trim();
  if (typeof comment.sourceId === 'string' && comment.sourceId.trim()) result.sourceId = comment.sourceId.trim();
  return result;
}

export function publishedPrayerCategoryComment(category) {
  return category && isPublishedPrayerContent(category) ? normalizePrayerCategoryComment(category.comment) : null;
}

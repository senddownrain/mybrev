// Book source + rights notice shown to readers under a prayer ("Крыніца:").
// Markdown is rendered by renderPrayerMarkdown, so the notice is plain text.
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

/**
 * @param {{ book?: string, pages?: string, copyrightNotices?: string[] }} parts
 * @returns {string} e.g. «Прасіце і атрымаеце» (Мінск, 2024), с. 17–21. © Выдавецтва «Про Хрысто», 2024
 */
export function formatSourceNotice({ book, pages, copyrightNotices } = {}) {
  const head = clean(book);
  const pageText = clean(pages);
  const notices = [...new Set((copyrightNotices || []).map(clean).filter(Boolean))];
  const first = [head, pageText ? `с. ${pageText}` : ''].filter(Boolean).join(', ');
  return [first && `${first}.`, notices.join('; ')].filter(Boolean).join(' ').replace(/\.\.$/, '.');
}

export function pageSpanLabel(start, end) {
  if (!start) return '';
  return end && end !== start ? `${start}–${end}` : String(start);
}

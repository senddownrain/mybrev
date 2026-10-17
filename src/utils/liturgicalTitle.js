/**
 * Format a liturgical title as safe HTML, allowing only explicit line breaks.
 * All other markup remains escaped before the result is rendered with v-html.
 */
export function formatLiturgicalTitleHtml(title) {
  return String(title || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r?\n/g, '<br>');
}

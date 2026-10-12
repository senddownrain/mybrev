/**
 * Preview sanitizer for the rich-text fields of the admin editors
 * (`InlineEditor.vue`, Hours texts): the stored HTML is rendered with
 * `v-html`, so only formatting survives — never scripts, handlers, frames,
 * unsafe URLs or layout-breaking styles. The stored value is NOT modified;
 * only the preview (and the Quill editor keeps its own model).
 */
const ALLOWED_TAGS = new Set(['p', 'br', 'span', 'div', 'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a']);
const ALLOWED_STYLE = new Set(['color', 'background-color', 'font-style', 'font-weight', 'text-align', 'text-indent', 'text-decoration', 'margin-left', 'padding-left']);
const SAFE_VALUE = /^[\w\s#%.,()+\-/]*$/;

function safeStyle(style) {
  return String(style || '').split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const [name, ...rest] = part.split(':');
    return [String(name).trim().toLowerCase(), rest.join(':').trim()];
  }).filter(([name, value]) => ALLOWED_STYLE.has(name) && SAFE_VALUE.test(value) && !/url\s*\(|expression|javascript/i.test(value))
    .map(([name, value]) => `${name}: ${value}`).join('; ');
}

export function sanitizeEditorPreviewHtml(html) {
  const source = String(html ?? '');
  if (!/[<>]/.test(source)) return source;
  return source
    .replace(/<(script|style|iframe|object|embed|template|noscript|svg|math)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?([a-z][a-z0-9]*)\b([^>]*)>/gi, (match, rawTag, attributes) => {
      const tag = rawTag.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) return '';
      if (match.startsWith('</')) return `</${tag}>`;
      if (tag === 'br') return '<br>';
      const parts = [];
      const style = /\bstyle\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attributes);
      const cleanStyle = safeStyle(style?.[2] ?? style?.[3]);
      if (cleanStyle) parts.push(`style="${cleanStyle}"`);
      const className = /\bclass\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attributes);
      const classes = String(className?.[2] ?? className?.[3] ?? '').split(/\s+/).filter((name) => /^[\w-]+$/.test(name));
      if (classes.length) parts.push(`class="${classes.join(' ')}"`);
      if (tag === 'a') {
        const href = /\bhref\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attributes);
        const url = String(href?.[2] ?? href?.[3] ?? '').trim();
        if (/^(https?:|mailto:|#)/i.test(url)) parts.push(`href="${url.replace(/"/g, '&quot;')}"`, 'rel="noopener noreferrer"', 'target="_blank"');
      }
      return `<${tag}${parts.length ? ` ${parts.join(' ')}` : ''}>`;
    });
}

const SPACE = '(?:[ \\t]|&nbsp;|&#160;|&#xA0;)';
const VERSE = '\\d{1,3}\\.[ \\t]*\\p{L}';

// Called only for the responsorial psalm, after ordinary text is escaped or
// trusted HTML has been supplied. Tags are kept outside the text transforms.
export function formatResponsorialPsalmHtml(html) {
  return String(html).split(/(<[^>]+>)/u).map((part) => {
    if (part.startsWith('<')) return part;
    return part
      .replace(new RegExp(`(?<=\\S)${SPACE}+(?=${VERSE})`, 'giu'), '<br>')
      .replace(new RegExp(`(?<=[.!?;:…])(?=${VERSE})`, 'giu'), '<br>')
      .replace(new RegExp(`\\*${SPACE}*`, 'giu'), '<span class="psalm-marker">*</span><br>')
      .replace(/†/gu, '<span class="psalm-marker">†</span>');
  }).join('')
    .replace(/(<span class="psalm-marker">\*<\/span><br>)(?:<br\s*\/?>)+/giu, '$1');
}

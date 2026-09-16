function clamp(value, min, max) {
  return Math.min(Math.max(Number(value) || 0, min), max);
}

/**
 * Build a CodeMirror transaction that toggles Markdown delimiters around a selection.
 * The returned selection keeps the same visible text selected after either action.
 */
export function toggleMarkdownInlineFormat(
  source,
  selection,
  before,
  after = before,
  fallback = 'тэкст',
) {
  const text = String(source || '');
  const from = clamp(selection?.from, 0, text.length);
  const to = clamp(selection?.to, from, text.length);
  const selected = text.slice(from, to);

  if (
    selected.startsWith(before)
    && selected.endsWith(after)
    && selected.length >= before.length + after.length
  ) {
    const insert = selected.slice(before.length, selected.length - after.length);
    return {
      changes: { from, to, insert },
      selection: { anchor: from, head: from + insert.length },
      formatted: false,
    };
  }

  const outerFrom = from - before.length;
  const outerTo = to + after.length;
  if (
    selected
    && outerFrom >= 0
    && text.slice(outerFrom, from) === before
    && text.slice(to, outerTo) === after
  ) {
    return {
      changes: { from: outerFrom, to: outerTo, insert: selected },
      selection: { anchor: outerFrom, head: outerFrom + selected.length },
      formatted: false,
    };
  }

  const content = selected || fallback;
  const insert = `${before}${content}${after}`;
  return {
    changes: { from, to, insert },
    selection: {
      anchor: from + before.length,
      head: from + before.length + content.length,
    },
    formatted: true,
  };
}

// A legacy import stored every short poetic line as a separate paragraph.
// Require a uniform run so real prose paragraphs and mixed structures stay intact.
export function inspectReadingText(value) {
  if (typeof value !== 'string' || !/\r?\n\r?\n/u.test(value)) {
    return { kind: 'unchanged', value };
  }

  const lines = value.split(/\r?\n(?:[ \t]*\r?\n)+/u);
  if (lines.length < 8) return { kind: 'unchanged', value };

  const shortLine = (line) => line.length > 0
    && line.length <= 85
    && line === line.trim()
    && !/[\r\n<>]/u.test(line);
  const allShortLines = lines.every(shortLine);
  const proseIntroduction = lines.length >= 9
    && lines[0].length > 85
    && lines[0].length <= 250
    && lines[0] === lines[0].trim()
    && /[.!?]$/u.test(lines[0])
    && !/[\r\n<>]/u.test(lines[0])
    && lines.slice(1).every(shortLine);
  if (!allShortLines && !proseIntroduction) return { kind: 'review', value, lineCount: lines.length };

  const newline = value.includes('\r\n') ? '\r\n' : '\n';
  const normalized = proseIntroduction
    ? `${lines[0]}${newline}${newline}${lines.slice(1).join(newline)}`
    : lines.join(newline);
  return { kind: 'change', value: normalized, lineCount: lines.length };
}

export function normalizeReadingText(value) {
  return inspectReadingText(value).value;
}

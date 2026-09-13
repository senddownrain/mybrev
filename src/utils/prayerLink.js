// Keep prayer references portable: web and native readers resolve the same path.
export function prayerLinkMarkdown(id, label) {
  if (!id) throw new Error('Prayer ID is required');
  const text = String(label || '').replace(/\r?\n/g, ' ').trim() || 'Малітва';
  const escaped = text.replace(/[\\`*_[\]<>]/g, '\\$&');
  const pathId = encodeURIComponent(id).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `[${escaped}](/prayer/${pathId})`;
}

// Called only for an actual Markdown Link syntax node, not arbitrary prose/code.
export function parsePrayerLink(source) {
  const match = /^\[([\s\S]*)\]\(\/prayer\/([^\s)]+)\)$/.exec(source);
  if (!match) return null;
  try {
    return {
      id: decodeURIComponent(match[2]),
      label: match[1].replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, '$1'),
    };
  } catch {
    return null;
  }
}

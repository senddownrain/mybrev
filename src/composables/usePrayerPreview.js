const previewCache = new Map();

export function getPrayerPreview(text) {
  if (!text) return 'Няма змесціва';
  
  if (previewCache.has(text)) {
    return previewCache.get(text);
  }
  
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const plainText = (doc.body.textContent || "").trim();
  const preview = plainText.length > 150 ? plainText.substring(0, 150) + '...' : plainText;
  
  if (previewCache.size > 100) {
    const firstKey = previewCache.keys().next().value;
    previewCache.delete(firstKey);
  }
  previewCache.set(text, preview);
  
  return preview;
}

export function clearPreviewCache() {
  previewCache.clear();
}


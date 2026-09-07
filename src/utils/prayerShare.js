export function buildPrayerSharePath(prayerId) {
  if (!prayerId) return '';
  return `/p/${encodeURIComponent(String(prayerId))}`;
}

export function buildPrayerShareUrl(routeHref, baseHref = globalThis.location?.href) {
  if (!routeHref || !baseHref) return '';
  return new URL(routeHref, baseHref).href;
}

function copyWithTemporaryInput(url, documentRef) {
  if (!documentRef?.body || typeof documentRef.execCommand !== 'function') {
    throw new Error('Clipboard is not available');
  }

  const input = documentRef.createElement('textarea');
  input.value = url;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  documentRef.body.appendChild(input);
  input.select();

  try {
    if (!documentRef.execCommand('copy')) {
      throw new Error('Could not copy the prayer link');
    }
  } finally {
    input.remove();
  }
}

export async function sharePrayerLink({
  title,
  url,
  navigatorRef = globalThis.navigator,
  documentRef = globalThis.document,
}) {
  const shareData = { title, url };
  const canUseNativeShare = typeof navigatorRef?.share === 'function'
    && (typeof navigatorRef.canShare !== 'function' || navigatorRef.canShare(shareData));

  if (canUseNativeShare) {
    try {
      await navigatorRef.share(shareData);
      return 'shared';
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled';
      // A browser can expose Web Share but still reject it for environmental
      // reasons. Copying the same direct URL remains a useful fallback.
    }
  }

  if (typeof navigatorRef?.clipboard?.writeText === 'function') {
    await navigatorRef.clipboard.writeText(url);
  } else {
    copyWithTemporaryInput(url, documentRef);
  }

  return 'copied';
}

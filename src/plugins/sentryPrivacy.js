// Privacy filters for the optional Sentry error reporting (variant B, see docs/analytics-sentry-review.md).
// Pure functions: no network, no Sentry import, safe to run on synthetic events in node tests.

export const SENTRY_PRIVACY_OPTIONS = Object.freeze({
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  sendDefaultPii: false,
});

const MAX_STRING = 500;
const MAX_DEPTH = 6;
const URL_IN_TEXT = /https?:\/\/[^\s"'<>)\]]+/gi;
// Bare in-app paths inside free text, e.g. "boom at /song/abc?x=1#y" (two or more segments).
const PATH_IN_TEXT = /(^|[\s"'(])(\/[\w\-.~%:@]+(?:\/[\w\-.~%:@?]+)+)(?:\?[^\s"')]*)?(?:#[^\s"')]*)?/g;
// Breadcrumb categories that carry clicked/typed DOM text or arbitrary console payloads.
const DROPPED_BREADCRUMB_CATEGORIES = /^(ui\.|console$|sentry\.)/;
// Event fields that logger.js fills with arbitrary caller data (documents, prayer text).
const DROPPED_EVENT_FIELDS = ['extra', 'user'];
const DROPPED_REQUEST_FIELDS = ['query_string', 'cookies', 'headers', 'data', 'env'];

function fallbackPattern(pathname) {
  const segments = pathname.split('/').filter(Boolean);
  if (!segments.length) return '/';
  return `/${segments[0]}${segments.slice(1).map(() => '/:param').join('')}`;
}

/**
 * Reduce a path or URL to a route pattern without origin, query, hash or ids.
 * @param {string} value path or absolute URL
 * @param {(pathname: string) => string | null} [resolvePattern] returns the matched route pattern, e.g. '/prayer/:id'
 */
export function parameterizeRoute(value, resolvePattern) {
  if (typeof value !== 'string' || !value) return value;
  let pathname;
  try {
    pathname = new URL(value, 'https://placeholder.invalid').pathname;
  } catch {
    pathname = value.split(/[?#]/)[0];
  }
  let pattern;
  try {
    pattern = resolvePattern ? resolvePattern(pathname) : null;
  } catch {
    pattern = null;
  }
  return typeof pattern === 'string' && pattern ? pattern : fallbackPattern(pathname);
}

function scrubUrl(url, resolvePattern) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return '[url]';
  }
  const sameOrigin = parsed.origin === globalThis.location?.origin;
  // Third-party endpoints (Firestore, Auth, fonts) keep only the host: their paths hold document ids.
  if (!sameOrigin && !/\.js$/.test(parsed.pathname)) return parsed.origin;
  if (/\.(js|css|woff2?|map)$/.test(parsed.pathname)) return `${parsed.origin}${parsed.pathname}`;
  return parameterizeRoute(parsed.pathname, resolvePattern);
}

function scrubString(value, resolvePattern) {
  const text = value
    .replace(URL_IN_TEXT, (url) => scrubUrl(url, resolvePattern))
    .replace(PATH_IN_TEXT, (match, lead, pathname) => (/\.(js|css|map)$/.test(pathname) ? match : `${lead}${parameterizeRoute(pathname, resolvePattern)}`));
  return text.length > MAX_STRING ? `${text.slice(0, MAX_STRING)}…` : text;
}

function deepScrub(value, resolvePattern, depth = 0) {
  if (typeof value === 'string') return scrubString(value, resolvePattern);
  if (depth >= MAX_DEPTH || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => deepScrub(item, resolvePattern, depth + 1));
  const out = {};
  for (const [key, item] of Object.entries(value)) out[key] = deepScrub(item, resolvePattern, depth + 1);
  return out;
}

export function scrubBreadcrumb(breadcrumb, resolvePattern) {
  if (!breadcrumb) return null;
  if (DROPPED_BREADCRUMB_CATEGORIES.test(breadcrumb.category || '')) return null;
  const out = { ...breadcrumb };
  if (typeof out.message === 'string') out.message = scrubString(out.message, resolvePattern);
  if (out.data && typeof out.data === 'object') {
    const data = {};
    for (const key of ['from', 'to', 'url']) {
      if (typeof out.data[key] === 'string') data[key] = parameterizeRoute(out.data[key], resolvePattern);
    }
    if (out.category === 'fetch' || out.category === 'xhr') {
      if (typeof out.data.url === 'string') data.url = scrubUrl(out.data.url, resolvePattern);
      if (out.data.status_code !== undefined) data.status_code = out.data.status_code;
      if (typeof out.data.method === 'string') data.method = out.data.method;
    }
    out.data = data;
  }
  return out;
}

/**
 * beforeSend: keep the error type, message, stack, release and browser; drop anything that could
 * record which prayer, song or Bible chapter a person had open.
 */
export function scrubEvent(event, resolvePattern) {
  if (!event) return null;
  const out = deepScrub(event, resolvePattern);
  for (const field of DROPPED_EVENT_FIELDS) delete out[field];
  if (out.contexts && typeof out.contexts === 'object') {
    // Defense in depth: component props (prayer, song, Bible text) must never ride along.
    out.contexts = { ...out.contexts };
    delete out.contexts.vue;
  }
  if (out.request) {
    const request = { ...out.request };
    if (typeof event.request?.url === 'string') request.url = parameterizeRoute(event.request.url, resolvePattern);
    for (const field of DROPPED_REQUEST_FIELDS) delete request[field];
    out.request = request;
  }
  if (typeof event.transaction === 'string') out.transaction = parameterizeRoute(event.transaction, resolvePattern);
  if (Array.isArray(event.breadcrumbs)) {
    out.breadcrumbs = event.breadcrumbs.map((b) => scrubBreadcrumb(b, resolvePattern)).filter(Boolean);
  }
  return out;
}

/** Performance transactions and replays are disabled; if one still arrives, do not send it. */
export function dropTransaction() {
  return null;
}

export function createSentryFilters(resolvePattern) {
  return {
    beforeSend: (event) => scrubEvent(event, resolvePattern),
    beforeSendTransaction: dropTransaction,
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb, resolvePattern),
  };
}

/** Route pattern resolver backed by vue-router; falls back to a generic `/:param` shape when unmatched. */
export function createRouterPatternResolver(router) {
  return (pathname) => {
    const matched = router.resolve(pathname).matched;
    const record = matched[matched.length - 1];
    return record?.path || null;
  };
}

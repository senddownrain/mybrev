/**
 * Analytics contract v1 (WEB + Flutter). See docs/analytics-contract.md.
 *
 * Pure, dependency-free validator and bucketing helpers. Nothing here measures,
 * stores or sends anything, and no screen imports this module yet. Network
 * transmission stays disabled: ANALYTICS_NETWORK_DEFAULT is false and the
 * contract has no code path that sends data.
 */

export const SCHEMA_VERSION = 1;

/** Compiled default of the network gate. Changing it requires an owner decision. */
export const ANALYTICS_NETWORK_DEFAULT = false;

export const PLATFORMS = Object.freeze(['web', 'android', 'ios']);
export const REGIONS = Object.freeze(['BY', 'OTHER', 'UNKNOWN']);

/** Public sections only. Admin, login, priest-only and personal prayers are not measurable. */
export const SECTIONS = Object.freeze([
  'today', 'hours', 'readings', 'ordo', 'prayers', 'mass', 'songs',
  'compendium', 'bible', 'picker', 'settings', 'about',
]);

/** section -> content_id kind. Sections absent from the map carry no content_id. */
export const SECTION_CONTENT_KIND = Object.freeze({
  prayers: 'prayer',
  mass: 'mass',
  songs: 'song',
  compendium: 'comp',
  hours: 'hour',
  bible: 'bible',
});

export const HOUR_IDS = Object.freeze([
  'invitatorium', 'morning', 'lectionis', 'laudes', 'terz', 'sext', 'non', 'vesper', 'completorium',
]);

const CONTENT_ID_PATTERNS = Object.freeze({
  prayer: /^prayer:[A-Za-z0-9]{20}$/,
  song: /^song:holysongs-[0-9a-f]{20}$/,
  comp: /^comp:[a-z0-9]+(?:-[a-z0-9]+){0,4}$/,
  mass: /^mass:order$/,
  hour: new RegExp(`^hour:(?:${HOUR_IDS.join('|')})$`),
  bible: /^bible:(?:bel|ru):[a-z0-9_-]{1,32}$/i,
});

export const FEATURE_IDS = Object.freeze([
  'text_scale_change', 'text_settings_open', 'theme_change', 'font_family_change',
  'keep_screen_on_toggle', 'favorite_add', 'favorite_remove', 'share_use', 'copy_use',
  'search_open', 'search_submit', 'date_pick', 'picker_open', 'hour_switch',
  'hour_option_select', 'psalmody_layout_change', 'chords_toggle', 'chord_transpose',
  'chord_layout_change', 'mass_language_change', 'mass_section_nav',
  'ordo_diocese_change', 'bible_language_change', 'bible_chapter_nav', 'back_to_top',
  'offline_update_apply', 'install_prompt_open',
]);

export const ERROR_IDS = Object.freeze([
  'clock_anomaly', 'storage_unavailable', 'queue_overflow',
  'visibility_unsupported', 'scroll_unmeasurable',
]);

export const EVENTS = Object.freeze(['screen_view', 'text_read', 'feature_use', 'measurement_error']);
export const TEXT_METRICS = Object.freeze(['fv', 'er', 'sd']);

/** Upper bounds of time buckets in seconds (exclusive), in order. */
export const TIME_BUCKETS = Object.freeze(['lt5s', '5_15s', '15_60s', '60_180s', '180_600s', 'gte600s']);
const TIME_BOUNDS = Object.freeze([5, 15, 60, 180, 600]);
export const SCROLL_BUCKETS = Object.freeze(['fit', 'p0_25', 'p25_50', 'p50_75', 'p75_99', 'p100']);

/** Hard cap on the foreground time of one visit; longer time is clamped. */
export const MAX_VISIT_SECONDS = 1800;
/** Visits shorter than this are navigation noise (redirects) and are discarded. */
export const MIN_COUNTED_VISIT_SECONDS = 1;
/** Visits with foreground time below this are "short opens": no er/sd rows. */
export const SHORT_OPEN_SECONDS = 5;
/** Documented, NOT calibrated assumption for the rough estimate (see contract). */
export const READING_WORDS_PER_MINUTE = 120;
export const CHARS_PER_WORD = 6;

export const LIMITS = Object.freeze({
  maxCellsPerPacket: 200,
  maxCellCount: 10000,
  maxPacketBytes: 16 * 1024,
  maxLocalDays: 14,
});

const PACKET_KEYS = ['schema_version', 'day', 'platform', 'app_version', 'region', 'cells'];
const CELL_KEYS = Object.freeze({
  screen_view: ['e', 'section', 'content_id', 'n'],
  text_read: ['e', 'section', 'content_id', 'metric', 'bucket', 'n'],
  feature_use: ['e', 'feature_id', 'section', 'n'],
  measurement_error: ['e', 'error_id', 'n'],
});

export function bucketVisibleSeconds(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const s = Math.min(seconds, MAX_VISIT_SECONDS);
  const index = TIME_BOUNDS.findIndex((bound) => s < bound);
  return TIME_BUCKETS[index === -1 ? TIME_BUCKETS.length - 1 : index];
}

/**
 * @param {number} fraction furthest bottom edge of the viewport as a share of the
 *   scrollable height (0..1)
 * @param {{fits?: boolean}} [options] fits: text needs no scrolling
 */
export function bucketScrollDepth(fraction, { fits = false } = {}) {
  if (fits) return 'fit';
  if (!Number.isFinite(fraction) || fraction < 0) return null;
  if (fraction >= 0.98) return 'p100';
  if (fraction >= 0.75) return 'p75_99';
  if (fraction >= 0.5) return 'p50_75';
  if (fraction >= 0.25) return 'p25_50';
  return 'p0_25';
}

/**
 * Rough upper-bound estimate of reading time: never more than the foreground
 * time, and never more than the time needed for the text the viewport reached.
 * Not proof of reading.
 */
export function estimateReadingSeconds({ visibleSeconds, totalChars, maxScrollFraction = 1 }) {
  if (![visibleSeconds, totalChars, maxScrollFraction].every(Number.isFinite)) return null;
  if (visibleSeconds < 0 || totalChars < 0) return null;
  const visible = Math.min(visibleSeconds, MAX_VISIT_SECONDS);
  const reachedChars = totalChars * Math.min(1, Math.max(0, maxScrollFraction));
  const needed = (reachedChars / CHARS_PER_WORD) / READING_WORDS_PER_MINUTE * 60;
  return Math.min(visible, needed);
}

function hasOnlyKeys(object, allowed) {
  return Object.keys(object).every((key) => allowed.includes(key));
}

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Validates one content_id. When `publicIds` (a Set of allowed ids) is given the
 * id must also be a member: this is how closed material is kept out.
 */
export function validateContentId(section, contentId, { publicIds } = {}) {
  const kind = SECTION_CONTENT_KIND[section];
  if (!kind) return contentId === undefined ? [] : [`content_id is not allowed in section "${section}"`];
  if (typeof contentId !== 'string') return [`content_id is required in section "${section}"`];
  if (!CONTENT_ID_PATTERNS[kind].test(contentId)) return [`content_id "${contentId}" does not match kind "${kind}"`];
  if (publicIds && !publicIds.has(contentId)) return [`content_id "${contentId}" is not in the public inventory`];
  return [];
}

/** @returns {string[]} list of problems; empty means valid */
export function validateCell(cell, options = {}) {
  if (!isPlainObject(cell)) return ['cell must be an object'];
  const keys = CELL_KEYS[cell.e];
  if (!keys) return [`unknown event "${cell.e}"`];
  const errors = [];
  if (!hasOnlyKeys(cell, keys)) errors.push(`event "${cell.e}" has non-whitelisted fields: ${Object.keys(cell).filter((k) => !keys.includes(k)).join(', ')}`);
  if (!Number.isInteger(cell.n) || cell.n < 1 || cell.n > LIMITS.maxCellCount) errors.push('n must be an integer 1..10000');
  if (cell.e === 'measurement_error') {
    if (!ERROR_IDS.includes(cell.error_id)) errors.push(`unknown error_id "${cell.error_id}"`);
    return errors;
  }
  if (!SECTIONS.includes(cell.section)) { errors.push(`unknown section "${cell.section}"`); return errors; }
  if (cell.e === 'feature_use') {
    if (!FEATURE_IDS.includes(cell.feature_id)) errors.push(`unknown feature_id "${cell.feature_id}"`);
    return errors;
  }
  errors.push(...validateContentId(cell.section, cell.content_id, options));
  if (cell.e === 'text_read') {
    if (!SECTION_CONTENT_KIND[cell.section]) errors.push('text_read requires a section with content_id');
    if (!TEXT_METRICS.includes(cell.metric)) errors.push(`unknown metric "${cell.metric}"`);
    else if (!(cell.metric === 'sd' ? SCROLL_BUCKETS : TIME_BUCKETS).includes(cell.bucket)) errors.push(`bucket "${cell.bucket}" is invalid for metric "${cell.metric}"`);
  }
  return errors;
}

/** @returns {string[]} list of problems; empty means valid */
export function validatePacket(packet, options = {}) {
  if (!isPlainObject(packet)) return ['packet must be an object'];
  const errors = [];
  if (!hasOnlyKeys(packet, PACKET_KEYS)) errors.push(`packet has non-whitelisted fields: ${Object.keys(packet).filter((k) => !PACKET_KEYS.includes(k)).join(', ')}`);
  if (packet.schema_version !== SCHEMA_VERSION) errors.push('unsupported schema_version');
  if (typeof packet.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(packet.day) || Number.isNaN(Date.parse(`${packet.day}T00:00:00Z`))
    || new Date(`${packet.day}T00:00:00Z`).toISOString().slice(0, 10) !== packet.day) errors.push('day must be a real UTC date YYYY-MM-DD');
  if (!PLATFORMS.includes(packet.platform)) errors.push(`unknown platform "${packet.platform}"`);
  if (typeof packet.app_version !== 'string' || !/^\d{1,2}\.\d{1,2}$/.test(packet.app_version)) errors.push('app_version must be coarse "major.minor"');
  if (!REGIONS.includes(packet.region)) errors.push(`unknown region "${packet.region}"`);
  if (!Array.isArray(packet.cells)) errors.push('cells must be an array');
  else {
    if (packet.cells.length === 0 || packet.cells.length > LIMITS.maxCellsPerPacket) errors.push(`cells must hold 1..${LIMITS.maxCellsPerPacket} items`);
    const seen = new Set();
    packet.cells.forEach((cell, index) => {
      validateCell(cell, options).forEach((problem) => errors.push(`cells[${index}]: ${problem}`));
      const key = JSON.stringify({ ...cell, n: 0 });
      if (seen.has(key)) errors.push(`cells[${index}]: duplicate cell (counts must be merged)`);
      seen.add(key);
    });
  }
  if (errors.length === 0 && JSON.stringify(packet).length > LIMITS.maxPacketBytes) errors.push('packet exceeds maxPacketBytes');
  return errors;
}

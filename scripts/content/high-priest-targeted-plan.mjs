/**
 * Plan one strictly-scoped Firebase content publication.
 * No Firebase calls. Published hashes (not live collection scans) are the source
 * for the next collection digest. No unrelated content can enter the release.
 */
export const HIGH_PRIEST_ID = 'feast-christthehighpriest';
export const HIGH_PRIEST_BEFORE = 'c62263e79af628b2';
export const HIGH_PRIEST_AFTER = '82cc1163da5f1e12';
export const HIGH_PRIEST_FIELDS = Object.freeze(
  [1, 2, 3].flatMap(hour =>
    ['Hymn', 'Ps1', 'Ps2', 'Ps3'].map(suffix => 'sext' + hour + suffix),
  ),
);

function check(ok, why) {
  if (!ok) throw new Error('REFUSED high-priest publication: ' + why);
}

function keysEqual(left, right) {
  return left.length === right.length && left.every(key => right.includes(key));
}

/**
 * @param {object} params
 * @param {object} params.day  Stored production document including "id"
 * @param {object} params.days  Published contentManifest/days
 * @param {object} params.current Published contentManifest/current
 * @param {object} params.ops The same documentHash / collectionDigest as the app
 * @param {number} params.now Unix milliseconds
 */
export function planHighPriestTargetedRelease({ day, days, current, ops, now }) {
  check(day && days && current, 'one of three required documents is absent');
  check(day.id === HIGH_PRIEST_ID, 'unexpected target document');
  check(String(day._feast || '').replace(/^feast-/, '') === 'christthehighpriest',
    'feast selector does not match');
  check(days.collection === 'days', 'wrong collection in published days manifest');
  check(current.schemaVersion === ops.schemaVersion, 'content schema mismatch');
  const previous = current.collections?.days;
  check(previous && typeof previous === 'object', 'current has no days entry');
  check(days.hashes && days.sizes && typeof days.hashes === 'object'
    && typeof days.sizes === 'object', 'published hashes or sizes missing');
  const ids = Object.keys(days.hashes);
  const sizeIds = Object.keys(days.sizes);
  check(keysEqual(ids, sizeIds), 'published hashes and sizes cover different IDs');
  check(ids.includes(HIGH_PRIEST_ID), 'feast is absent from published days');
  check(previous.count === ids.length, 'published days count mismatch');
  const sum = sizeIds.reduce((n, id) => {
    const size = days.sizes[id];
    check(Number.isInteger(size) && size >= 0, 'invalid stored size of ' + id);
    return n + size;
  }, 0);
  check(previous.bytes === sum, 'published days byte count mismatch');
  check(Number.isInteger(previous.version) && previous.version >= 1,
    'invalid current days version');
  check(previous.version === days.version, 'published days version mismatch');
  const digest = ops.collectionDigest(days.hashes);
  check(digest === days.digest && digest === previous.digest,
    'published days digest inconsistent with current');

  const before = ops.documentHash(day);
  const published = days.hashes[HIGH_PRIEST_ID];
  if (before === HIGH_PRIEST_AFTER && published === HIGH_PRIEST_AFTER) {
    return { kind: 'already-published', before, published, changed: [] };
  }
  check(before === HIGH_PRIEST_BEFORE, 'live day hash changed: ' + before);
  check(published === HIGH_PRIEST_BEFORE,
    'target published hash differs from approved baseline: ' + published);
  check(HIGH_PRIEST_FIELDS.every(field => day[field] == null),
    'one of the 12 daytime references is not empty; needs manual review');
  const set = Object.fromEntries(HIGH_PRIEST_FIELDS.map(field => [field, 'from-day']));
  const afterDay = { ...day, ...set };
  const after = ops.documentHash(afterDay);
  check(after === HIGH_PRIEST_AFTER, 'target hash after patch is unexpected: ' + after);
  check(ops.validateDay(afterDay), 'post-update day validation failed');
  const hashes = { ...days.hashes, [HIGH_PRIEST_ID]: after };
  const sizes = { ...days.sizes, [HIGH_PRIEST_ID]: Buffer.byteLength(JSON.stringify(afterDay)) };
  check(keysEqual(Object.keys(hashes), ids), 'unexpected published document changes');
  const nextDigest = ops.collectionDigest(hashes);
  check(nextDigest !== digest, 'patch unexpectedly has the same digest');
  const nextBytes = sum - days.sizes[HIGH_PRIEST_ID] + sizes[HIGH_PRIEST_ID];
  const version = previous.version + 1;
  check(Number.isSafeInteger(now) && now > 0, 'invalid publication time');
  const contentVersion = Math.max(now, Number(current.contentVersion || 0) + 1);
  const nextCurrent = {
    ...current,
    collections: {
      ...current.collections,
      days: { ...previous, digest: nextDigest, count: ids.length, bytes: nextBytes, version },
    },
    contentVersion,
    publishedAt: new Date(contentVersion).toISOString(),
  };
  const nextDays = { ...days, hashes, sizes, digest: nextDigest, version };
  check(Object.keys(nextCurrent.collections).length === Object.keys(current.collections).length,
    'new collection introduced accidentally');
  for (const [name, value] of Object.entries(current.collections)) {
    if (name !== 'days') check(JSON.stringify(nextCurrent.collections[name]) === JSON.stringify(value),
      'unrelated collection metadata modified');
  }
  return {
    kind: 'safe-targeted-patch', before, published, after,
    set, changed: [HIGH_PRIEST_ID], nextDays, nextCurrent,
    originalDigest: digest, nextDigest, nextBytes, count: ids.length,
    storedBytes: sizes[HIGH_PRIEST_ID],
    version, contentVersion,
  };
}

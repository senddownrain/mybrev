import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPrayerSharePath,
  buildPrayerShareUrl,
  sharePrayerLink,
} from '../src/utils/prayerShare.js';

test('builds the compact public route and safely encodes its id', () => {
  assert.equal(buildPrayerSharePath('abc 123'), '/p/abc%20123');
});

test('builds a direct absolute URL for the selected prayer route', () => {
  assert.equal(
    buildPrayerShareUrl('/p/abc123', 'https://malitounik.example/prayers?tag=ранiца'),
    'https://malitounik.example/p/abc123',
  );
});

test('uses the native share sheet when available', async () => {
  const calls = [];
  const result = await sharePrayerLink({
    title: 'Ранішняя малітва',
    url: 'https://malitounik.example/prayer/abc123',
    navigatorRef: {
      share: async (data) => calls.push(data),
      canShare: () => true,
    },
  });

  assert.equal(result, 'shared');
  assert.deepEqual(calls, [{
    title: 'Ранішняя малітва',
    url: 'https://malitounik.example/prayer/abc123',
  }]);
});

test('copies the direct URL when native sharing is unavailable', async () => {
  const copied = [];
  const result = await sharePrayerLink({
    title: 'Ранішняя малітва',
    url: 'https://malitounik.example/prayer/abc123',
    navigatorRef: { clipboard: { writeText: async (value) => copied.push(value) } },
  });

  assert.equal(result, 'copied');
  assert.deepEqual(copied, ['https://malitounik.example/prayer/abc123']);
});

test('does not copy when the native share sheet is cancelled', async () => {
  const copied = [];
  const abortError = new Error('Cancelled');
  abortError.name = 'AbortError';
  const result = await sharePrayerLink({
    title: 'Ранішняя малітва',
    url: 'https://malitounik.example/prayer/abc123',
    navigatorRef: {
      share: async () => { throw abortError; },
      clipboard: { writeText: async (value) => copied.push(value) },
    },
  });

  assert.equal(result, 'cancelled');
  assert.deepEqual(copied, []);
});

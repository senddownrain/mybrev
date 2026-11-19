import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import moment from 'moment';

const source = (await readFile(new URL('../src/utils/cacheWarmup.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
const buildDateWarmupOrder = new Function('moment', `${source}\nreturn buildDateWarmupOrder;`)(moment);

test('opt-in development warmup visits the requested dates in proximity order', () => {
  const dates = buildDateWarmupOrder(new Date(2026, 9, 14));
  assert.deepEqual(dates.map((date) => date.format('YYYY-MM-DD')), [
    '2026-10-14', '2026-10-15', '2026-10-13', '2026-10-16', '2026-10-17',
    '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21',
  ]);
});

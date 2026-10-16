import assert from 'node:assert/strict';
import test from 'node:test';
import { BACKGROUND_CLOSE_MS, MAX_LOCAL_CELLS, coarseAppVersion, createCollector } from '../src/utils/analytics/collector.js';
import { validatePacket } from '../src/utils/analytics/contract.js';

const PRAYER = 'prayer:AbCdEfGhIjKlMnOpQrSt';
const CLOSED = 'prayer:ZZZZZZZZZZZZZZZZZZZZ';
const publicIds = new Set([PRAYER, 'hour:laudes', 'reading:day']);

function setup(options = {}) {
  let t = Date.parse('2026-10-15T10:00:00Z');
  const collector = createCollector({
    platform: 'web', appVersion: '4.5.2', enabled: true, publicIds, now: () => t, ...options,
  });
  return { collector, tick: (seconds) => { t += seconds * 1000; }, time: () => t };
}

const cellsOf = (collector) => collector.snapshot().flatMap((packet) => packet.cells);
const find = (cells, predicate) => cells.find(predicate);

test('disabled by default: nothing is collected', () => {
  const collector = createCollector({ platform: 'web', appVersion: '4.5', publicIds });
  collector.enterView({ section: 'prayers', contentId: PRAYER });
  collector.featureUse('back_to_top', 'prayers');
  collector.flush();
  assert.deepEqual(collector.snapshot(), []);
  assert.equal(collector.enabled, false);
});

test('a read visit yields screen_view plus fv, sd and er cells in a valid packet', () => {
  const { collector, tick } = setup();
  collector.enterView({ section: 'prayers', contentId: PRAYER, totalChars: 1200 });
  tick(30);
  collector.reportScroll(0.6);
  collector.reportScroll(0.4);
  collector.leaveView();
  collector.flush();
  const packets = collector.snapshot();
  assert.equal(packets.length, 1);
  assert.deepEqual(validatePacket(packets[0], { publicIds }), []);
  assert.equal(packets[0].app_version, '4.5');
  assert.equal(packets[0].region, 'UNKNOWN');
  const cells = packets[0].cells;
  assert.ok(find(cells, (c) => c.e === 'screen_view' && c.content_id === PRAYER));
  assert.equal(find(cells, (c) => c.metric === 'fv').bucket, '15_60s');
  assert.equal(find(cells, (c) => c.metric === 'sd').bucket, 'p50_75');
  // 1200*0.6=720 chars -> 120 words -> 60 s needed, capped by 30 s visible -> 15_60s
  assert.equal(find(cells, (c) => c.metric === 'er').bucket, '15_60s');
});

test('short opens (1-5 s) give fv=lt5s only; under 1 s is discarded', () => {
  const { collector, tick } = setup();
  collector.enterView({ section: 'prayers', contentId: PRAYER, totalChars: 500 });
  tick(3);
  collector.leaveView();
  collector.enterView({ section: 'prayers', contentId: 'hour:laudes' });
  collector.leaveView();
  tick(0.5);
  collector.flush();
  const cells = cellsOf(collector);
  assert.equal(cells.filter((c) => c.e === 'screen_view').length, 1);
  assert.deepEqual(cells.filter((c) => c.e === 'text_read').map((c) => `${c.metric}:${c.bucket}`), ['fv:lt5s']);
});

test('closed or unknown material is never measured (fail closed)', () => {
  const { collector, tick } = setup();
  collector.enterView({ section: 'prayers', contentId: CLOSED });
  tick(20);
  collector.flush();
  assert.deepEqual(collector.snapshot(), []);
  const noInventory = createCollector({ platform: 'web', appVersion: '4.5', enabled: true });
  noInventory.enterView({ section: 'prayers', contentId: PRAYER });
  noInventory.flush();
  assert.deepEqual(noInventory.snapshot(), []);
});

test('background time is not visible time; 5+ minutes in background starts a new visit', () => {
  const { collector, tick } = setup();
  collector.enterView({ section: 'prayers', contentId: PRAYER, totalChars: 600 });
  tick(10);
  collector.setVisible(false);
  tick(60);
  collector.setVisible(true);
  tick(10);
  collector.leaveView();
  collector.flush();
  let cells = cellsOf(collector);
  assert.equal(find(cells, (c) => c.e === 'screen_view').n, 1);
  assert.equal(find(cells, (c) => c.metric === 'fv').bucket, '15_60s'); // 20 s, not 80 s

  const second = setup();
  second.collector.enterView({ section: 'prayers', contentId: PRAYER });
  second.tick(10);
  second.collector.setVisible(false);
  second.tick(BACKGROUND_CLOSE_MS / 1000);
  second.collector.setVisible(true);
  second.tick(10);
  second.collector.flush();
  cells = cellsOf(second.collector);
  assert.equal(find(cells, (c) => c.e === 'screen_view').n, 2);
});

test('same-material double trigger within 2 s and same-material re-entry are one visit', () => {
  const { collector, tick } = setup();
  collector.enterView({ section: 'prayers', contentId: PRAYER });
  tick(10);
  collector.enterView({ section: 'prayers', contentId: PRAYER }); // hash/lang change
  collector.leaveView();
  tick(1);
  collector.enterView({ section: 'prayers', contentId: PRAYER }); // double trigger
  tick(10);
  collector.flush();
  const cells = cellsOf(collector);
  assert.equal(find(cells, (c) => c.e === 'screen_view').n, 1);
  assert.equal(find(cells, (c) => c.metric === 'fv').bucket, '15_60s'); // 10 + 10 (1 s gap excluded)
});

test('back navigation to the same material after more than 2 s is a new visit', () => {
  const { collector, tick } = setup();
  collector.enterView({ section: 'prayers', contentId: PRAYER });
  tick(6);
  collector.leaveView();
  tick(3);
  collector.enterView({ section: 'prayers', contentId: PRAYER });
  tick(6);
  collector.flush();
  assert.equal(find(cellsOf(collector), (c) => c.e === 'screen_view').n, 2);
});

test('sections without content ids count views only; text that fits reports fit', () => {
  const { collector, tick } = setup();
  collector.enterView({ section: 'settings' });
  tick(4);
  collector.leaveView();
  collector.enterView({ section: 'prayers', contentId: PRAYER, totalChars: 300, fits: true });
  tick(8);
  collector.flush();
  const cells = cellsOf(collector);
  assert.ok(find(cells, (c) => c.e === 'screen_view' && c.section === 'settings' && !('content_id' in c)));
  assert.equal(find(cells, (c) => c.metric === 'sd').bucket, 'fit');
  assert.equal(cells.filter((c) => c.section === 'settings' && c.e === 'text_read').length, 0);
});

test('unmeasurable scroll is counted as an error, not guessed', () => {
  const { collector, tick } = setup();
  collector.enterView({ section: 'prayers', contentId: PRAYER, totalChars: 900 });
  tick(20);
  collector.flush();
  const cells = cellsOf(collector);
  assert.ok(find(cells, (c) => c.error_id === 'scroll_unmeasurable'));
  assert.equal(find(cells, (c) => c.metric === 'sd'), undefined);
});

test('clock going backwards is a measurement error, not negative time', () => {
  let t = Date.parse('2026-10-15T10:00:00Z');
  const c = createCollector({ platform: 'web', appVersion: '4.5', enabled: true, publicIds, now: () => t });
  c.enterView({ section: 'prayers', contentId: PRAYER });
  t += 10000;
  c.setVisible(false);
  t -= 5000;
  c.setVisible(true);
  t += 6000;
  c.flush();
  assert.ok(find(cellsOf(c), (x) => x.error_id === 'clock_anomaly'));
});

test('feature_use validates ids; unknown features and sections are dropped', () => {
  const { collector } = setup();
  collector.featureUse('theme_change', 'settings');
  collector.featureUse('theme_change', 'settings');
  collector.featureUse('not_a_feature', 'settings');
  collector.featureUse('theme_change', 'admin');
  const cells = cellsOf(collector);
  assert.equal(cells.length, 1);
  assert.equal(cells[0].n, 2);
});

test('local queue is bounded and overflow is counted', () => {
  let t = Date.parse('2020-01-01T00:00:00Z');
  const c = createCollector({ platform: 'web', appVersion: '4.5', enabled: true, publicIds, now: () => t });
  for (let d = 0; d < 400; d += 1) {
    for (const f of ['theme_change', 'back_to_top', 'share_use', 'copy_use', 'date_pick', 'search_open']) c.featureUse(f, 'settings');
    t += 86400000;
  }
  const cells = c.snapshot().flatMap((p) => p.cells);
  assert.ok(cells.filter((x) => x.e === 'feature_use').length <= MAX_LOCAL_CELLS);
  assert.ok(cells.some((x) => x.error_id === 'queue_overflow'));
});

test('pruneOlderThan drops stale days; disabling clears everything', () => {
  let t = Date.parse('2026-09-01T00:00:00Z');
  const c = createCollector({ platform: 'ios', appVersion: '4.5', enabled: true, now: () => t });
  c.featureUse('theme_change', 'settings');
  t = Date.parse('2026-10-15T00:00:00Z');
  c.featureUse('theme_change', 'settings');
  c.pruneOlderThan(14);
  assert.deepEqual(c.snapshot().map((p) => p.day), ['2026-10-15']);
  c.setEnabled(false);
  assert.deepEqual(c.snapshot(), []);
});

test('app version is coarsened to major.minor', () => {
  assert.equal(coarseAppVersion('4.5.2+11'), '4.5');
  assert.equal(coarseAppVersion('garbage'), '0.0');
});

test('discardView drops the active visit without recording it', () => {
  const { collector, tick } = setup();
  collector.enterView({ section: 'prayers', contentId: PRAYER });
  tick(20);
  collector.discardView();
  collector.flush();
  assert.deepEqual(collector.snapshot(), []);
});

test('daily readings are measured as one generic material with fv, sd and er; no date anywhere', () => {
  const { collector, tick } = setup();
  collector.enterView({ section: 'readings', contentId: 'reading:day', totalChars: 2400 });
  tick(40);
  collector.reportScroll(0.9);
  collector.flush();
  const cells = collector.snapshot().flatMap((p) => p.cells);
  assert.ok(find(cells, (c) => c.e === 'screen_view' && c.section === 'readings' && c.content_id === 'reading:day'));
  assert.equal(find(cells, (c) => c.metric === 'sd').bucket, 'p75_99');
  assert.ok(find(cells, (c) => c.metric === 'er'));
  assert.ok(!JSON.stringify(cells).match(/20\d\d-\d\d/));
});

test('catalog screens count catalog_open once per visit and never a material', () => {
  const { collector, tick } = setup();
  collector.enterView({ catalogId: 'prayers_home' });
  tick(3);
  collector.enterView({ catalogId: 'prayers_home' }); // same screen again: one visit
  tick(2);
  collector.leaveView();
  collector.enterView({ section: 'prayers', contentId: PRAYER, totalChars: 500 });
  tick(6);
  collector.flush();
  const cells = collector.snapshot().flatMap((p) => p.cells);
  assert.equal(find(cells, (c) => c.e === 'catalog_open' && c.catalog_id === 'prayers_home').n, 1);
  assert.equal(cells.filter((c) => c.e === 'screen_view').length, 1);
  collector.enterView({ catalogId: 'not_a_catalog' });
  tick(3);
  collector.flush();
  assert.ok(!collector.snapshot().flatMap((p) => p.cells).some((c) => c.catalog_id === 'not_a_catalog'));
});

test('catalog visit under one second is discarded; background time does not count', () => {
  const { collector, tick } = setup();
  collector.enterView({ catalogId: 'songs' });
  tick(0.4);
  collector.leaveView();
  collector.flush();
  assert.deepEqual(collector.snapshot(), []);
});

test('importPackets restores persisted counters; invalid, foreign and closed-id packets are ignored', () => {
  const { collector, tick } = setup();
  collector.featureUse('theme_change', 'settings');
  collector.enterView({ section: 'prayers', contentId: PRAYER, totalChars: 500 });
  tick(6);
  collector.flush();
  const saved = collector.snapshot();
  const fresh = setup().collector;
  fresh.importPackets([...saved, { junk: true }, { ...saved[0], platform: 'ios' }, { ...saved[0], cells: [{ e: 'screen_view', section: 'prayers', content_id: CLOSED, n: 1 }] }]);
  const cells = fresh.snapshot().flatMap((p) => p.cells);
  assert.equal(cells.filter((c) => c.e === 'feature_use').length, 1);
  assert.ok(!cells.some((c) => c.content_id === CLOSED));
  fresh.importPackets(saved);
  assert.equal(find(fresh.snapshot().flatMap((p) => p.cells), (c) => c.e === 'feature_use').n, 2);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { FEATURE_IDS, validateContentId, validatePacket } from '../src/utils/analytics/contract.js';
import { mapRoute } from '../src/utils/analytics/routeMapper.js';
import {
  GOLDEN_PATH, MASS_ORDER_ID, buildGolden, inventory, replayWeb, sha256, webFeatureHooks,
} from '../scripts/analytics/lib/parity-core.mjs';

const committed = readFileSync(GOLDEN_PATH, 'utf8');
const golden = JSON.parse(committed);
const publicIds = new Set(inventory().ids);

// Features without a WEB hook (verified by webFeatureHooks(): no trackFeature call exists).
const WEB_NOT_COVERED = {
  search_submit: 'search text is never counted; a submit hook is not wanted',
  offline_update_apply: 'Flutter content update only; WEB has no apply-update UI',
  install_prompt_open: 'WEB has no custom install prompt UI (no beforeinstallprompt handler)',
};

test('committed parity golden equals what the WEB sources produce (drift guard)', () => {
  assert.equal(committed, `${JSON.stringify(buildGolden(), null, 2)}\n`,
    'run `node scripts/analytics/parity.mjs --write` and copy the golden to the Flutter repo in the same decision');
});

test('golden pins the shared fixture and the public inventory', () => {
  assert.equal(golden.sources.inventory_sha256, inventory().sha256);
  assert.equal(golden.sources.inventory_count, inventory().ids.length);
  assert.equal(golden.sources.contract_fixture_sha256, sha256(readFileSync(new URL('./fixtures/analytics-contract-v2.json', import.meta.url))));
  assert.equal(golden.contract.schema_version, 2);
  assert.equal(golden.contract.feature_ids.length, 27);
});

test('every route case is mapped exactly as the golden promises', () => {
  for (const route of golden.routes) {
    if (route.web === null) continue;
    assert.deepEqual(mapRoute(route.web, { massOrderPrayerId: MASS_ORDER_ID }) ?? null, route.expect, route.id);
    assert.deepEqual(route.web_actual, route.expect, route.id);
  }
  // closed and personal screens are never measurable
  for (const id of ['login', 'admin', 'prayer-add-personal', 'unknown']) {
    assert.equal(golden.routes.find((r) => r.id === id).expect, null, id);
  }
});

test('content id probes agree with the validator', () => {
  for (const probe of golden.contentIdProbes) {
    const ok = validateContentId(probe.section, probe.content_id, { publicIds }).length === 0;
    assert.equal(ok, probe.valid, `${probe.section} ${probe.content_id}`);
    assert.equal(probe.web_ok, probe.valid);
  }
});

test('synthetic visits replay to the golden cells; packets are valid and text-free', () => {
  for (const visit of golden.visits) {
    const cells = replayWeb(visit.steps, { publicIds });
    assert.deepEqual(cells, visit.cells, visit.id);
    for (const platform of ['android', 'ios']) {
      assert.deepEqual(replayWeb(visit.steps, { publicIds, platform }), visit.cells, `${visit.id} on ${platform}`);
    }
    if (cells.length) {
      const packet = { schema_version: 2, day: '2026-10-15', platform: 'web', app_version: '4.5', region: 'UNKNOWN', cells };
      assert.deepEqual(validatePacket(packet, { publicIds }), [], visit.id);
    }
    assert.ok(!/[Ѐ-ӿ]/.test(JSON.stringify(cells)), 'no Cyrillic text in cells');
  }
});

test('feature_use coverage: 24/27 hooked, the rest declared with a reason', () => {
  const hooks = webFeatureHooks();
  for (const id of Object.keys(hooks)) assert.ok(FEATURE_IDS.includes(id), `hook for unknown feature ${id}`);
  const missing = FEATURE_IDS.filter((id) => !hooks[id]);
  assert.deepEqual([...missing].sort(), Object.keys(WEB_NOT_COVERED).sort(), 'a feature lost its hook, or a new gap appeared');
  assert.equal(FEATURE_IDS.length - missing.length, 24);
});

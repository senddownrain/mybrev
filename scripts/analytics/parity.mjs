#!/usr/bin/env node
/**
 * WEB <-> Flutter analytics v2 parity guard (offline, no Firestore, no network).
 *
 *   node scripts/analytics/parity.mjs                    # check the committed golden against WEB sources
 *   node scripts/analytics/parity.mjs --write            # regenerate tests/fixtures/analytics-parity-v2.json
 *   node scripts/analytics/parity.mjs --flutter <dir>    # also compare the Flutter checkout's copies and Dart constants
 *   node scripts/analytics/parity.mjs --out parity.json  # write the deterministic report
 *
 * The WEB contract stays the source of truth; any intended change is made here, the golden is
 * regenerated and copied to Flutter in the same decision.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { GOLDEN_PATH, buildGolden, inventory, root, sha256, webFeatureHooks } from './lib/parity-core.mjs';
import { FEATURE_IDS } from '../../src/utils/analytics/contract.js';

const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
const stable = (value) => `${JSON.stringify(value, null, 2)}\n`;

const problems = [];
const golden = buildGolden();
const expected = stable(golden);

if (args.includes('--write')) {
  writeFileSync(GOLDEN_PATH, expected);
  console.log(`wrote ${path.relative(root, GOLDEN_PATH)} sha256=${sha256(expected)}`);
}

const committed = existsSync(GOLDEN_PATH) ? readFileSync(GOLDEN_PATH, 'utf8') : null;
if (committed !== expected) problems.push('tests/fixtures/analytics-parity-v2.json is stale: run `node scripts/analytics/parity.mjs --write` and copy it to the Flutter repo');

const dartList = (source, name) => {
  const m = source.match(new RegExp(`const List<String> ${name} = \\[([\\s\\S]*?)\\];`));
  return m ? [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]) : null;
};

const flutter = option('--flutter');
const flutterReport = { checked: false };
if (flutter) {
  flutterReport.checked = true;
  const goldenCopy = path.join(flutter, 'test/fixtures/analytics/analytics-parity-v2.json');
  const fixtureCopy = path.join(flutter, 'test/fixtures/analytics/analytics-contract-v2.json');
  const same = (a, b, label) => {
    if (!existsSync(b)) { problems.push(`${label}: missing in Flutter (${b})`); return; }
    if (sha256(readFileSync(a)) !== sha256(readFileSync(b))) problems.push(`${label}: Flutter copy differs from WEB`);
  };
  same(GOLDEN_PATH, goldenCopy, 'analytics-parity-v2.json');
  same(path.join(root, 'tests/fixtures/analytics-contract-v2.json'), fixtureCopy, 'analytics-contract-v2.json');
  const dart = readFileSync(path.join(flutter, 'lib/analytics/contract.dart'), 'utf8');
  const contract = golden.contract;
  for (const [dartName, key] of [['sections', 'sections'], ['featureIds', 'feature_ids'], ['errorIds', 'error_ids'],
    ['catalogIds', 'catalog_ids'], ['hourIds', 'hour_ids'], ['events', 'events'], ['timeBuckets', 'time_buckets'],
    ['scrollBuckets', 'scroll_buckets'], ['platforms', 'platforms'], ['regions', 'regions'], ['textMetrics', 'text_metrics']]) {
    const list = dartList(dart, dartName);
    if (JSON.stringify(list) !== JSON.stringify(contract[key])) problems.push(`contract.dart ${dartName} differs from WEB ${key}`);
  }
  const inv = readFileSync(path.join(flutter, 'lib/analytics/public_inventory.dart'), 'utf8');
  const dartSha = inv.match(/kAnalyticsInventorySha256 =\s*'([0-9a-f]{64})'/)?.[1];
  if (dartSha !== inventory().sha256) problems.push(`Dart inventory sha256 ${dartSha} != WEB ${inventory().sha256}`);
  const dartIds = new Set([...inv.matchAll(/^\s*'([a-z]+:[^']+)',$/gm)].map((m) => m[1]));
  const webIds = inventory().ids;
  if (dartIds.size !== webIds.length || webIds.some((id) => !dartIds.has(id))) problems.push('Dart public id set differs from WEB inventory ids');
  flutterReport.dart_inventory_ids = dartIds.size;
}

const hooks = webFeatureHooks();
const report = {
  schema_version: 2,
  contract_surface_sha256: sha256(JSON.stringify(golden.contract)),
  golden_sha256: sha256(expected),
  sources: golden.sources,
  counts: { routes: golden.routes.length, visits: golden.visits.length, content_id_probes: golden.contentIdProbes.length },
  web_feature_use: {
    total: FEATURE_IDS.length,
    covered: FEATURE_IDS.filter((id) => hooks[id]),
    not_covered: FEATURE_IDS.filter((id) => !hooks[id]),
  },
  flutter: flutterReport,
  problems,
};
const out = option('--out');
if (out) writeFileSync(out, stable(report));
console.log(stable(report));
if (problems.length) { console.error(`PARITY FAIL:\n- ${problems.join('\n- ')}`); process.exit(1); }
console.log('PARITY OK');

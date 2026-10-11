import { spawnSync } from 'node:child_process';
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Firestore emulator is required; no live tests allowed.');
if (!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST)) throw new Error('Only local emulators are permitted.');
for (const args of [['tests/firestore-rules/rules-emulator.mjs'], ['--test', '--test-concurrency=1', 'tests/priest-firestore.test.mjs', 'tests/priest-migration.test.mjs'], ['scripts/smoke-priest-ui.mjs']]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status || 1);
}

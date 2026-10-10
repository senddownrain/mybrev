import { spawnSync } from 'node:child_process';
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Firestore emulator is required; no live tests allowed.');
for (const args of [['tests/firestore-rules/rules-emulator.mjs'], ['--test', 'tests/priest-firestore.test.mjs']]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status || 1);
}

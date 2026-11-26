import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'reports/access-sets-v2-s4/callable-source');
const inputs = [
  'functions-catalog/index.mjs',
  'functions-catalog/authorization.mjs',
  'functions-catalog/bind.mjs',
  'scripts/lib/access-sets-v2-writer.mjs',
  'scripts/lib/access-sets-v2-draft-publication.mjs',
  'scripts/lib/access-sets-v2-storage-plan.mjs',
  'scripts/lib/access-sets-v2-content-values.mjs',
  'src/utils/accessSetsV2Code.mjs',
  'src/utils/accessSetsV2Paths.mjs',
  'src/utils/accessSetsV2Policy.mjs',
  'src/utils/adminAccess.js',
  'src/constants/admin.js',
  'src/utils/prayerCategoryMembership.mjs',
  'src/utils/prayerDraftModel.mjs',
  'src/utils/prayerSource.mjs',
  'src/data/sourceBibliography.json',
  'src/utils/prayerStoragePlan.mjs',
  'src/utils/priestCode.mjs',
  'src/utils/priestPolicy.mjs',
];
// The Functions Emulator creates .env.local for parameter defaults. Both
// packaging configurations exclude it from the deploy source.
const allowed = new Set([...inputs, 'package.json', 'package-lock.json', '.gcloudignore', '.env.local']);
await mkdir(output, { recursive: true });
async function checkStaged(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!prefix && entry.name === 'node_modules' && entry.isDirectory()) continue;
    const relative = prefix + entry.name;
    if (entry.isDirectory() && inputs.some((input) => input.startsWith(relative + '/'))) {
      await checkStaged(resolve(directory, entry.name), relative + '/');
    } else if (!entry.isFile() || !allowed.has(relative)) {
      throw new Error(`Unexpected file in staged Function source: ${relative}`);
    }
  }
}
await checkStaged(output);
for (const input of inputs) {
  const target = resolve(output, input);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve(root, input), target);
}
for (const name of ['package.json', 'package-lock.json']) {
  await copyFile(resolve(root, 'functions-catalog', name), resolve(output, name));
}
await writeFile(resolve(output, '.gcloudignore'), ['.gcloudignore', 'node_modules', '.env.local', 'firebase-debug*', ''].join('\n'));
console.log('Staged one catalog Function at reports/access-sets-v2-s4/callable-source');

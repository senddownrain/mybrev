import { mkdir, readFile, writeFile } from 'node:fs/promises';

const rulesUrl = new URL('../firestore.rules', import.meta.url);
const outputDir = new URL('../.firebase/finops/', import.meta.url);
const normal = 'let restrictPublicLists = false;';
const emergency = 'let restrictPublicLists = true;';
const rules = await readFile(rulesUrl, 'utf8');
if (rules.split(normal).length !== 2 || rules.includes(emergency)) {
  throw new Error('Expected exactly one inactive emergency switch in firestore.rules');
}

const { emulators } = JSON.parse(await readFile(new URL('../firebase.json', import.meta.url), 'utf8'));
await mkdir(outputDir, { recursive: true });
await writeFile(new URL('firestore.rules', outputDir), rules.replace(normal, emergency));
await writeFile(new URL('firebase.json', outputDir), JSON.stringify({
  firestore: { rules: 'firestore.rules' },
  emulators,
}, null, 2) + '\n');
console.log('Prepared .firebase/finops/firebase.json and its Firestore rules.');

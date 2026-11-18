// Read-only access to the structured corpora (never committed: they carry the full text of the books).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export const fileSha256 = (file) => sha256(readFileSync(file));
export const stableJson = (value) => JSON.stringify(value, (_key, item) => (item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item));

/** Accepts a directory or a .zip (extracted with the system `unzip` into `workspace`, a fresh ignored folder). */
export function openCorpusRoot(input, workspace, name) {
  if (statSync(input).isDirectory()) return input;
  const target = path.join(workspace, name);
  if (!existsSync(target)) {
    mkdirSync(target, { recursive: true });
    const result = spawnSync('unzip', ['-q', '-o', input, '-d', target], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`unzip failed: ${result.stderr}`);
  }
  return target;
}
const findDir = (root, marker) => {
  if (existsSync(path.join(root, marker))) return root;
  for (const name of readdirSync(root)) {
    const child = path.join(root, name);
    if (statSync(child).isDirectory() && existsSync(path.join(child, marker))) return child;
    if (statSync(child).isDirectory()) { const deeper = findDir(child, marker); if (deeper) return deeper; }
  }
  return null;
};

/** Official corpus: result/index.json + result/entries/<source>/<entry>.json */
export function loadOfficialCorpus(root) {
  const base = findDir(root, 'index.json');
  if (!base) throw new Error('result/index.json not found');
  const index = JSON.parse(readFileSync(path.join(base, 'index.json'), 'utf8')).entries;
  const manifest = JSON.parse(readFileSync(path.join(base, 'manifest.json'), 'utf8'));
  return { index, manifest, sourceHashes: manifest.inputFileHashes, readEntry: (meta) => JSON.parse(readFileSync(path.join(base, meta.entryFile), 'utf8')) };
}

/** Bog Dobry corpus: data/entry_index.json + data/entries/*.json */
export function loadBogCorpus(root) {
  const base = findDir(root, 'data/entry_index.json');
  if (!base) throw new Error('data/entry_index.json not found');
  const index = JSON.parse(readFileSync(path.join(base, 'data/entry_index.json'), 'utf8')).entries;
  return { index, readEntry: (meta) => JSON.parse(readFileSync(path.join(base, meta.file), 'utf8')) };
}

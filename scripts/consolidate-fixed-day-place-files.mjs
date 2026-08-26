#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const inputArgument = process.argv.find((argument) => argument.startsWith('--input-dir='));
const INPUT_DIR = inputArgument
  ? path.resolve(ROOT, inputArgument.slice('--input-dir='.length))
  : path.join(ROOT, 'patchs', 'db-feasts');
const APPLY = process.argv.includes('--apply');

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function normalizePlaces(value) {
  return [...new Set((Array.isArray(value) ? value : [value])
    .map((place) => String(place ?? '').trim())
    .filter(Boolean))].sort();
}

function contentKey(payload) {
  const content = { ...payload };
  delete content._id;
  delete content._place;
  delete content.place;
  return JSON.stringify(stable(content));
}

async function main() {
  const filenames = (await fs.readdir(INPUT_DIR))
    .filter((filename) => filename.endsWith('.json'))
    .sort();
  const documents = await Promise.all(filenames.map(async (filename) => ({
    filename,
    payload: JSON.parse(await fs.readFile(path.join(INPUT_DIR, filename), 'utf8')),
  })));
  const groups = new Map();

  documents.forEach((document) => {
    const places = normalizePlaces(document.payload._place ?? document.payload.place);
    if (!places.length) return;
    const key = contentKey(document.payload);
    const group = groups.get(key) || [];
    group.push({ ...document, places });
    groups.set(key, group);
  });

  const merges = [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) => {
      const [primary, ...duplicates] = group;
      return {
        primary,
        duplicates,
        places: [...new Set(group.flatMap((document) => document.places))].sort(),
      };
    });

  const report = {
    mode: APPLY ? 'apply' : 'dry-run',
    inputDirectory: INPUT_DIR,
    documents: documents.length,
    mergeGroups: merges.length,
    removedDocuments: merges.reduce((total, merge) => total + merge.duplicates.length, 0),
    merges: merges.map((merge) => ({
      primary: merge.primary.filename,
      duplicates: merge.duplicates.map((document) => document.filename),
      places: merge.places,
    })),
  };

  if (APPLY) {
    for (const merge of merges) {
      const payload = { ...merge.primary.payload, _place: merge.places };
      await fs.writeFile(
        path.join(INPUT_DIR, merge.primary.filename),
        `${JSON.stringify(payload, null, 2)}\n`,
        'utf8',
      );
      for (const duplicate of merge.duplicates) {
        await fs.unlink(path.join(INPUT_DIR, duplicate.filename));
      }
    }
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});

#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openFirestoreSnapshot } from './lib/firestore-snapshot.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseScalar(raw) {
  if (raw === 'null') return null;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  // Keep dotted values such as liturgical dates (`26.08`) as strings.
  if (/^-?\d+$/.test(raw)) return Number(raw);
  return raw;
}

function parseWhere(raw) {
  const operators = ['array-contains', '==', 'in'];
  const op = operators.find((candidate) => raw.includes(`:${candidate}:`));
  if (!op) throw new Error(`Invalid --where value: ${raw}`);
  const marker = `:${op}:`;
  const markerIndex = raw.indexOf(marker);
  const field = raw.slice(0, markerIndex);
  const value = raw.slice(markerIndex + marker.length);
  return {
    field,
    op,
    value: op === 'in' ? value.split(',').map(parseScalar) : parseScalar(value),
  };
}

function parseArgs(argv) {
  const options = {
    snapshot: path.join(ROOT, 'backups', 'firestore-snapshot'),
    collection: null,
    id: null,
    filters: [],
    limit: 20,
    list: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--snapshot') options.snapshot = path.resolve(argv[++index]);
    else if (arg === '--collection') options.collection = argv[++index];
    else if (arg === '--id') options.id = argv[++index];
    else if (arg === '--where') options.filters.push(parseWhere(argv[++index]));
    else if (arg === '--limit') options.limit = Number(argv[++index]);
    else if (arg === '--list') options.list = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function printHelp() {
  console.log(`Inspect the local Firestore snapshot without contacting Firebase.

Usage:
  npm run db:snapshot:query -- --list
  npm run db:snapshot:query -- --collection days --id <document-id>
  npm run db:snapshot:query -- --collection readings --where _date:==:26.08
  npm run db:snapshot:query -- --collection readings --where _dayIds:array-contains:<id>

Options:
  --snapshot <dir>       Snapshot directory (default: backups/firestore-snapshot)
  --list                 List collections and document counts
  --collection <path>    Collection path from manifest
  --id <document-id>     Return one document
  --where <f:op:value>   Filter; supported operators: ==, array-contains, in
  --limit <number>       Maximum printed documents (default: 20)
  --help                 Show this message`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return printHelp();

  const snapshot = await openFirestoreSnapshot(options.snapshot);
  if (options.list || !options.collection) {
    const rows = snapshot.collectionPaths.map((collectionPath) => ({
      collection: collectionPath,
      documents: snapshot.manifest.collections[collectionPath].documentCount,
    }));
    console.table(rows);
    console.log(`Total documents: ${snapshot.manifest.totalDocuments}`);
    console.log(`Exported at: ${snapshot.manifest.exportedAt}`);
    return;
  }

  const result = options.id
    ? await snapshot.document(options.collection, options.id)
    : await snapshot.query(options.collection, options.filters);
  if (result === null) {
    process.exitCode = 2;
    console.error(`Not found: ${options.collection}${options.id ? `/${options.id}` : ''}`);
    return;
  }

  const output = Array.isArray(result) ? result.slice(0, options.limit) : result;
  console.log(JSON.stringify(output, null, 2));
  if (Array.isArray(result) && result.length > options.limit) {
    console.error(`Showing ${options.limit} of ${result.length} matching documents.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

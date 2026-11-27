#!/usr/bin/env node
/**
 * Offline `novenaDefinitions` bundle in the app bundle format, from local
 * prayers only:
 *
 *   npm run novena:bundle -- --prayers <source> --out <dir>          empty (production in V1)
 *   npm run novena:bundle -- --prayers <source> --out <dir> --dev    every ready definition,
 *                                                                    marked published, for tests
 *
 * The released app bundle is built by `content:app-release` from published
 * Firestore documents; a --dev bundle must never be shipped.
 */
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { generateDrafts, readPublicPrayers } from './lib.mjs';
import { writeBundle } from '../content/build-app-bundle.mjs';
import { storedDocument } from '../content/lib/app-content.mjs';
import { NOVENA_COLLECTION, pickDefinition, publicNovenaRows } from '../../src/utils/novena/document.mjs';

export function devRows(prayers) {
  const rows = generateDrafts(prayers).drafts.filter((draft) => !draft.blockers.length)
    .map((draft) => storedDocument(draft.novenaId, { ...pickDefinition(draft), status: 'published', trackerEnabled: true }));
  const result = publicNovenaRows(rows, prayers);
  if (result.excluded.length) throw new Error(`Ready definitions failed the export filter: ${result.excluded.map((item) => item.id).join(', ')}`);
  return result.rows;
}

async function main() {
  const argv = process.argv.slice(2);
  const value = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null);
  const source = value('--prayers');
  const out = value('--out');
  if (!source || !out) throw new Error('Usage: build-bundle.mjs --prayers <source> --out <dir> [--dev]');
  const { prayers, version } = await readPublicPrayers(source);
  if (!version) throw new Error('The prayer source carries no content version (use a bundle or snapshot directory).');
  const rows = argv.includes('--dev') ? devRows(prayers) : [];
  // `devRows` already applied the export filter against these prayers.
  writeBundle(new Map([[NOVENA_COLLECTION, rows]]), new Map([[NOVENA_COLLECTION, version]]), version, out, { project: (collections) => collections });
  console.log(`${NOVENA_COLLECTION}: ${rows.length} definitions → ${out}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => { console.error(error.message || error); process.exitCode = 1; });
}

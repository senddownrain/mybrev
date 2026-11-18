#!/usr/bin/env node
// One source registry; the Firestore allowlist is generated, never edited independently.
import fs from 'node:fs';
import bibliography from '../src/data/sourceBibliography.json' with { type: 'json' };
const file = new URL('../firestore.rules', import.meta.url);
const begin = '    // BEGIN GENERATED PRAYER SOURCE NAMES';
const end = '    // END GENERATED PRAYER SOURCE NAMES';
const names = ['', ...new Set(bibliography.entries.map(({canonicalValue, shortTitle}) => canonicalValue || shortTitle))];
const generated = `${begin}\n    function canonicalPrayerSource(value) {\n      return value is string && value in [\n${names.map((name) => '        ' + JSON.stringify(name)).join(',\n')}\n      ];\n    }\n${end}`;
const current = fs.readFileSync(file, 'utf8');
const updated = current.replace(new RegExp(`${begin}[\\s\\S]*?${end}`, 'u'), generated);
if (updated === current && !current.includes(generated)) throw new Error('Missing generated source-rule markers');
if (process.argv.includes('--check')) {
  if (updated !== current) throw new Error('Source rules are stale; run node scripts/generate-prayer-source-rules.mjs');
} else if (updated !== current) fs.writeFileSync(file, updated);

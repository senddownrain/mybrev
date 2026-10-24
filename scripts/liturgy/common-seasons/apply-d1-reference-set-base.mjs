#!/usr/bin/env node
/**
 * D-1 (owner decision 2026-10-24): the reference «Выбіраюцца найбольш адпаведныя тэксты з ліку тых, што былі пададзены
 * (вышэй) ў Агульных тэкстах пра святых мужчын, с. N» of the holy woman is the SET of the legal readings of the Common
 * of holy men of the SAME volume. The stored base (Volume III) printed only the reference and the readings specific to a
 * holy woman, so a user reading `holy-women` in Ordinary Time never reached the readings the reference points to.
 *
 *   holy-women.officeOfReadingsR1   reference · readings of holy-men.officeOfReadingsR1 · «Іншае, пра святую, якая жыла ў
 *                                   сужэнстве:» + Prov 31 · «Або іншае, таксама пра святую:» + 1 Pet 3
 *   holy-women.officeOfReadingsR2   reference · readings of holy-men.officeOfReadingsR2 · «Або іншае …» + Pius XII (already stored)
 *
 * Nothing is written by hand except the two lead-ins that Volume III prints (03_ordinary_utf8.txt lines 5587 and 5604);
 * the inserted readings are the stored `holy-men` texts, unchanged. Idempotent. Seasonal variants are generated
 * separately (`common-seasons.mjs --write`, see `completeReferenceSets`).
 *
 *   node scripts/liturgy/common-seasons/apply-d1-reference-set-base.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DIR = path.join(ROOT, 'patchs', 'feasts', 'common-texts');
const load = (name) => JSON.parse(fs.readFileSync(path.join(DIR, `${name}.json`), 'utf8'));
const save = (name, data) => fs.writeFileSync(path.join(DIR, `${name}.json`), `${JSON.stringify(data, null, 2)}\n`);
const HR = '\n<hr />\n';
const P = '<p style="text-align: justify;">';
const red = (text) => `<span style="color: #ff0000;">${text}</span>`;
const lead = (text) => `${P}${red(text)}</p>\n`;

const men = load('holy-men');
const women = load('holy-women');
let changed = false;

const r1 = women.officeOfReadingsR1.split(/\n?<hr \/>\n?/u);
if (r1.length === 3) {
  if (!/Каласянаў/u.test(r1[0] + r1[1])) {
    women.officeOfReadingsR1 = [r1[0], men.officeOfReadingsR1.trim(),
      `${lead('Іншае, пра святую, якая жыла ў сужэнстве:')}${r1[1]}`,
      `${lead('Або іншае, таксама пра святую:')}${r1[2]}`].join(HR);
    changed = true;
  }
} else if (!/Каласянаў/u.test(women.officeOfReadingsR1)) {
  throw new Error(`holy-women.officeOfReadingsR1 has ${r1.length} sections, expected 3 (reference, Prov 31, 1 Pet 3)`);
}

const r2 = women.officeOfReadingsR2.split(/\n?<hr \/>\n?/u);
if (r2.length === 2) {
  women.officeOfReadingsR2 = [r2[0], men.officeOfReadingsR2.trim(), r2[1]].join(HR);
  changed = true;
} else if (!/Хрызастома/u.test(women.officeOfReadingsR2)) {
  throw new Error(`holy-women.officeOfReadingsR2 has ${r2.length} sections, expected 2 (reference, lead-in + Pius XII)`);
}

if (changed) { save('holy-women', women); console.log('holy-women R1/R2 completed with the readings of holy-men'); } else console.log('nothing to do');

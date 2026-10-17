#!/usr/bin/env node
/**
 * D-6: the stored base (Ordinary Time, Volume III) misses text that Volume III prints.
 *
 *   martyr-one.vesper1R             «Кароткае чытанне Рым 8, 35. 37-39» + the reading + the «Кароткі рэспансорый» heading
 *   holy-women.officeOfReadingsR2   (D-1) the reference «Выбіраюцца найбольш адпаведныя тэксты … святых мужчын» and
 *                                   the lead-in «Або іншае, пра святую, якая жыла ў сужэнстве:» before the Pius XII text
 *   religious.officeOfReadingsR1    the reference line «Пасланне св. апостала Паўла да Філіпянаў 3, 7 – 4, 1. 4-9»
 *                                   and the second responsory «Пра законніцу: Пс 45 (44), 2»
 *
 * Each piece is copied from a text that is already stored and identical to the volume (the same reading in
 * martyrs-many.vesper1R) or typed from the exact Volume III lines (5959–5961, 5979–5981); the tests compare the
 * result with the volume. Idempotent: an already completed field is left alone. Seasonal variants are not touched.
 *
 *   node scripts/liturgy/common-seasons/apply-d6-base-completion.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DIR = path.join(ROOT, 'patchs', 'feasts', 'common-texts');
const load = (name) => JSON.parse(fs.readFileSync(path.join(DIR, `${name}.json`), 'utf8'));
const save = (name, data) => fs.writeFileSync(path.join(DIR, `${name}.json`), `${JSON.stringify(data, null, 2)}\n`);

const P = '<p style="text-align: justify;">';
const red = (text) => `<span style="color: #ff0000;">${text}</span>`;

// martyr-one.vesper1R: the short reading and the responsory heading come before the stored responsory.
const martyrOne = load('martyr-one');
if (!/Кароткае чытанне/u.test(martyrOne.vesper1R)) {
  const many = load('martyrs-many').vesper1R;
  const paragraphs = many.split('\n');
  const reading = paragraphs.slice(0, 2); // «Кароткае чытанне Рым 8, 35. 37-39» + the text (identical in Volume III, lines 2637–2640)
  const heading = paragraphs.find((p) => /Кароткі\s*<\/span><span style="color: #ff0000;">рэспансорый|Кароткі /u.test(p)) || `${P}${red('Кароткі ')}${red('рэспансорый')}</p>`;
  if (!/Рым/u.test(reading[0]) || !/Хто адлучыць нас/u.test(reading[1])) throw new Error('martyrs-many.vesper1R no longer starts with the Rom 8 reading');
  martyrOne.vesper1R = [...reading, heading, martyrOne.vesper1R].join('\n');
  save('martyr-one', martyrOne);
  console.log('martyr-one.vesper1R completed');
}

// religious.officeOfReadingsR1: reference line before, «Пра законніцу» responsory after.
const religious = load('religious');
if (!/Філіпянаў/u.test(religious.officeOfReadingsR1)) {
  const header = `${P}Пасланне св. апостала Паўла да Філіпянаў ${red('3, 7 – 4, 1. 4-9')}</p>`;
  const nun = [
    '<hr />',
    `${P}${red('Пра законніцу: Пс 45 (44), 2')}</p>`,
    `${P}${red('Н.')} Адкінула валадарства гэтага свету і ўсю прыгажосць яго дзеля любові да Пана майго, Езуса Хрыста; ${red('*')} Яго пазнала і выбрала, у Яго паверыла і палюбіла Яго.</p>`,
    `${P}${red('К.')} З майго сэрца выплывае добрае слова; я спяваю песню маю для Караля. ${red('Н.')} Яго пазнала.</p>`,
  ];
  religious.officeOfReadingsR1 = [header, religious.officeOfReadingsR1.trimEnd(), ...nun].join('\n');
  save('religious', religious);
  console.log('religious.officeOfReadingsR1 completed');
}

// holy-women.officeOfReadingsR2 (D-1): Volume III prints the reference to the readings of the Common of holy men
// FIRST and the Pius XII address as «Або іншае»; the stored field starts straight with the address, so the reference
// (the set of legal choices) is lost and the address looks like the only reading. Volume III, lines 5617–5622.
const holyWomen = load('holy-women');
if (!/Выбіраюцца/u.test(holyWomen.officeOfReadingsR2)) {
  const reference = `${P}Выбіраюцца найбольш адпаведныя тэксты з ліку тых, што былі пададзены ў Агульных тэкстах пра святых мужчын, с. 1584-1587.</p>`;
  const lead = `${P}${red('Або іншае, пра святую, якая жыла ў сужэнстве:')}</p>`;
  holyWomen.officeOfReadingsR2 = [reference, '<hr />', lead, holyWomen.officeOfReadingsR2].join('\n');
  save('holy-women', holyWomen);
  console.log('holy-women.officeOfReadingsR2 completed');
}

// holy-men.officeOfReadingsHymn (A3 of the PR #132 verification): Volume III prints for several saints only the reference
// «Пра некалькіх святых – гімн Будзем праслаўляць за веру, с. 1593» (line 4855), and that hymn is stored as the second
// half of holy-men.vesperHymn. The Office of Readings field had only the hymn «Пра аднаго святога», so the second legal
// hymn was unreachable there. The paragraphs of the hymn «Пра некалькіх святых» are copied from vesperHymn (same page).
const holyMen = load('holy-men');
if (!/Пра некалькіх святых/u.test(holyMen.officeOfReadingsHymn)) {
  const blocks = (holyMen.vesperHymn || '').split('\n');
  const start = blocks.findIndex((block) => /Пра некалькіх святых/u.test(block));
  if (start < 0) throw new Error('holy-men.vesperHymn no longer has the hymn «Пра некалькіх святых»');
  holyMen.officeOfReadingsHymn = [holyMen.officeOfReadingsHymn.trimEnd(), '<hr />', ...blocks.slice(start)].join('\n');
  save('holy-men', holyMen);
  console.log('holy-men.officeOfReadingsHymn completed');
}

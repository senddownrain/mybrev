#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const sourcePath = path.join(process.cwd(), 'patchs', 'feasts', 'common-texts', 'office-for-dead.json');
const data = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
if (String(data.officeOfReadingsR1 || '').includes('data-alternative-title=')) {
  console.log(JSON.stringify({ source: sourcePath, status: 'already-formatted' }, null, 2));
  process.exit(0);
}

const red = (text) => `<span style="color: #ff0000;">${text}</span>`;
const p = (html) => `<p style="text-align: justify;">${html}</p>`;
const rubric = (text) => p(red(text));
const responseLine = (text) => p(String(text)
  .replace(/К\.[\s ]*/gu, `${red('К. ' )}`)
  .replace(/Н\.[\s ]*/gu, `${red('Н. ' )}`));

const reading = (reference, text) => [rubric(`Кароткае чытанне ${reference}`), p(text)].join('\n');
const suffix = (lines) => `<div data-alternative-suffix>\n${lines.map(responseLine).join('\n')}\n</div>`;
const option = (title, html) => `<div data-alternative-title="${title}">\n${html}\n</div>`;

data.sext1R = [
  option('Ёў 19, 25–26', reading(
    'Ёў 19, 25–26',
    'Я ведаю: Адкупіцель мой жыве і ў апошні дзень падымецца над пылам. Нават пасля таго, як скура мая ападзе, я ў целе ўбачу Бога.',
  )),
  option('2 Мак 7, 9b', reading(
    '2 Мак 7, 9b',
    'Валадар свету ўваскрасіць да вечнага жыцця нас, якія паміраюць за Яго закон.',
  )),
  suffix([
    'К. Чаму сумуеш, душа мая, чаму хвалюешся ўва мне?',
    'Н. Спадзявайся на Пана, бо яшчэ буду праслаўляць Яго.',
  ]),
].join('\n');

data.sext2R = [
  reading(
    'Мдр 1, 13–14а. 15',
    'Паколькі Бог не стварыў смерці, Ён не цешыцца са згубы жывога. Бо Ён стварыў усё для жыцця. Справядлівасць вечная і несмяротная.',
  ),
  responseLine('К. Пасярод смяротнага ценю не спалохаюся зла.'),
  responseLine('Н. Таму што Ты, Пане, са мною.'),
].join('\n');

data.sext3R = [
  reading(
    'Іс 25, 8',
    'Ён знішчыць смерць назаўсёды. І вытра Пан Бог слёзы з усіх твараў, і здыме ганьбу з народу свайго па ўсёй зямлі, бо так сказаў Пан.',
  ),
  responseLine('К. Выслухай, Божа, маю малітву.'),
  responseLine('Н. Няхай да Цябе прыйдзе ўсякае цела.'),
].join('\n');

const shortResponsory = (lines) => [
  rubric('Кароткі рэспансорый'),
  responseLine(lines.join(' ')),
].join('\n');

data.vesperR = [
  reading(
    '1 Кар 15, 55–57',
    'Cмерць, дзе твая перамога? Смерць, дзе тваё джала? Джала смерці – гэта грэх, а сіла граху – гэта закон. Богу ж падзяка, бо Ён даў нам перамогу праз нашага Пана Езуса Хрыста.',
  ),
  option('На Цябе, Пане, спадзяюся', shortResponsory([
    `К. На Цябе, Пане, спадзяюся, ${red('* ')}не буду асаромлены навекі.`,
    'Н. На Цябе.',
    'К. Узрадуюся і ўсцешуся міласэрнасці Тваёй.',
    'Н. Не буду.',
    'К. Хвала Айцу.',
    'Н. На Цябе.',
  ])),
  option('У міласэрнасці сваёй, Пане', shortResponsory([
    `К. У міласэрнасці сваёй, Пане, ${red('* ')}дай ім адпачынак.`,
    'Н. У міласэрнасці.',
    'К. Які прыйдзеш судзіць жывых і памерлых.',
    'Н. Дай ім.',
    'К. Хвала Айцу.',
    'Н. У міласэрнасці.',
  ])),
].join('\n');

function formatLongVariant(html) {
  return String(html)
    .replace(/<p\b[^>]*>Рэспансорый\s+([\s\S]*?)<\/p>/giu, (_, reference) => rubric(`Рэспансорый ${reference.trim()}`))
    .replace(/<p\b([^>]*)>([\s\S]*?)<\/p>/giu, (whole, attributes, body) => {
      if (!/(?:К\.|Н\.)[\s ]/u.test(body) || /color:\s*#ff0000[^>]*>К\./u.test(body)) return whole;
      return `<p${attributes}>${body
        .replace(/К\.[\s ]*/gu, red('К. '))
        .replace(/Н\.[\s ]*/gu, red('Н. '))}</p>`;
    });
}

function longReadingOptions(html, label, titles) {
  const parts = String(html).split(/\s*<hr\s*\/?>\s*<p\b[^>]*>Або іншае:<\/p>\s*/giu);
  const firstLabel = new RegExp(`<p\\b[^>]*>${label}<\\/p>`, 'iu');
  parts[0] = parts[0].replace(firstLabel, '');
  return [
    rubric(label),
    ...parts.map((part, index) => option(titles[index] || `Варыянт ${index + 1}`, formatLongVariant(part.trim()))),
  ].join('\n');
}

data.officeOfReadingsR1 = longReadingOptions(data.officeOfReadingsR1, 'Першае чытанне', [
  '1 Кар 15, 12–34',
  '1 Кар 15, 35–57',
  '2 Кар 4, 16 — 5, 10',
]);
data.officeOfReadingsR2 = longReadingOptions(data.officeOfReadingsR2, 'Другое чытанне', [
  'Казанне св. Атаназія',
  'Ліст св. Браўліёна',
]);

await fs.writeFile(sourcePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ source: sourcePath, status: 'formatted' }, null, 2));

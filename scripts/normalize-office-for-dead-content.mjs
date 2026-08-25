#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const SOURCE_PATH = path.join(process.cwd(), 'patchs', 'feasts', 'common-texts', 'office-for-dead.json');
const data = JSON.parse(await fs.readFile(SOURCE_PATH, 'utf8'));
if (String(data.laudesPs3 || '').includes('data-alternative-title="Псальм 150"')) {
  console.log(JSON.stringify({ source: SOURCE_PATH, status: 'already-normalized' }, null, 2));
  process.exit(0);
}
const red = (text) => `<span style="color: #ff0000;">${text}</span>`;
const marker = (value) => `<span style="color: #ff0000;">${value}</span>`;
const paragraph = (lines) => `<p>${lines.join('<br />')}</p>`;
const stanzas = (lines) => {
  const result = [];
  for (let index = 0; index < lines.length; index += 4) result.push(paragraph(lines.slice(index, index + 4)));
  return result.join('\n');
};

function hymn(commonLines, endings, suffixLines = []) {
  const common = stanzas(commonLines);
  const suffix = suffixLines.length ? `\n${stanzas(suffixLines)}` : '';
  return `${common}\n${endings.map(({ title, lines }) => (
    `<div data-alternative-title="${title}">\n<p>${red(`${title}:`)}</p>\n${paragraph(lines)}${suffix}\n</div>`
  )).join('\n')}`;
}

data.officeOfReadingsHymn = hymn([
  'Ты жывеш перад вякамі,', 'Ты адзін – жыцця крыніца,', 'Божа, глянь на чалавека,', 'Які прагне жыць навекі.',
  'Ойча, грэх нясе нам згубу', 'І прыводзіць нас да смерці.', 'Пыл Ты ў пыл ператвараеш,', 'Як за грэх ўміласціўленне.',
  'Жыццядайным сваім духам', 'Надзяляеш чалавека,', 'І прадбачліва даеш нам', 'Жыцця вечнага пачатак.',
  'Хрыстус першы ўваскрасае', 'І нясе нам суцяшэнне.', 'Да Цябе Ён забярэ нас,', 'Жыць з Табою будзем, Пане.',
], [
  { title: 'За аднаго памерлага', lines: ['Дай слугу Твайму, о Божа,', 'Які быў з Хрыстом з’яднаны', 'І прыняў Святога Духа,', 'Радасць Твайго Валадарства.'] },
  { title: 'За адну памерлую', lines: ['Дай слузе Тваёй, о Божа,', 'Што была з Хрыстом з’яднана,', 'Прыняла Святога Духа,', 'Радасць Твайго Валадарства.'] },
  { title: 'За некалькіх памерлых', lines: ['Слугам дай Тваім, о Божа,', 'Што былі з Хрыстом з’яднаны,', 'Прынялі што Духа Праўды,', 'Радасць Твайго Валадарства.'] },
], ['Калі мы жыццё закончым,', 'Дай нам, Божа, быць з Табою,', 'Каб Цябе мы праслаўлялі', 'Пане, вечны Валадару. Амэн.']);

data.laudesHymn = hymn([
  'Хрыстэ, надзея збаўлення,', 'Наша жыццё, ўваскрашэнне.', 'Мы да Цябе у час смерці', 'Сэрцы і вочы ўздымаем.',
  'Ты зведаў смерць і пакуты,', 'Крыжа жахлівыя мукі.', 'Перад Айцом у пакоры', 'Ціха аддаў свайго духа.',
  'Ты, Пастыр наш міласэрны,', 'Узяў на сябе нашу немач.', 'І тых, хто церпіць з Табою,', 'На ўлонне Бога прымаеш.',
  'Пане, прыбіты да крыжа,', 'І з сэрцам, дзідай адкрытым,', 'Хворых, гаротных прымаеш,', 'Каб сум глыбокі суцешыць.',
  'Вось брамы пекла зламаны,', 'Ідзе ўжо наш Пераможца,', 'Каб на зямлі нас суцешыць', 'І пасля смерці даць неба.',
], [
  { title: 'За аднаго памерлага', lines: ['Брату, што спіць у спакоі,', 'Ты, Пане наш міласэрны,', 'Дай радасць у Тваім доме,', 'Славіў каб Цябе вечна. Амэн.'] },
  { title: 'За адну памерлую', lines: ['Сястры, што спіць у спакоі,', 'Ты, Пане наш міласэрны,', 'Дай радасць у Тваім доме,', 'Славіла каб Цябе вечна. Амэн.'] },
  { title: 'За некалькіх', lines: ['Тым, што ўжо спяць у спакоі,', 'Ты, Пане наш міласэрны,', 'Дай радасць у Тваім доме,', 'Славілі каб Цябе вечна. Амэн.'] },
]);

data.vesperHymn = hymn([
  'Валадар магутны, Хрыстэ,', 'Каб Айцец быў праслаўлёны', 'І наш род людскі узняты,', 'Разарваў Ты путы смерці.',
  'Ты, прыняўшы нашу слабасць,', 'Растаптаў старога змея,', 'І сваёю смерцю знішчыў', 'Смерць, што грэх падрыхтаваў нам.',
  'Ты сваім уваскрасеннем', 'У Пасхальнай таямніцы', 'Дар жыцця ў нас аднаўляеш,', 'Хоць грэх быў прычынай смерці.',
  'Дай нам, Пане, Тваю ласку.', 'Мы запалім светач веры,', 'Каб сустрэць Цябе ў чаканні', 'І з надзеяй на збаўленне.',
  'Прымі ўсіх, Суддзя ласкавы,', 'У Нябесным Валадарстве,', 'Хто ў веры і любові', 'Вызнае Святую Тройцу.',
], [
  { title: 'За аднаго памерлага', lines: ['Брата Ты пакліч, о Божа,', 'Што свет гэты пакідае.', 'Дай яму ў жыцця краіне', 'Праслаўляць Цябе навекі. Амэн.'] },
  { title: 'За адну памерлую', lines: ['Ты пакліч сястру, о Божа,', 'Што свет гэты пакідае.', 'Ёй дазволь ў жыцця краіне', 'Праслаўляць Цябе навекі. Амэн.'] },
  { title: 'За некалькіх', lines: ['Слугаў Ты пакліч, о Божа,', 'Што свет гэты пакідаюць.', 'Ім дазволь ў жыцця краіне', 'Праслаўляць Цябе навекі. Амэн.'] },
]);

const plain = (html) => String(html || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
const paragraphs = (html) => String(html || '').match(/<p\b[^>]*>[\s\S]*?<\/p>/giu) || [];
const inner = (value) => value.replace(/^<p\b[^>]*>/iu, '').replace(/<\/p>$/iu, '');
const hasStar = (value) => /(?:\*|&#0*42;|&ast;)<\/span>/iu.test(value);
const hasMarker = (value) => /(?:\*|†|&#0*42;|&ast;)<\/span>/iu.test(value);

function verseParagraphs(bodyHtml) {
  const lines = bodyHtml.split(/<br\s*\/?>/iu).map((line) => line.trim()).filter(Boolean);
  const instructions = lines.filter((line) => /^(?:Хвала Айцу\.|Верш Хвала Айцу)/u.test(plain(line)));
  const verseLines = lines.filter((line) => !instructions.includes(line));
  const groups = [];
  let current = [];
  for (const line of verseLines) {
    if (current.length && current.some(hasStar) && hasMarker(line)) {
      groups.push(current);
      current = [];
    }
    current.push(line);
  }
  if (current.length) groups.push(current);
  return {
    verses: groups.map(paragraph).join('\n'),
    instructions: instructions.length
      ? `<p style="text-align: center;">${red(instructions.join('<br />'))}</p>`
      : '',
  };
}

function formatPsalm(html) {
  const parts = paragraphs(html).filter((item) => !/^Ант\./u.test(plain(item)));
  const title = parts.shift();
  const body = parts.map(inner).join('<br />');
  const lines = body.split(/<br\s*\/?>/iu).map((line) => line.trim()).filter(Boolean);
  const sectionLines = [];
  while (lines.length && /^(?:І|ІІ|III|IV)\s*\(/u.test(plain(lines[0]))) sectionLines.push(lines.shift());
  const formatted = verseParagraphs(lines.join('<br />'));
  return [
    title ? `<p style="text-align: center;">${red(inner(title))}</p>` : '',
    sectionLines.length ? `<p style="text-align: center;">${red(sectionLines.join('<br />'))}</p>` : '',
    formatted.verses,
    formatted.instructions,
  ].filter(Boolean).join('\n');
}

const psalmFields = [
  'officeOfReadingsPs1', 'officeOfReadingsPs2', 'officeOfReadingsPs3',
  'laudesPs1', 'laudesPs2',
  'vesperPs1', 'vesperPs2', 'vesperPs3',
];
psalmFields.forEach((field) => { data[field] = formatPsalm(data[field]); });

const originalLaudesPs3 = data.laudesPs3;
const primaryPsalm = formatPsalm(originalLaudesPs3.split(/<hr\s*\/?>/iu)[0]);
const primaryAnt = '<p>3 ант. Буду славіць Пана ' + marker('*') + ' ў сваім жыцці.</p>';
const alternativeAnt = '<p>3 ант. Усё жывое ' + marker('*') + ' няхай славіць Пана.</p>';
const alternativePsalm = [
  `<p style="text-align: center;">${red('Псальм 150')}</p>`,
  paragraph([`Хваліце Бога ў Яго святыні, ${marker('*')}`, 'хваліце Яго на небасхіле моцы Ягонай.']),
  paragraph([`Хваліце Яго за Яго магутныя справы, ${marker('*')}`, 'хваліце Яго за бязмежную веліч Ягоную.']),
  paragraph([`Хваліце Яго гукам трубы, ${marker('*')}`, 'хваліце Яго на арфе і гуслях.']),
  paragraph([`Хваліце Яго бубнам і танцам, ${marker('*')}`, 'хваліце Яго на струнах і флейце.']),
  paragraph([`Хваліце Яго на мілагучных цымбалах, ${marker('*')}`, 'хваліце Яго на цымбалах звонкіх.']),
  paragraph([`Усё, што дыхае, ${marker('*')}`, 'няхай хваліць Пана.']),
  paragraph([`Хвала Айцу і Сыну, ${marker('*')}`, 'і Духу Святому.']),
  paragraph([`Як была спрадвеку, цяпер і заўсёды, ${marker('*')}`, 'і на векі вечныя. Амэн.']),
].join('\n');

const psalmOption = (title, antiphon, psalm) => [
  `<div data-alternative-title="${title}">`,
  `<div class="ora-ant">${antiphon}</div>`,
  `<div class="ora-psalm">${psalm.replace(
    /((?:\*|&#0*42;|&ast;)(?:\s|&nbsp;)*(?:<\/(?:span|font|strong|b|em|i)>\s*))(?:<br\s*\/?>\s*)+/giu,
    '$1 ',
  )}</div>`,
  `<div class="ora-ant">${antiphon.replace(/^<p>3 ант\. /u, '<p>Ант. ')}</div>`,
  '</div>',
].join('\n');

data.laudesAnt3 = primaryAnt;
data.laudesPs3 = [
  psalmOption('Псальм 146 (145)', primaryAnt, primaryPsalm),
  psalmOption('Псальм 150', alternativeAnt, alternativePsalm),
].join('\n');

const prayerOptions = [
  {
    title: 'За аднаго памерлага або адну памерлую — 1',
    text: 'Спрадвечны Божа, выслухай ласкава нашыя малітвы, якія мы ўзносім да Цябе з вераю ў Твайго ўваскрослага Сына, умацуй нашую надзею, што слуга Твой (Твая) N. паўстане з мёртвых да жыцця вечнага. Праз Пана нашага.',
  },
  {
    title: 'За аднаго памерлага або адну памерлую — 2',
    text: 'Божа, святло верных і жыццё справядлівых, Твой Сын адкупіў нас сваёю смерцю і ўваскрасеннем, змілуйся над слугой Тваім (Тваёй) N., які жыў (якая жыла) з вераю ва ўваскрашэнне з мёртвых, і адары яго (яе) вечным шчасцем. Праз Пана нашага.',
  },
  {
    title: 'За аднаго памерлага або адну памерлую — 3',
    text: 'Пане, наш Божа, выслухай нашыя пакорныя малітвы; будзь міласэрны да слугі Твайго (Тваёй) N., якога (якую) Ты на гэтым свеце далучыў да Твайго народу, і прымі яго (яе) да святых Тваіх у Валадарстве святла і супакою. Праз Пана нашага.',
  },
  {
    title: 'За некалькіх',
    text: 'Спрадвечны Божа, Ты ўчыніў, што Твой Адзінародны Сын перамог смерць і ўзышоў на неба, учыні Тваіх слугаў (N. і N.) удзельнікамі Яго перамогі над смерцю, каб яны маглі вечна бачыць Цябе, свайго Стварыцеля і Збаўцу. Праз Пана нашага.',
  },
  {
    title: 'За братоў, блізкіх і дабрадзеяў',
    text: 'Божа, Ты хочаш збаўлення ўсіх людзей і міласціва даруеш правіны, просім Цябе за нашых родных, сяброў і дабрадзеяў, якія адышлі з гэтага свету, каб праз заступніцтва благаслаўлёнай заўсёды Панны Марыі і ўсіх святых яны прыйшлі да вечнага шчасця. Праз Пана нашага.',
  },
];
const prayers = prayerOptions.map(({ title, text }) => (
  `<div data-alternative-title="${title}">\n<p>${red(`${title}:`)}</p>\n<p>${text}</p>\n</div>`
)).join('\n');
['officeOfReadingsPr', 'laudesPr', 'sext1Pr', 'sext2Pr', 'sext3Pr', 'vesperPr']
  .forEach((field) => { data[field] = prayers; });

await fs.writeFile(SOURCE_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ source: SOURCE_PATH, fields: Object.keys(data).length }, null, 2));

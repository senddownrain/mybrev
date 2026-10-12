import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'node-html-parser';
import { getLiturgicalAlternatives, formatIntercessions } from '../../src/utils/liturgicalAlternatives.js';
import { formatPsalmHtml } from '../../src/utils/liturgicalHtml.js';
import { SUNDAY_WEEK_1_TEMPLATE } from '../../src/constants/officeFields.js';
import { zipEntries, unzipText } from '../import-prayer-markdown-collection.mjs';
import { contentMarkdown, hash, plainText, whitespace } from './catholicby-yearcycle.mjs';

export const GADZINKI_SECTIONS = ['Ютрань', 'Першая гадзіна', 'Трэцяя гадзіна', 'Шостая гадзіна', 'Дзевятая гадзіна', 'Нешпары', 'Напрыканцы дня', 'Ахвяраванне Гадзінак'];
export async function readGadzinki(directory) {
  const buffer = await fs.readFile(path.join(directory, 'Гадзінкі.docx'));
  const entries = zipEntries(buffer);
  const xml = await unzipText(entries.get('word/document.xml'), 'word/document.xml');
  // Word's main document only: headers, footers and page numbers are excluded.
  const lines = [...xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)].map((paragraph) => (
    [...paragraph[1].matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:(br|tab)\b[^>]*\/>/g)]
      .map((text) => text[2] === 'br' ? '\n' : text[2] === 'tab' ? ' ' : parse(text[1]).textContent).join('')
  )).flatMap((paragraph) => paragraph.split('\n')).map((line) => line.trim()).filter(Boolean);
  const text = (await fs.readFile(path.join(directory, 'Gadzinki_Bezzahannym_Zachatstsi_from_DOCX.md'), 'utf8')).replace(/\r\n/g, '\n').trim();
  const suppliedLines = await fs.readFile(path.join(directory, 'Gadzinki_DOCX_source_lines.txt'), 'utf8');
  const sections = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  const faithful = whitespace(lines.join(' ')) === plainText(text);
  const issues = [];
  if (!faithful) issues.push('docx-markdown-text-mismatch');
  if (JSON.stringify(sections) !== JSON.stringify(GADZINKI_SECTIONS)) issues.push('docx-section-order-mismatch');
  if (whitespace(suppliedLines) !== whitespace(lines.join(' '))) issues.push('supplied-source-lines-mismatch');
  return { text, issues, faithful, sections, docxHash: hash(buffer), textHash: hash(text),
    lineCount: lines.length,
    stanzaCount: text.split(/\n\s*\n/).filter((block) => block.includes('\n') && !/^(?:#|\*\*)/.test(block)).length,
    markdownBlockCount: text.split(/\n\s*\n/).length,
    anomalies: lines.filter((line) => /Молімся: Молiмся:|Ӳсесвятая|ветлая, Прачыста|[A-Za-z]/u.test(line)),
  };
}

const DEFINITIONS = [
  ['office-for-dead', 'laudes', 'Ютрань за памерлых', 'За памерлых'],
  ['office-for-dead', 'vesper', 'Нешпары за памерлых', 'За памерлых'],
  ['blessed-virgin-mary', 'laudes', 'Ютрань да Найсвяцейшай Панны Марыі', 'Марыя'],
  ['blessed-virgin-mary', 'vesper', 'Нешпары да Найсвяцейшай Панны Марыі', 'Марыя'],
];
export async function buildDevotionHours({ root, prayers, templates = [] }) {
  const read = async (file) => fs.readFile(path.join(root, file), 'utf8');
  const sundayPath = `patchs/db-templates/${SUNDAY_WEEK_1_TEMPLATE}.json`;
  const sunday = await read(sundayPath).then(JSON.parse).catch(() => templates.find((t) => t.id === SUNDAY_WEEK_1_TEMPLATE));
  const introSource = await read('src/components/oraparts/Intro.vue');
  const intro = /<div class="ora-intro">([\s\S]*?)<\/div>/.exec(introSource)?.[1];
  const endingSource = await read('src/components/oraparts/EndOfVesper.vue');
  const ending = endingSource.match(/<section\b[\s\S]*?<\/section>/g)?.join('\n').replace(/class="ora-ending__rubric"/g, 'class="rubric"');
  const songs = {};
  for (const [component, variable] of [['Benedictus', 'ben'], ['Magnificat', 'mag']]) {
    const source = await read(`src/components/oraparts/${component}.vue`);
    const html = new RegExp(`const ${variable} = \x60([\\s\\S]*?)\x60`).exec(source)?.[1];
    songs[component] = html;
  }
  const paterDocument = prayers?.find((p) => p.id === 'import-08-asnounyya-malitvy-na-pratsyagu-dnya');
  const pater = /Ойча наш,[\s\S]*?збаў нас ад злога\. Амэн\./u.exec(paterDocument?.text || '')?.[0];
  const results = [];
  for (const [templateId, hour, title, tag] of DEFINITIONS) {
    const file = `patchs/feasts/common-texts/${templateId}.json`;
    const source = await read(file);
    const template = JSON.parse(source);
    const fields = {}, issues = [], alternatives = [], provenance = {};
    const canticle = hour === 'laudes' ? 'Benedictus' : 'Magnificat';
    const canticleAnt = `${hour}${hour === 'laudes' ? 'AntBen' : 'AntMag'}`;
    for (const suffix of ['Hymn', 'Ant1', 'Ps1', 'Ant2', 'Ps2', 'Ant3', 'Ps3', 'R', hour === 'laudes' ? 'AntBen' : 'AntMag', 'Inter', 'Pr']) {
      const field = `${hour}${suffix}`;
      let value = template[field];
      provenance[field] = file;
      if (!value && hour === 'vesper' && suffix === 'Pr') { value = template.laudesPr; provenance[field] = `${file}:laudesPr`; }
      if (value === 'from-first-week' || template._fieldRules?.[field]?.source === 'sunday-week-1') {
        value = sunday?.[field]; provenance[field] = sunday ? sundayPath : 'missing:sunday-week-1';
        if (!value) issues.push(`blocked-missing-template:${field}:sunday-week-1`);
      }
      if (!value || /^(?:from-|vesper1|laudes)/.test(value)) issues.push(`missing-or-unresolved:${field}`);
      const kind = suffix === 'Hymn' ? 'hymn' : suffix === 'R' ? 'reading' : suffix === 'Pr' ? 'prayer'
        : suffix === 'Inter' ? 'intercession' : field === canticleAnt ? 'gospel-antiphon' : 'generic';
      fields[field] = getLiturgicalAlternatives(value || '', kind).map((option) => ({ ...option,
        markdown: contentMarkdown(suffix === 'Inter' ? formatIntercessions(option.html) : option.html) }));
      alternatives.push({ field, kind, options: fields[field].map((o) => ({ title: o.title, textHash: hash(o.markdown) })), policy: 'first-option-main; other-options-in-labelled-appendix' });
    }
    if (!pater) issues.push('missing-full-pater-noster');
    if (!intro || !ending || !songs[canticle]) issues.push('missing-component-text');
    const appendix = [];
    const primary = (field) => {
      const options = fields[field] || [];
      for (const option of options.slice(1)) appendix.push(`### ${fieldLabel(field)} — ${option.title}\n\n${option.markdown}`);
      return options[0]?.markdown || '';
    };
    const chunks = ['## Пачатак', contentMarkdown(intro || ''), '## Гімн', primary(`${hour}Hymn`), '## Псальмодыя'];
    for (let n = 1; n <= 3; n++) {
      const antField = `${hour}Ant${n}`, psField = `${hour}Ps${n}`;
      const psOptions = fields[psField];
      const embedded = psOptions?.[0]?.html.includes('class="ora-ant"');
      if (embedded) {
        chunks.push(primary(psField));
      } else {
        const ant = primary(antField);
        const ps = contentMarkdown(formatPsalmHtml(psOptions?.[0]?.html || '', { stripEmbeddedAntiphon: true }));
        chunks.push(ant, ps, ant);
        for (const option of psOptions.slice(1)) appendix.push(`### Псальмодыя ${n} — ${option.title}\n\n${ant}\n\n${option.markdown}\n\n${ant}`);
      }
    }
    const ant = primary(canticleAnt);
    chunks.push('## Кароткае чытанне і рэспансорый', primary(`${hour}R`),
      `## ${hour === 'laudes' ? 'Песня Захарыі (Лк 1, 68–79)' : 'Песня Марыі (Лк 1, 46–55)'}`,
      ant, contentMarkdown(songs[canticle] || ''), ant,
      '## Просьбы', primary(`${hour}Inter`), '## Ойча наш', pater || '',
      '## Малітва', primary(`${hour}Pr`), '## Завяршэнне', contentMarkdown(ending || ''));
    if (appendix.length) chunks.push('## Іншыя варыянты частак Гадзіны',
      ':::rubric\nНа выбар — адзін варыянт адпаведнай часткі Гадзіны.\n:::', ...appendix);
    const text = chunks.filter(Boolean).join('\n\n');
    if (/from-first-week|from-day|data-alternative-title|<\/?(?:p|span|div)\b/u.test(text)) issues.push('unresolved-html-or-directive');
    results.push({ id: `mybrev-devotion-${templateId}-${hour}`, title, text,
      tags: ['Набажэнства', tag], sourceKind: 'mybrev-office-template',
      source: `Літургія гадзінаў MyBrev — ${templateId === 'office-for-dead' ? 'Агульныя тэксты за памерлых' : 'Агульныя тэксты пра Найсвяцейшую Панну Марыю'}`,
      importKey: `mybrev-devotion-${templateId}-${hour}`, issues,
      audit: { file, templateHash: hash(source), provenance, alternatives, sundayWeek1Resolved: hour === 'laudes' && templateId === 'blessed-virgin-mary' && Boolean(sunday),
        canticleSource: `src/components/oraparts/${canticle}.vue`, paterSource: paterDocument?.id || null,
        introSource: 'src/components/oraparts/Intro.vue', endingSource: 'src/components/oraparts/EndOfVesper.vue',
        currentDateDependency: false, vespersPolicy: 'vesper*, not vesper1*' },
    });
  }
  return results;
}
function fieldLabel(field) {
  const suffix = field.replace(/^(?:laudes|vesper)/, '');
  return ({ Hymn: 'Гімн', R: 'Чытанне і рэспансорый', AntBen: 'Антыфона да песні Захарыі', AntMag: 'Антыфона да песні Марыі', Inter: 'Просьбы', Pr: 'Малітва',
    Ant1: 'Першая антыфона', Ant2: 'Другая антыфона', Ant3: 'Трэцяя антыфона',
    Ps1: 'Першы псальм', Ps2: 'Другі псальм', Ps3: 'Трэці псальм' })[suffix] || suffix;
}

#!/usr/bin/env node
/**
 * Імпартуе тэксты для дыяцэзіяльных фіксаваных святаў з catholic.by.
 *
 * Dry-run:   node scripts/import-fixed-dates-texts.mjs
 * Прымяніць: node scripts/import-fixed-dates-texts.mjs --apply
 */

import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const serviceAccount = require('../patchs/serviceAccountKey.json');
import admin from 'firebase-admin';
const { load } = require('cheerio');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const APPLY = process.argv.includes('--apply');

const BASE = 'https://catholic.by/3/liturgy/lectionary';

// docId → URL (або масіў docId калі адзін URL на некалькі дакументаў)
const DOC_MAP = [
  { ids: ['fixed-04.03'], url: `${BASE}/uspaminy/4935-4-sakavika-uspamin-sv-kazimira` },
  { ids: ['fixed-16.05'], url: `${BASE}/uspaminy/4942-16-maya-uspamin-sv-andreya-baboli-svyatara-i-muchanika` },
  { ids: ['fixed-09.08'], url: `${BASE}/sviaty/8471-9-zhni-nya-svyata-sv-terezy-benedykty-ad-kryzha-edyty-shtajn-panny-i-muchanitsy-apyakunki-e-ropy` },
  { ids: ['fixed-16.11'], url: `${BASE}/uspaminy/8864-16-listapada-uspamin-najsvyatsejshaj-panny-maryi-matsi-milasernastsi-matsi-bozhaj-vastrabramskaj` },
  // Гадавіна пасвячэння катэдральных касцёлаў — аднолькавыя чытанні для ўсіх дыяцэзіяў
  {
    ids: ['fixed-16.03', 'fixed-04.12', 'fixed-10.10'],
    url: `${BASE}/sviaty/17068-16-sakavika-gadavina-pasvyachennya-katedralnaga-kastsjola-u-minsku`,
  },
];

// ─────────────────────────────────────────────────────────────
// ХЭЛПЕРЫ ПАРСІНГА (аналагічна import-christmas-texts.mjs)
// ─────────────────────────────────────────────────────────────

function sectionToPlainText(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function nodeText($, el) {
  return sectionToPlainText($(el).html() || '');
}

function parseReading($, nodes, sectionHtml) {
  let bible = '';
  for (const m of sectionHtml.matchAll(/<div[^>]*align="right"[^>]*>([\s\S]*?)<\/div>/gi)) {
    const t = load(m[1]).text().trim().replace(/\s+/g, ' ');
    if (t) { bible = t; break; }
  }

  let title = '', comment = '';
  const textParts = [];
  let pastHeader = false;

  $(nodes).each((i, el) => {
    if (el.type !== 'tag' || el.tagName.toLowerCase() !== 'p') return;
    const inner = $(el).html() || '';
    const txt = $(el).text().trim();
    if (!txt) return;

    if (/^<i>/i.test(inner.trim()) && !title && !pastHeader) { title = txt; pastHeader = true; return; }
    if (/^(Чытанне|Паслання|Кнігі)/i.test(txt) && !pastHeader) { pastHeader = true; return; }
    if (!pastHeader) pastHeader = true;
    if (/^Гэта слова/i.test(txt)) return;
    if (/^Пераклад здзейснены/i.test(txt)) return;
    if (!comment && /^(Браты|Сёстры|Умілаваныя|У тыя дні|Дарагія)/i.test(txt) && !textParts.length) {
      comment = txt; return;
    }
    textParts.push(nodeText($, el));
  });

  // Fallback plain text
  if (!textParts.length) {
    const plain = sectionToPlainText(sectionHtml);
    let inText = false;
    for (const line of plain.split('\n').map(l => l.trim()).filter(Boolean)) {
      if (/^Гэта слова/i.test(line)) break;
      if (/^РЭСПАНСАРЫЙНЫ|^ДРУГОЕ|^СПЕЎ|^ЕВАНГЕЛЛЕ/i.test(line)) break;
      if (/^(Чытанне|Паслання|Кнігі)/i.test(line)) { inText = true; continue; }
      if (inText) textParts.push(line);
    }
  }

  return { bible, title: title || null, comment: comment || null, text: textParts.join('\n\n') || null };
}

function parsePsalm($, nodes, sectionHtml) {
  let bible = '';
  for (const m of sectionHtml.matchAll(/<div[^>]*align="right"[^>]*>([\s\S]*?)<\/div>/gi)) {
    const t = load(m[1]).text().trim().replace(/\s+/g, ' ');
    if (t) { bible = t; break; }
  }

  // Pre-extract inline chorus (для /sviaty/ і /uspaminy/ старонак з голым тэкстам)
  let chorus = null;
  const plainForChorus = sectionToPlainText(sectionHtml);
  const chorusPreMatch = plainForChorus.match(/^Рэфрэн:\s+(.+?)(?:\n|$)/m);
  if (chorusPreMatch) {
    chorus = chorusPreMatch[1].replace(/^Або:\s*Аллелюя\.?\s*/i, '').trim() || null;
  }

  let nextIsChorus = false;
  const verses = [];

  $(nodes).each((i, el) => {
    if (el.type !== 'tag' || el.tagName.toLowerCase() !== 'p') return;
    const txt = $(el).text().trim();
    if (!txt) return;

    const boldEl = $(el).find('b').first();
    const boldTxt = boldEl.length > 0 ? boldEl.text().trim() : '';
    const isChorusColon = /^Рэфрэн:$/i.test(boldTxt);
    const isRepeatMarker = /^Рэфрэн$/i.test(boldTxt);

    if (isChorusColon || /^Рэфрэн:\s+\S/i.test(txt)) {
      const afterBold = txt.replace(/^Рэфрэн:\s*/i, '').replace(/^Або:\s*Аллелюя\.?\s*/i, '').trim();
      if (afterBold && !chorus) { chorus = afterBold; }
      else if (!afterBold) { nextIsChorus = true; }
      return;
    }
    if (/^Рэфрэн:?$/i.test(txt)) return;
    if (nextIsChorus) { if (!chorus) chorus = txt; nextIsChorus = false; return; }

    if (isRepeatMarker) {
      const w = txt.replace(/\s*Рэфрэн:?\s*$/i, '').trim();
      if (w) verses.push(w);
      return;
    }
    const c = txt.replace(/\s*Рэфрэн:?\s*$/i, '').trim();
    if (c) verses.push(c);
  });

  // Fallback plain text — запускаецца калі verses пустыя (нават калі chorus ёсць)
  if (!verses.length) {
    for (const line of plainForChorus.split('\n').map(l => l.trim()).filter(Boolean)) {
      if (/^ДРУГОЕ|^СПЕЎ|^ЕВАНГЕЛЛЕ/i.test(line)) break;
      if (/^Рэфрэн:/i.test(line)) continue; // прапускаем маркеры рэфрэна
      // Толькі радкі з вершамі (пачынаюцца з лічбы або апостала)
      if (/^\d+[а-яёА-ЯЁ]?\.\s/.test(line)) verses.push(line);
    }
  }

  return { bible, chorus: chorus || null, verses: verses.length ? verses : null, text: null };
}

function parseAlleluia($, nodes, sectionHtml) {
  let bible = '';
  for (const m of sectionHtml.matchAll(/<div[^>]*align="right"[^>]*>([\s\S]*?)<\/div>/gi)) {
    const t = load(m[1]).text().trim().replace(/\s+/g, ' ');
    if (t) { bible = t; break; }
  }
  const plain = sectionToPlainText(sectionHtml);
  let verse = '';
  const m = plain.match(/Аллелюя[.,\s]*\n([\s\S]+?)\nАкламацыя/i);
  if (m) verse = m[1].replace(/\s+/g, ' ').trim();
  if (bible && verse.startsWith(bible)) verse = verse.slice(bible.length).trim();
  return { bible: bible || null, verse: verse || null };
}

function parseGospel($, nodes, sectionHtml) {
  let bible = '';
  for (const m of sectionHtml.matchAll(/<div[^>]*align="right"[^>]*>([\s\S]*?)<\/div>/gi)) {
    const t = load(m[1]).text().trim().replace(/\s+/g, ' ');
    if (t) { bible = t; break; }
  }
  let title = '', comment = '';
  const textParts = [];

  $(nodes).each((i, el) => {
    if (el.type !== 'tag' || el.tagName.toLowerCase() !== 'p') return;
    const inner = $(el).html() || '';
    const txt = $(el).text().trim();
    if (!txt) return;
    if (/^<i>/i.test(inner.trim()) && !title && !/Пераклад здзейснены/i.test(txt)) { title = txt; return; }
    if (/\+\s*Чытанне святога Евангелля/i.test(txt)) { comment = txt; return; }
    if (/^Гэта слова/i.test(txt)) return;
    if (/^Пераклад здзейснены/i.test(txt)) return;
    textParts.push(nodeText($, el));
  });

  // Fallback
  if (!textParts.length) {
    const plain = sectionToPlainText(sectionHtml);
    let inText = false;
    for (const line of plain.split('\n').map(l => l.trim()).filter(Boolean)) {
      if (/^Гэта слова/i.test(line)) break;
      if (/\+\s*Чытанне/i.test(line)) { inText = true; comment = line; continue; }
      if (inText) textParts.push(line);
    }
  }

  return { bible, title: title || null, comment: comment || null, text: textParts.join('\n\n') || null };
}

const SECTION_REGEX = {
  reading1: /ПЕРШАЕ ЧЫТАННЕ/,
  psalm:    /РЭСПАНСАРЫЙНЫ ПСАЛЬМ/,
  reading2: /ДРУГОЕ ЧЫТАННЕ/,
  alleluia: /СПЕЎ ПЕРАД ЕВАНГЕЛЛЕМ/,
  gospel:   /ЕВАНГЕЛЛЕ(?!М)/,
};

function parsePage(articleHtml) {
  const sectionBounds = {};
  for (const [key, regex] of Object.entries(SECTION_REGEX)) {
    const m = regex.exec(articleHtml);
    if (m) sectionBounds[key] = m.index;
  }
  const sorted = Object.entries(sectionBounds).sort((a, b) => a[1] - b[1]);
  const result = {};

  for (let i = 0; i < sorted.length; i++) {
    const [key, start] = sorted[i];
    const end = i + 1 < sorted.length ? sorted[i + 1][1] : articleHtml.length;
    const html = articleHtml.slice(start, end);
    const $sec = load(`<div>${html}</div>`);
    $sec('b').first().remove();
    const nodes = $sec('div > *').toArray();

    if (key === 'reading1' || key === 'reading2') result[key] = parseReading($sec, nodes, html);
    else if (key === 'psalm') result[key] = parsePsalm($sec, nodes, html);
    else if (key === 'alleluia') result[key] = parseAlleluia($sec, nodes, html);
    else if (key === 'gospel') result[key] = parseGospel($sec, nodes, html);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────

async function main() {
  console.log(`Рэжым: ${APPLY ? '⚠️  ПРЫМЯНЕННЕ' : '🔍 DRY-RUN'}\n`);

  const report = [];
  let updated = 0;
  let errors = 0;

  for (const { ids, url } of DOC_MAP) {
    console.log(`\n══ ${url.split('/').slice(-1)[0].slice(0, 50)} ══`);
    console.log(`   Дакументы: ${ids.join(', ')}`);

    let parsed;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; mybrev-bot/1.0)' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const $ = load(html);
      const articleHtml = $('div.article').first().html() || '';
      if (!articleHtml) throw new Error('div.article not found');

      parsed = parsePage(articleHtml);

      for (const [sec, data] of Object.entries(parsed)) {
        const textLen = data.text?.length || data.verse?.length
          || (data.verses ? data.verses.reduce((a, v) => a + v.length, 0) : 0);
        console.log(`  ${sec}: bible="${data.bible}" content=${textLen}ch`);
        if (data.chorus) console.log(`    chorus: "${data.chorus.slice(0, 70)}"`);
        if (data.verses) console.log(`    verses: ${data.verses.length} блокаў`);
        if (data.verse) console.log(`    verse: "${data.verse?.slice(0, 70)}"`);
        if (data.title) console.log(`    title: "${data.title.slice(0, 70)}"`);
        if (data.comment) console.log(`    comment: "${data.comment.slice(0, 50)}"`);
      }
    } catch (e) {
      console.error(`  ❌ Памылка загрузкі: ${e.message}`);
      for (const id of ids) report.push({ id, url, error: e.message });
      errors += ids.length;
      continue;
    }

    // Запісваем у кожны docId
    for (const docId of ids) {
      try {
        report.push({ id: docId, url, sections: Object.keys(parsed), parsed });

        if (APPLY) {
          const updateData = {};
          for (const [sec, data] of Object.entries(parsed)) {
            // Прапускаем секцыі без кантэнту (text/verse/verses/chorus — усе null)
            const hasContent = ['text','verse','verses','chorus'].some(f => {
              const v = data[f];
              return v != null && !(Array.isArray(v) && v.length === 0);
            });
            if (!hasContent) {
              console.log(`    ⚠️  ${sec} прапушчана (без кантэнту)`);
              continue;
            }
            for (const [field, val] of Object.entries(data)) {
              if (val === undefined) continue;
              const norm = (typeof val === 'string' && val === '') ? null : val;
              if (field === 'bible' && norm === null) continue;
              updateData[`${sec}.${field}`] = norm;
            }
          }
          await db.collection('parsedData').doc(docId).update(updateData);
          console.log(`  ✅ ${docId} запісана`);
          updated++;
        }
      } catch (e) {
        console.error(`  ❌ ${docId}: ${e.message}`);
        errors++;
      }
    }

    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n═══════════════════════`);
  console.log(`Запісана: ${updated}, памылак: ${errors}`);

  await mkdir('reports', { recursive: true });
  const outPath = 'reports/import-fixed-dates-report.json';
  await writeFile(outPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`Адчот: ${outPath}`);

  if (!APPLY) {
    console.log('\n✅ Dry-run завершаны. Для прымянення: node scripts/import-fixed-dates-texts.mjs --apply');
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });

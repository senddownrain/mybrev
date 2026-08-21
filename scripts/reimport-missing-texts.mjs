#!/usr/bin/env node
/**
 * Рэімпартуе тэксты для ўсіх parsedData дакументаў з _sourceUrl але пустым тэкстам.
 * Падтрымлівае: /zvychajny/, /advent/, /lent/, /bn/, /sviaty/, /urachystasci/ старонкі.
 * Для будніх (year=1|2): раздзяляе старонку па маркерах "Год І" / "Год ІІ".
 *
 * Dry-run:   node scripts/reimport-missing-texts.mjs
 * Прымяніць: node scripts/reimport-missing-texts.mjs --apply
 */

import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const sa = require('../patchs/serviceAccountKey.json');
const { load } = require('cheerio');
import admin from 'firebase-admin';
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const APPLY = process.argv.includes('--apply');

// Дакументы, якія патрабуюць асобнага апрацоўвання (не сюды)
const MANUAL_SKIP = new Set([
  'sviaty-4994_A', // Holy Family — шматгадовая старонка, апрацаваная import-holyfamily-texts.mjs
]);

// ─────────────────────────────────────────────────────────────
// Парсеры (аналагічна import-christmas-texts.mjs / import-fixed-dates-texts.mjs)
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
    if ($(el).find('span.divider').length > 0) return; // section divider (zvychajny pages)
    const inner = $(el).html() || '';
    const txt = $(el).text().trim();
    if (!txt) return;
    if (/^<i>/i.test(inner.trim()) && !title && !pastHeader && !/Пераклад здзейснены/i.test(txt)) { title = txt; pastHeader = true; return; }
    // Кніжная інтра-фраза — заўсёды прапускаем (на /bn/ Sunday старонках без <b>)
    if (/^(Чытанне|Паслання|Кнігі|Пачатак)/i.test(txt)) { pastHeader = true; return; }
    if (!pastHeader) { pastHeader = true; }
    if (/^Гэта слова/i.test(txt)) return;
    if (/^Пераклад здзейснены/i.test(txt)) return;
    if (!comment && /^(Браты|Сёстры|Умілаваныя|У тыя дні|Дарагія)/i.test(txt) && !textParts.length) { comment = txt; return; }
    textParts.push(nodeText($, el));
  });

  if (!textParts.length) {
    const plain = sectionToPlainText(sectionHtml);
    let inText = false;
    for (const line of plain.split('\n').map(l => l.trim()).filter(Boolean)) {
      if (/^Гэта слова/i.test(line)) break;
      if (/^РЭСПАНСАРЫЙНЫ|^ДРУГОЕ|^СПЕЎ|^ЕВАНГЕЛЛЕ/i.test(line)) break;
      if (/^(Чытанне|Паслання|Кнігі|Пачатак)/i.test(line)) { inText = true; continue; }
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
    if (isRepeatMarker) { const w = txt.replace(/\s*Рэфрэн:?\s*$/i, '').trim(); if (w) verses.push(w); return; }
    const c = txt.replace(/\s*Рэфрэн:?\s*$/i, '').trim();
    if (c) verses.push(c);
  });

  if (!verses.length) {
    for (const line of plainForChorus.split('\n').map(l => l.trim()).filter(Boolean)) {
      if (/^ДРУГОЕ|^СПЕЎ|^ЕВАНГЕЛЛЕ/i.test(line)) break;
      if (/^Рэфрэн:/i.test(line)) continue;
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

function parseSections(articleHtml) {
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

// Раздзяляем старонку па гадах (для будніх дакументаў з year=1|2)
function extractYearSection(articleHtml, year) {
  if (year !== 1 && year !== 2) return articleHtml;

  // Шукаем маркеры "Год ІІ" (ІІ — Cyrillic roman numerals)
  const yearIIRegex = /Год\s+ІІ(?!\w)/;
  const yearIIMatch = yearIIRegex.exec(articleHtml);

  if (!yearIIMatch) {
    // Адзін год на старонцы
    return articleHtml;
  }

  if (year === 1) {
    return articleHtml.slice(0, yearIIMatch.index);
  } else {
    return articleHtml.slice(yearIIMatch.index);
  }
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────

async function main() {
  console.log(`Рэжым: ${APPLY ? '⚠️  ПРЫМЯНЕННЕ' : '🔍 DRY-RUN'}\n`);

  // 1. Загружаем усе дакументы без тэксту
  const coverageReport = require('../reports/parseddata-coverage-audit.json');
  const missingTextIds = coverageReport.issues
    .filter(i => i.type === 'missing_text')
    .map(i => i.id);

  console.log(`Дакументаў без тэксту: ${missingTextIds.length}`);

  // 2. Загружаем дакументы з Firestore (нас цікавяць _sourceUrl і year)
  const docs = [];
  for (const id of missingTextIds) {
    if (MANUAL_SKIP.has(id)) {
      console.log(`  ⏭  ${id}: ручная апрацоўка, прапускаем`);
      continue;
    }
    const snap = await db.collection('parsedData').doc(id).get();
    if (!snap.exists) continue;
    const d = snap.data();
    if (!d._sourceUrl) {
      console.log(`  ⏭  ${id}: _sourceUrl=null, прапускаем`);
      continue;
    }
    docs.push({ id, url: d._sourceUrl, year: d.year ?? null, data: d });
  }

  console.log(`З _sourceUrl: ${docs.length} (прапушчана ${missingTextIds.length - docs.length} без URL)\n`);

  // 3. Групуем па URL (адзін фэтч на URL)
  const urlGroups = new Map();
  for (const doc of docs) {
    const group = urlGroups.get(doc.url) || [];
    group.push(doc);
    urlGroups.set(doc.url, group);
  }

  console.log(`Унікальных URL: ${urlGroups.size}`);

  const report = [];
  let updated = 0;
  let errors = 0;
  let skipped = 0;

  for (const [url, groupDocs] of urlGroups) {
    const shortUrl = url.split('/').slice(-1)[0].slice(0, 60);
    console.log(`\n══ ${shortUrl} ══`);
    console.log(`   Дакументы: ${groupDocs.map(d => d.id).join(', ')}`);

    let articleHtml;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; mybrev-bot/1.0)' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const $ = load(html);
      articleHtml = $('div.article').first().html() || '';
      if (!articleHtml) throw new Error('div.article not found');
    } catch (e) {
      console.error(`  ❌ Памылка загрузкі: ${e.message}`);
      for (const doc of groupDocs) {
        report.push({ id: doc.id, url, error: e.message });
        errors++;
      }
      continue;
    }

    for (const doc of groupDocs) {
      try {
        // Выбіраем патрэбны год (для будніх з year=1|2)
        const section = extractYearSection(articleHtml, doc.year);
        const parsed = parseSections(section);

        // Правяраем, ці атрымалі тэкст
        let gotText = false;
        for (const sec of Object.values(parsed)) {
          if (sec && (
            (sec.text && sec.text.length > 10) ||
            (sec.verse && sec.verse.length > 5) ||
            (sec.verses && sec.verses.length > 0)
          )) { gotText = true; break; }
        }

        if (!gotText) {
          console.log(`  ⚠️  ${doc.id}: тэкст не атрыманы — магчыма іншая структура старонкі`);
          report.push({ id: doc.id, url, year: doc.year, warning: 'no_text_parsed', parsed });
          skipped++;
          continue;
        }

        // Лог
        for (const [sec, data] of Object.entries(parsed)) {
          const len = data.text?.length || data.verse?.length || (data.verses?.reduce((a, v) => a + v.length, 0) || 0);
          console.log(`    ${sec}: ${len}ch ${data.bible ? '| bible=' + data.bible.slice(0,30) : ''}`);
        }

        report.push({ id: doc.id, url, year: doc.year, parsed });

        if (APPLY) {
          const updateData = {};
          for (const [sec, data] of Object.entries(parsed)) {
            // Толькі перазапісваем секцыі, якія ёсць у дакуменце
            if (!doc.data[sec]) continue; // секцыя не існуе ў DB
            for (const [field, val] of Object.entries(data)) {
              if (val === undefined) continue;
              const norm = (typeof val === 'string' && val === '') ? null : val;
              // Не перазаціраем bible калі ёсць у DB і парсер вярнуў null
              if (field === 'bible' && norm === null && doc.data[sec]?.bible) continue;
              // Не перазаціраем тэкст калі парсер вярнуў пустое але ў DB ёсць нешта
              if ((field === 'text' || field === 'verse') && (norm === null || norm === 'а') && doc.data[sec]?.[field] && doc.data[sec][field].length > 10) continue;
              updateData[`${sec}.${field}`] = norm;
            }
          }
          if (Object.keys(updateData).length === 0) {
            console.log(`  ℹ️  ${doc.id}: няма чаго абнаўляць`);
            skipped++;
            continue;
          }
          await db.collection('parsedData').doc(doc.id).update(updateData);
          console.log(`  ✅ ${doc.id} абноўлены (${Object.keys(updateData).length} палёў)`);
          updated++;
        }
      } catch (e) {
        console.error(`  ❌ ${doc.id}: ${e.message}`);
        report.push({ id: doc.id, url, error: e.message });
        errors++;
      }
    }

    await new Promise(r => setTimeout(r, 300)); // throttle
  }

  console.log('\n═══════════════════════════════════');
  console.log(`Абноўлена: ${updated}`);
  console.log(`Прапушчана: ${skipped}`);
  console.log(`Памылак: ${errors}`);

  await mkdir('reports', { recursive: true });
  const outPath = 'reports/reimport-missing-texts-report.json';
  await writeFile(outPath, JSON.stringify(report, null, 2));
  console.log(`Адчот: ${outPath}`);

  if (!APPLY) {
    console.log('\n✅ Dry-run завершаны. Для прымянення: node scripts/reimport-missing-texts.mjs --apply');
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });

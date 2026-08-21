#!/usr/bin/env node
/**
 * Імпартуе тэксты чытанняў Свята Святой Сям'і (Год A/B/C) з catholic.by/3/liturgy/lectionary/sviaty/4994
 * Усе тры гады на адной старонцы, раздзеленыя маркерамі "Год А." / "Або на выбар у год B:" / "Або на выбар у год С:"
 *
 * Dry-run:   node scripts/import-holyfamily-texts.mjs
 * Прымяніць: node scripts/import-holyfamily-texts.mjs --apply
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
const URL = 'https://catholic.by/3/liturgy/lectionary/sviaty/4994';

// docId → year marker
const YEAR_DOCS = {
  'feast-holyfamily_A': 'A',
  'feast-holyfamily_B': 'B',
  'feast-holyfamily_C': 'C',
  'sviaty-4994_A': 'A', // same page, same year A content
};

// ─────────────────────────────────────────────────────────────
// АГУЛЬНЫЯ ХЭЛПЕРЫ (скапіраваны з import-christmas-texts.mjs)
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
  const html = $(el).html() || '';
  return sectionToPlainText(html);
}

function parseReading($, nodes, sectionHtml) {
  let bible = '';
  for (const m of sectionHtml.matchAll(/<div[^>]*align="right"[^>]*>([\s\S]*?)<\/div>/gi)) {
    const t = load(m[1]).text().trim().replace(/\s+/g, ' ');
    if (t) { bible = t; break; }
  }

  let title = '';
  let comment = '';
  const textParts = [];
  let pastHeader = false;

  $(nodes).each((i, el) => {
    if (el.type !== 'tag') return;
    const tag = el.tagName.toLowerCase();
    if (tag === 'div') return;
    if (tag !== 'p') return;

    const inner = $(el).html() || '';
    const txt = $(el).text().trim();
    if (!txt) return;

    if (/^<i>/i.test(inner.trim()) && !title && !pastHeader) {
      title = txt; pastHeader = true; return;
    }
    if (/^(Чытанне|Паслання|Евангелля)/i.test(txt) && !pastHeader) {
      pastHeader = true; return;
    }
    if (/^(Браты|Сёстры|Умілаваныя|У тыя дні|Дарагія|Браты і сёстры)/i.test(txt) && !comment && !pastHeader) {
      comment = txt; pastHeader = true; return;
    }
    if (!pastHeader) { pastHeader = true; }
    if (/^Гэта слова/i.test(txt)) return;
    if (/^Пераклад здзейснены/i.test(txt)) return;

    if (!comment && /^(Браты|Сёстры|Умілаваныя|У тыя дні|Дарагія)/i.test(txt) && textParts.length === 0) {
      comment = txt; return;
    }
    textParts.push(nodeText($, el));
  });

  // Fallback для старонак з bare text (не <p>)
  if (!textParts.length) {
    const plain = sectionToPlainText(sectionHtml);
    const lines = plain.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (/^Гэта слова/i.test(line)) break;
      if (/^Пераклад здзейснены/i.test(line)) break;
      if (/^РЭСПАНСАРЫЙНЫ|^ДРУГОЕ|^СПЕЎ|^ЕВАНГЕЛЛЕ/i.test(line)) break;
      textParts.push(line);
    }
  }

  return {
    bible,
    title: title || null,
    comment: comment || null,
    text: textParts.join('\n\n') || null,
  };
}

function parsePsalm($, nodes, sectionHtml) {
  let bible = '';
  for (const m of sectionHtml.matchAll(/<div[^>]*align="right"[^>]*>([\s\S]*?)<\/div>/gi)) {
    const t = load(m[1]).text().trim().replace(/\s+/g, ' ');
    if (t) { bible = t; break; }
  }

  // Pre-check: на /sviaty/ старонках "Рэфрэн: тэкст" — голы тэкстава вузел, не <p>.
  // Вытягваем яго з plain text да DOM-цыкла.
  let chorus = null;
  const plainForChorus = sectionToPlainText(sectionHtml);
  const chorusPreMatch = plainForChorus.match(/^Рэфрэн:\s+(.+?)(?:\n|$)/m);
  if (chorusPreMatch) {
    chorus = chorusPreMatch[1]
      .replace(/^Або:\s*Аллелюя\.?\s*/i, '')
      .trim() || null;
  }

  let nextIsChorus = false;
  const verses = [];

  $(nodes).each((i, el) => {
    if (el.type !== 'tag') return;
    const tag = el.tagName.toLowerCase();
    if (tag === 'div') return;
    if (tag !== 'p') return;

    const txt = $(el).text().trim();
    if (!txt) return;

    const boldEl = $(el).find('b').first();
    const boldTxt = boldEl.length > 0 ? boldEl.text().trim() : '';
    const isChorusColon = /^Рэфрэн:$/i.test(boldTxt);
    const isRepeatMarker = /^Рэфрэн$/i.test(boldTxt);

    // Inline chorus: <p><b>Рэфрэн:</b> тэкст</p>
    // або <p>Рэфрэн: тэкст</p> (без bold — на /sviaty/ старонках)
    if (isChorusColon || /^Рэфрэн:\s+\S/i.test(txt)) {
      const afterBold = txt.replace(/^Рэфрэн:\s*/i, '').trim()
        .replace(/^Або:\s*Аллелюя\.?\s*/i, '').trim(); // прыбіраем "Або: Аллелюя."
      if (afterBold && !chorus) {
        chorus = afterBold;
      } else if (!afterBold) {
        nextIsChorus = true;
      }
      return;
    }

    // Маркер "Рэфрэн:" паміж вершамі (пусты рэфрэн-маркер)
    if (/^Рэфрэн:$/i.test(txt)) {
      // нічога не робім — проста прапускаем
      return;
    }

    if (nextIsChorus) {
      if (!chorus) chorus = txt;
      nextIsChorus = false;
      return;
    }

    if (isRepeatMarker) {
      const withoutMarker = txt.replace(/\s*Рэфрэн:?\s*$/i, '').trim();
      if (withoutMarker) verses.push(withoutMarker);
      return;
    }

    const cleanTxt = txt.replace(/\s*Рэфрэн:?\s*$/i, '').trim();
    if (cleanTxt) verses.push(cleanTxt);
  });

  // Fallback: plain text парсінг (калі <p> не знайдзены)
  if (!chorus && !verses.length) {
    const plain = sectionToPlainText(sectionHtml);
    const lines = plain.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (/^ДРУГОЕ|^СПЕЎ|^ЕВАНГЕЛЛЕ/i.test(line)) break;
      if (/^Рэфрэн:\s+\S/i.test(line)) {
        if (!chorus) chorus = line.replace(/^Рэфрэн:\s*/i, '').replace(/^Або:\s*Аллелюя\.?\s*/i, '').trim();
      } else if (/^Рэфрэн:?$/i.test(line)) {
        // skip
      } else if (/^\d+\./.test(line) || /^\S/.test(line)) {
        verses.push(line);
      }
    }
  }

  return { bible, chorus: chorus || null, verses: verses.length ? verses : null, text: null };
}

function parseAlleluia($, nodes, sectionHtml) {
  // bible: першы непусты <div align="right">
  let bible = '';
  for (const m of sectionHtml.matchAll(/<div[^>]*align="right"[^>]*>([\s\S]*?)<\/div>/gi)) {
    const t = load(m[1]).text().trim().replace(/\s+/g, ' ');
    if (t) { bible = t; break; }
  }

  // verse: тэкст паміж двума "Акламацыя:"
  const plain = sectionToPlainText(sectionHtml);
  let verse = '';
  const m = plain.match(/Аллелюя[.,\s]*\n([\s\S]+?)\nАкламацыя/i);
  if (m) {
    verse = m[1].replace(/\s+/g, ' ').trim();
    // Прыбіраем bible ref з пачатку verse (калі ёсць)
    if (bible && verse.startsWith(bible)) verse = verse.slice(bible.length).trim();
  }

  // Для /sviaty/ старонак: bible можа быць проста тэкстам перад першай Акламацыяй
  if (!bible) {
    const m2 = plain.match(/Акламацыя.*?\n([\s\S]*?)\n\n([\s\S]+?)\nАкламацыя/i);
    if (m2) { bible = m2[1].trim(); verse = m2[2].trim(); }
  }

  return { bible: bible || null, verse: verse || null };
}

function parseGospel($, nodes, sectionHtml) {
  let bible = '';
  for (const m of sectionHtml.matchAll(/<div[^>]*align="right"[^>]*>([\s\S]*?)<\/div>/gi)) {
    const t = load(m[1]).text().trim().replace(/\s+/g, ' ');
    if (t) { bible = t; break; }
  }

  let title = '';
  let comment = '';
  const textParts = [];

  $(nodes).each((i, el) => {
    if (el.type !== 'tag') return;
    const tag = el.tagName.toLowerCase();
    if (tag === 'div') return;
    if (tag !== 'p') return;

    const inner = $(el).html() || '';
    const txt = $(el).text().trim();
    if (!txt) return;

    if (/^<i>/i.test(inner.trim()) && !title) { title = txt; return; }
    if (/\+\s*Чытанне святога Евангелля/i.test(txt)) { comment = txt; return; }
    if (/^Гэта слова/i.test(txt)) return;
    if (/^Пераклад здзейснены/i.test(txt)) return;

    textParts.push(nodeText($, el));
  });

  // Fallback plain text
  if (!textParts.length) {
    const plain = sectionToPlainText(sectionHtml);
    const lines = plain.split('\n').map(l => l.trim()).filter(Boolean);
    let inText = false;
    for (const line of lines) {
      if (/\+\s*Чытанне/i.test(line)) { inText = true; comment = line; continue; }
      if (/^Гэта слова/i.test(line)) break;
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

function findSectionIndex(html, regex) {
  const m = regex.exec(html);
  return m ? m.index : -1;
}

function parseSections(sectionHtml) {
  const sectionBounds = {};
  for (const [key, regex] of Object.entries(SECTION_REGEX)) {
    const idx = findSectionIndex(sectionHtml, regex);
    if (idx !== -1) sectionBounds[key] = idx;
  }

  const sorted = Object.entries(sectionBounds).sort((a, b) => a[1] - b[1]);
  const sections = {};

  for (let i = 0; i < sorted.length; i++) {
    const [key, start] = sorted[i];
    const end = i + 1 < sorted.length ? sorted[i + 1][1] : sectionHtml.length;
    const html = sectionHtml.slice(start, end);
    const $sec = load(`<div>${html}</div>`);
    $sec('b').first().remove();
    sections[key] = { html, $sec };
  }

  const result = {};
  for (const [key, { html, $sec }] of Object.entries(sections)) {
    const $ = $sec;
    const nodes = $('div > *').toArray();
    if (key === 'reading1' || key === 'reading2') result[key] = parseReading($, nodes, html);
    else if (key === 'psalm') result[key] = parsePsalm($, nodes, html);
    else if (key === 'alleluia') result[key] = parseAlleluia($, nodes, html);
    else if (key === 'gospel') result[key] = parseGospel($, nodes, html);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────

async function main() {
  console.log(`Рэжым: ${APPLY ? '⚠️  ПРЫМЯНЕННЕ' : '🔍 DRY-RUN'}\n`);
  console.log(`Крыніца: ${URL}\n`);

  const res = await fetch(URL, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; mybrev-bot/1.0)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const $ = load(html);
  const articleHtml = $('div.article').first().html() || '';
  if (!articleHtml) throw new Error('div.article not found');

  // Знаходзім межы трох гадоў
  const yearBounds = {};
  const yearPatterns = {
    A: /(?:^|>)\s*Год\s+А\.\s*(?:<|$)/m,
    B: /Або на выбар у год\s+B:/i,
    C: /Або на выбар у год\s+С:/i,
  };
  for (const [year, regex] of Object.entries(yearPatterns)) {
    const m = regex.exec(articleHtml);
    if (m) yearBounds[year] = m.index;
    else console.warn(`⚠️  Не знайдзены маркер для Года ${year}`);
  }

  const yearOrder = ['A', 'B', 'C'].filter(y => yearBounds[y] !== undefined);
  const report = [];
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < yearOrder.length; i++) {
    const year = yearOrder[i];
    const start = yearBounds[year];
    const end = i + 1 < yearOrder.length ? yearBounds[yearOrder[i + 1]] : articleHtml.length;
    const yearHtml = articleHtml.slice(start, end);

    // Усе docId якія адпавядаюць гэтаму году
    const docIds = Object.entries(YEAR_DOCS).filter(([, y]) => y === year).map(([id]) => id);

    let parsed;
    try {
      parsed = parseSections(yearHtml);
    } catch (e) {
      for (const docId of docIds) {
        console.error(`  ❌ [${docId}] Памылка парсінгу: ${e.message}`);
        report.push({ id: docId, year, error: e.message });
        errors++;
      }
      continue;
    }

    for (const docId of docIds) {
      console.log(`\n══ ${docId} (Год ${year}) ══`);
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

      report.push({ id: docId, year, sections: Object.keys(parsed), parsed });

      if (APPLY) {
        try {
          const updateData = {};
          for (const [sec, data] of Object.entries(parsed)) {
            for (const [field, val] of Object.entries(data)) {
              if (val === undefined) continue;
              const norm = (typeof val === 'string' && val === '') ? null : val;
              if (field === 'bible' && norm === null) continue;
              updateData[`${sec}.${field}`] = norm;
            }
          }
          await db.collection('parsedData').doc(docId).update(updateData);
          console.log(`  ✅ Запісана ў Firestore`);
          updated++;
        } catch (e) {
          console.error(`  ❌ Памылка запісу: ${e.message}`);
          errors++;
        }
      }
    }
  }

  console.log(`\n═══════════════════════`);
  console.log(`Гадоў: ${yearOrder.length}, запісана: ${updated}, памылак: ${errors}`);

  await mkdir('reports', { recursive: true });
  const outPath = 'reports/import-holyfamily-texts-report.json';
  await writeFile(outPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`Адчот: ${outPath}`);

  if (!APPLY) {
    console.log('\n✅ Dry-run завершаны. Для прымянення: node scripts/import-holyfamily-texts.mjs --apply');
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });

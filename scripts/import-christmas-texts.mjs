#!/usr/bin/env node
/**
 * Імпартуе поўны тэкст чытанняў Каляднага актавы (15 дакументаў) з catholic.by.
 * Таксама можа абнавіць feast-holyfamily_A/B/C, Казімір, Бабалю.
 *
 * Dry-run:   node scripts/import-christmas-texts.mjs
 * Прымяніць: node scripts/import-christmas-texts.mjs --apply
 * Адзін дак: node scripts/import-christmas-texts.mjs --apply --id christmas-29-12
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
const ONLY_ID = process.argv.includes('--id')
  ? process.argv[process.argv.indexOf('--id') + 1]
  : null;

const BASE = 'https://catholic.by/3/liturgy/lectionary';

// ── URL-маппінг: docId → URL ──
const DOC_URLS = {
  'christmas-29-12': `${BASE}/bn/4561`,
  'christmas-30-12': `${BASE}/bn/4562`,
  'christmas-31-12': `${BASE}/bn/4563`,
  'christmas-01-01': `${BASE}/urachystasci/5025`,
  'christmas-02-01': `${BASE}/bn/4564`,
  'christmas-03-01': `${BASE}/bn/4566`,
  'christmas-04-01': `${BASE}/bn/4567`,
  'christmas-05-01': `${BASE}/bn/4568`,
  'christmas-06-01': `${BASE}/urachystasci/5026`,
  'christmas-07-01': `${BASE}/bn/4569`,
  'christmas-08-01': `${BASE}/bn/4570`,
  'christmas-09-01': `${BASE}/bn/4571`,
  'christmas-10-01': `${BASE}/bn/4572`,
  'christmas-11-01': `${BASE}/bn/4573`,
  'christmas-12-01': `${BASE}/bn/4574`,
};

// ─────────────────────────────────────────────────────────────
// ПАРСЕР
// ─────────────────────────────────────────────────────────────

function cleanText(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Атрымоўвае тэкст вузла cheerio, замяняючы <br> на \n і <p> на \n\n */
function nodeText($, el) {
  const html = $(el).html() || '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function sectionToPlainText(sectionHtml) {
  return sectionHtml
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseReading($, nodes, sectionHtml) {
  // bible ref — першы непусты <div align="right">
  let bible = '';
  for (const m of sectionHtml.matchAll(/<div[^>]*align="right"[^>]*>([\s\S]*?)<\/div>/gi)) {
    const t = load(m[1]).text().trim().replace(/\s+/g, ' ');
    if (t) { bible = t; break; }
  }

  // Убіраем з HTML: section header, bible div, "Гэта слова...", translator note
  let cleaned = sectionHtml
    .replace(/^[^<]*(?:ПЕРШАЕ|ДРУГОЕ) ЧЫТАННЕ[^<]*/i, '')
    .replace(/<div[^>]*align="right"[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<[^>]*class="divider"[^>]*>[\s\S]*?<\/[^>]+>/gi, '');

  // Канвертуем у тэкст
  const plain = sectionToPlainText(cleaned);

  // Знаходзім title (курсіўная italic або bold Чытанне...)
  let title = '';
  const italicM = /<p><i>([\s\S]*?)<\/i>/i.exec(sectionHtml);
  if (italicM) title = load(italicM[1]).text().trim();

  // Рубрыка Чытанне...
  let rubric = '';
  const boldM = /<p><b>(Чытанне[\s\S]*?)<\/b>/i.exec(sectionHtml);
  if (boldM) rubric = load(boldM[1]).text().trim();

  // Астатні тэкст: выдаляем italic, bold рубрыку, "Гэта слова", перакладчыка
  const lines = plain.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .filter(l => !/^(Гэта слова|Пераклад здзейснены)/i.test(l));

  // Выдаляем радкі якія супадаюць з title або rubric
  const bodyLines = lines.filter(l => l !== title && l !== rubric);

  // Першы радок можа быць прывітаннем
  let comment = '';
  let text = '';
  if (bodyLines.length > 0) {
    const first = bodyLines[0];
    if (/^(Умілаваныя|Браты і сёстры|У тыя дні|Браце|Дарагія|Возлюбленны|Паважаны)/.test(first)) {
      comment = first;
      text = bodyLines.slice(1).join('\n');
    } else {
      text = bodyLines.join('\n');
    }
  }

  return {
    bible,
    title: title || rubric || null,
    comment: comment || null,
    text: text.trim() || null,
  };
}

function parsePsalm($, nodes, sectionHtml) {
  // bible ref
  let bible = '';
  for (const m of sectionHtml.matchAll(/<div[^>]*align="right"[^>]*>([\s\S]*?)<\/div>/gi)) {
    const t = load(m[1]).text().trim().replace(/\s+/g, ' ');
    if (t) { bible = t; break; }
  }

  let chorus = null;
  let nextIsChorus = false; // флаг: наступны <p> — тэкст рэфрэна
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

    // Маркер з двукроп'ем "Рэфрэн:" — альбо inline (тэкст ёсць), альбо standalone (пусты маркер)
    const isChorusColon = /^Рэфрэн:$/i.test(boldTxt);
    // Inline маркер без двукроп'я "Рэфрэн" у канцы верша — маркер паўтарэння, НЕ chorus
    const isRepeatMarker = /^Рэфрэн$/i.test(boldTxt);

    if (isChorusColon) {
      const afterBold = txt.replace(/^Рэфрэн:\s*/i, '').trim();
      if (afterBold && !chorus) {
        // <p><b>Рэфрэн:</b> тэкст...</p> — inline chorus
        chorus = afterBold;
      } else if (!afterBold) {
        // <p><b>Рэфрэн:</b></p> — пусты маркер, наступны <p> = тэкст рэфрэна
        nextIsChorus = true;
      }
      return;
    }

    // Папярэдні элемент быў пустым маркерам → гэты <p> і ёсць тэкст рэфрэна
    if (nextIsChorus) {
      if (!chorus) chorus = txt;
      nextIsChorus = false;
      return;
    }

    // Звычайны верш псалма (магчыма, з inline <b>Рэфрэн</b> у канцы — выдаляем)
    const verseRaw = nodeText($, el);
    // Выдаляем маркер паўтарэння і "Рэфрэн:" у канцы любога верша
    const verseText = verseRaw
      .replace(/\s*\*?\s*\nРэфрэн:?\s*$/im, '')
      .replace(/\s*<b>\s*Рэфрэн\s*<\/b>\s*$/i, '')
      .trim();
    // Калі увесь тэкст — гэта verseText, то прыбяром inline Рэфрэн з txt
    const cleanTxt = txt.replace(/\s*Рэфрэн:?\s*$/i, '').trim();
    if (isRepeatMarker) {
      // Апошні верш з inline Рэфрэн: прыбіраем толькі маркер, захоўваем верш
      const withoutMarker = txt.replace(/\s*Рэфрэн:?\s*$/i, '').trim();
      if (withoutMarker) verses.push(withoutMarker);
      return;
    }
    if (cleanTxt) verses.push(cleanTxt);
  });

  return { bible, chorus: chorus || null, verses: verses.length ? verses : null, text: null };
}

function parseAlleluia($, nodes, sectionHtml) {
  // bible ref — любы непусты <div align="right"> (у urachystasci старонках можа быць 2 дыва)
  let bible = '';
  for (const m of sectionHtml.matchAll(/<div[^>]*align="right"[^>]*>([\s\S]*?)<\/div>/gi)) {
    const t = load(m[1]).text().trim().replace(/\s+/g, ' ');
    if (t) { bible = t; break; }
  }

  // Выдаляем усе <div align="right"> з HTML перад пошукам тэксту verse
  const htmlNoDivs = sectionHtml.replace(/<div[^>]*align="right"[^>]*>[\s\S]*?<\/div>/gi, '');

  // Тэкст verse — паміж першай "Аллелюя..." і другой "<b>Акламацыя"
  let verse = '';
  const m1 = htmlNoDivs.match(/Аллелюя[^<]*\.\s*<br[^>]*>(?:\s*<br[^>]*>)?([\s\S]*?)\s*<b>Акламацыя/i);
  if (m1) {
    verse = sectionToPlainText(m1[1]).replace(/\s+/g, ' ').trim();
    // Калі verse пачынаецца з bible ref — відаць div не быў выдалены правільна
    if (bible && verse.startsWith(bible)) {
      verse = verse.slice(bible.length).trim();
    }
  }

  // Fallback: plain text паміж двума акламацыямі
  if (!verse) {
    const plain = sectionToPlainText(htmlNoDivs);
    const m2 = plain.match(/Аллелюя[.,\s]+\n([\s\S]+?)\nАкламацыя/i);
    if (m2) verse = m2[1].replace(/\s+/g, ' ').trim();
  }

  return { bible, verse: verse || null };
}

function parseGospel($, nodes, sectionHtml) {
  const bibleDiv = sectionHtml.match(/<div[^>]*align="right"[^>]*>([\s\S]*?)<\/div>/i);
  let bible = '';
  if (bibleDiv) {
    bible = load(bibleDiv[1]).text().trim().replace(/\s+/g, ' ');
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

    // Italic title
    if (/^<i>/i.test(inner.trim()) && !title) {
      title = txt;
      return;
    }
    // Rubric "+ Чытанне святога Евангелля..."
    if (/\+\s*Чытанне святога Евангелля/i.test(txt)) {
      comment = txt;
      return;
    }
    // Канец
    if (/^Гэта слова/i.test(txt)) return;
    // Прыпіска перакладчыка
    if (/Пераклад здзейснены/i.test(txt)) return;

    textParts.push(nodeText($, el));
  });

  return {
    bible,
    title: title || null,
    comment: comment || null,
    text: textParts.join('\n\n') || null,
  };
}

// ─────────────────────────────────────────────────────────────
// АСНОЎНЫ ПАРСЕР СТАРОНКІ
// ─────────────────────────────────────────────────────────────

// Regex-маркеры для дакладнага знаходжання секцый у HTML
// ЕВАНГЕЛЛЕ(?!М) — каб не пляскаць з ЕВАНГЕЛЛЕМ у "СПЕЎ ПЕРАД ЕВАНГЕЛЛЕМ"
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

async function fetchAndParse(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; mybrev-bot/1.0)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const html = await res.text();
  const $ = load(html);
  const articleHtml = $('div.article').first().html() || '';

  if (!articleHtml) throw new Error(`div.article not found at ${url}`);

  const sections = {};
  const sectionBounds = {};
  for (const [key, regex] of Object.entries(SECTION_REGEX)) {
    const idx = findSectionIndex(articleHtml, regex);
    if (idx !== -1) sectionBounds[key] = idx;
  }

  // Сартуем па пазіцыі
  const sorted = Object.entries(sectionBounds).sort((a, b) => a[1] - b[1]);

  for (let i = 0; i < sorted.length; i++) {
    const [key, start] = sorted[i];
    const end = i + 1 < sorted.length ? sorted[i + 1][1] : articleHtml.length;
    const sectionHtml = articleHtml.slice(start, end);
    // Атрымоўваем вузлы ўнутры секцыі (пасля загалоўка)
    const $sec = load(`<div>${sectionHtml}</div>`);
    // Выдаляем загаловак секцыі (першы <b>...</b>)
    $sec('b').first().remove();
    sections[key] = { html: sectionHtml, $sec, $ };
  }

  const result = {};

  for (const [key, { html: sectionHtml, $sec }] of Object.entries(sections)) {
    const $ = $sec;
    const nodes = $('div > *').toArray();

    if (key === 'reading1' || key === 'reading2') {
      result[key] = parseReading($, nodes, sectionHtml);
    } else if (key === 'psalm') {
      result[key] = parsePsalm($, nodes, sectionHtml);
    } else if (key === 'alleluia') {
      result[key] = parseAlleluia($, nodes, sectionHtml);
    } else if (key === 'gospel') {
      result[key] = parseGospel($, nodes, sectionHtml);
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────

async function main() {
  console.log(`Рэжым: ${APPLY ? '⚠️  ПРЫМЯНЕННЕ' : '🔍 DRY-RUN'}\n`);

  const docs = ONLY_ID
    ? Object.entries(DOC_URLS).filter(([id]) => id === ONLY_ID)
    : Object.entries(DOC_URLS);

  const report = [];
  let updated = 0;
  let errors = 0;

  for (const [docId, url] of docs) {
    console.log(`\n── ${docId} (${url}) ──`);
    try {
      const parsed = await fetchAndParse(url);

      // Паказваем что знайшлі
      for (const [sec, data] of Object.entries(parsed)) {
        const textLen = data.text?.length
          || data.verse?.length
          || (data.verses ? data.verses.reduce((a, v) => a + v.length, 0) : 0);
        console.log(`  ${sec}: bible="${data.bible}" content=${textLen}ch`);
        if (data.chorus) console.log(`    chorus: "${data.chorus.slice(0, 70)}"`);
        if (data.verses) console.log(`    verses: ${data.verses.length} блокаў`);
        if (data.verse) console.log(`    verse: "${data.verse.slice(0, 70)}"`);
        if (data.comment) console.log(`    comment: "${data.comment.slice(0, 70)}"`);
        if (data.title) console.log(`    title: "${data.title.slice(0, 70)}"`);
      }

      report.push({ id: docId, url, sections: Object.keys(parsed), parsed });

      if (APPLY) {
        // Будуем update: толькі перазаписваем паля секцый
        // Пустыя радкі bible нармалізуем у null (не перазапісваем правільны ref пустатой)
        const updateData = {};
        for (const [sec, data] of Object.entries(parsed)) {
          for (const [field, val] of Object.entries(data)) {
            if (val === undefined) continue;
            const normalized = (typeof val === 'string' && val === '') ? null : val;
            // Не перазапісваем bible пустым значэннем (магчыма, у DB ужо ёсць рэф)
            if (field === 'bible' && normalized === null) continue;
            updateData[`${sec}.${field}`] = normalized;
          }
        }
        await db.collection('parsedData').doc(docId).update(updateData);
        console.log(`  ✅ Запісана ў Firestore`);
        updated++;
      }
    } catch (e) {
      console.error(`  ❌ Памылка: ${e.message}`);
      report.push({ id: docId, url, error: e.message });
      errors++;
    }

    // Паўза каб не флудзіць catholic.by
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n═══════════════════════`);
  console.log(`Апрацавана: ${docs.length}, абноўлена: ${updated}, памылак: ${errors}`);

  await mkdir('reports', { recursive: true });
  const outPath = 'reports/import-christmas-texts-report.json';
  await writeFile(outPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`Адчот: ${outPath}`);

  if (!APPLY) {
    console.log('\n✅ Dry-run завершаны. Для прымянення: node scripts/import-christmas-texts.mjs --apply');
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });

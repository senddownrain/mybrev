#!/usr/bin/env node
/**
 * Правяраем HTML-структуру /zvychajny/ і /advent/ старонак catholic.by
 * для разумення, як парсіць тэксты.
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { load } = require('cheerio');

// Тэставыя URL з _sourceUrl
const SAMPLES = [
  // Будні звычайны час (weekday, has year 1 and 2)
  'https://catholic.by/3/liturgy/lectionary/zvychajny/4672-panyadzelak-sjomy-zvychajny-tydzen',
  // Нядзеля (Sunday, has year A)
  'https://catholic.by/3/liturgy/lectionary/zvychajny/4664-vi-zvychajnaya-nyadzelya-god-a',
  // Адвэнт будні
  'https://catholic.by/3/liturgy/lectionary/advent/4577-panyadzelak-pershy-tydzen-adventu',
];

for (const url of SAMPLES) {
  console.log('\n══════════════════════════');
  console.log('URL:', url);

  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; mybrev-bot/1.0)' } });
  const html = await res.text();
  const $ = load(html);

  const article = $('div.article').first().html() || '';

  // Знаходзім маркеры секцый
  const sectionMarkers = [
    'ПЕРШАЕ ЧЫТАННЕ', 'ДРУГОЕ ЧЫТАННЕ', 'РЭСПАНСАРЫЙНЫ ПСАЛЬМ',
    'СПЕЎ ПЕРАД ЕВАНГЕЛЛЕМ', 'ЕВАНГЕЛЛЕ', 'ГОД', 'I ВАРЫЯНТ', 'II ВАРЫЯНТ'
  ];

  for (const marker of sectionMarkers) {
    if (article.includes(marker)) console.log('  ✓ МАРКЕР:', marker);
  }

  // Праверым тэгі абзацаў
  const pCount = (article.match(/<p[^>]*>/gi) || []).length;
  const brCount = (article.match(/<br\s*\/?>/gi) || []).length;
  console.log(`  <p>: ${pCount}, <br>: ${brCount}`);

  // Першы абзац з тэкстам
  const firstPs = [];
  $('div.article p').each((i, el) => {
    if (i < 5) firstPs.push($(el).text().trim().slice(0, 80));
  });
  console.log('  Першыя <p>:', firstPs);

  // Правяраем, ці ёсць year-specific падзел (для будніх 2 гадоў)
  const hasYear1 = /I\s+ГОД/i.test(article) || /ПЕРШЫ\s+ГОД/i.test(article) || /ГОД\s+I(?!\w)/i.test(article);
  const hasYearA = /ГОД\s+А/i.test(article);
  console.log(`  Год I: ${hasYear1}, Год А: ${hasYearA}`);

  // Першыя 500 знакаў артыкула (без тэгаў)
  const plainStart = article.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
  console.log('  Пачатак:', plainStart);
}

process.exit(0);

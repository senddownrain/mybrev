#!/usr/bin/env node
/**
 * Правярае readings + parsedData для 13 дакументаў без тэкстаў.
 * Паказвае: ці ёсць readings, якія палі запоўнены, ці можна выкарыстаць.
 *
 * Запуск: node scripts/audit-missing-from-readings.mjs
 */

import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const serviceAccount = require('../patchs/serviceAccountKey.json');
import admin from 'firebase-admin';

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const MISSING_IDS = [
  'feast-paulvi',
  'fixed-01.05',
  'fixed-04.09',
  'fixed-12.06',
  'fixed-14.08',
  'fixed-15.02',
  'fixed-18.09-grodno',
  'fixed-18.09-minsk-mohilev',
  'fixed-18.09-pinsk',
  'fixed-26.08-grodno',
  'fixed-26.08-minsk-mohilev',
  'fixed-26.08-pinsk',
  'fixed-26.10',
];

function summarize(doc) {
  if (!doc.exists) return null;
  const d = doc.data();
  const summary = {};
  for (const [k, v] of Object.entries(d)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string') {
      summary[k] = v.length > 0 ? `"${v.slice(0, 80)}${v.length > 80 ? '…' : ''}"` : '""';
    } else if (Array.isArray(v)) {
      summary[k] = `[${v.length} items]`;
    } else if (typeof v === 'object') {
      // Nested (parsedData structure: reading1, psalm, etc.)
      const sub = {};
      for (const [sk, sv] of Object.entries(v)) {
        if (sv === null || sv === undefined) { sub[sk] = null; continue; }
        if (typeof sv === 'string') sub[sk] = sv.length > 0 ? `${sv.length}ch` : 'empty';
        else if (Array.isArray(sv)) sub[sk] = `[${sv.length}]`;
        else sub[sk] = sv;
      }
      summary[k] = sub;
    } else {
      summary[k] = v;
    }
  }
  return summary;
}

async function main() {
  console.log('Правяраю 13 пустых дакументаў у readings + parsedData...\n');

  const report = [];

  for (const id of MISSING_IDS) {
    const [rdSnap, pdSnap] = await Promise.all([
      db.collection('readings').doc(id).get(),
      db.collection('parsedData').doc(id).get(),
    ]);

    const rdData = rdSnap.exists ? rdSnap.data() : null;
    const pdData = pdSnap.exists ? pdSnap.data() : null;

    // Падлічым, ці ёсць тэкст у readings
    let rdHasText = false;
    let rdFields = [];
    if (rdData) {
      for (const [k, v] of Object.entries(rdData)) {
        if (typeof v === 'string' && v.trim().length > 20) {
          rdHasText = true;
          rdFields.push(`${k}(${v.trim().length}ch)`);
        }
      }
    }

    // Стан parsedData
    let pdSections = [];
    let pdHasText = false;
    if (pdData) {
      for (const sec of ['reading1','reading2','psalm','alleluia','gospel']) {
        const s = pdData[sec];
        if (!s) continue;
        const hasText = (s.text && s.text.trim().length > 10)
          || (s.verse && s.verse.trim().length > 5)
          || (s.verses && s.verses.length > 0);
        if (hasText) { pdHasText = true; pdSections.push(sec); }
      }
    }

    const status = rdHasText ? '✅ readings мае тэкст' : (pdHasText ? '⚠️  parsedData ёсць секцыі' : '❌ пусты ўсюды');

    console.log(`── ${id}`);
    console.log(`   ${status}`);
    if (rdData) {
      console.log(`   readings: ${rdFields.length > 0 ? rdFields.join(', ') : '(без тэкставых палёў / пустыя)'}`);
      // Выведзем ключы з тэкстам
      for (const [k, v] of Object.entries(rdData)) {
        if (typeof v === 'string' && v.trim().length > 20) {
          console.log(`     ${k}: "${v.trim().slice(0, 120)}"`);
        }
      }
    } else {
      console.log(`   readings: адсутнічае`);
    }
    if (pdData && pdSections.length > 0) {
      console.log(`   parsedData секцыі з кантэнтам: ${pdSections.join(', ')}`);
    }
    console.log();

    report.push({
      id,
      readings_exists: !!rdData,
      readings_has_text: rdHasText,
      readings_text_fields: rdFields,
      readings_raw: rdData ? summarize(rdSnap) : null,
      parsedData_exists: !!pdData,
      parsedData_has_text: pdHasText,
      parsedData_sections_with_content: pdSections,
    });
  }

  const withText = report.filter(r => r.readings_has_text);
  const nothingEverywhere = report.filter(r => !r.readings_has_text && !r.parsedData_has_text);

  console.log('═══════════════════════════════════');
  console.log(`Усяго правераных: ${report.length}`);
  console.log(`З тэкстам у readings: ${withText.length}`);
  console.log(`Пустыя ўсюды: ${nothingEverywhere.length}`);
  if (withText.length > 0) {
    console.log(`\nМагчымы міграцыя з readings: ${withText.map(r => r.id).join(', ')}`);
  }

  await mkdir('reports', { recursive: true });
  const outPath = 'reports/missing-readings-audit.json';
  await writeFile(outPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\nАдчот: ${outPath}`);

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });

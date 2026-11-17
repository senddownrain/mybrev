#!/usr/bin/env node

import { sourceForSave } from '../src/utils/prayerSource.mjs';

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { inflateRaw } from 'node:zlib';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { PRAYER_TEXT_FORMAT, PRAYER_TEXT_FORMAT_VERSION } from '../src/utils/prayerMarkdown.js';

const inflateRawAsync = promisify(inflateRaw);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOWNLOADS = path.join(os.homedir(), 'Downloads');
const DEFAULT_ARCHIVE = path.join(DOWNLOADS, 'malitvy_md_collection_full.zip');
const DEFAULT_MARIAN_SOURCE = path.join(DOWNLOADS, 'malitvy_ajcou_maryjanau.md');
const DEFAULT_SERVICE_ACCOUNT = path.join(ROOT, 'patchs', 'serviceAccountKey.json');
const DEFAULT_REPORT = path.join(ROOT, 'reports', 'prayer-markdown-import-report.json');
const COLLECTION = 'prayers';

export const SOURCES = [
  ['01_malitvy_na_kozhny_dzen_tydnya.md', 'На кожны дзень'],
  ['02_agulny_katekhizis.md', 'Катэхізіс'],
  ['03_sakrament_pakayannya_spovedz.md', 'Споведзь'],
  ['05_vyanochak_za_kanayuchykh_i_pamerlykh.md', 'За памерлых'],
  ['06_malitvy_u_roznykh_patrebakh.md', 'У розных патрэбах'],
  ['07_malitvy_da_matsi_bozhaj.md', 'Марыя'],
  ['08_asnounyya_malitvy_na_pratsyagu_dnya.md', 'Асноўныя малітвы'],
  ['09_litaniya_da_khrysta_svyatara_i_akhvyary.md', 'Літанія'],
  ['10_navenna_za_pamerlykh_z_bl_a_hanaratam.md', 'Навэнна'],
  ['11_asnounyya_malitvy_na_latsinskaj_move.md', 'Лацінская мова'],
  ['12_nabazhenstvy_na_pratsyagu_liturgichnaga_goda.md', 'Набажэнства'],
  ['13_nabazhenstva_pershykh_subotau_mesyatsa_peraprashenne_bezzahannaha_sertsa_maryi.md', 'Першыя суботы'],
  ['14_malitvy_da_matsi_bozhaj_barunskaj_sutsyashalnitsy_zasmuchanykh.md', 'Марыя'],
  ['15_malitvy_za_semi.md', 'За сям’ю'],
  ['16_nabazhenstva_prysvyachennya_parafii_najsvyatsejshamu_sertsu_ezusa.md', 'Набажэнства'],
  ['17_kryzhovy_shlyakh_za_belarus.md', 'Крыжовы шлях'],
  ['18_kryzhovy_shlyakh_prabachennya.md', 'Крыжовы шлях'],
  ['19_uhledzemsya_u_kryzh.md', 'Крыжовы шлях'],
  ['20_kryzhovy_shlyakh_dlya_dzyatsej_shlyakh_laski_bozhaj.md', 'Крыжовы шлях'],
  ['21_kryzhovy_shlyakh_pavodle_dzennika_svyatoj_syastry_faustyny.md', 'Крыжовы шлях'],
  ['22_kryzhovy_shlyakh_nenarodzhanykh.md', 'Крыжовы шлях'],
  ['23_razvazhanni_kryzhovaha_shlyakhu.md', 'Крыжовы шлях'],
  ['24_nabazhenstvy_vyalikaha_postu_kryzhovy_shlyakh.md', 'Крыжовы шлях'],
  ['25_tady_i_tsyaper_kryzhovy_shlyakh_pavodle_ks_yana_tvardouskaha.md', 'Крыжовы шлях'],
];

function parseArgs(argv) {
  const options = { apply: false, archive: DEFAULT_ARCHIVE, marianSource: DEFAULT_MARIAN_SOURCE, serviceAccount: DEFAULT_SERVICE_ACCOUNT, report: DEFAULT_REPORT };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--apply') options.apply = true;
    else if (argument === '--archive') options.archive = path.resolve(argv[++index]);
    else if (argument === '--marian-source') options.marianSource = path.resolve(argv[++index]);
    else if (argument === '--service-account') options.serviceAccount = path.resolve(argv[++index]);
    else if (argument === '--report') options.report = path.resolve(argv[++index]);
    else if (argument === '--help' || argument === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function printHelp() {
  console.log(`Import the supplied Belarusian prayer Markdown collection.\n\nDry-run only reads the archive and writes a local report. Firestore is contacted only with --apply.\n\nUsage: node scripts/import-prayer-markdown-collection.mjs [--apply]\n\nOptions:\n  --archive <zip>          Full prayer collection ZIP\n  --marian-source <file>  Separate Marian Fathers Markdown file\n  --report <file>          Local JSON report\n  --apply                  Create only missing deterministic documents\n  --service-account <file> Firebase service account used only with --apply`);
}

function zipEntries(buffer) {
  const end = buffer.lastIndexOf(Buffer.from('PK\x05\x06'));
  if (end < 0) throw new Error('ZIP end-of-central-directory record was not found');
  const centralOffset = buffer.readUInt32LE(end + 16);
  const count = buffer.readUInt16LE(end + 10);
  const entries = new Map();
  let offset = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid ZIP central-directory entry');
    const compression = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`Invalid ZIP local entry: ${name}`);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    entries.set(name, { compression, data: buffer.subarray(dataStart, dataStart + compressedSize) });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function unzipText(entry, name) {
  if (!entry) throw new Error(`Archive is missing required file: ${name}`);
  const data = entry.compression === 0 ? entry.data : entry.compression === 8 ? await inflateRawAsync(entry.data) : null;
  if (!data) throw new Error(`Unsupported ZIP compression for ${name}: ${entry.compression}`);
  return data.toString('utf8');
}

export function extractEmbeddedSource(markdown) {
  const match = /^>\s*Крыніца:\s*(https?:\/\/\S+)\s*$/mu.exec(markdown);
  if (!match) return { text: markdown, source: '' };
  const url = match[1];
  const text = `${markdown.slice(0, match.index)}${markdown.slice(match.index + match[0].length)}`
    .replace(/^\n+|\s*$/g, '');
  return { text, source: `[${url}](${url})` };
}

export function sourceToPrayer(id, markdown, tags) {
  const normalized = markdown.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const match = /^#\s+(.+?)\s*\n(?:\n|$)/m.exec(normalized);
  if (!match) throw new Error(`${id} does not contain a level-one Markdown title`);
  const titleLineStart = match.index;
  const titleLineEnd = titleLineStart + match[0].length;
  const extracted = extractEmbeddedSource(
    `${normalized.slice(0, titleLineStart)}${normalized.slice(titleLineEnd)}`.replace(/^\n+|\s*$/g, ''),
  );
  return {
    id: `import-${id.replace(/\.md$/, '').replace(/[^a-z0-9]+/gi, '-')}`.toLowerCase(),
    source: sourceForSave(extracted.source),
    title: match[1].trim(),
    text: extracted.text,
    tags,
    textFormat: PRAYER_TEXT_FORMAT,
    textFormatVersion: PRAYER_TEXT_FORMAT_VERSION,
  };
}

export async function buildImportPlan({ archive, marianSource }) {
  const entries = zipEntries(await fs.readFile(archive));
  const prayers = await Promise.all(SOURCES.map(async ([name, tag]) => (
    sourceToPrayer(name, await unzipText(entries.get(name), name), [tag])
  )));
  prayers.push(sourceToPrayer('malitvy_ajcou_maryjanau.md', await fs.readFile(marianSource, 'utf8'), ['Марыяне', 'Марыя']));
  return prayers;
}

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }

async function applyPlan(prayers, serviceAccountPath) {
  const [{ default: admin }, serviceAccountText] = await Promise.all([import('firebase-admin'), fs.readFile(serviceAccountPath, 'utf8')]);
  const app = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(serviceAccountText)) });
  try {
    const db = admin.firestore();
    const result = { created: [], skippedExisting: [] };
    for (const prayer of prayers) {
      const ref = db.collection(COLLECTION).doc(prayer.id);
      const snapshot = await ref.get();
      if (snapshot.exists) { result.skippedExisting.push(prayer.id); continue; }
      await ref.create({ ...prayer, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      const verification = await ref.get();
      if (!verification.exists || verification.data().text !== prayer.text) throw new Error(`Post-write verification failed: ${prayer.id}`);
      result.created.push(prayer.id);
    }
    return result;
  } finally { await app.delete(); }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return printHelp();
  const prayers = await buildImportPlan(options);
  const report = {
    generatedAt: new Date().toISOString(), mode: options.apply ? 'apply' : 'dry-run', analysisSource: 'local-supplied-markdown',
    archive: options.archive, marianSource: options.marianSource, collection: COLLECTION,
    plannedDocuments: prayers.length,
    documents: prayers.map(({ id, source, title, tags, text }) => ({ id, source, title, tags, textSha256: sha256(text), textLength: text.length })),
  };
  if (options.apply) Object.assign(report, await applyPlan(prayers, options.serviceAccount));
  await fs.mkdir(path.dirname(options.report), { recursive: true });
  await fs.writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ reportPath: options.report, plannedDocuments: report.plannedDocuments, created: report.created?.length ?? 0, skippedExisting: report.skippedExisting?.length ?? 0 }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error); process.exitCode = 1; });

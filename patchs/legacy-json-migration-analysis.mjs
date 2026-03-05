#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'src/json');
const OUTPUT = path.join(ROOT, 'patchs/json/legacy-db-analysis-report.json');

const TABLE_LINKS = {
  Svyat: ['Svyat (1)'],
  Zakl_Ant: ['Zakl_Ant'],
  Zakl_PS: ['Zakl_PS'],
  GCH_Gimn: ['GCH_Gimn'],
  GCH_Ant: ['GCH_Ant'],
  GCH_PS: ['GCH_PS'],
  GCH_Versh: ['GCH_Versh'],
  GCH_CH_1: ['GCH_CH_1'],
  GCH_CH_2: ['GCH_CH_2'],
  GCH_Tabe: ['GCH_Tabe'],
  GCH_Mal: ['GCH_Mal'],
  UTR_Gimn: ['UTR_Gimn'],
  UTR_Ant: ['UTR_Ant'],
  UTR_PS: ['UTR_PS'],
  UTR_Chyt: ['UTR_Chyt'],
  UTR_Ant_Zakh: ['UTR_Ant_Zakh'],
  UTR_Prosby: ['UTR_Prosby'],
  UTR_Mal: ['UTR_Mal'],
  MPD_Gimn_1: ['MPD_Gimn_1'],
  MPD_Ant_1: ['MPD_Ant_1'],
  MPD_PS_1: ['MPD_PS_1'],
  MPD_PS_2: ['MPD_PS_1'],
  MPD_PS_3: ['MPD_PS_1'],
  MPD_Chyt_1: ['MPD_Chyt_1'],
  MPD_Mal_1: ['MPD_Mal_1', 'UTR_Mal'],
  MPD_Gimn_2: ['MPD_Gimn_2', 'MPD_Gimn_1'],
  MPD_Ant_2: ['MPD_Ant_2', 'MPD_Ant_1'],
  MPD_Chyt_2: ['MPD_Chyt_2'],
  MPD_Mal_2: ['MPD_Mal_2', 'UTR_Mal'],
  MPD_Gimn_3: ['MPD_Gimn_3', 'MPD_Gimn_1'],
  MPD_Ant_3: ['MPD_Ant_3', 'MPD_Ant_1'],
  MPD_Chyt_3: ['MPD_Chyt_3'],
  MPD_Mal_3: ['MPD_Mal_3', 'UTR_Mal'],
  NESH_Gimn: ['NESH_Gimn'],
  NESH_Ant: ['NESH_Ant'],
  NESH_PS: ['NESH_PS'],
  NESH_Chyt: ['NESH_Chyt'],
  NESH_Ant_M: ['NESH_Ant_M'],
  NESH_Prosby: ['NESH_Prosby'],
  NESH_Mal: ['NESH_Mal', 'UTR_Mal'],
  KAMP_Gimn: ['KAMP_Gimn'],
  KAMP_Ant: ['KAMP_Ant'],
  KAMP_PS: ['KAMP_PS'],
  KAMP_Chyt: ['KAMP_Chyt'],
  KAMP_Resp: ['KAMP_Resp'],
  KAMP_Ant_S: ['KAMP_Ant_S'],
  KAMP_Mal: ['KAMP_Mal'],
  KAMP_Ant_M: ['KAMP_Ant_M'],
};

function parsePhpMyAdminJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const start = raw.indexOf('[');
  if (start < 0) return [];
  return JSON.parse(raw.slice(start));
}

function summarizeTable(rows) {
  const columns = new Set();
  for (const row of rows) {
    if (row && typeof row === 'object') {
      for (const key of Object.keys(row)) columns.add(key);
    }
  }
  return {
    rows: rows.length,
    columns: [...columns].sort(),
  };
}

function main() {
  const files = fs.readdirSync(SRC_DIR).filter((name) => name.endsWith('.json')).sort();
  const parsed = new Map();

  for (const file of files) {
    const fullPath = path.join(SRC_DIR, file);
    const rows = parsePhpMyAdminJson(fullPath);
    parsed.set(file.replace('.json', ''), summarizeTable(rows));
  }

  const bridge = parsePhpMyAdminJson(path.join(SRC_DIR, 'Bridge.json'));
  const distinctDays = new Set(bridge.map((r) => r.Bridge_DayId)).size;
  const years = [...new Set(bridge.map((r) => Number(r.Bridge_Year)).filter(Boolean))].sort((a, b) => a - b);

  const linkCoverage = Object.fromEntries(
    Object.entries(TABLE_LINKS).map(([bridgeKey, candidates]) => {
      const hit = candidates.find((name) => parsed.has(name));
      return [bridgeKey, {
        targetTable: hit || null,
        exists: Boolean(hit),
      }];
    }),
  );

  const report = {
    generatedAt: new Date().toISOString(),
    sourceDir: 'src/json',
    tableCount: parsed.size,
    bridge: {
      rows: bridge.length,
      distinctDays,
      minYear: years[0] || null,
      maxYear: years.at(-1) || null,
      columns: parsed.get('Bridge')?.columns || [],
    },
    tables: Object.fromEntries(parsed.entries()),
    bridgeLinks: linkCoverage,
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(report, null, 2), 'utf8');
  console.log(`Saved report: ${OUTPUT}`);
  console.log(`Tables: ${report.tableCount}, Bridge rows: ${report.bridge.rows}, distinct days: ${report.bridge.distinctDays}`);
}

main();

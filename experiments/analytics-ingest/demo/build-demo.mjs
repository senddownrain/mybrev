/**
 * Bundles consent-demo.mjs + the mock into ONE html file with no external reference (no CDN, no font, no script src).
 * `node experiments/analytics-ingest/demo/build-demo.mjs [outFile]`, then open the file from disk. Needs `npm ci` (esbuild comes with vite).
 */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(process.argv[2] || path.join(here, 'out', 'consent-demo.html'));
const result = await build({ entryPoints: [path.join(here, 'consent-demo.mjs')], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2020', loader: { '.json': 'json' } });
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'">
<title>Analytics consent mock (TEST ONLY)</title>
<style>
body{font:15px/1.4 system-ui,sans-serif;margin:0;padding:16px;max-width:760px;margin-inline:auto;color:#1c1c1c;background:#fafafa}
.banner{background:#b00020;color:#fff;font-weight:700;text-align:center;padding:10px;border-radius:6px;letter-spacing:.04em}
fieldset{margin:14px 0;border:1px solid #bbb;border-radius:6px;background:#fff}
pre{background:#f0f0f0;padding:8px;border-radius:4px;white-space:pre-wrap;margin:6px 0}
button{padding:8px 12px;margin:3px 4px 3px 0;font:inherit}
label{display:block;margin:6px 0}
small{color:#555}
@media (prefers-color-scheme:dark){body{background:#161616;color:#eee}fieldset{background:#202020;border-color:#555}pre{background:#2a2a2a}small{color:#aaa}}
</style></head><body>
<div class="banner">TEST ONLY / NO DATA SENT: synthetic data, in-process mock, not a real consent</div>
<h1>Share anonymous usage counts?</h1>
<p><small>Developer demo of the opt-in flow. Ticking the box here is NOT legal consent and no real form may use this text (owner/lawyer approval pending, D-01…D-09). Nothing leaves this page: network APIs are blocked and counted.</small></p>
<fieldset><legend>Choice (default OFF, the app works the same without it)</legend>
<label><input type="checkbox" id="consent"> Allow sending general usage counters (mock)</label>
<button id="revoke">Withdraw consent and erase queue</button></fieldset>
<fieldset><legend>Developer switches</legend>
<label><input type="checkbox" id="build" checked> build flag (VITE_ANALYTICS_LOCAL)</label>
<label><input type="checkbox" id="server" checked> server flag / kill switch (ingest enabled)</label>
<button id="relaunch">Relaunch app</button><button id="lose">Lose next send</button></fieldset>
<fieldset><legend>Simulated use</legend>
<button id="read">Read 3 pages (9 synthetic cells)</button><button id="flush">App resume / daily send</button></fieldset>
<h3>Gate</h3><pre id="gate"></pre><h3>Device queue</h3><pre id="queue"></pre><h3>Mock aggregator</h3><pre id="agg"></pre><h3>Counters (networkCalls must stay 0)</h3><pre id="stats"></pre><h3>Log</h3><pre id="log"></pre>
<script>${js}</script></body></html>`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`${out} (${html.length} bytes)`);

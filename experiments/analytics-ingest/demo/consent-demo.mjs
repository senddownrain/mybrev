/**
 * P07 developer-only demo: consent / revoke / kill switch against the in-process mock. TEST ONLY / NO DATA SENT.
 * Bundled by build-demo.mjs into ONE html file (opened from disk). It never touches localStorage or the network:
 * "device storage" is a JS Map, so a page reload is a fresh install with consent OFF.
 */
import contract from '../../../tests/fixtures/analytics-contract-v2.json';
import inventory from '../../../src/utils/analytics/public-inventory.json';
import { createMemoryKv, createMockBackend, createMockClient, QUEUE_KEY } from '../src/mock-client.mjs';

const publicIds = new Set(inventory.ids);
const DAY = 86400000;
const net = { count: 0 }; // proves "analytics requests = 0": any network API call from this page is counted and refused
const refuse = () => { net.count += 1; throw new Error('network is disabled in the demo'); };
window.fetch = refuse; window.XMLHttpRequest = function Refused() { refuse(); };
window.navigator.sendBeacon = () => { net.count += 1; return false; };

const state = { now: Date.parse('2026-10-17T12:00:00Z'), build: true, server: true, loseNext: false, hostBuffer: 0, kv: createMemoryKv(), log: [] };
const backend = createMockBackend({ now: () => state.now, publicIds, lose: () => { const v = state.loseNext; state.loseNext = false; return v; } });
const day = (offset) => new Date(state.now + offset * DAY).toISOString().slice(0, 10);
const makeClient = () => createMockClient({
  buildFlag: state.build, serverFlag: () => state.server, kv: state.kv, transport: backend.transport, now: () => state.now, publicIds,
  onPurge: () => { state.hostBuffer = 0; },
});
let client = makeClient();
const $ = (id) => document.getElementById(id);
const note = (text) => { state.log.unshift(text); state.log.length = Math.min(state.log.length, 12); };

function packet(cells) {
  return { ...JSON.parse(JSON.stringify(contract.validPacket)), day: day(-1), cells: JSON.parse(JSON.stringify(contract.validPacket.cells)).slice(0, cells) };
}
async function render() {
  const gate = client.gate();
  $('consent').checked = client.consent.get();
  $('gate').textContent = `build=${gate.build ? 'ON' : 'OFF'}  server=${gate.server ? 'ON' : 'OFF'}  consent=${gate.consent ? 'ON' : 'OFF'}  → ${client.isActive() ? 'ACTIVE (mock only)' : 'INERT (fail closed)'}`;
  const queue = client.queue();
  $('queue').textContent = queue.length ? queue.map((p) => `${p.day}: ${p.cells.length} cells, n=${p.cells.reduce((s, c) => s + c.n, 0)}`).join('\n') : '(empty; queue key ' + (state.kv.has(QUEUE_KEY) ? 'present' : 'absent') + ')';
  const rows = await backend.rows();
  $('agg').textContent = `${rows.length} cells, total n = ${rows.reduce((s, r) => s + r.n, 0)}  (in-memory mock aggregator)`;
  $('stats').textContent = JSON.stringify({ ...client.stats, transportCalls: backend.received.calls, networkCalls: net.count });
  $('log').textContent = state.log.join('\n');
}
async function act(fn) { await fn(); await render(); }

$('consent').addEventListener('change', (e) => act(() => { if (e.target.checked) client.consent.grant(); else client.consent.revoke(); note(e.target.checked ? 'user: opt-in (demo)' : 'user: opt-out'); }));
$('revoke').addEventListener('click', () => act(() => { client.consent.revoke(); note('user: REVOKE → queue and buffer wiped'); }));
$('read').addEventListener('click', () => act(() => { state.hostBuffer += 9; const r = client.offer(packet(9)); note(`read 3 pages → offer ${r.accepted ? 'queued' : 'dropped (' + r.reason + ')'}`); }));
$('flush').addEventListener('click', () => act(async () => { const r = await client.flush(); note(`flush (resume/daily): ${JSON.stringify(r)}`); }));
$('lose').addEventListener('click', () => act(() => { state.loseNext = true; note('next send will be lost'); }));
$('relaunch').addEventListener('click', () => act(() => { client = makeClient(); note('relaunch: state reloaded from device storage'); }));
$('build').addEventListener('change', (e) => act(() => { state.build = e.target.checked; client = makeClient(); note(`build flag ${state.build ? 'ON' : 'OFF'}`); }));
$('server').addEventListener('change', (e) => act(() => { state.server = e.target.checked; backend.setIngestEnabled(state.server); note(`kill switch (server flag) ${state.server ? 'ON (ingest enabled)' : 'OFF (ingest disabled)'}`); }));
render();

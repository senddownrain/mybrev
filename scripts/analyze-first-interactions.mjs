/** Derive action-level measurements without counting diagnostic retries. */
import fs from 'node:fs';

const files = process.argv.slice(2);
if (!files.length) throw new Error('Pass raw first-interactions JSON reports');
const rounded = value => value === null ? null : +value.toFixed(1);
const pct = (values, p) => values.length ? rounded([...values].sort((a,b) => a-b)[Math.ceil(values.length*p)-1]) : null;
const stats = values => ({n:values.length, p50Ms:pct(values,.5), p95Ms:pct(values,.95), maxMs:values.length ? rounded(Math.max(...values)) : null});
const actions = [];
const series = files.map((file, index) => {
  const report = JSON.parse(fs.readFileSync(file, 'utf8'));
  const name = index === 0 ? 'baseline' : index === 1 ? 'visible-point-control' : `probe-${index}`;
  for (const row of report.measurements) {
    const trace = row.beforeRetry || row.trace;
    for (const [action, click, response, success] of row.case === 'menu' ? [
      ['hamburger',row.rawClick,row.menuOpenMs,Number.isFinite(row.menuOpenMs)],
      ['readings-link',row.drawerClick,row.drawerNavigationMs,row.success],
    ] : [['day-card',row.rawClick,row.dayNavigationMs,row.success]]) {
      if (!click) continue;
      const input = trace.log.inputs.find(i => i.type === 'click' && i.at >= click.at);
      const tasks = trace.log.longTasks;
      const dispatchTasks = tasks.filter(t => input && t.at < input.at && t.at+t.duration > click.at);
      const events = (trace.log.events || []).filter(e => e.name === 'click' && input && e.at >= click.at-1 && e.at <= input.at+1);
      actions.push({series:name, mode:row.mode, case:row.case, trial:row.trial, action, success,
        visibleAtMs:row.firstVisibleMs, sampledAtMs:click.at,
        x:click.x, y:click.y, inViewport:click.inViewport, hitTarget:click.targetIsHit,
        inert:click.inheritedInert, pointerEvents:click.pointerEvents, loadingList:click.loadingList,
        inputTarget:input?.target, inputHref:input?.href || null,
        sampleToInputMs:input ? input.at-click.at : null, responseMs:response ?? null,
        taskCount:tasks.length, maxTaskMs:tasks.length ? Math.max(...tasks.map(t=>t.duration)) : 0,
        tasksDuringDispatchCount:dispatchTasks.length,
        maxTaskDuringDispatchMs:dispatchTasks.length ? Math.max(...dispatchTasks.map(t=>t.duration)) : null,
        eventTimingProcessingDelayMs:events.length ? rounded(Math.max(...events.map(e=>e.processingStart-e.at))) : null,
      });
    }
  }
  const rows = report.measurements;
  const idb = rows.flatMap(r => (r.beforeRetry || r.trace).log.indexedDB || []);
  return {name, file, scenarios:rows.length, successfulScenarios:rows.filter(r=>r.success).length,
    failedScenarios:rows.filter(r=>!r.success).length, environment:report.environment,
    pageErrors:rows.flatMap(r=>r.pageErrors),
    failedRequestHosts:[...new Set(rows.flatMap(r=>r.failedRequests.map(e=>e.urlHost)))],
    serviceWorkerControlled:rows.filter(r=>r.trace.serviceWorkerControlled).length,
    indexedDB:{operations:idb.length, errors:idb.filter(r=>'error' in r).length, blocked:idb.filter(r=>'blocked'in r).length, aborted:idb.filter(r=>'abort'in r).length,
      publicOpen:stats(idb.filter(r=>r.kind==='open' && r.name.startsWith('mybrev-public') && r.success).map(r=>r.success-r.at)),
      firestoreOpen:stats(idb.filter(r=>r.kind==='open' && r.name.startsWith('firestore/') && r.success).map(r=>r.success-r.at)),
      publicTransactions:stats(idb.filter(r=>r.kind==='transaction' && r.name.startsWith('mybrev-public') && r.complete).map(r=>r.complete-r.at)),
      firestoreTransactions:stats(idb.filter(r=>r.kind==='transaction' && r.name.startsWith('firestore/') && r.complete).map(r=>r.complete-r.at)),
      pendingAtCapture:idb.filter(r=>r.kind==='open' && !r.success && !r.error && !r.blocked).length},
    longTasks:stats(rows.flatMap(r=>(r.beforeRetry || r.trace).log.longTasks.map(t=>t.duration))),
  };
});
const groups = [];
for (const s of series) for (const mode of ['cold','warm','slow']) for (const action of ['hamburger','readings-link','day-card']) {
  const rows = actions.filter(r=>r.series===s.name && r.mode===mode && r.action===action);
  if (!rows.length) continue;
  groups.push({series:s.name, mode, action, attempts:rows.length, failed:rows.filter(r=>!r.success).length,
    response:stats(rows.filter(r=>r.success && r.responseMs !== null).map(r=>r.responseMs)),
    over250Ms:rows.filter(r=>r.responseMs>250).length,
    offscreenClicks:rows.filter(r=>!r.inViewport).length,
    hitMisses:rows.filter(r=>!r.hitTarget).length,
    sampleToInput:stats(rows.filter(r=>r.sampleToInputMs!==null).map(r=>r.sampleToInputMs))});
}
const result = {generatedAt:new Date().toISOString(),
  notes:['Menu scenario has two actions; its overall failure must not discard a successful hamburger measurement.',
    'sampleToInputMs includes automation round trips and is not browser input delay or INP.',
    'tasksDuringDispatchCount uses the interval from coordinate sampling to captured click; Event Timing processing delay is separate and only available for reported events.',
    'Response measures active drawer class / SPA URL change, not completed animation / content paint.',
    'The baseline warm mode reloads before caches and service worker are necessarily ready.',
    'Fixture SDK reads do not reproduce server queries or Firestore persistent-cache read timing.'],
  series, groups, actions};
fs.mkdirSync('reports/performance', {recursive:true});
fs.writeFileSync('reports/performance/first-click-analysis.json', JSON.stringify(result,null,2)+'\n');
const fields = Object.keys(actions[0]);
const cell = v => JSON.stringify(v ?? '');
fs.writeFileSync('reports/performance/first-click-measurements.csv', [fields.join(','),...actions.map(row=>fields.map(k=>cell(row[k])).join(','))].join('\n')+'\n');
console.log(JSON.stringify({series:series.map(s=>({name:s.name,scenarios:s.scenarios,failed:s.failedScenarios})),groups},null,2));

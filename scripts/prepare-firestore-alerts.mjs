import { mkdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    channel: { type: 'string' },
    'reads-per-10m': { type: 'string', default: '25000' },
    'response-mib-per-10m': { type: 'string', default: '64' },
  },
});
const project = 'ibreviaryby';
const channel = values.channel;
if (!/^projects\/ibreviaryby\/notificationChannels\/\d+$/.test(channel ?? '')) {
  throw new Error('Supply --channel projects/ibreviaryby/notificationChannels/CHANNEL_ID');
}

function positiveInteger(arg) {
  const value = Number(values[arg]);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`--${arg} must be a positive integer`);
  }
  return value;
}

const readThreshold = positiveInteger('reads-per-10m');
const responseThreshold = positiveInteger('response-mib-per-10m') * 1024 * 1024;
const runbook = 'https://github.com/senddownrain/mybrev/blob/main/docs/firebase-finops.md';
const responseSelector = '{"serviceruntime.googleapis.com/api/response_sizes_sum", monitored_resource="consumed_api", project_id="ibreviaryby", service="firestore.googleapis.com", method=~"google[.]firestore[.]v1[.]Firestore[.](RunQuery|BatchGetDocuments|ListDocuments|GetDocument|Listen|RunAggregationQuery)"}';

function alert(displayName, condition, guidance) {
  return {
    displayName,
    combiner: 'OR',
    enabled: true,
    notificationChannels: [channel],
    documentation: { mimeType: 'text/markdown', content: `${guidance}\n\n[Incident runbook](${runbook})` },
    conditions: [{ displayName, ...condition }],
  };
}

const reads = alert('Malitounik Firestore document reads', {
  conditionThreshold: {
    filter: [
      'resource.type = "firestore.googleapis.com/Database"',
      `resource.labels.project_id = "${project}"`,
      'resource.labels.database_id = "(default)"',
      'metric.type = "firestore.googleapis.com/document/read_ops_count"',
    ].join(' AND '),
    aggregations: [{
      alignmentPeriod: '600s',
      perSeriesAligner: 'ALIGN_SUM',
      crossSeriesReducer: 'REDUCE_SUM',
    }],
    comparison: 'COMPARISON_GT',
    thresholdValue: readThreshold,
    duration: '0s',
  },
}, 'Check whether the read spike overlaps a content release or other known job.');

const response = alert('Malitounik Firestore API response volume', {
  conditionPrometheusQueryLanguage: {
    query: `sum(increase(${responseSelector}[10m])) > ${responseThreshold}`,
    duration: '0s',
    evaluationInterval: '60s',
  },
}, 'API response bytes are a traffic signal. Check billed Firestore network charges in Cloud Billing.');

const budget = {
  displayName: 'Malitounik monthly project spend',
  budgetFilter: { projects: ['projects/344097781816'], calendarPeriod: 'MONTH' },
  amount: { specifiedAmount: { currencyCode: 'USD', units: '60' } },
  thresholdRules: [5, 15, 30, 60].map(usd => ({
    thresholdPercent: usd / 60,
    spendBasis: 'CURRENT_SPEND',
  })),
  notificationsRule: {
    monitoringNotificationChannels: [channel],
    enableProjectLevelRecipients: true,
  },
};

const outputDir = new URL('../.firebase/finops/', import.meta.url);
await mkdir(outputDir, { recursive: true });
for (const [name, config] of Object.entries({ reads, response, budget })) {
  await writeFile(new URL(`${name}.json`, outputDir), JSON.stringify(config, null, 2) + '\n');
}
console.log('Prepared Monitoring policies and an alerts-only budget in .firebase/finops/.');
